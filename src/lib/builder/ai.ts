import { COASTER_STYLES, type CoasterStyle } from "@/lib/builder/coaster";
import { ENVIRONMENTS, type EnvKey, type GroundKind, type Part, type PartsIndex, type SceneDoc, type SceneItem } from "@/lib/builder/types";

/**
 * AI scenes: Gemini picks kits from the parts library and writes a compact layout plan (landmarks,
 * rows, fills, rings, scatters, coaster rides, walkers, lights) — for a new scene, or for an addition
 * to the open one. `buildAiScene` (ai-build.ts) turns the plan into scene items.
 *
 * Calls go straight from the browser to the Gemini API with the user's own key — the site is a static
 * export, so there is no server to hide a shared key behind.
 */

// --- Settings ------------------------------------------------------------------------------------

export type AiSize = "small" | "medium" | "large" | "huge";

export const AI_SIZES: Record<AiSize, { label: string; area: number; objects: [number, number]; maxItems: number; maxTriangles: number; kits: [number, number] }> = {
  small: { label: "Small", area: 40, objects: [60, 160], maxItems: 320, maxTriangles: 500_000, kits: [2, 5] },
  medium: { label: "Medium", area: 80, objects: [160, 400], maxItems: 750, maxTriangles: 1_000_000, kits: [3, 7] },
  large: { label: "Large", area: 140, objects: [400, 900], maxItems: 1500, maxTriangles: 1_800_000, kits: [4, 9] },
  huge: { label: "Huge", area: 220, objects: [800, 1600], maxItems: 2500, maxTriangles: 2_800_000, kits: [5, 11] },
};

export const AI_EXAMPLES: { label: string; prompt: string }[] = [
  { label: "Theme park", prompt: "A big theme park with roller coasters, a grand entrance gate, food and drink stalls, an arcade, benches, trees and crowds of visitors" },
  { label: "Town", prompt: "A small town with streets, houses, shops, parked cars, street lamps, trees and people walking around" },
  { label: "Farm", prompt: "A countryside farm with a barn, fenced fields, crops, farm animals, a pond and a dirt road" },
  { label: "Moon base", prompt: "A space base on the moon with habitat modules, rovers, landing pads, satellites and astronauts" },
  { label: "Medieval fair", prompt: "A medieval village fair with a castle wall, market booths, a stage, carts, barrels and villagers" },
  { label: "Haunted night", prompt: "A haunted graveyard at night with a crypt, crooked trees, pumpkins, candles and skeletons" },
];

/** Ideas for changing the open scene. */
export const AI_EDIT_EXAMPLES: { label: string; prompt: string }[] = [
  { label: "Add a coaster", prompt: "Add a big roller coaster with loopings on the free ground, with a path from the main walkway to its entrance" },
  { label: "Walking crowds", prompt: "Add lots of people walking along the paths from stall to stall and to the ride entrances" },
  { label: "Swap parts", prompt: "Replace all the benches with street lamps, and the small trees with big oak trees" },
  { label: "Clear an area", prompt: "Remove the trees and rocks on the left side and put a food court with stalls and tables there" },
  { label: "Party time", prompt: "Make it night, add warm lights along the paths, and make the standing people dance" },
  { label: "Change a ride", prompt: "Replace the roller coaster at the back with a wooden coaster without loopings" },
];

export interface GeminiModel {
  id: string;
  label: string;
}

/** Shown until the key's own model list has loaded. */
export const FALLBACK_MODELS: GeminiModel[] = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-flash-latest", label: "Gemini Flash Latest" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
];

/**
 * "Auto" tries these first when the key has them (they answered reliably on the free tier), then the
 * key's other models; the last model that answered goes first next time.
 */
const PREFERRED_MODELS = FALLBACK_MODELS.map((m) => m.id);
const AUTO_LIMIT = 6;

const KEY_STORAGE = "scene-builder:gemini-key";
const MODEL_STORAGE = "scene-builder:gemini-model";

/**
 * The site's default key, `NEXT_PUBLIC_GEMINI_API_KEY`. It lives in `.env.development.local`, which only
 * `npm run dev` loads, so a production build leaves it out unless it is set for the build on purpose —
 * a NEXT_PUBLIC_ value is inlined into the public JavaScript, where anyone can read it. Visitors can
 * always use their own key instead.
 */
export const BUILTIN_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";

/** Short, safe-to-show form of a key. */
export function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "••••";
}

export function readStoredKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredKey(key: string) {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode: the key lasts until the dialog closes.
  }
}

function modelChain(choice: string, available: string[]): string[] {
  if (choice !== "auto") return [choice];
  let last = "";
  try {
    last = window.localStorage.getItem(MODEL_STORAGE) ?? "";
  } catch {
    // ignore
  }
  const pool = available.length ? available : PREFERRED_MODELS;
  const order = [last, ...PREFERRED_MODELS, ...pool].filter((m) => m && pool.includes(m));
  return [...new Set(order)].slice(0, AUTO_LIMIT);
}

/** Text models only — not speech, image, music, embedding or agent models. */
const NOT_FOR_SCENES = /tts|image|banana|embed|transcri|audio|live|lyria|robotics|computer-use|deep-research|antigravity|customtools|omni|aqa|learnlm/i;

/** Flash before Flash-Lite before Pro (Pro has no free tier), newest version first. */
function modelRank(id: string): [number, number] {
  const tier = /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : /pro/.test(id) ? 2 : 3;
  const version = /latest/.test(id) ? 0 : Number(/^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  return [tier, version];
}

/** The models this key can call that can write a scene plan. */
export async function listModels(key: string, signal?: AbortSignal): Promise<GeminiModel[]> {
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key }, signal });
  const body = (await res.json().catch(() => null)) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] } | null;
  if (!res.ok) {
    throw new AiError(res.status === 400 || res.status === 401 || res.status === 403 ? "Gemini didn't accept this API key." : `Couldn't load the model list (${res.status}).`);
  }
  return (body?.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name }))
    .filter((m) => m.id.startsWith("gemini-") && !NOT_FOR_SCENES.test(m.id) && !NOT_FOR_SCENES.test(m.label))
    .sort((a, b) => {
      const [ta, va] = modelRank(a.id);
      const [tb, vb] = modelRank(b.id);
      return ta - tb || vb - va || a.id.localeCompare(b.id);
    });
}

// --- Gemini client -------------------------------------------------------------------------------

export class AiError extends Error {}

const API = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  error?: { message?: string };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function generateJson<T>(o: {
  key: string;
  models: string[];
  system: string;
  prompt: string;
  schema: object;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
}): Promise<{ data: T; model: string }> {
  const failures: string[] = [];
  for (const model of o.models) {
    o.onModel?.(model);
    let res: Response;
    try {
      res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal: o.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": o.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: o.system }] },
          contents: [{ role: "user", parts: [{ text: o.prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: o.schema, maxOutputTokens: 60000 },
        }),
      });
    } catch (err) {
      if (o.signal?.aborted) throw err;
      failures.push(`${model}: network error`);
      continue;
    }
    const body = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) {
      const message = (body?.error?.message ?? res.statusText).split("\n")[0].slice(0, 160);
      if (/api key/i.test(message) && (res.status === 400 || res.status === 401 || res.status === 403)) {
        throw new AiError("Gemini didn't accept the API key — check it in the key field.");
      }
      // 404 (model gone), 429 (quota), 5xx (overloaded): try the next model.
      failures.push(`${model}: ${res.status === 429 ? "quota / rate limit reached" : res.status === 503 ? "busy right now" : `${res.status} ${message}`}`);
      continue;
    }
    const candidate = body?.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    const data = parseJson(text);
    if (data && typeof data === "object") {
      try {
        window.localStorage.setItem(MODEL_STORAGE, model);
      } catch {
        // ignore
      }
      return { data: data as T, model };
    }
    failures.push(`${model}: ${candidate?.finishReason === "MAX_TOKENS" ? "the answer was cut off" : "the answer wasn't valid JSON"}`);
  }
  throw new AiError(`No Gemini model could answer — ${failures.join(" · ")}`);
}

// --- Prompts -------------------------------------------------------------------------------------

export const ACTIONS = ["idle", "walk", "run", "dance", "cheer", "wave", "talk", "sit"] as const;
export type Action = (typeof ACTIONS)[number];

const GROUND_KINDS: Exclude<GroundKind, "none">[] = ["grass", "dirt", "stone", "sand", "snow", "dark"];
const ENV_KEYS = Object.keys(ENVIRONMENTS) as EnvKey[];

/** Extra know-how for kits whose parts must be assembled a particular way. */
const KIT_NOTES: Record<string, string> = {
  "coaster-kit":
    "Never lay coaster track, supports or trains by hand — the `coasters` tool builds whole rides from them, and their trains run by themselves. Use the other parts directly: `park-entrance` is the main gate; stalls: stall-food, stall-drinks, stall-information, stall-toilets (mark them visit: true); `path-*` tiles (1×1, with kerbs — lay them in lines for walkways, not as fills for plazas); bench, trash, flowers, tree, tree-large. Kit scale 2–2.5.",
  "city-kit-roads": "Road tiles are 1×1 units; lay them in straight lines on a grid of (tile size × scale) so they join.",
  "3d-road-tiles": "Road tiles are 3×3 units; lay them in straight lines on a grid of (tile size × scale) so they join.",
  "medieval-fair": "Authored in real metres (scale 1). `Floor`, `Path` and `Roof` are 40–60 m wide set pieces — avoid them unless the scene is built around them.",
  "momuspark": "Authored in real metres (scale 1). Floating islands, the sky door and the logo are huge set pieces — use them only as landmarks.",
};

export function shortName(p: Part): string {
  return p.id.startsWith(`${p.collectionKey}-`) ? p.id.slice(p.collectionKey.length + 1) : p.id;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Spread-out sample of a kit's part names (variants like `_01`, `_02` count once). */
function sampleNames(list: Part[], max: number): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of list) {
    const name = shortName(p);
    const stem = name.toLowerCase().replace(/[-_ ]?(\d+|[a-f])$/i, "").replace(/[-_ ]?(art|large|small|medium|tall|short)$/i, "");
    if (seen.has(stem)) continue;
    seen.add(stem);
    unique.push(name);
  }
  if (unique.length <= max) return unique;
  return Array.from({ length: max }, (_, i) => unique[Math.floor((i * unique.length) / max)]);
}

/** People in a kit tell the AI how to scale it to real metres. */
function peopleHeight(list: Part[]): number | null {
  const heights = list
    .filter((p) => p.set || (p.clips.some((c) => /walk/i.test(c)) && /character|male|female|man|woman|person|skeleton|zombie|knight|mage|rogue|barbarian|adventurer|survivor|astronaut|gamer|employee/i.test(p.id)))
    .map((p) => p.size[1])
    .sort((a, b) => a - b);
  return heights.length ? heights[Math.floor(heights.length / 2)] : null;
}

function groupByKit(parts: Part[]): Map<string, Part[]> {
  const kits = new Map<string, Part[]>();
  for (const p of parts) {
    const list = kits.get(p.collectionKey) ?? [];
    list.push(p);
    kits.set(p.collectionKey, list);
  }
  return kits;
}

// --- The scene being added to --------------------------------------------------------------------

/** The square the plan works in (centred on the origin) and the ground it needs. */
export interface SceneFrame {
  half: number;
  groundSize: number;
}

/** Pieces of a coaster ride (track, supports, station, queue, entrance, trains). */
export const RIDE_PART = /^coaster-kit-(coaster-|support-|station|queue-|ride-|train-)/;

/** Rigged and animated characters (people, skeletons…) — not animated props like doors. */
export const isPerson = (p: Part) =>
  !!p.set || (p.clips.some((c) => /walk/i.test(c)) && /character|male|female|man|woman|person|skeleton|zombie|knight|mage|rogue|barbarian|adventurer|survivor|astronaut|gamer|employee|child|adult/i.test(p.id));

/** Thin slabs (paths, road and floor tiles) count as walkable ground. */
export const tileLike = (p: Part) => p.size[1] * 3 <= Math.min(p.size[0], p.size[2]);

/** Footprint of an existing item: centre, width / depth after scaling, turn, and whether it is flat ground. */
export function itemFootprint(item: SceneItem, part: Part): { x: number; z: number; w: number; d: number; yaw: number; flat: boolean } {
  const sx = Math.abs(item.scale[0]);
  const sy = Math.abs(item.scale[1]);
  const sz = Math.abs(item.scale[2]);
  const top = item.position[1] + part.size[1] * sy;
  return {
    x: item.position[0],
    z: item.position[2],
    w: part.size[0] * sx,
    d: part.size[2] * sz,
    yaw: item.rotation[1],
    flat: top < 0.45 || part.size[1] * sy < 0.4,
  };
}

/** Static items of a scene with their parts (lights and travelling items left out). */
export function staticItems(doc: SceneDoc, parts: Map<string, Part>): { item: SceneItem; part: Part }[] {
  return doc.items.flatMap((item) => {
    const part = item.kind === "model" && item.part && !item.motion ? parts.get(item.part) : undefined;
    return part && !item.hidden ? [{ item, part }] : [];
  });
}

export function sceneFrame(size: AiSize, base: SceneDoc | null, parts: Map<string, Part>): SceneFrame {
  const area = AI_SIZES[size].area;
  if (!base) return { half: area / 2, groundSize: Math.max(100, Math.round(area * 1.8)) };
  let extent = 0;
  for (const { item, part } of staticItems(base, parts)) {
    const f = itemFootprint(item, part);
    extent = Math.max(extent, Math.abs(f.x) + Math.max(f.w, f.d) / 2, Math.abs(f.z) + Math.max(f.w, f.d) / 2);
  }
  // Room for the addition next to what is there, without growing past ~200 m each way.
  const half = Math.min(200, Math.max(area / 2, extent ? extent + area * 0.25 : 0));
  return { half: Math.ceil(half), groundSize: Math.max(base.ground.size, Math.round(half * 2.6)) };
}

/** Typical scale of each kit already in the scene, so additions match it. */
export function sceneKitScales(base: SceneDoc | null, parts: Map<string, Part>): Map<string, number> {
  const scales = new Map<string, number[]>();
  for (const { item, part } of base ? staticItems(base, parts) : []) {
    const list = scales.get(part.collectionKey) ?? [];
    list.push(Math.abs(item.scale[0]));
    scales.set(part.collectionKey, list);
  }
  return new Map([...scales].map(([kit, list]) => [kit, list.sort((a, b) => a - b)[Math.floor(list.length / 2)]]));
}

/**
 * What the AI needs to change a scene: its size, the kits it uses (and their scales), an inventory of
 * every part by name, what moves, and a coarse map of built, walkable and free ground.
 */
function describeScene(base: SceneDoc, parts: Map<string, Part>, frame: SceneFrame): string {
  const items = staticItems(base, parts);
  const scales = sceneKitScales(base, parts);
  const counts = new Map<string, number>();
  for (const { part } of items) counts.set(part.collectionKey, (counts.get(part.collectionKey) ?? 0) + 1);

  // Inventory, one line per part; coaster rides are summed up by their entrances.
  const byPart = new Map<string, { size: string; area: number; xs: number[]; zs: number[] }>();
  const rides: string[] = [];
  for (const { item, part } of items) {
    if (RIDE_PART.test(part.id)) {
      if (shortName(part) === "ride-entrance") rides.push(`(${fmt(item.position[0])}, ${fmt(item.position[2])})`);
      continue;
    }
    const f = itemFootprint(item, part);
    const name = `${part.collectionKey}/${shortName(part)}`;
    const entry = byPart.get(name) ?? { size: `${fmt(f.w)} × ${fmt(f.d)} m`, area: f.w * f.d, xs: [], zs: [] };
    entry.xs.push(f.x);
    entry.zs.push(f.z);
    byPart.set(name, entry);
  }
  const range = (v: number[]) => `${fmt(Math.min(...v))}..${fmt(Math.max(...v))}`;
  const inventory = [...byPart]
    .sort((a, b) => b[1].area * Math.sqrt(b[1].xs.length) - a[1].area * Math.sqrt(a[1].xs.length))
    .slice(0, 120)
    .map(([name, e]) => {
      const n = e.xs.length;
      const where = n <= 4 ? `at ${e.xs.map((x, i) => `(${fmt(x)}, ${fmt(e.zs[i])})`).join(", ")}` : `spread over x ${range(e.xs)}, z ${range(e.zs)}`;
      return `${name}${n > 1 ? ` ×${n}` : ""}, ${e.size}, ${where}`;
    });
  const walkers = base.items.filter((i) => i.motion && i.motion.orient !== "full").length;
  const trains = base.items.filter((i) => i.motion?.orient === "full").length;
  const lights = base.items.filter((i) => i.kind === "light").length;

  // Map: one character per cell, back row first.
  const half = frame.half;
  const n = Math.min(36, Math.max(8, Math.ceil((half * 2) / 5)));
  const cell = (half * 2) / n;
  const grid = Array.from({ length: n }, () => Array<string>(n).fill("."));
  for (const { item, part } of items) {
    const f = itemFootprint(item, part);
    const r = Math.max(f.w, f.d) / 2;
    for (let i = Math.floor((f.z - r + half) / cell); i <= Math.floor((f.z + r + half) / cell); i++) {
      for (let j = Math.floor((f.x - r + half) / cell); j <= Math.floor((f.x + r + half) / cell); j++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        if (!f.flat) grid[i][j] = "#";
        else if (grid[i][j] === ".") grid[i][j] = "=";
      }
    }
  }

  return `Current scene "${base.name}": ${base.items.length} objects, ${base.environment} lighting, ${base.ground.kind} ground.
Kits already used, with their scales — reuse them so new parts match: ${[...counts].map(([kit, c]) => `${kit} ×${fmt(scales.get(kit) ?? 1)} (${c})`).join(", ") || "none"}.
Inventory (existing parts by name — use these names in "changes"):
${inventory.map((l) => `- ${l}`).join("\n") || "- nothing yet"}
Coaster rides: ${rides.length ? `${rides.length}, entrances at ${rides.join(", ")} — "rides" with an area around one changes that ride` : "none"}.
Moving: ${walkers} walkers, ${trains} coaster cars. Lights: ${lights}.
Map, ${fmt(cell)} m per character — first row is the back (z = ${-half}), last row the front (z = ${half}); columns run from x = ${-half} to ${half}. # = built, = = path or floor, . = free ground:
${grid.map((row) => row.join("")).join("\n")}`;
}

export interface AiConcept {
  title: string;
  concept: string;
  environment: EnvKey;
  ground: Exclude<GroundKind, "none">;
  kits: { key: string; use: string }[];
}

const KITS_SYSTEM = `You plan 3D scenes for a browser scene builder. A scene can only use the ready-made GLB parts in the kits the user lists.
Pick the kits that best fit the idea and sketch the layout:
- Prefer kits whose parts match the idea directly, then add kits for nature, people and props so the scene feels alive.
- Keep one visual style: most kits are low-poly. Rocketbox kits (rigged-*) are realistic people and animals with 5–15k triangles each, and NASA kits are realistic too — pick them only for realistic scenes. For crowds in low-poly scenes use mini-characters, blocky-characters, character-pack-adventures or animated-characters-*.
- "ground" is the surface that covers most of the area: grass for parks, farms, villages and campsites; stone for city squares; sand for beaches and deserts; dirt for wild or haunted places; snow for winter.
- "concept" is 3–6 sentences: the zones of the layout (with rough positions: front/back/left/right/centre), the landmark of each zone, where people walk and what fills the space between.
When changing an existing scene, keep its kits and style, and pick kits only for new or replacement parts — none at all if the request only removes, moves, turns, resizes, re-animates or relights what is there.`;

export function kitsRequest(idea: string, size: AiSize, environment: EnvKey | "auto", index: PartsIndex, parts: Part[], base: string | null) {
  const s = AI_SIZES[size];
  const kits = groupByKit(parts);
  const lines = [...kits.entries()].map(([key, list]) => {
    const c = index.collections[key];
    return `${key} | ${c?.name ?? key} | ${c?.category ?? "Props"} | ${list.length} | ${sampleNames(list, 16).join(", ")}`;
  });
  const prompt = `${base ? `Change the existing scene: ${idea}\n\n${base}\n\nAmount to add, if anything: ${s.label} — up to about ${s.objects[1]} new objects.` : `Idea: ${idea}\nSize: ${s.label} — about ${s.area} × ${s.area} m, roughly ${s.objects[0]}–${s.objects[1]} objects.`}
Lighting: ${environment === "auto" ? (base ? "keep the scene's lighting unless the request changes it" : "choose what suits the idea (day, sunset, night or studio)") : `${environment} (required)`}.
Choose ${base ? 0 : s.kits[0]}–${s.kits[1]} kits.

Kits (key | name | category | parts | sample part names):
${lines.join("\n")}`;
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Short scene name, 2–5 words" },
      concept: { type: "string" },
      environment: { type: "string", enum: ENV_KEYS },
      ground: { type: "string", enum: GROUND_KINDS },
      kits: {
        type: "array",
        items: {
          type: "object",
          properties: { key: { type: "string", enum: [...kits.keys()] }, use: { type: "string", description: "What this kit provides in the scene" } },
          required: ["key", "use"],
        },
      },
    },
    required: ["title", "concept", "environment", "ground", "kits"],
  };
  return { system: KITS_SYSTEM, prompt, schema };
}

const LAYOUT_SYSTEM = `You lay out 3D scenes for a browser scene builder, using only the GLB parts listed by the user.
World: metres, Y up, the ground is a flat plane at y = 0. The camera looks from the front (+Z) towards the back (-Z): put the main entrance at the front edge.
Rotation "rot" is in degrees around Y. At rot 0 a part faces +Z (the camera); 180 faces -Z, 90 faces +X, -90 faces -X. Turn buildings, stalls and benches to face the path or plaza they stand on.

Scale: a part's final size = listed size × its kit scale × the item's own "scale" (default 1). Set "kitScales" for every kit you use so all kits match real-world proportions and each other: an adult ≈ 1.75 m tall, a door ≈ 2.1 m, a bench seat ≈ 0.45 m high, a car ≈ 4.5 m long, a stall ≈ 3 m tall, a house 6–9 m tall, trees 4–12 m. Use the people heights given in the kit headers when present.

Tools (all positions in metres; x and z must stay inside the area):
- place: one part at an exact spot — landmarks, rides, buildings, stalls, stages, fountains, gates, vehicles, key characters. Leave clear space around each one: check footprints (width × depth after scaling) so they don't overlap each other. Set "visit": true on places people walk to (stalls, shops, fountains, stages, benches, kiosks) and put each one right beside a path, facing it.
- lines: parts repeated along a polyline of points — paths, roads, fences, walls, queues, rows of lamps, benches or trees. Parts turn to follow the line by themselves. "spacing" defaults to the part's own length (pieces end to end, right for tiles and fences); use 6–12 m for lamps and trees. Set "sink": true for flat tiles (paths, roads, floors) so they sit flush with the ground. "mix": "cycle" repeats the parts in order, "random" picks at random.
- fills: a rectangle tiled on a grid — paved plazas, floors, car parks, crop fields, orchards. The ground plane already covers everything, so only fill special surfaces.
- rings: parts spaced evenly around a circle — stalls around a plaza, seats around a stage, trees around a fountain; "facing" turns them towards the centre, away from it, along the circle or at random.
- scatter: "count" random parts inside a rectangle, never overlapping anything. surface "open" keeps them off paths and plazas (trees, bushes, rocks, flowers, grass); "paths" puts them only on paths and plazas (people standing around, bins, balloons); "any" allows both.
- walkers: people who walk the paths from place to place — each one tours "stops" of the visit places (and ride entrances), waits "wait" seconds at each doing "stopAction", then walks on. They only walk on path tiles and plazas, so every visit place must touch the path network and the network must be connected. Busy scenes want many walkers (20–80 in a big park) plus some people standing on plazas (scatter).
- coasters (only when coaster-kit is listed): complete roller-coaster rides — a closed track circuit with hills and loopings, supports, station, a train that runs round the track by itself, entrance and queue. Give the centre, the footprint sizeX × sizeZ in metres (each 25–80), track height in metres (0 = on the ground, up to 15) and which way the entrance faces. Keep other parts out of the footprint, and run a path to the entrance side (the queue sticks out about 10 m there); walkers visit ride entrances on their own. A theme park wants 2–4 rides of different styles.
- lights: point lights for lamps, fires, neon and windows — 8–24 for night or sunset scenes, 0–4 for day. intensity 8–40, distance 8–25 m, y at the lamp head.
Animated parts (marked *) can take an "action": idle, walk, run, dance, cheer, wave, talk or sit. Give crowds a mix of actions.

Fill the whole area so there are no large empty patches: big landmarks first (together they should cover a good share of the ground), then a connected network of main paths 4–8 m wide (fills, or parallel lines) linking every zone and every visit place, then rows, rings and scatters around them, then walkers. Stay within the target object count (rows, fills, scatters and walkers count every part they create).
Write parts exactly as listed, as "kit/name". Start with "zones" to plan the layout, then use the tools.

Editing an existing scene (the prompt then lists its inventory and map):
- changes: change what is already there; they apply before anything is added. op "remove" deletes parts; "replace" swaps each for one of "with" (same spot and turn, at its kit scale); "move" shifts them by dx, dz metres; "scale" multiplies their size by "factor"; "turn" adds "degrees" of rotation; "animate" gives characters "action" (walkers do it at their stops). "parts" picks existing parts by inventory name — "kit/name", "kit/*" for a whole kit, "kit/tree*" for a family — or one of: all, people, walkers, trains, rides (whole roller coasters: track, supports, station, train, queue), lights. Narrow it to an area with x1, z1, x2, z2 and to "count" random ones (e.g. half the trees).
- scene: new lighting or ground for the whole scene — only when the request asks.
Do what the request asks and leave everything else alone. New parts go on free ground (".") or where the request asks — never on built cells ("#") unless the same request removes what is there — connect new paths to the existing ones ("="), and reuse the kits and kit scales listed for the scene. A request that only changes things needs no new parts: leave the other tools empty.`;

export function layoutRequest(idea: string, size: AiSize, concept: AiConcept, index: PartsIndex, parts: Part[], frame: SceneFrame, base: string | null, scales: Map<string, number>) {
  const s = AI_SIZES[size];
  const half = frame.half;
  const kits = groupByKit(parts);
  const chosen = concept.kits.map((k) => k.key).filter((k) => kits.has(k));
  const sections = chosen.map((key) => {
    const list = kits.get(key)!;
    const c = index.collections[key];
    const people = peopleHeight(list);
    const use = concept.kits.find((k) => k.key === key)?.use;
    const header = [
      `### ${key} — ${c?.name ?? key} (${c?.category ?? "Props"}, ${list.length} parts)`,
      use ? `Use: ${use}` : "",
      scales.has(key) ? `Already in the scene at kit scale ${fmt(scales.get(key)!)} — keep it.` : people ? `People in this kit are ${fmt(people)} tall → kit scale ≈ ${fmt(1.75 / people)}.` : "",
      KIT_NOTES[key] ?? "",
    ].filter(Boolean);
    const names = list.map((p) => `${shortName(p)} ${fmt(p.size[0])}×${fmt(p.size[1])}×${fmt(p.size[2])}${p.animated ? "*" : ""}`);
    return `${header.join("\n")}\n${names.join(" | ")}`;
  });
  const prompt = `${base ? `Change the existing scene: ${idea}` : `Idea: ${idea}`}
Title: ${concept.title}
Concept: ${concept.concept}
Area: x and z from ${-half} to ${half} (${half * 2} × ${half * 2} m). Front edge (entrance) is z = ${half}.
Target: ${base ? `up to ${s.objects[1]} new objects, only if the request adds things` : `${s.objects[0]}–${s.objects[1]} objects in total`}.
Lighting: ${concept.environment}. Ground: ${concept.ground}.
${base ? `\n${base}\n` : ""}
Parts are listed as name width×height×depth (native units, before scaling); * = animated.

${sections.join("\n\n")}`;

  const num = { type: "number" };
  const partList = { type: "array", items: { type: "string" } };
  const action = { type: "string", enum: ACTIONS };
  const properties: Record<string, object> = {
    zones: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, x1: num, z1: num, x2: num, z2: num }, required: ["name", "x1", "z1", "x2", "z2"] },
    },
    kitScales: {
      type: "array",
      items: { type: "object", properties: { kit: chosen.length ? { type: "string", enum: chosen } : { type: "string" }, scale: num }, required: ["kit", "scale"] },
    },
    place: {
      type: "array",
      items: {
        type: "object",
        properties: { part: { type: "string" }, x: num, z: num, y: num, rot: num, scale: num, action, visit: { type: "boolean" } },
        required: ["part", "x", "z"],
      },
    },
    ...(chosen.includes("coaster-kit")
      ? {
          coasters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                style: { type: "string", enum: COASTER_STYLES },
                x: num,
                z: num,
                sizeX: num,
                sizeZ: num,
                height: num,
                entrance: { type: "string", enum: ["front", "back", "left", "right"] },
                loops: { type: "boolean" },
                hills: { type: "boolean" },
              },
              required: ["style", "x", "z", "sizeX", "sizeZ", "entrance"],
            },
          },
        }
      : {}),
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parts: partList,
          points: { type: "array", items: { type: "object", properties: { x: num, z: num }, required: ["x", "z"] } },
          closed: { type: "boolean" },
          spacing: num,
          mix: { type: "string", enum: ["cycle", "random"] },
          rot: num,
          y: num,
          scale: num,
          sink: { type: "boolean" },
          action,
        },
        required: ["parts", "points"],
      },
    },
    fills: {
      type: "array",
      items: {
        type: "object",
        properties: { parts: partList, x1: num, z1: num, x2: num, z2: num, spacing: num, randomRotate: { type: "boolean" }, scale: num, sink: { type: "boolean" } },
        required: ["parts", "x1", "z1", "x2", "z2"],
      },
    },
    rings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parts: partList,
          x: num,
          z: num,
          radius: num,
          count: num,
          facing: { type: "string", enum: ["center", "outward", "along", "random"] },
          y: num,
          scale: num,
          action,
        },
        required: ["parts", "x", "z", "radius", "count"],
      },
    },
    scatter: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parts: partList,
          count: num,
          x1: num,
          z1: num,
          x2: num,
          z2: num,
          surface: { type: "string", enum: ["open", "paths", "any"] },
          scaleMin: num,
          scaleMax: num,
          action,
        },
        required: ["parts", "count", "x1", "z1", "x2", "z2"],
      },
    },
    walkers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parts: partList,
          count: num,
          stops: { type: "number", description: "Places each walker visits, 2–6" },
          wait: { type: "number", description: "Seconds at each place, 2–10" },
          stopAction: action,
          moveAction: { type: "string", enum: ["walk", "run"] },
        },
        required: ["parts", "count"],
      },
    },
    lights: {
      type: "array",
      items: {
        type: "object",
        properties: { x: num, y: num, z: num, color: { type: "string", description: "#rrggbb" }, intensity: num, distance: num, flicker: { type: "boolean" } },
        required: ["x", "y", "z"],
      },
    },
  };
  if (base) {
    properties.changes = {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["remove", "replace", "move", "scale", "turn", "animate"] },
          parts: { type: "array", items: { type: "string" }, description: "Inventory names (kit/name, kit/*, kit/prefix*) or: all, people, walkers, trains, rides, lights" },
          x1: num,
          z1: num,
          x2: num,
          z2: num,
          count: num,
          with: partList,
          dx: num,
          dz: num,
          factor: num,
          degrees: num,
          action,
        },
        required: ["op", "parts"],
      },
    };
    properties.scene = { type: "object", properties: { environment: { type: "string", enum: ENV_KEYS }, ground: { type: "string", enum: GROUND_KINDS } } };
  }
  const schema = { type: "object", properties, required: Object.keys(properties).filter((k) => k !== "scene") };
  return { system: LAYOUT_SYSTEM, prompt, schema };
}

// --- Plan ----------------------------------------------------------------------------------------

interface XZ {
  x: number;
  z: number;
}

export interface AiPlan {
  zones?: { name: string; x1: number; z1: number; x2: number; z2: number }[];
  kitScales?: { kit: string; scale: number }[];
  place?: { part: string; x: number; z: number; y?: number; rot?: number; scale?: number; action?: Action; visit?: boolean }[];
  coasters?: { style: CoasterStyle; x: number; z: number; sizeX: number; sizeZ: number; height?: number; entrance?: "front" | "back" | "left" | "right"; loops?: boolean; hills?: boolean }[];
  lines?: { parts: string[]; points: XZ[]; closed?: boolean; spacing?: number; mix?: "cycle" | "random"; rot?: number; y?: number; scale?: number; sink?: boolean; action?: Action }[];
  fills?: { parts: string[]; x1: number; z1: number; x2: number; z2: number; spacing?: number; randomRotate?: boolean; scale?: number; sink?: boolean }[];
  rings?: { parts: string[]; x: number; z: number; radius: number; count: number; facing?: "center" | "outward" | "along" | "random"; y?: number; scale?: number; action?: Action }[];
  scatter?: { parts: string[]; count: number; x1: number; z1: number; x2: number; z2: number; surface?: "open" | "paths" | "any"; scaleMin?: number; scaleMax?: number; action?: Action }[];
  walkers?: { parts: string[]; count: number; stops?: number; wait?: number; stopAction?: Action; moveAction?: "walk" | "run" }[];
  lights?: { x: number; y: number; z: number; color?: string; intensity?: number; distance?: number; flicker?: boolean }[];
  /** Editing only: changes to the existing parts, applied before anything is added. */
  changes?: AiChange[];
  scene?: { environment?: EnvKey; ground?: GroundKind };
}

export interface AiChange {
  op: "remove" | "replace" | "move" | "scale" | "turn" | "animate";
  parts: string[];
  x1?: number;
  z1?: number;
  x2?: number;
  z2?: number;
  count?: number;
  with?: string[];
  dx?: number;
  dz?: number;
  factor?: number;
  degrees?: number;
  action?: Action;
}

export interface AiResult {
  /** "edit": the plan changes (and adds to) an existing scene. */
  mode: "new" | "edit";
  concept: AiConcept;
  plan: AiPlan;
  size: AiSize;
  frame: SceneFrame;
  /** Lighting the user picked (add mode keeps the scene's own otherwise). */
  environment: EnvKey | "auto";
  models: string[];
}

/** Both Gemini steps: pick kits, then lay them out — for a new scene, or for an addition to `base`. */
export async function generateScene(o: {
  key: string;
  model: string;
  /** The key's models (from `listModels`), for "Auto". */
  available: string[];
  idea: string;
  size: AiSize;
  environment: EnvKey | "auto";
  index: PartsIndex;
  parts: Part[];
  /** The scene to change; null makes a new one. */
  base: SceneDoc | null;
  signal?: AbortSignal;
  onStep?: (step: "kits" | "layout", model: string) => void;
}): Promise<AiResult> {
  const partsMap = new Map(o.parts.map((p) => [p.id, p]));
  const frame = sceneFrame(o.size, o.base, partsMap);
  const scales = sceneKitScales(o.base, partsMap);
  const summary = o.base ? describeScene(o.base, partsMap, frame) : null;

  const models = modelChain(o.model, o.available);
  const kits = kitsRequest(o.idea, o.size, o.environment, o.index, o.parts, summary);
  const first = await generateJson<AiConcept>({ key: o.key, models, ...kits, signal: o.signal, onModel: (m) => o.onStep?.("kits", m) });
  const concept = sanitizeConcept(first.data, o.environment, new Set(o.parts.map((p) => p.collectionKey)), o.base);
  // An edit may need no new kits (removing, moving, relighting…); a new scene always does.
  if (!concept.kits.length && !o.base) throw new AiError("Gemini didn't pick any kits — try describing the scene differently.");

  // The model that just answered goes first for the (much bigger) layout step.
  const layoutModels = [first.model, ...models.filter((m) => m !== first.model)];
  const layout = layoutRequest(o.idea, o.size, concept, o.index, o.parts, frame, summary, scales);
  const second = await generateJson<AiPlan>({ key: o.key, models: layoutModels, ...layout, signal: o.signal, onModel: (m) => o.onStep?.("layout", m) });
  return {
    mode: o.base ? "edit" : "new",
    concept,
    plan: second.data,
    size: o.size,
    frame,
    environment: o.environment,
    models: [...new Set([first.model, second.model])],
  };
}

function sanitizeConcept(raw: Partial<AiConcept>, environment: EnvKey | "auto", known: Set<string>, base: SceneDoc | null): AiConcept {
  const kits = (Array.isArray(raw.kits) ? raw.kits : []).filter((k) => k && typeof k.key === "string" && known.has(k.key));
  const fallbackEnv = base?.environment ?? (raw.environment && ENV_KEYS.includes(raw.environment) ? raw.environment : "day");
  const baseGround = base && base.ground.kind !== "none" ? base.ground.kind : null;
  return {
    title: base?.name ?? (typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 60) : "AI scene"),
    concept: typeof raw.concept === "string" ? raw.concept : "",
    environment: environment !== "auto" ? environment : fallbackEnv,
    ground: baseGround ?? (raw.ground && GROUND_KINDS.includes(raw.ground) ? raw.ground : "grass"),
    kits: kits.filter((k, i) => kits.findIndex((x) => x.key === k.key) === i).map((k) => ({ key: k.key, use: typeof k.use === "string" ? k.use : "" })),
  };
}
