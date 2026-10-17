import { CATEGORY_INFO, formatBytes, formatNumber, sourceOf, type Category, type ModelEntry } from "@/lib/catalog";

/**
 * Text written from each model's own data (size, triangle count, textures, rig, collection, author), so every
 * model page says something specific about its model instead of repeating a template.
 */

/** What the model is typically used for, by category. */
const USES: Record<Category, string[]> = {
  Characters: ["NPCs and player avatars", "architectural visualisation crowds", "VR and metaverse scenes", "animation and pre-vis"],
  Animals: ["farm and nature scenes", "pet and wildlife games", "kids' learning apps", "AR experiences"],
  Vehicles: ["racing and driving games", "city and traffic scenes", "product mock-ups", "level blockouts"],
  Buildings: ["city builders and strategy games", "level design and blockouts", "architectural mock-ups", "background scenery"],
  Furniture: ["interior design mock-ups", "room and house scenes", "simulation games", "AR furniture previews"],
  Food: ["cooking and restaurant games", "menu and product visuals", "kids' apps", "props for kitchen scenes"],
  Nature: ["outdoor levels and terrain dressing", "garden and park scenes", "low-poly landscapes", "background filler"],
  Trees: ["forests and parks", "open-world terrain", "city streets and gardens", "stylised landscapes"],
  Space: ["sci-fi games", "space education and science apps", "planetarium-style scenes", "renders and posters"],
  Weapons: ["action, RPG and shooter games", "inventory and loot screens", "fantasy and sci-fi props", "trailers and renders"],
  Skeletons: ["dungeon crawlers and RPG enemies", "Halloween and horror scenes", "undead armies", "spooky AR effects"],
  Ghosts: ["horror games", "Halloween scenes", "haunted-house levels", "spooky AR filters"],
  Bikes: ["racing and stunt games", "city traffic scenes", "garage and showroom renders", "cyberpunk worlds"],
  Gaming: ["arcade and action games", "game jams and prototypes", "arena and level design", "RPG loot and props"],
  Hair: ["custom avatars", "character creators", "stylised and anime characters", "VTuber models"],
  "God of War": ["mythology and action games", "fan renders and posters", "Greek-themed scenes", "character studies"],
  Props: ["dressing game levels", "dungeons and adventure maps", "modular kit building", "scene detail"],
};

/** Rough detail class from the triangle count, and the platforms that budget suits. */
function detail(tris: number): { label: string; fits: string } {
  if (tris < 2_000) return { label: "very low-poly", fits: "mobile games, WebGL pages and scenes that place hundreds of copies" };
  if (tris < 10_000) return { label: "low-poly", fits: "mobile and web games, AR and VR" };
  if (tris < 50_000) return { label: "mid-poly", fits: "PC, console and web projects" };
  return { label: "high-detail", fits: "close-up renders, hero assets and desktop projects" };
}

function sizeText(m: ModelEntry): string {
  const [w, h, d] = m.stats.size.map((n) => n.toFixed(2));
  return m.kind === "human" ? `${h} m tall` : `${w} × ${h} × ${d} m`;
}

export interface ModelContext {
  /** 1-based position in its collection. */
  position: number;
  collectionCount: number;
  animationCount: number;
}

/** Meta description that leads with this model's own figures. Kept under ~160 characters. */
export function modelMetaDescription(m: ModelEntry): string {
  const info = CATEGORY_INFO[m.category];
  const rig = m.rigged ? "rigged " : "";
  return `Download ${m.title}, a free ${rig}${detail(m.stats.triangles).label} ${info.singular} 3D model: ${formatNumber(m.stats.triangles)} triangles, ${sizeText(m)}, ${formatBytes(m.glbBytes)} GLB. Commercial use OK.`;
}

/** The "About this model" paragraphs. */
export function modelOverview(m: ModelEntry, ctx: ModelContext): string[] {
  const info = CATEGORY_INFO[m.category];
  const d = detail(m.stats.triangles);
  const src = sourceOf(m);
  const uses = USES[m.category];
  const textures = m.stats.textures
    ? `${m.stats.textures} texture${m.stats.textures === 1 ? "" : "s"} and ${m.stats.materials} material${m.stats.materials === 1 ? "" : "s"}`
    : `${m.stats.materials} flat-colour material${m.stats.materials === 1 ? "" : "s"} and no image textures`;

  const paragraphs = [
    `${m.title} is a ${d.label} ${info.singular} model with ${formatNumber(m.stats.triangles)} triangles and ${formatNumber(m.stats.vertices)} vertices. It measures ${sizeText(m)} in real-world units and uses ${textures}, all packed into one ${formatBytes(m.glbBytes)} .glb file.`,
    ctx.collectionCount > 1
      ? `It is model ${ctx.position} of ${ctx.collectionCount} in the ${m.collection} collection, so it shares a scale and art style with the rest of that set — you can mix them in one scene or download the whole collection as a single pack.`
      : `It is part of the ${m.collection} collection.`,
    m.rigged
      ? `The model is rigged${m.stats.bones ? ` with a ${m.stats.bones}-bone skeleton` : ""}${ctx.animationCount ? ` and works with ${ctx.animationCount} ready-made animation clips you can preview above` : ""}, so it can be posed or animated in Blender, Unity, Unreal, Godot or three.js.`
      : `It is a static (unrigged) mesh, ready to place in a scene as-is in Blender, Unity, Unreal, Godot, three.js or Babylon.js.`,
    `At this triangle count it suits ${d.fits}. Typical uses: ${uses.join(", ")}.`,
    m.credit
      ? `Created by ${m.credit.author} and shared under ${src.licenseName}: free for personal and commercial projects as long as you credit the author.`
      : `Released under ${src.licenseName}: free for personal and commercial projects.`,
  ];
  return paragraphs;
}

/** Questions answered with this model's own figures; rendered on the page and mirrored into FAQPage data. */
export function modelFaqs(m: ModelEntry, ctx: ModelContext): { q: string; a: string }[] {
  const src = sourceOf(m);
  return [
    {
      q: `Is the ${m.title} 3D model free for commercial use?`,
      a: m.credit
        ? `Yes. It is licensed under ${src.licenseName}, which allows commercial use when you credit ${m.credit.author}.`
        : `Yes. It is licensed under ${src.licenseName}, which allows personal and commercial use.`,
    },
    {
      q: `What file format is ${m.title} in?`,
      a: `A single glTF 2.0 binary (.glb) file of ${formatBytes(m.glbBytes)} with the mesh${m.rigged ? ", skeleton" : ""}${m.stats.textures ? " and textures" : ""} embedded. Blender, Unity, Unreal, Godot, three.js and most 3D apps open it directly.`,
    },
    {
      q: `How many polygons does ${m.title} have?`,
      a: `${formatNumber(m.stats.triangles)} triangles and ${formatNumber(m.stats.vertices)} vertices, which makes it a ${detail(m.stats.triangles).label} model.`,
    },
    {
      q: `Is ${m.title} rigged or animated?`,
      a: m.rigged
        ? `Yes, it is rigged${m.stats.bones ? ` with ${m.stats.bones} bones` : ""}${ctx.animationCount ? ` and compatible with ${ctx.animationCount} animation clips on this site` : ""}.`
        : `No, it is a static mesh. You can still place, scale and recolour it, or add your own rig in Blender.`,
    },
  ];
}
