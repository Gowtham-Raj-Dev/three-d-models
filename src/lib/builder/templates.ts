import { emptyScene, newId, type EnvKey, type GroundKind, type Part, type SceneDoc, type SceneItem, type Vec3 } from "@/lib/builder/types";

/** Small, fast seeded PRNG (mulberry32) so a template + seed always rebuilds the same scene. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AddOptions {
  y?: number;
  /** Yaw in radians. */
  ry?: number;
  /** Uniform scale. */
  s?: number;
  anim?: string | null;
  name?: string;
  locked?: boolean;
  /** Footprint radius reserved for scatter(); 0 = don't reserve. Defaults to half the part's widest side. */
  block?: number;
}

/** Places library parts by id and keeps track of the ground they cover, for overlap-free scattering. */
export class Composer {
  readonly items: SceneItem[] = [];
  private readonly occupied: { x: number; z: number; r: number }[] = [];

  constructor(
    private readonly parts: Map<string, Part>,
    readonly rand: () => number,
  ) {}

  add(id: string, x: number, z: number, o: AddOptions = {}): SceneItem | null {
    const part = this.parts.get(id);
    if (!part) return null;
    const s = o.s ?? 1;
    const item: SceneItem = {
      id: newId(),
      kind: "model",
      part: id,
      glb: part.glb,
      name: o.name ?? part.title,
      position: [round(x), round(o.y ?? 0), round(z)],
      rotation: [0, round(o.ry ?? 0), 0],
      scale: [s, s, s],
      animation: o.anim ?? null,
      ...(o.locked ? { locked: true } : {}),
    };
    this.items.push(item);
    const r = o.block ?? Math.max(part.size[0], part.size[2]) * s * 0.5;
    if (r > 0) this.occupied.push({ x, z, r });
    return item;
  }

  light(x: number, y: number, z: number, o: { color?: string; intensity?: number; distance?: number; flicker?: boolean; name?: string } = {}) {
    this.items.push({
      id: newId(),
      kind: "light",
      name: o.name ?? "Point light",
      position: [round(x), round(y), round(z)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      light: { color: o.color ?? "#ffa040", intensity: o.intensity ?? 14, distance: o.distance ?? 14, ...(o.flicker ? { flicker: true } : {}) },
    });
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)];
  }

  between(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }

  chance(p: number): boolean {
    return this.rand() < p;
  }

  isFree(x: number, z: number, r: number): boolean {
    return this.occupied.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r);
  }

  /**
   * Drops `count` random parts from `ids` inside a rectangle (or ring, when `ring` is set) without
   * overlapping anything placed so far.
   */
  scatter(
    ids: readonly string[],
    count: number,
    area: { x: [number, number]; z: [number, number]; ring?: [number, number] },
    o: { s?: [number, number]; gap?: number; anim?: string; y?: number; avoid?: (x: number, z: number) => boolean } = {},
  ) {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 40; tries++) {
      let x: number;
      let z: number;
      if (area.ring) {
        const angle = this.rand() * Math.PI * 2;
        const radius = Math.sqrt(this.between(area.ring[0] ** 2, area.ring[1] ** 2));
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      } else {
        x = this.between(area.x[0], area.x[1]);
        z = this.between(area.z[0], area.z[1]);
      }
      if (o.avoid?.(x, z)) continue;
      const id = this.pick(ids);
      const part = this.parts.get(id);
      if (!part) continue;
      const s = o.s ? this.between(o.s[0], o.s[1]) : 1;
      const r = Math.max(part.size[0], part.size[2]) * s * 0.5 + (o.gap ?? 0.2);
      if (!this.isFree(x, z, r)) continue;
      this.add(id, x, z, { s, ry: this.rand() * Math.PI * 2, anim: o.anim, y: o.y, block: r });
      placed++;
    }
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface TemplateInfo {
  key: string;
  name: string;
  description: string;
  /** Collections the template draws from (shown in the UI). */
  kits: string[];
  environment: EnvKey;
  ground: { kind: GroundKind; size: number; y: number };
  camera: { position: Vec3; target: Vec3 };
  compose: (c: Composer) => void;
}

const QUARTER = Math.PI / 2;

// --- Haunted backyard: Halloween Bits + Skeletons -------------------------------------------------

const H = (name: string) => `halloween-bits-${name}`;
const SK = (name: string) => `character-pack-skeletons-${name}`;

function hauntedBackyard(c: Composer) {
  const half = 14;

  // Dirt floor tiles (top surface at y=0). The dug grave is a tile too, so its pit stays open.
  const pit = { x: 8, z: 8 };
  for (let x = -16; x <= 16; x += 4) {
    for (let z = -16; z <= 16; z += 4) {
      const isPit = x === pit.x && z === pit.z;
      c.add(isPit ? H("floor_dirt_grave") : H("floor_dirt"), x, z, { ry: QUARTER * Math.floor(c.rand() * 4), locked: !isPit, block: 0 });
    }
  }

  // Fence on all four sides, with the arched gate at the front (+Z faces the viewer).
  const fence = () => (c.chance(0.22) ? H("fence_broken") : H("fence"));
  for (let x = -12; x <= 12; x += 4) {
    c.add(fence(), x, -half, { block: 0 });
    if (x !== 0) c.add(fence(), x, half, { block: 0 });
  }
  for (let z = -12; z <= 12; z += 4) {
    c.add(fence(), -half, z, { ry: QUARTER, block: 0 });
    c.add(fence(), half, z, { ry: QUARTER, block: 0 });
  }
  for (let p = -14; p <= 14; p += 4) {
    const pillar = () => (c.chance(0.15) ? H("fence_pillar_broken") : H("fence_pillar"));
    c.add(pillar(), p, -half, { block: 0 });
    if (Math.abs(p) !== 2) c.add(pillar(), p, half, { block: 0 });
    if (Math.abs(p) !== 14) {
      c.add(pillar(), -half, p, { block: 0 });
      c.add(pillar(), half, p, { block: 0 });
    }
  }
  c.add(H("arch_gate"), 0, half, { block: 0 });

  // Path from the gate to the crypt.
  for (let z = 12; z >= -3; z -= 1.9) {
    c.add(c.pick([H("path_A"), H("path_B"), H("path_C"), H("path_D")]), 0, z, { ry: QUARTER * Math.floor(c.rand() * 4), block: 1.2 });
  }

  // Crypt at the back, with candles and skull candles at its door.
  c.add(H("crypt"), 0, -8.5, { block: 4.4 });
  c.add(H("skull_candle"), -2.4, -3.8);
  c.add(H("skull_candle"), 2.4, -3.8);
  c.add(H("candle_triple"), -1.4, -4.1, { block: 0 });
  c.add(H("candle_triple"), 1.4, -4.1, { block: 0 });
  c.light(0, 1.4, -3.4, { color: "#ffb15c", intensity: 10, distance: 9, flicker: true, name: "Crypt candles light" });

  // Graves in two blocks either side of the path; the right block leaves room for the dug grave.
  const graves = [H("grave_A"), H("grave_A"), H("grave_B"), H("grave_B"), H("gravestone"), H("gravemarker_A"), H("gravemarker_B"), H("grave_A_destroyed")];
  for (const x of [-11, -8, -5, 5, 8, 11]) {
    for (const z of [-1, 3, 7]) {
      if (x > 0 && z === 7) continue;
      c.add(c.pick(graves), x + c.between(-0.3, 0.3), z + c.between(-0.3, 0.3), { ry: c.between(-0.15, 0.15) });
    }
  }

  // The dug grave: coffin beside the pit, a skeleton clawing its way out.
  c.add(H("coffin_decorated"), 11.7, pit.z + 0.4, { ry: 0.08 });
  c.add(SK("Skeleton_Minion"), 4.4, pit.z + 0.6, { ry: -0.5, anim: "Skeletons_Awaken_Floor_Long" });
  c.add(H("coffin"), -3.6, -2.4, { ry: 0.35 });

  // The skeleton crew.
  c.add(SK("Skeleton_Warrior"), -2.6, 5, { ry: 0.45, anim: "Idle_Combat" });
  c.add(SK("Skeleton_Mage"), 2.9, 1.2, { ry: -0.55, anim: "Spellcasting" });
  c.add(SK("Skeleton_Rogue"), -6.6, 10.2, { ry: 0.7, anim: "Idle_B" });
  c.add(SK("Skeleton_Minion"), 3.6, -4.4, { ry: -0.3, anim: "Skeletons_Awaken_Standing" });

  // Gate lanterns (arms turned towards the path) and standing lanterns along it.
  c.add(H("post_lantern"), -2.9, 12.4, { ry: QUARTER });
  c.add(H("post_lantern"), 2.9, 12.4, { ry: -QUARTER });
  c.light(-1.9, 2.6, 12.4, { name: "Gate lantern light (left)", flicker: true });
  c.light(1.9, 2.6, 12.4, { name: "Gate lantern light (right)", flicker: true });
  for (const [x, z] of [
    [-1.7, 8.2],
    [1.7, 4.2],
    [-1.7, 0.2],
  ] as const) {
    c.add(H("lantern_standing"), x, z);
    c.light(x, 0.9, z, { intensity: 6, distance: 8, flicker: true, name: "Lantern light" });
  }
  c.add(H("post_skull"), -6.5, 12.9);
  c.add(H("post_skull"), 6.5, 12.9, { ry: Math.PI });

  // Seating and a candle shrine along the side fences.
  c.add(H("bench_decorated"), -12.4, -4, { ry: QUARTER });
  c.add(H("shrine_candles"), 12.2, -4.5, { ry: -QUARTER });
  c.add(H("plaque_candles"), 12, 1.2, { ry: -QUARTER });

  // Trees: dead ones inside the fence, autumn pines outside.
  c.add(H("tree_dead_large_decorated"), -10, -9.5, { ry: 0.6 });
  c.add(H("tree_dead_large"), 10.2, -10, { ry: -0.8 });
  c.add(H("tree_dead_medium"), -11.6, 11.2, { ry: 1.4 });
  c.add(H("tree_dead_small"), 3.6, 10.6, { ry: 2.2 });
  const pines = [H("tree_pine_orange_large"), H("tree_pine_orange_medium"), H("tree_pine_yellow_large"), H("tree_pine_yellow_medium"), H("tree_pine_orange_small"), H("tree_pine_yellow_small")];
  for (const [x, z] of [
    [-17, -17],
    [-8, -17.4],
    [4, -17.2],
    [16.6, -16.8],
    [-17.4, -6],
    [17.2, -5],
    [-17, 5.5],
    [17.4, 6.5],
    [-16.4, 16.6],
    [16.8, 16.4],
  ] as const) {
    c.add(c.pick(pines), x + c.between(-0.8, 0.8), z + c.between(-0.8, 0.8), { ry: c.rand() * Math.PI * 2, s: c.between(0.85, 1.15) });
  }

  // Pumpkins by the gate, then pumpkins, bones and skulls scattered around the yard.
  c.add(H("pumpkin_orange_jackolantern"), -4.2, 12.2, { ry: 0.3 });
  c.add(H("pumpkin_yellow_jackolantern"), 4.3, 12, { ry: -0.4 });
  c.light(-4.2, 0.9, 12.9, { color: "#ff8a2a", intensity: 5, distance: 6, flicker: true, name: "Pumpkin glow" });
  const yard = { x: [-12.5, 12.5] as [number, number], z: [-12.5, 12.5] as [number, number] };
  const offPath = (x: number) => Math.abs(x) < 1.6;
  c.scatter([H("pumpkin_orange"), H("pumpkin_orange_small"), H("pumpkin_yellow"), H("pumpkin_yellow_small"), H("pumpkin_orange_jackolantern")], 9, yard, {
    s: [0.8, 1.1],
    avoid: offPath,
  });
  c.scatter([H("bone_A"), H("bone_B"), H("bone_C"), H("skull"), H("ribcage"), H("bone_A"), H("bone_B")], 14, yard, { s: [0.7, 1], gap: 0.1, avoid: offPath });
  c.scatter([H("candle"), H("candle_melted"), H("candle_thin")], 6, yard, { gap: 0.1, avoid: offPath });
}

// --- Old graveyard: Graveyard Kit (scaled ×3 to match the Halloween parts) -------------------------

const G = (name: string) => `graveyard-kit-${name}`;

function oldGraveyard(c: Composer) {
  const S = 3;
  const u = (n: number) => n * S;
  const add = (id: string, x: number, z: number, o: AddOptions = {}) => c.add(G(id), u(x), u(z), { s: S, ...o, y: o.y === undefined ? undefined : o.y * S });

  // Iron fence on the tile edges around a 9×9 yard; gate in the middle of the front.
  for (let x = -4; x <= 4; x++) {
    add(x % 2 === 0 ? "iron-fence-border-column" : "iron-fence-border", x, -4, { block: 0 });
    add(x === 0 ? "iron-fence-border-gate" : x % 2 === 0 ? "iron-fence-border-column" : c.chance(0.2) ? "iron-fence-damaged" : "iron-fence-border", x, 4, { ry: Math.PI, block: 0 });
  }
  for (let z = -4; z <= 4; z++) {
    add(z % 2 === 0 ? "iron-fence-border-column" : "iron-fence-border", -4, z, { ry: QUARTER, block: 0 });
    add(z % 2 === 0 ? "iron-fence-border-column" : c.chance(0.2) ? "iron-fence-damaged" : "iron-fence-border", 4, z, { ry: -QUARTER, block: 0 });
  }

  // Large crypt with its roof on top and an animated door.
  add("crypt-large", 0, -2.6, { block: u(1.4) });
  add("crypt-large-roof", 0, -2.6, { y: 1, block: 0 });
  add("crypt-large-door", 0, -2.6 + 1.13, { anim: "open-and-close", block: 0 });
  add("fire-basket", -1.25, -1.2);
  add("fire-basket", 1.25, -1.2);
  c.light(u(-1.25), u(0.45), u(-1.2), { color: "#ff8c3a", intensity: 16, distance: 13, flicker: true, name: "Fire basket light (left)" });
  c.light(u(1.25), u(0.45), u(-1.2), { color: "#ff8c3a", intensity: 16, distance: 13, flicker: true, name: "Fire basket light (right)" });
  add("candle-multiple", -0.55, -1.3, { block: 0 });
  add("candle-multiple", 0.55, -1.3, { block: 0 });
  add("urn-round", -1, -3.2);
  add("urn-square", 1, -3.2);

  // Road from the gate to the crypt.
  for (let z = 3.55; z > -1.3; z -= 0.79) add("road", 0, z, { block: u(0.45) });

  // Two blocks of graves: a mound plus a headstone at its head end.
  const stones = ["gravestone-cross", "gravestone-round", "gravestone-bevel", "gravestone-decorative", "gravestone-roof", "gravestone-wide", "gravestone-broken", "cross", "cross-wood", "gravestone-cross-large"];
  for (const x of [-3.1, -2.1, -1.1, 1.1, 2.1, 3.1]) {
    for (const z of [-0.1, 1.9]) {
      const jitter = c.between(-0.06, 0.06);
      add(c.chance(0.3) ? "grave-border" : "grave", x + jitter, z, { ry: c.between(-0.05, 0.05) });
      add(c.pick(stones), x + jitter, z - 0.72, { ry: c.between(-0.12, 0.12) });
    }
  }

  // Entrance lamps.
  add("lightpost-single", -0.75, 3.3, { ry: QUARTER });
  add("lightpost-single", 0.75, 3.3, { ry: -QUARTER });
  c.light(u(-0.45), u(1.05), u(3.3), { color: "#ffc36b", intensity: 12, distance: 12, name: "Lamp light (left)" });
  c.light(u(0.45), u(1.05), u(3.3), { color: "#ffc36b", intensity: 12, distance: 12, name: "Lamp light (right)" });

  // The residents.
  add("character-keeper", -1.0, 2.9, { ry: 0.5, anim: "idle" });
  add("character-zombie", 2.6, 0.9, { ry: -0.9, anim: "walk" });
  add("character-skeleton", 1.15, 2.85, { ry: -0.5, anim: "emote-yes" });
  add("character-ghost", -2.6, 0.95, { ry: 0.8, anim: "idle", y: 0.15 });
  add("character-vampire", 0.85, -0.6, { ry: -0.4, anim: "idle" });

  // Coffins, a fresh dig and benches by the crypt.
  add("coffin", 2.9, -2.4, { ry: 0.3 });
  add("coffin-old", -2.9, -2.6, { ry: -0.25 });
  add("shovel-dirt", -2.1, -3.2, { ry: 0.6 });
  add("bench", -3.45, -1, { ry: QUARTER });
  add("bench-damaged", 3.45, -0.9, { ry: -QUARTER });
  add("pillar-obelisk", -3.5, 3.4);
  add("cross-column", 3.5, 3.4);

  // Pines inside the back corners and all around the outside.
  add("pine-crooked", -3.3, -3.4, { ry: 0.4 });
  add("pine-fall", 3.3, -3.3, { ry: 2.1 });
  const pines = ["pine", "pine-crooked", "pine-fall", "pine-fall-crooked"];
  c.scatter(
    pines.map(G),
    22,
    { x: [u(-8), u(8)], z: [u(-8), u(8)] },
    { s: [S * 0.85, S * 1.25], gap: 0.6, avoid: (x, z) => (Math.abs(x) < u(4.8) && Math.abs(z) < u(4.8)) || (z > u(4) && Math.abs(x) < u(2.2)) },
  );

  // Pumpkins, candles, rocks and debris.
  const yard = { x: [u(-3.6), u(3.6)] as [number, number], z: [u(-3.6), u(3.7)] as [number, number] };
  const offRoad = (x: number) => Math.abs(x) < u(0.55);
  c.scatter(["pumpkin", "pumpkin-carved", "pumpkin-tall", "pumpkin-tall-carved"].map(G), 8, yard, { s: [S * 0.9, S * 1.1], avoid: offRoad });
  c.scatter(["candle", "lantern-candle", "candle-multiple"].map(G), 6, yard, { s: [S, S], gap: 0.1, avoid: offRoad });
  c.scatter(["debris", "debris-wood", "rocks"].map(G), 6, yard, { s: [S * 0.8, S], avoid: offRoad });
  c.scatter(["rocks", "rocks-tall", "trunk", "trunk-long", "hay-bale"].map(G), 10, { x: [u(-7), u(7)], z: [u(-7), u(7)] }, {
    s: [S * 0.8, S * 1.2],
    avoid: (x, z) => Math.abs(x) < u(4.6) && Math.abs(z) < u(4.6),
  });
}

// --- Forest campsite: Nature Kit + Mini Characters + Cube Pets (scaled ×3) -------------------------

const N = (name: string) => `nature-kit-${name}`;
const MC = (name: string) => `mini-characters-${name}`;

function forestCampsite(c: Composer) {
  const S = 3;
  const u = (n: number) => n * S;
  const add = (id: string, x: number, z: number, o: AddOptions = {}) => c.add(id, u(x), u(z), { s: S, ...o });

  // Campfire with a flickering light.
  add(N("campfire_stones"), 0, 0);
  add(N("campfire_logs"), 0, 0, { block: 0 });
  c.light(0, 1.2, 0, { color: "#ff8a2b", intensity: 30, distance: 18, flicker: true, name: "Campfire light" });

  // Logs to sit on, and the campers (the mini characters are authored larger than the nature kit).
  const person = { s: 2 };
  add(N("log_large"), 0, -1.45, { ry: 0.05 });
  add(N("log_large"), -1.35, 0.55, { ry: QUARTER + 0.5 });
  add(N("stump_round"), 1.35, 0.7);
  add(MC("character-male-a"), 0, -1.75, { ...person, anim: "sit", block: 0 });
  add(MC("character-female-b"), -1.6, 0.7, { ...person, ry: 2.1, anim: "sit", block: 0 });
  add(MC("character-female-d"), 1.6, 1.1, { ...person, ry: -2.3, anim: "emote-yes" });
  add(MC("character-male-c"), 2.3, -1.3, { ...person, ry: -0.9, anim: "idle" });
  c.add("cube-pets-animal-dog", u(-0.6), u(1.5), { ry: 2.6, s: 0.5, anim: "idle" });

  // Tents facing the fire, firewood and gear.
  add(N("tent_detailedOpen"), -2.6, -2.4, { ry: 0.75 });
  add(N("tent_smallClosed"), 2.7, -2.8, { ry: -0.6 });
  add(N("log_stack"), -3.9, -0.6, { ry: 1.2 });
  add(N("log_stackLarge"), 3.9, -0.9, { ry: -1.4 });
  add(N("canoe"), 4.2, 2.2, { ry: 0.9 });
  add(N("canoe_paddle"), 3.5, 2.6, { ry: 0.3 });
  add(N("pot_large"), -2.1, 1.9, { ry: 0.3 });

  // Stone path into the clearing, with a sign.
  for (let z = 2.4; z <= 9.5; z += 0.62) add(N(c.chance(0.5) ? "path_stone" : "path_stoneCircle"), c.between(-0.06, 0.06), z, { ry: QUARTER + c.between(-0.2, 0.2), block: u(0.4) });
  add(N("sign"), 0.75, 5.2, { ry: -0.3 });

  // Forest ring: tall pines and leafy trees around the clearing, a darker ring further out.
  const trees = ["tree_pineTallA_detailed", "tree_pineTallB_detailed", "tree_pineTallC_detailed", "tree_pineTallD_detailed", "tree_pineRoundA", "tree_pineRoundC", "tree_default", "tree_oak", "tree_fat", "tree_detailed", "tree_default_fall", "tree_oak_fall", "tree_tall"].map(N);
  const offPath = (x: number, z: number) => z > u(1.5) && Math.abs(x) < u(1);
  c.scatter(trees, 26, { x: [0, 0], z: [0, 0], ring: [u(5.2), u(9)] }, { s: [S * 0.9, S * 1.35], gap: 0.4, avoid: offPath });
  c.scatter(trees, 34, { x: [0, 0], z: [0, 0], ring: [u(9), u(15)] }, { s: [S * 1.1, S * 1.6], gap: 0.6, avoid: offPath });

  // Undergrowth.
  const clearing = { x: [0, 0] as [number, number], z: [0, 0] as [number, number], ring: [u(2.6), u(7)] as [number, number] };
  c.scatter(["rock_largeA", "rock_largeC", "rock_tallA", "rock_tallE", "stone_tallB", "stump_old", "stump_oldTall", "log"].map(N), 10, clearing, { s: [S * 0.8, S * 1.2], avoid: offPath });
  c.scatter(["mushroom_redGroup", "mushroom_tanGroup", "mushroom_red", "mushroom_tanTall"].map(N), 8, clearing, { s: [S, S * 1.3], gap: 0.1, avoid: offPath });
  c.scatter(["flower_redA", "flower_yellowA", "flower_purpleA", "flower_redB", "flower_yellowB", "flower_purpleB"].map(N), 16, clearing, { s: [S, S * 1.4], gap: 0.05, avoid: offPath });
  c.scatter(["grass_large", "grass", "plant_bush", "plant_bushDetailed", "plant_bushLarge", "grass_leafsLarge"].map(N), 22, { x: [0, 0], z: [0, 0], ring: [u(2.8), u(12)] }, { s: [S, S * 1.5], gap: 0.05, avoid: offPath });
}

export const TEMPLATES: TemplateInfo[] = [
  {
    key: "haunted-backyard",
    name: "Haunted backyard",
    description: "Fenced graveyard yard with a crypt, dead trees, autumn pines, coffins, an open grave and animated skeletons.",
    kits: ["Halloween Bits", "Character Pack Skeletons"],
    environment: "night",
    ground: { kind: "dark", size: 160, y: -0.5 },
    camera: { position: [11, 15, 31], target: [0, 1.5, 0] },
    compose: hauntedBackyard,
  },
  {
    key: "old-graveyard",
    name: "Old graveyard",
    description: "Iron-fenced cemetery with a crypt whose door swings open, rows of graves, pines and its keeper, zombie, ghost and vampire.",
    kits: ["Graveyard Kit"],
    environment: "night",
    ground: { kind: "grass", size: 160, y: 0 },
    camera: { position: [-9, 12, 30], target: [0, 1.5, 0] },
    compose: oldGraveyard,
  },
  {
    key: "forest-campsite",
    name: "Forest campsite",
    description: "Clearing with a campfire, tents, campers on logs, a dog, a stone path and a ring of pines and leafy trees.",
    kits: ["Nature Kit", "Mini Characters", "Cube Pets"],
    environment: "sunset",
    ground: { kind: "grass", size: 200, y: -0.15 },
    camera: { position: [5, 9.5, 21], target: [0, 0.8, -1] },
    compose: forestCampsite,
  },
];

export function buildTemplate(template: TemplateInfo, parts: Map<string, Part>, seed: number): SceneDoc {
  const composer = new Composer(parts, seededRandom(seed));
  template.compose(composer);
  return {
    ...emptyScene(template.name),
    environment: template.environment,
    ground: { ...template.ground },
    camera: template.camera,
    template: { key: template.key, seed },
    items: composer.items,
  };
}
