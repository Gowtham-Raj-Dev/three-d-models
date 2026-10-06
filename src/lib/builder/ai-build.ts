import { AI_SIZES, isPerson, itemFootprint, RIDE_PART, sceneKitScales, shortName, staticItems, tileLike, type Action, type AiChange, type AiResult } from "@/lib/builder/ai";
import { COASTER_STYLES, coasterCircuit, turn } from "@/lib/builder/coaster";
import { MotionSampler } from "@/lib/builder/motion";
import { buildNavGraph, offsetLoop, shortestPaths, walkBack, type XZ } from "@/lib/builder/nav";
import { Composer, seededRandom } from "@/lib/builder/templates";
import { emptyScene, ENVIRONMENTS, GROUNDS, newId, type Motion, type MotionStop, type Part, type PartsIndex, type SceneDoc, type SceneItem, type Vec3 } from "@/lib/builder/types";
import * as THREE from "three";

/**
 * Turns an AI plan into scene items: expands rows, fills, rings and scatters without overlaps,
 * assembles coaster rides whose trains run round their track, and sends walkers along the path
 * network from place to place. In "add" mode the existing scene's parts block placement and its
 * paths join the network.
 */

interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Footprints on a spatial hash: solid parts block placement, flat ones (paths, floors) mark walkable ground. */
class Occupancy {
  private readonly cells = new Map<number, { c: Circle; flat: boolean }[]>();
  private static readonly CELL = 4;

  private static key(ix: number, iz: number) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  private range(c: Circle, fn: (key: number) => void) {
    const C = Occupancy.CELL;
    for (let ix = Math.floor((c.x - c.r) / C); ix <= Math.floor((c.x + c.r) / C); ix++) {
      for (let iz = Math.floor((c.z - c.r) / C); iz <= Math.floor((c.z + c.r) / C); iz++) fn(Occupancy.key(ix, iz));
    }
  }

  /** Long parts (fences, walls) are covered by a row of circles rather than one big one. */
  add(x: number, z: number, w: number, d: number, yaw: number, flat: boolean) {
    const long = Math.max(w, d);
    const short = Math.max(Math.min(w, d), 0.2);
    const n = long / short > 1.6 ? Math.min(Math.ceil(long / short), 24) : 1;
    // Direction of the long side in world space.
    const [ax, az] = w >= d ? [Math.cos(yaw), -Math.sin(yaw)] : [Math.sin(yaw), Math.cos(yaw)];
    const r = n === 1 ? long / 2 : Math.max(short / 2, long / n / 2);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i + 0.5) / n - 0.5;
      const c = { x: x + ax * t * long, z: z + az * t * long, r };
      this.range(c, (k) => {
        const list = this.cells.get(k) ?? [];
        list.push({ c, flat });
        this.cells.set(k, list);
      });
    }
  }

  /** Does a circle hit a solid footprint (or, with `flats`, a path / floor)? */
  hits(c: Circle, flats: boolean): boolean {
    let hit = false;
    this.range(c, (k) => {
      if (hit) return;
      for (const o of this.cells.get(k) ?? []) {
        if ((!o.flat || flats) && Math.hypot(o.c.x - c.x, o.c.z - c.z) < o.c.r + c.r) {
          hit = true;
          return;
        }
      }
    });
    return hit;
  }

  onFlat(x: number, z: number): boolean {
    const C = Occupancy.CELL;
    return (this.cells.get(Occupancy.key(Math.floor(x / C), Math.floor(z / C))) ?? []).some((o) => o.flat && Math.hypot(o.c.x - x, o.c.z - z) < o.c.r);
  }
}

const ACTION_CLIPS: Record<Action, RegExp[]> = {
  idle: [/^idle$/i, /idle/i],
  walk: [/^walk$/i, /walk/i],
  run: [/^run$/i, /^sprint$/i, /run|sprint/i],
  dance: [/danc/i],
  cheer: [/cheer/i, /clap/i, /emote-yes|gesture-positive/i, /victory|celebrat/i],
  wave: [/wave/i, /hello|greet/i, /emote-yes|gesture-positive/i],
  talk: [/talk|gestic/i, /interact/i],
  sit: [/^sit$/i, /sit/i],
};

/** Existing parts people are likely to walk to, when adding walkers to a scene. */
const VISIT_HINT = /stall|booth|shop|kiosk|vending|cart|market|fountain|bench|stage|entrance|ticket|food|drink|counter|stand|arcade|carousel|statue|tent|cafe|restaurant|store/i;

/** Coaster speed (units per second, before scaling) and train look per style. */
const COASTER_SPEED: Record<string, number> = { steel: 6, wood: 5, mouse: 3.5, flume: 2.5, monorail: 3 };
const STATION_WAIT = 4;

const finite = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? n : fallback);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const DEG = Math.PI / 180;

export interface BuildReport {
  objects: number;
  lights: number;
  walkers: number;
  trains: number;
  /** Rides left out because no free ground was big enough. */
  skippedRides: number;
  /** Editing: existing parts removed, and changed (replaced, moved, resized, turned, re-animated). */
  removed: number;
  changed: number;
  unknown: string[];
  zones: string[];
  kits: string[];
}

/** A travelling item before its timing is settled (world-space path). */
interface Draft {
  item: SceneItem;
  path: Vec3[];
  ups?: Vec3[];
  speed: number;
  lag: number;
  stops: MotionStop[];
  orient: "yaw" | "full";
  stopAnimation?: string | null;
  /** "station": waiting at its first stop at time 0 (coaster trains); a number: random start (0–1 of the loop). */
  start: "station" | number;
}

function loopLength(path: Vec3[]): number {
  let length = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return length;
}

/**
 * Gives every travelling item a loop time that divides one common period, so the scene (and its
 * exported single clip) loops seamlessly; then makes each path relative to its item's start pose.
 */
function settleMotion(drafts: Draft[]) {
  const loops = drafts.map((d) => {
    const length = loopLength(d.path);
    const waits = d.stops.reduce((n, s) => n + s.wait, 0);
    return { length, waits, duration: length / d.speed + waits };
  });
  const period = clamp(Math.max(0, ...loops.map((l) => l.duration)), 15, 150);
  drafts.forEach((d, i) => {
    const { length, waits, duration } = loops[i];
    const target = period / Math.max(1, Math.round(period / duration));
    const travel = length / d.speed;
    if (target >= duration) {
      // Longer: wait a little longer at stops, or travel a little slower.
      const extra = target - duration;
      if (waits > 0) d.stops = d.stops.map((s) => ({ ...s, wait: (s.wait * (waits + extra)) / waits }));
      else d.speed = length / target;
    } else {
      // Shorter: trim waits first, then travel a little faster.
      let cut = duration - target;
      const fromWaits = Math.min(waits * 0.6, cut);
      if (waits > 0) d.stops = d.stops.map((s) => ({ ...s, wait: (s.wait * (waits - fromWaits)) / waits }));
      cut -= fromWaits;
      d.speed = length / Math.max(travel - cut, travel * 0.5);
    }

    const total = length / d.speed + d.stops.reduce((n, s) => n + s.wait, 0);
    const phase = d.start === "station" ? (d.stops[0]?.at ?? 0) / d.speed : d.start * total;
    const motion: Motion = {
      path: d.path,
      ...(d.ups ? { ups: d.ups } : {}),
      speed: r3(d.speed),
      ...(d.lag ? { lag: r3(d.lag) } : {}),
      phase: r3(phase),
      ...(d.stops.length ? { stops: d.stops.map((s) => ({ ...s, at: r3(s.at), wait: r3(s.wait) })) } : {}),
      ...(d.stopAnimation !== undefined ? { stopAnimation: d.stopAnimation } : {}),
      orient: d.orient,
    };
    // The item rests where it is at time 0; its path is stored relative to that spot.
    const start = new THREE.Vector3();
    new MotionSampler(motion, [0, 0, 0]).pose(0, start, new THREE.Quaternion(), new THREE.Quaternion());
    const anchor: Vec3 = [r3(start.x), r3(start.y), r3(start.z)];
    d.item.position = anchor;
    // The direction of travel sets the heading; the item's own rotation is only an offset on top.
    d.item.rotation = [0, 0, 0];
    d.item.motion = {
      ...motion,
      path: d.path.map((p) => [r3(p[0] - anchor[0]), r3(p[1] - anchor[1]), r3(p[2] - anchor[2])]),
      ...(d.ups ? { ups: d.ups.map((u) => [r3(u[0]), r3(u[1]), r3(u[2])] as Vec3) } : {}),
    };
  });
}

/**
 * Builds the scene for an AI result. With `base` (add mode) the new items join that scene; otherwise
 * they make a new one. `added` lists only the new items.
 */
export function buildAiScene(
  result: AiResult,
  parts: Map<string, Part>,
  bipedClips: PartsIndex["clips"],
  seed: number,
  base: SceneDoc | null,
): { doc: SceneDoc; added: SceneItem[]; report: BuildReport } {
  const { concept, plan, frame } = result;
  const s = AI_SIZES[result.size];
  const half = frame.half;
  const limit = Math.min(half * 1.15, frame.groundSize / 2 - 1);
  const composer = new Composer(parts, seededRandom(seed));
  const rand = composer.rand;
  const occupancy = new Occupancy();
  const unknown = new Set<string>();
  /** Walkway centre lines, and the places walkers visit. */
  const walkways: [XZ, XZ][] = [];
  const places: XZ[] = [];
  const drafts: Draft[] = [];

  // Part lookup: "kit/name", the full id, or a loose match ignoring case and separators.
  const chosen = new Set(concept.kits.map((k) => k.key));
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byKey = new Map<string, Part>();
  const byNorm = new Map<string, Part>();
  for (const p of parts.values()) {
    byKey.set(`${p.collectionKey}/${shortName(p)}`.toLowerCase(), p);
    byKey.set(p.id.toLowerCase(), p);
    const n = norm(p.id);
    if (!byNorm.has(n) || chosen.has(p.collectionKey)) byNorm.set(n, p);
  }
  const resolved = new Map<string, Part | null>();
  const resolve = (name: unknown): Part | null => {
    if (typeof name !== "string" || !name) return null;
    if (resolved.has(name)) return resolved.get(name)!;
    const lower = name.trim().toLowerCase();
    const part = byKey.get(lower) ?? byKey.get(lower.replace("/", "-")) ?? byNorm.get(norm(lower)) ?? null;
    if (!part) unknown.add(name);
    resolved.set(name, part);
    return part;
  };
  const resolveAll = (names: unknown) => (Array.isArray(names) ? names.map(resolve).filter((p): p is Part => !!p) : []);

  // Kits already in the scene keep their scale, so additions match.
  const kitScale = new Map<string, number>();
  for (const k of plan.kitScales ?? []) if (k && typeof k.kit === "string") kitScale.set(k.kit, clamp(finite(k.scale, 1), 0.02, 60));
  for (const [kit, scale] of sceneKitScales(base, parts)) kitScale.set(kit, scale);
  const scaleOf = (p: Part, own?: number) => clamp((kitScale.get(p.collectionKey) ?? 1) * clamp(finite(own, 1), 0.05, 20), 0.01, 120);

  const clipFor = (p: Part, action?: Action): string | null => {
    const names = p.set ? bipedClips.filter((c) => c.set === p.set).map((c) => c.id) : p.clips;
    if (!names.length) return null;
    if (!action || !ACTION_CLIPS[action]) {
      // Characters idle; single-clip props (prize wheels, claw machines…) play their only clip.
      if (names.length === 1) return names[0];
      action = "idle";
    }
    for (const re of ACTION_CLIPS[action]) {
      const hit = names.find((n) => re.test(n));
      if (hit) return hit;
    }
    return ACTION_CLIPS.idle.map((re) => names.find((n) => re.test(n))).find(Boolean) ?? null;
  };

  const inside = (x: number, z: number) => Math.abs(x) <= limit && Math.abs(z) <= limit;

  // Edits to what is already there come first, so additions fit around the result.
  const edits = base ? applyChanges(base.items, plan.changes ?? [], { parts, rand, resolveAll, scaleOf, clipFor }) : null;
  const edited = base && edits ? { ...base, items: edits.items } : null;

  // The (edited) scene: its parts block placement, its paths and floors are walkable, and its
  // stalls, benches and entrances are places to visit.
  for (const { item, part } of edited ? staticItems(edited, parts) : []) {
    const f = itemFootprint(item, part);
    occupancy.add(f.x, f.z, f.w, f.d, f.yaw, f.flat);
    if (f.flat) {
      // A cross through each tile, so neighbouring tiles join whichever way they continue.
      const [ax, az] = [Math.cos(f.yaw), -Math.sin(f.yaw)];
      walkways.push([
        [f.x - (ax * f.w) / 2, f.z - (az * f.w) / 2],
        [f.x + (ax * f.w) / 2, f.z + (az * f.w) / 2],
      ]);
      walkways.push([
        [f.x - (az * f.d) / 2, f.z + (ax * f.d) / 2],
        [f.x + (az * f.d) / 2, f.z - (ax * f.d) / 2],
      ]);
    } else if (VISIT_HINT.test(part.id)) {
      places.push([f.x, f.z]);
    }
  }


  let triangles = 0;
  type Footprint = Parameters<Occupancy["add"]>;
  /**
   * Adds a part and records its footprint. With `check`, skips it if it would overlap a solid part.
   * Rows, rings and fills collect their footprints in `group` and record them once complete, so their
   * own neighbours never block them.
   */
  const put = (
    p: Part,
    x: number,
    z: number,
    o: { y?: number; yaw?: number; scale?: number; action?: Action; sink?: boolean; check?: boolean; budget?: boolean; group?: Footprint[] },
  ): SceneItem | null => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !inside(x, z)) return null;
    if (o.budget !== false && (composer.items.length >= s.maxItems || triangles + p.tri > s.maxTriangles)) return null;
    const sc = o.scale ?? scaleOf(p);
    const yaw = o.yaw ?? 0;
    const flat = !!o.sink || p.size[1] * sc < 0.4;
    const w = p.size[0] * sc;
    const d = p.size[2] * sc;
    if (o.check && !flat && occupancy.hits({ x, z, r: Math.max(Math.min(w, d), 0.3) * 0.45 }, false)) return null;
    const y = o.sink ? 0.02 - p.size[1] * sc : finite(o.y, 0);
    const item = composer.add(p.id, x, z, { y, ry: yaw, s: r3(sc), anim: clipFor(p, o.action), block: 0 });
    triangles += p.tri;
    const footprint: Footprint = [x, z, w, d, yaw, flat];
    if (o.group) o.group.push(footprint);
    else occupancy.add(...footprint);
    return item;
  };
  const commit = (group: Footprint[]) => group.forEach((f) => occupancy.add(...f));

  // 1. Landmarks.
  for (const it of plan.place ?? []) {
    const p = resolve(it?.part);
    if (!p) continue;
    const x = finite(it.x, NaN);
    const z = finite(it.z, NaN);
    if (put(p, x, z, { y: it.y, yaw: finite(it.rot, 0) * DEG, scale: scaleOf(p, it.scale), action: it.action, budget: false }) && it.visit) places.push([x, z]);
  }

  // 2. Coaster rides, assembled piece by piece (see coaster.ts), with trains that run round the track.
  // The station sits on the circuit's local +X side, so the entrance direction decides its turn.
  const coasterScale = kitScale.get("coaster-kit") ?? 2;
  const ENTRANCE_YAW = { right: 0, back: Math.PI / 2, left: Math.PI, front: -Math.PI / 2 };
  let trains = 0;
  let skippedRides = 0;
  for (const ride of (plan.coasters ?? []).slice(0, 6)) {
    if (!ride || !COASTER_STYLES.includes(ride.style)) continue;
    const S = coasterScale;
    const facing = ride.entrance && ride.entrance in ENTRANCE_YAW ? ride.entrance : "front";
    const yaw0 = ENTRANCE_YAW[facing];
    // The station side runs along the circuit's local Z, across the entrance direction.
    const alongZ = facing === "left" || facing === "right";
    const length = clamp(finite(alongZ ? ride.sizeZ : ride.sizeX, 40), 10, half * 2);
    const width = clamp(finite(alongZ ? ride.sizeX : ride.sizeZ, 30), 8, half * 2);
    const circuit = coasterCircuit({
      style: ride.style,
      straights: clamp(Math.round((length / S - 8) / 4), 2, 14),
      across: clamp(Math.round((width / S - 8) / 4), 0, 12),
      elevation: clamp(Math.round(finite(ride.height, 6) / S), 0, 6),
      loops: ride.loops ?? true,
      hills: ride.hills ?? true,
    });
    // The ride needs free ground: if the requested spot overlaps something (Gemini can't see every
    // part), look outwards in rings for the nearest spot where the whole circuit and station fit.
    const probes: [number, number][] = [...circuit.path, ...circuit.pieces.filter((piece) => !piece.name.startsWith("coaster-")).map((piece) => [piece.x, piece.z] as [number, number])];
    const fits = (x0: number, z0: number) => {
      let bad = 0;
      for (const [lx, lz] of probes) {
        const [ox, oz] = turn(lx * S, lz * S, yaw0);
        const x = x0 + ox;
        const z = z0 + oz;
        if (!inside(x, z) || occupancy.hits({ x, z, r: S * 0.6 }, false)) bad++;
      }
      return bad <= probes.length * 0.02;
    };
    const wantX = finite(ride.x, 0);
    const wantZ = finite(ride.z, 0);
    let spot: XZ | null = fits(wantX, wantZ) ? [wantX, wantZ] : null;
    for (let ring = 1; !spot && ring * 4 <= half * 2; ring++) {
      const steps = ring * 8;
      for (let k = 0; k < steps && !spot; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = wantX + Math.cos(a) * ring * 4;
        const z = wantZ + Math.sin(a) * ring * 4;
        if (fits(x, z)) spot = [x, z];
      }
    }
    if (!spot) {
      skippedRides++;
      continue;
    }
    const [cx, cz] = spot;
    const world = (lx: number, lz: number): XZ => {
      const [ox, oz] = turn(lx * S, lz * S, yaw0);
      return [cx + ox, cz + oz];
    };
    // The route the train rides, in world space.
    const route: Vec3[] = circuit.route.map(([lx, ly, lz]) => {
      const [x, z] = world(lx, lz);
      return [x, ly * S, z];
    });
    const ups = circuit.ups?.map(([ux, uy, uz]) => {
      const [x, z] = turn(ux, uz, yaw0);
      return [x, uy, z] as Vec3;
    });
    // Track pieces are pivoted at their start, so their footprint comes from the centre line instead.
    const track: Footprint[] = [];
    let entrance: XZ | null = null;
    let queueEnd: XZ | null = null;
    for (const piece of circuit.pieces) {
      const part = parts.get(`coaster-kit-${piece.name}`);
      if (!part) continue;
      const [x, z] = world(piece.x, piece.z);
      const isTrack = piece.name.startsWith("coaster-") && !piece.name.startsWith("coaster-train");
      const item = put(part, x, z, { y: piece.y * S, yaw: piece.yaw + yaw0, scale: S, budget: false, sink: piece.name.startsWith("queue"), group: isTrack ? track : undefined });
      if (piece.name === "ride-entrance") entrance = [x, z];
      if (piece.name.startsWith("queue")) queueEnd = [x, z];
      if (item && piece.car !== undefined) {
        drafts.push({
          item,
          path: route,
          ups,
          speed: (COASTER_SPEED[ride.style] ?? 5) * S,
          lag: piece.car * circuit.carGap * S,
          stops: [{ at: circuit.station * S, wait: STATION_WAIT }],
          orient: "full",
          start: "station",
        });
        if (piece.car === 0) trains++;
      }
    }
    for (const [px, pz] of circuit.path) {
      const [x, z] = world(px, pz);
      occupancy.add(x, z, S * 1.3, S * 1.3, 0, false);
    }
    // Walkers queue up to the entrance.
    if (entrance && queueEnd) {
      walkways.push([entrance, queueEnd]);
      places.push(entrance);
    }
  }

  // 3. Rings.
  for (const ring of plan.rings ?? []) {
    const list = resolveAll(ring?.parts);
    const count = Math.round(clamp(finite(ring.count, 0), 0, 80));
    const radius = clamp(finite(ring.radius, 4), 0.5, half * 2);
    if (!list.length || !count) continue;
    const offset = rand() * Math.PI * 2;
    const group: Footprint[] = [];
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const x = finite(ring.x, 0) + Math.cos(a) * radius;
      const z = finite(ring.z, 0) + Math.sin(a) * radius;
      const toCentre = Math.atan2(-Math.cos(a), -Math.sin(a));
      const yaw = ring.facing === "outward" ? toCentre + Math.PI : ring.facing === "along" ? toCentre + Math.PI / 2 : ring.facing === "random" ? rand() * Math.PI * 2 : toCentre;
      const p = list[i % list.length];
      put(p, x, z, { y: ring.y, yaw, scale: scaleOf(p, ring.scale), action: ring.action, check: true, group });
    }
    commit(group);
  }

  // 4. Lines: paths, fences, rows. Each segment gets a whole number of evenly spaced parts. Lines of
  // flat tiles are walkways.
  for (const line of plan.lines ?? []) {
    const list = resolveAll(line?.parts);
    const points = (Array.isArray(line?.points) ? line.points : []).filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.z)).slice(0, 64);
    if (!list.length || points.length < 2) continue;
    if (line.closed && points.length > 2) points.push(points[0]);
    const walkway = line.y === undefined && (line.sink ?? tileLike(list[0]));
    const group: Footprint[] = [];
    let n = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      if (walkway) walkways.push([clampXZ([a.x, a.z], limit), clampXZ([b.x, b.z], limit)]);
      const first = list[0];
      const firstScale = scaleOf(first, line.scale);
      const step = Math.max(finite(line.spacing, 0) || Math.max(first.size[0], first.size[2]) * firstScale, 0.2);
      const count = Math.min(Math.max(1, Math.round(length / step)), 400);
      for (let k = 0; k < count; k++) {
        const p = line.mix === "random" ? composer.pick(list) : list[n % list.length];
        n++;
        const t = (k + 0.5) / count;
        // Turn the part so its longer side follows the line.
        const along = p.size[0] >= p.size[2] ? Math.atan2(-dz, dx) : Math.atan2(dx, dz);
        const sink = line.sink ?? (line.y === undefined && tileLike(p));
        put(p, a.x + dx * t, a.z + dz * t, { y: line.y, yaw: along + finite(line.rot, 0) * DEG, scale: scaleOf(p, line.scale), action: line.action, sink, check: true, group });
      }
    }
    commit(group);
  }

  // 5. Fills: grids of tiles, crops or trees (at most 700 cells each — the step grows to fit). Tiled
  // plazas are walkable: walkers cross them along their edges and middle lines.
  for (const fill of plan.fills ?? []) {
    const list = resolveAll(fill?.parts);
    if (!list.length) continue;
    const x1 = clamp(Math.min(finite(fill.x1, 0), finite(fill.x2, 0)), -limit, limit);
    const x2 = clamp(Math.max(finite(fill.x1, 0), finite(fill.x2, 0)), -limit, limit);
    const z1 = clamp(Math.min(finite(fill.z1, 0), finite(fill.z2, 0)), -limit, limit);
    const z2 = clamp(Math.max(finite(fill.z1, 0), finite(fill.z2, 0)), -limit, limit);
    const first = list[0];
    // Floor tiles always butt up against each other; other parts (crops, trees) may be spaced out.
    const tile = Math.max(first.size[0], first.size[2]) * scaleOf(first, fill.scale);
    let step = Math.max(tileLike(first) ? tile : finite(fill.spacing, 0) || tile, 0.25);
    while (((x2 - x1) / step + 1) * ((z2 - z1) / step + 1) > 700) step *= 1.2;
    const group: Footprint[] = [];
    for (let x = x1 + step / 2; x <= x2; x += step) {
      for (let z = z1 + step / 2; z <= z2; z += step) {
        const p = composer.pick(list);
        const yaw = fill.randomRotate ? Math.floor(rand() * 4) * (Math.PI / 2) : 0;
        put(p, x, z, { yaw, scale: scaleOf(p, fill.scale), sink: fill.sink ?? tileLike(p), check: true, group });
      }
    }
    commit(group);
    if (tileLike(first) && x2 - x1 > step && z2 - z1 > step) {
      const [a, b, c, d] = [x1 + step / 2, x2 - step / 2, z1 + step / 2, z2 - step / 2];
      const mx = (a + b) / 2;
      const mz = (c + d) / 2;
      walkways.push([[a, c], [b, c]], [[b, c], [b, d]], [[b, d], [a, d]], [[a, d], [a, c]], [[mx, c], [mx, d]], [[a, mz], [b, mz]]);
    }
  }

  // 6. Scatters, scaled down together when they would go over the object budget (walkers keep a share).
  const walkerWanted = (plan.walkers ?? []).reduce((n, w) => n + Math.round(clamp(finite(w?.count, 0), 0, 150)), 0);
  const scatters = (plan.scatter ?? []).map((sc) => ({ sc, list: resolveAll(sc?.parts), count: Math.round(clamp(finite(sc?.count, 0), 0, 600)) })).filter((x) => x.list.length && x.count);
  const wanted = scatters.reduce((n, x) => n + x.count, 0);
  const room = Math.max(0, s.maxItems - composer.items.length - Math.min(walkerWanted, s.maxItems * 0.2));
  const factor = wanted > room ? room / wanted : 1;
  for (const { sc, list, count } of scatters) {
    const target = Math.floor(count * factor);
    const x1 = clamp(Math.min(finite(sc.x1, -half), finite(sc.x2, half)), -limit, limit);
    const x2 = clamp(Math.max(finite(sc.x1, -half), finite(sc.x2, half)), -limit, limit);
    const z1 = clamp(Math.min(finite(sc.z1, -half), finite(sc.z2, half)), -limit, limit);
    const z2 = clamp(Math.max(finite(sc.z1, -half), finite(sc.z2, half)), -limit, limit);
    const lo = clamp(finite(sc.scaleMin, 1), 0.2, 5);
    const hi = Math.max(lo, clamp(finite(sc.scaleMax, lo), 0.2, 5));
    let placed = 0;
    for (let tries = 0; placed < target && tries < target * 30; tries++) {
      const x = x1 + (x2 - x1) * rand();
      const z = z1 + (z2 - z1) * rand();
      const p = composer.pick(list);
      const scale = scaleOf(p) * (lo + (hi - lo) * rand());
      const r = Math.max(p.size[0], p.size[2]) * scale * 0.5 + 0.15;
      if (sc.surface === "paths" ? !occupancy.onFlat(x, z) : sc.surface !== "any" && occupancy.onFlat(x, z)) continue;
      if (occupancy.hits({ x, z, r }, sc.surface !== "paths" && sc.surface !== "any")) continue;
      if (put(p, x, z, { yaw: rand() * Math.PI * 2, scale, action: sc.action })) placed++;
    }
  }

  // 7. Walkers: tours of nearby places along the walkway graph, waiting at each one.
  let walkers = 0;
  if (plan.walkers?.length) {
    const graph = buildNavGraph(walkways, places);
    let targets = places.map((p, i) => ({ at: p, node: graph.anchors[i] })).filter((t) => t.node >= 0);
    // No places to visit (or none near a path): wander between spots spread over the network.
    if (targets.length < 2 && graph.nodes.length > 2) {
      targets = Array.from({ length: Math.min(12, graph.nodes.length) }, () => {
        const node = Math.floor(rand() * graph.nodes.length);
        return { at: graph.nodes[node], node };
      });
    }
    const trees = new Map<number, ReturnType<typeof shortestPaths>>();
    const tree = (node: number) => {
      let t = trees.get(node);
      if (!t) trees.set(node, (t = shortestPaths(graph, node)));
      return t;
    };

    for (const group of plan.walkers) {
      const people = resolveAll(group?.parts);
      if (!people.length || targets.length < 2) continue;
      const count = Math.round(clamp(finite(group.count, 0), 0, 150));
      const stopsWanted = Math.round(clamp(finite(group.stops, 4), 2, 6));
      const wait = clamp(finite(group.wait, 5), 1, 20);
      const running = group.moveAction === "run";
      for (let w = 0; w < count; w++) {
        if (composer.items.length >= s.maxItems) break;
        const p = people[w % people.length];
        if (triangles + p.tri > s.maxTriangles) break;

        // A compact tour: each next place is one of the closest not yet visited.
        const first = Math.floor(rand() * targets.length);
        const tour = [first];
        while (tour.length < stopsWanted) {
          const from = tree(targets[tour[tour.length - 1]].node);
          const options = targets
            .map((t, i) => ({ i, d: from.dist[t.node] }))
            .filter((o) => !tour.includes(o.i) && Number.isFinite(o.d) && o.d > 1 && o.d < 90)
            .sort((a, b) => a.d - b.d)
            .slice(0, 4);
          if (!options.length) break;
          tour.push(options[Math.floor(rand() * options.length)].i);
        }
        if (tour.length < 2) continue;

        const route: XZ[] = [];
        const stopIndex: number[] = [];
        for (let k = 0; k < tour.length; k++) {
          const a = targets[tour[k]].node;
          const b = targets[tour[(k + 1) % tour.length]].node;
          const leg = walkBack(tree(a).prev, a, b).map((n) => graph.nodes[n]);
          stopIndex.push(route.length);
          route.push(...leg.slice(0, -1));
        }
        if (route.length < 2) continue;
        // People keep to one side or the other of the path.
        const shifted = offsetLoop(route, (rand() - 0.5) * 1.4);
        const path: Vec3[] = shifted.map(([x, z]) => [x, 0.02, z]);
        const along: number[] = [0];
        for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
        const stops: MotionStop[] = stopIndex.map((index, k) => ({ at: along[index], wait: wait * (0.7 + rand() * 0.6), look: targets[tour[k]].at }));

        const item = composer.add(p.id, path[0][0], path[0][2], { y: 0.02, s: r3(scaleOf(p)), anim: clipFor(p, running ? "run" : "walk"), block: 0 });
        if (!item) continue;
        triangles += p.tri;
        drafts.push({
          item,
          path,
          speed: running ? 3 + rand() * 0.6 : 1.15 + rand() * 0.35,
          lag: 0,
          stops,
          orient: "yaw",
          stopAnimation: clipFor(p, group.stopAction ?? "idle"),
          start: rand(),
        });
        walkers++;
      }
    }
  }

  settleMotion(drafts);

  // 8. Lights — capped, since every point light costs on every pixel.
  let lights = 0;
  for (const l of plan.lights ?? []) {
    if (lights >= 24 || !l || !inside(finite(l.x, NaN), finite(l.z, NaN))) continue;
    composer.light(finite(l.x, 0), clamp(finite(l.y, 2), 0.1, 60), finite(l.z, 0), {
      color: typeof l.color === "string" && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#ffb15c",
      intensity: clamp(finite(l.intensity, 14), 1, 200),
      distance: clamp(finite(l.distance, 14), 0, 80),
      flicker: !!l.flicker,
    });
    lights++;
  }

  const added = composer.items;
  const a = half * 2;
  // Lighting the user picked wins, then what the plan asks for, then what the scene had.
  const planEnv = plan.scene?.environment && plan.scene.environment in ENVIRONMENTS ? plan.scene.environment : null;
  const planGround = plan.scene?.ground && plan.scene.ground in GROUNDS ? plan.scene.ground : null;
  const doc: SceneDoc = edited
    ? {
        ...edited,
        environment: result.environment !== "auto" ? result.environment : (planEnv ?? edited.environment),
        ground: { ...edited.ground, kind: planGround ?? edited.ground.kind, size: Math.max(edited.ground.size, frame.groundSize) },
        items: [...edited.items, ...added],
      }
    : {
        ...emptyScene(concept.title),
        environment: concept.environment,
        ground: { kind: concept.ground, size: frame.groundSize, y: 0 },
        camera: { position: [Math.round(a * 0.18), Math.round(a * 0.5), Math.round(a * 0.92)], target: [0, 0, 0] },
        items: added,
      };
  return {
    doc,
    added,
    report: {
      objects: added.length - lights,
      lights,
      walkers,
      trains,
      skippedRides,
      removed: edits?.removed ?? 0,
      changed: edits?.changed ?? 0,
      unknown: [...unknown],
      zones: (plan.zones ?? []).map((z) => z?.name).filter((n): n is string => typeof n === "string"),
      kits: [...chosen],
    },
  };
}

function clampXZ([x, z]: XZ, limit: number): XZ {
  return [clamp(x, -limit, limit), clamp(z, -limit, limit)];
}

/** Shell-style pattern ("kit/tree*") to a regular expression. */
function glob(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
}

/**
 * Applies the plan's edits to a scene's items: which existing parts a change picks (by name or
 * family, special groups, an area, a random share), then remove / replace / move / scale / turn /
 * animate them. Returns the new item list and what happened.
 */
function applyChanges(
  items: SceneItem[],
  changes: AiChange[],
  ctx: {
    parts: Map<string, Part>;
    rand: () => number;
    resolveAll: (names: unknown) => Part[];
    scaleOf: (p: Part, own?: number) => number;
    clipFor: (p: Part, action?: Action) => string | null;
  },
): { items: SceneItem[]; removed: number; changed: number } {
  let list = items;
  let removed = 0;
  const changedIds = new Set<string>();

  for (const change of changes) {
    if (!change || !Array.isArray(change.parts)) continue;
    const tests = change.parts
      .filter((t): t is string => typeof t === "string" && !!t.trim())
      .map((token): ((item: SceneItem, part: Part | undefined) => boolean) => {
        const t = token.trim().toLowerCase();
        if (t === "all" || t === "*") return () => true;
        if (t === "lights") return (i) => i.kind === "light";
        if (t === "walkers") return (i) => !!i.motion && i.motion.orient !== "full";
        if (t === "trains") return (i) => i.motion?.orient === "full";
        if (t === "rides") return (_, p) => !!p && RIDE_PART.test(p.id);
        if (t === "people") return (_, p) => !!p && isPerson(p);
        const re = glob(t);
        return (i, p) => !!p && (re.test(`${p.collectionKey}/${shortName(p)}`) || re.test(shortName(p)) || re.test(p.id) || re.test(i.name));
      });
    if (!tests.length) continue;
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
    const [x1, x2] = [num(change.x1) ?? -Infinity, num(change.x2) ?? Infinity].sort((a, b) => a - b);
    const [z1, z2] = [num(change.z1) ?? -Infinity, num(change.z2) ?? Infinity].sort((a, b) => a - b);

    let picked = list.filter((item) => {
      const part = item.part ? ctx.parts.get(item.part) : undefined;
      const [x, , z] = item.position;
      return x >= x1 && x <= x2 && z >= z1 && z <= z2 && tests.some((test) => test(item, part));
    });
    const count = num(change.count);
    if (count !== undefined && count >= 0 && count < picked.length) {
      // A random share, e.g. "half the trees".
      picked = picked
        .map((item) => ({ item, key: ctx.rand() }))
        .sort((a, b) => a.key - b.key)
        .slice(0, Math.round(count))
        .map((x) => x.item);
    }
    if (!picked.length) continue;
    const ids = new Set(picked.map((i) => i.id));

    if (change.op === "remove") {
      list = list.filter((i) => !ids.has(i.id));
      removed += ids.size;
      continue;
    }

    const replacements = change.op === "replace" ? ctx.resolveAll(change.with) : [];
    list = list.map((item) => {
      if (!ids.has(item.id)) return item;
      const part = item.part ? ctx.parts.get(item.part) : undefined;
      let next: SceneItem = item;
      switch (change.op) {
        case "replace": {
          // Coaster cars stay with their track; everything else swaps in place.
          if (!replacements.length || item.kind !== "model" || item.motion?.orient === "full") return item;
          const fresh = replacements[Math.floor(ctx.rand() * replacements.length)];
          const s = r3(part && part.collectionKey === fresh.collectionKey ? Math.abs(item.scale[0]) : ctx.scaleOf(fresh));
          const sunk = tileLike(fresh) && item.position[1] <= 0.05;
          const y = sunk ? r3(0.02 - fresh.size[1] * s) : Math.max(item.position[1], 0);
          next = {
            ...item,
            id: newId(),
            part: fresh.id,
            glb: fresh.glb,
            name: fresh.title,
            position: [item.position[0], y, item.position[2]],
            scale: [s, s, s],
            animation: item.motion ? ctx.clipFor(fresh, "walk") : ctx.clipFor(fresh),
            ...(item.motion ? { motion: { ...item.motion, stopAnimation: ctx.clipFor(fresh, "idle") } } : {}),
          };
          if (item.motion && !isPerson(fresh)) delete next.motion;
          break;
        }
        case "move":
          next = { ...item, position: [r3(item.position[0] + (num(change.dx) ?? 0)), item.position[1], r3(item.position[2] + (num(change.dz) ?? 0))] };
          break;
        case "scale": {
          const f = clamp(num(change.factor) ?? 1, 0.05, 20);
          next = { ...item, scale: item.scale.map((v) => r3(v * f)) as Vec3 };
          break;
        }
        case "turn":
          next = { ...item, rotation: [item.rotation[0], r3(item.rotation[1] + (num(change.degrees) ?? 0) * DEG), item.rotation[2]] };
          break;
        case "animate": {
          if (!part || !change.action) return item;
          const clip = ctx.clipFor(part, change.action);
          if (!clip) return item;
          // Walkers keep walking and do it at their stops; everyone else does it where they stand.
          next = item.motion && change.action !== "walk" && change.action !== "run" ? { ...item, motion: { ...item.motion, stopAnimation: clip } } : { ...item, animation: clip };
          break;
        }
        default:
          return item;
      }
      changedIds.add(next.id);
      return next;
    });
  }
  return { items: list, removed, changed: changedIds.size };
}
