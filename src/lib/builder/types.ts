import type { Category, SourceKey } from "@/lib/catalog";

// --- Parts index (served by /data/parts.json) --------------------------------------------------

export interface PartsIndex {
  collections: Record<string, { name: string; category: Category; source: SourceKey; count: number }>;
  sources: Record<SourceKey, { licenseName: string; licenseShort: string; terms: string; copyright: string; licenseFile: string }>;
  /** Biped clips, playable on the rigged characters (`set` f/m). */
  clips: { id: string; label: string; set: "f" | "m"; file: string }[];
  parts: RawPart[];
}

export interface RawPart {
  id: string;
  slug: string;
  title: string;
  /** Collection key. */
  c: string;
  glb: string;
  /** Only present when it isn't the .glb path with a .webp extension. */
  thumb?: string;
  noThumb?: boolean;
  size: [number, number, number];
  tri: number;
  /** Has animation clips (embedded, or the Biped set). */
  anim?: true;
  /** Names of the embedded clips (library parts only). */
  clips?: string[];
  /** Biped animation set. */
  set?: "f" | "m";
  /** License, only when it differs from the collection's. */
  src?: SourceKey;
  /** Author credit line, for licenses that require one. */
  credit?: string;
}

export interface Part {
  id: string;
  slug: string;
  title: string;
  collectionKey: string;
  collection: string;
  category: Category;
  source: SourceKey;
  glb: string;
  thumb: string | null;
  size: [number, number, number];
  tri: number;
  animated: boolean;
  /** Embedded clip names (empty for Biped characters, whose clips come from the index). */
  clips: string[];
  set: "f" | "m" | null;
  /** Author credit line, for licenses that require one. */
  credit: string | null;
  /** Lower-cased search text. */
  search: string;
}

export function resolveParts(index: PartsIndex): Part[] {
  return index.parts.map((p) => {
    const col = index.collections[p.c];
    const collection = col?.name ?? p.c;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      collectionKey: p.c,
      collection,
      category: col?.category ?? "Props",
      source: p.src ?? col?.source ?? "cc0",
      glb: p.glb,
      thumb: p.noThumb ? null : (p.thumb ?? p.glb.replace(/\.glb$/, ".webp")),
      size: p.size,
      tri: p.tri,
      animated: !!p.anim,
      clips: p.clips ?? [],
      set: p.set ?? null,
      credit: p.credit ?? null,
      search: `${p.title} ${p.id} ${collection}`.toLowerCase(),
    };
  });
}

// --- Scene document ------------------------------------------------------------------------------

export type Vec3 = [number, number, number];

export interface LightSettings {
  color: string;
  /** Candela (three.js / glTF KHR_lights_punctual units). */
  intensity: number;
  /** Range in metres; 0 = infinite. */
  distance: number;
  /** Flame-like flicker in the editor (not exported — glTF lights are static). */
  flicker?: boolean;
}

export interface MotionStop {
  /** Distance along the path (m) where the item waits. */
  at: number;
  /** Seconds. */
  wait: number;
  /** World point (x, z) to face while waiting — the stall or ride being visited. */
  look?: [number, number];
}

/**
 * Makes an item travel a closed loop — coaster cars round their track, people from place to place.
 * The path is relative to the item's position, so moving or copying the item takes its path along;
 * the item's rotation is kept as an offset on top of the direction of travel.
 */
export interface Motion {
  path: Vec3[];
  /** Up direction at each path point (coaster cars rolling through loopings); otherwise upright. */
  ups?: Vec3[];
  /** Metres per second. */
  speed: number;
  /** Metres behind the schedule's lead point — keeps a train's cars apart. */
  lag?: number;
  /** Seconds into the loop at time 0. */
  phase?: number;
  stops?: MotionStop[];
  /** Clip played while waiting at a stop; the item's own animation plays while it moves. */
  stopAnimation?: string | null;
  /** "yaw": stays upright and turns to face the way it goes; "full": also pitches and rolls with the path. */
  orient?: "yaw" | "full";
}

export interface SceneItem {
  id: string;
  /** "model" parts reference a library model; "light" is a point light. */
  kind: "model" | "light";
  /** Library model id (models only). */
  part?: string;
  /** Model file (models only) — stored so a saved scene loads without the index. */
  glb?: string;
  name: string;
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
  scale: Vec3;
  /** Embedded clip name, or a Biped clip id for the rigged characters. */
  animation?: string | null;
  motion?: Motion;
  light?: LightSettings;
  hidden?: boolean;
  locked?: boolean;
}

export type EnvKey = "day" | "sunset" | "night" | "studio";
export type GroundKind = "grass" | "dirt" | "stone" | "sand" | "snow" | "dark" | "none";

export interface SceneDoc {
  format: "3d-models-scene";
  version: 1;
  name: string;
  environment: EnvKey;
  ground: { kind: GroundKind; size: number; y: number };
  /** Saved view, restored when the scene is opened. */
  camera?: { position: Vec3; target: Vec3 };
  /** The generated template this scene started from (lets "Remix" rebuild it with a new seed). */
  template?: { key: string; seed: number };
  items: SceneItem[];
}

export const ENVIRONMENTS: Record<
  EnvKey,
  {
    label: string;
    background: string;
    fog: [string, number, number] | null;
    sun: { color: string; intensity: number; position: Vec3 };
    hemi: [string, string, number];
    envIntensity: number;
    sky: { sunPosition: Vec3; turbidity: number; rayleigh: number } | null;
    stars: boolean;
    exposure: number;
  }
> = {
  day: {
    label: "Day",
    background: "#a9cbe8",
    fog: ["#c3d8ea", 45, 170],
    sun: { color: "#fff3df", intensity: 2.6, position: [22, 34, 16] },
    hemi: ["#dcecff", "#4a5a33", 0.7],
    envIntensity: 0.7,
    sky: { sunPosition: [22, 34, 16], turbidity: 6, rayleigh: 1.4 },
    stars: false,
    exposure: 1,
  },
  sunset: {
    label: "Sunset",
    background: "#f0a370",
    fog: ["#d99a7c", 30, 140],
    sun: { color: "#ffae6b", intensity: 2.4, position: [-34, 9, -18] },
    hemi: ["#ffcfa3", "#3d2a3c", 0.55],
    envIntensity: 0.55,
    sky: { sunPosition: [-34, 3, -18], turbidity: 9, rayleigh: 3 },
    stars: false,
    exposure: 1,
  },
  night: {
    label: "Night",
    background: "#06070f",
    fog: ["#0b0e1f", 16, 70],
    sun: { color: "#9db2ff", intensity: 0.9, position: [-18, 30, 14] },
    hemi: ["#5866b8", "#0b0a12", 0.4],
    envIntensity: 0.22,
    sky: null,
    stars: true,
    exposure: 1.15,
  },
  studio: {
    label: "Studio",
    background: "#14121c",
    fog: null,
    sun: { color: "#ffffff", intensity: 1.6, position: [14, 24, 12] },
    hemi: ["#e8e6ff", "#1a1626", 0.4],
    envIntensity: 1,
    sky: null,
    stars: false,
    exposure: 1.05,
  },
};

export const GROUNDS: Record<GroundKind, { label: string; color: string | null }> = {
  grass: { label: "Grass", color: "#4b6b34" },
  dirt: { label: "Dirt", color: "#4f3d2c" },
  stone: { label: "Stone", color: "#6a6a70" },
  sand: { label: "Sand", color: "#cdb586" },
  snow: { label: "Snow", color: "#e6edf5" },
  dark: { label: "Dark", color: "#17161d" },
  none: { label: "None", color: null },
};

export function emptyScene(name = "Untitled scene"): SceneDoc {
  return { format: "3d-models-scene", version: 1, name, environment: "day", ground: { kind: "grass", size: 80, y: 0 }, items: [] };
}

/** The clip a newly placed animated part plays: its idle, if it has one. */
export function defaultClip(names: string[]): string | null {
  return names.find((n) => /^idle$/i.test(n)) ?? names.find((n) => /^idle/i.test(n)) ?? names.find((n) => /idle/i.test(n)) ?? null;
}

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Scenes saved before library files moved from /library/<group>/<kit>/ to /library/<kit>/, when part
 * ids (and some file names) still started with "<group>-".
 */
function upgradeLegacyModel(glb: string, part: string | undefined): { glb: string; part: string | undefined } {
  const legacy = /^\/library\/([^/]+)\/([^/]+)\/([^/]+\.glb)$/.exec(glb);
  if (!legacy) return { glb, part };
  const [, group, kit, file] = legacy;
  const drop = (s: string) => (s.startsWith(`${group}-`) ? s.slice(group.length + 1) : s);
  return { glb: `/library/${kit}/${drop(file)}`, part: part && drop(part) };
}

const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** Keeps a saved motion only when it is well-formed. */
function parseMotion(raw: unknown): Motion | undefined {
  const m = raw as Partial<Motion> | undefined;
  if (!m || !Array.isArray(m.path) || m.path.length < 2 || !m.path.every(isVec) || typeof m.speed !== "number" || !(m.speed > 0)) return undefined;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
  return {
    path: m.path,
    ...(Array.isArray(m.ups) && m.ups.length === m.path.length && m.ups.every(isVec) ? { ups: m.ups } : {}),
    speed: m.speed,
    ...(num(m.lag) !== undefined ? { lag: m.lag } : {}),
    ...(num(m.phase) !== undefined ? { phase: m.phase } : {}),
    ...(Array.isArray(m.stops)
      ? {
          stops: m.stops
            .filter((st) => st && num(st.at) !== undefined && num(st.wait) !== undefined && st.wait >= 0)
            .map((st) => ({ at: st.at, wait: st.wait, ...(Array.isArray(st.look) && st.look.length === 2 && st.look.every((n) => num(n) !== undefined) ? { look: st.look } : {}) })),
        }
      : {}),
    ...(typeof m.stopAnimation === "string" || m.stopAnimation === null ? { stopAnimation: m.stopAnimation } : {}),
    orient: m.orient === "full" ? "full" : "yaw",
  };
}

/** Validates a parsed .json scene file; throws with a readable message when it isn't one. */
export function parseSceneFile(data: unknown): SceneDoc {
  const doc = data as Partial<SceneDoc>;
  if (!doc || doc.format !== "3d-models-scene" || !Array.isArray(doc.items)) throw new Error("Not a scene file from this builder.");
  const base = emptyScene(typeof doc.name === "string" ? doc.name : "Imported scene");
  const vec = (v: unknown, fallback: Vec3): Vec3 =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as Vec3) : fallback;
  return {
    ...base,
    environment: doc.environment && doc.environment in ENVIRONMENTS ? doc.environment : base.environment,
    ground: {
      kind: doc.ground?.kind && doc.ground.kind in GROUNDS ? doc.ground.kind : base.ground.kind,
      size: typeof doc.ground?.size === "number" ? doc.ground.size : base.ground.size,
      y: typeof doc.ground?.y === "number" ? doc.ground.y : 0,
    },
    ...(doc.template && typeof doc.template.key === "string" && typeof doc.template.seed === "number" ? { template: { key: doc.template.key, seed: doc.template.seed } } : {}),
    ...(doc.camera ? { camera: { position: vec(doc.camera.position, [0, 16, 34]), target: vec(doc.camera.target, [0, 1, 0]) } } : {}),
    items: doc.items
      // Models must point at files on this site (a root-relative path), never at another origin.
      .filter((i) => i && (i.kind === "light" || (i.kind === "model" && typeof i.glb === "string" && /^\/(?!\/)[\w\-./ ]+\.glb$/.test(i.glb))))
      .map((i) => ({
        ...i,
        ...(i.kind === "model" ? upgradeLegacyModel(i.glb!, i.part) : {}),
        id: newId(),
        name: typeof i.name === "string" ? i.name : "Item",
        position: vec(i.position, [0, 0, 0]),
        rotation: vec(i.rotation, [0, 0, 0]),
        scale: vec(i.scale, [1, 1, 1]),
        motion: i.kind === "model" ? parseMotion(i.motion) : undefined,
        ...(i.kind === "light"
          ? {
              light: {
                color: typeof i.light?.color === "string" && /^#[0-9a-f]{6}$/i.test(i.light.color) ? i.light.color : "#ffa040",
                intensity: typeof i.light?.intensity === "number" ? i.light.intensity : 14,
                distance: typeof i.light?.distance === "number" ? i.light.distance : 14,
                flicker: !!i.light?.flicker,
              },
            }
          : {}),
      })),
  };
}
