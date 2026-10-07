import libraryData from "@/data/library.json";
import {
  allCollections,
  catalog,
  CATEGORIES,
  CATEGORY_INFO,
  categorySlug,
  clipGroups,
  countBy,
  creditLine,
  formatBytes,
  formatNumber,
  getModelById,
  models,
  riggedCount,
  SOURCES,
  type CollectionInfo,
  type ModelEntry,
  type SourceKey,
} from "@/lib/catalog";
import { games } from "@/lib/games";
import { absoluteUrl, SITE } from "@/lib/site";

/**
 * The whole catalog as plain text and JSON for AI assistants, agents and scripts, so they can find a model
 * and its .glb URL from one file instead of crawling thousands of model pages:
 *   /llms.txt                 overview, licenses, how to load the files, index of collections
 *   /llms/<collection>.md     every model in one collection (absolute URLs)
 *   /llms-full.txt            every model on the site (paths relative to the site URL)
 *   /catalog.json             the same data as JSON
 */

/** Embedded clip counts of library models (animated characters, doors, chests…). */
const embeddedClips = new Map(
  (libraryData as unknown as { models: { id: string; stats: { animations?: number } }[] }).models
    .filter((m) => (m.stats.animations ?? 0) > 0)
    .map((m) => [m.id, m.stats.animations!]),
);

const biped = clipGroups();
const clipCount = catalog.animations.length;
/** Humans of the rigged character library: Biped skeletons that play the shared animation clips. */
const isBiped = (m: ModelEntry) => m.group !== null && m.kind === "human";
const sourceCount = (key: SourceKey) => models.filter((m) => m.source === key).length;
const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;
const licenseList = (sources: SourceKey[]) => sources.map((s) => SOURCES[s].licenseShort).join(" / ");

/** Bounding box, rounded for reading: 0.412 → 0.41, 12.345 → 12.3. */
const dims = (size: [number, number, number]) => size.map((n) => +n.toFixed(n < 10 ? 2 : 1)).join("×");

/** A model the examples load (the police car, or the first model if that kit is gone). */
function exampleModel(): ModelEntry {
  return getModelById("car-kit-police") ?? models[0];
}

/** "- [Title](page) — glb · 1,234 tris · 1×2×3 m · 85 KB · rigged …" */
function modelLine(m: ModelEntry, collection: CollectionInfo, url: (path: string) => string): string {
  const parts = [url(m.glb), `${formatNumber(m.stats.triangles)} tris`, dims(m.stats.size), formatBytes(m.glbBytes)];
  if (isBiped(m)) parts.push(m.subtitle);
  if (m.rigged) parts.push("rigged");
  if (isBiped(m) && m.animationSet) parts.push(`plays the ${m.animationSet === "f" ? "female" : "male"} animation clips`);
  const clips = embeddedClips.get(m.id);
  if (clips) parts.push(`${plural(clips, "animation")} inside`);
  if (m.source !== collection.source) parts.push(SOURCES[m.source].licenseShort);
  if (m.credit) parts.push(`credit: ${creditLine(m.credit)}`);
  return `- [${m.title}](${url(`/models/${m.slug}/`)}) — ${parts.join(" · ")}`;
}

/** A collection's models as a Markdown list, under category sub-headings when it spans several. */
function collectionModels(c: CollectionInfo, url: (path: string) => string, level: number): string[] {
  const categories = CATEGORIES.filter((cat) => c.models.some((m) => m.category === cat));
  if (categories.length === 1) return c.models.map((m) => modelLine(m, c, url));
  return categories.flatMap((cat, i) => {
    const list = c.models.filter((m) => m.category === cat);
    return [...(i ? [""] : []), `${"#".repeat(level)} ${cat} (${list.length})`, "", ...list.map((m) => modelLine(m, c, url))];
  });
}

/** "Nature 250, Trees 80" for collections that mix categories. */
function categoryMix(c: CollectionInfo): string {
  const counts = CATEGORIES.map((cat) => [cat, c.models.filter((m) => m.category === cat).length] as const).filter(([, n]) => n > 0);
  return counts.length > 1 ? counts.map(([cat, n]) => `${cat} ${n}`).join(", ") : c.category;
}

function licenseLines(): string[] {
  return (Object.keys(SOURCES) as SourceKey[])
    .filter((key) => sourceCount(key) > 0)
    .map((key) => {
      const s = SOURCES[key];
      const extra = key === "mit" ? ` and all ${clipCount} animation clips` : "";
      return `- ${s.licenseName} — ${plural(sourceCount(key), "model")}${extra}: ${s.terms}. ${s.licenseUrl}`;
    });
}

function header(): string[] {
  return [
    `# ${SITE.brand} — ${formatNumber(models.length)} free 3D models (GLB)`,
    "",
    `> A free library of ${formatNumber(models.length)} ready-to-use 3D models: ${formatNumber(models.filter(isBiped).length)} rigged human characters with ${clipCount} animation clips, animals, vehicles, buildings, furniture, food, nature, trees, space, weapons and game kits. Every model is one glTF 2.0 binary file (.glb) with a direct download URL — no sign-up, no API key — and free for personal and commercial use (MIT, CC0 or public domain; a few hairstyles are CC BY / CC BY-ND and need credit).`,
    "",
    `Site: ${absoluteUrl("/")} · Made by ${SITE.author}`,
  ];
}

function formatNotes(): string[] {
  return [
    "- Format: glTF 2.0 binary (.glb), one file per model with textures embedded, compressed with EXT_meshopt_compression and EXT_texture_webp. three.js (GLTFLoader + MeshoptDecoder; drei's useGLTF sets this up) and Babylon.js load them directly; other engines need meshopt support or a decompressed copy.",
    "- Size is the bounding box (width × height × depth) in glTF units, which are metres by the glTF spec; models are Y-up. A few imported models are not to real-world scale, so scale them to fit.",
    `- Rigged humans use a Biped skeleton (root bone Bip01; the child characters use Bip02). The ${clipCount} animation clips (${biped.length} motions: ${biped.map((g) => g.label.toLowerCase()).join(", ")}) are separate skeleton-only .glb files in a female (f_) and a male (m_) set: load a character and a clip from its set, then play the clip with THREE.AnimationMixer — the bone names match.`,
    "- Each .glb carries its license and credit in the glTF asset block (asset.copyright, asset.extras).",
  ];
}

/** Loading one model in three.js — in /llms.txt and on /developers/. */
export function threeExample(): string {
  const m = exampleModel();
  return [
    'import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";',
    'import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";',
    "",
    "const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);",
    `const gltf = await loader.loadAsync("${absoluteUrl(m.glb)}"); // ${m.title}`,
    "scene.add(gltf.scene);",
  ].join("\n");
}

// --- /llms.txt ---------------------------------------------------------------------------------

export function llmsTxt(): string {
  const collections = allCollections();
  return [
    ...header(),
    "",
    "Use it when you need:",
    "- free 3D models or game assets for three.js, react-three-fiber, Babylon.js, A-Frame or WebXR projects (other glTF engines too — see Using the files);",
    "- low-poly kits to build cities, roads, dungeons, castles, pirate islands, farms, restaurants or space bases;",
    `- rigged, animated people (adults, children, professions) and animals — ${formatNumber(riggedCount)} rigged models in all;`,
    "- models an AI coding agent can load by URL straight into a prototype.",
    "",
    "## Find models without crawling the site",
    "",
    `- [Every model in one file](${absoluteUrl("/llms-full.txt")}): Markdown, one line per model — name, model page, .glb path, triangles, size, file size, license notes. Paths are relative to ${SITE.url}.`,
    `- [catalog.json](${absoluteUrl("/catalog.json")}): the same data as JSON for scripts (\`models[].glb\` is relative to \`url\`).`,
    `- One collection at a time: ${absoluteUrl("/llms/")}<collection>.md — listed under Collections below, with absolute URLs.`,
    `- Model page: ${absoluteUrl("/models/")}<slug>/ (3D preview, downloads, license). Category pages: ${absoluteUrl("/models/category/")}<category>/. Sitemap: ${absoluteUrl("/sitemap.xml")}.`,
    "- The .glb files and these catalog files can be fetched from any website (CORS allows every origin), so a web app can load models straight from this site.",
    "",
    "## Using the files",
    "",
    ...formatNotes(),
    "",
    "Load a model in three.js:",
    "",
    "```js",
    threeExample(),
    "```",
    "",
    "## Licenses",
    "",
    ...licenseLines(),
    "",
    `Every model page names its license; the full texts and a per-collection table are at ${absoluteUrl("/license/")}.`,
    "",
    "## Categories",
    "",
    ...CATEGORIES.filter((c) => countBy(c) > 0).map(
      (c) => `- [${c}](${absoluteUrl(`/models/category/${categorySlug(c)}/`)}): ${plural(countBy(c), "model")} — ${CATEGORY_INFO[c].blurb}`,
    ),
    "",
    "## Collections",
    "",
    ...collections.map(
      (c) => `- [${c.name}](${absoluteUrl(`/llms/${c.key}.md`)}): ${plural(c.count, "model")} · ${categoryMix(c)} · ${licenseList(c.sources)}`,
    ),
    "",
    "## Optional",
    "",
    `- [Download packs](${absoluteUrl("/packs/")}): every collection as one .zip (built in the browser), plus all animation clips.`,
    `- [Animations](${absoluteUrl("/animations/")}): preview the ${clipCount} clips on a character and download them.`,
    `- [Scene builder](${absoluteUrl("/builder/")}): compose scenes from any model in the browser and export one .glb.`,
    `- [GLB viewer](${absoluteUrl("/viewer/")}): open a local .glb to preview, recolor and inspect it.`,
    `- [For developers & AI](${absoluteUrl("/developers/")}): these files explained, with code samples.`,
    `- [Free 3D games online](${absoluteUrl("/games/")}): free, ad-free 3D games — no download, no sign-up, on PC or phone.`,
    ...games
      .filter((g) => !g.comingSoon)
      .map((g) => `- [${g.title}](${absoluteUrl(`/games/${g.slug}/`)}): free ad-free 3D game (${g.genre.toLowerCase()}) built only from these models — ${g.tagline}`),
    "",
  ].join("\n");
}

// --- /llms/<collection>.md ---------------------------------------------------------------------

export function collectionMarkdown(c: CollectionInfo): string {
  const rigged = c.models.some((m) => m.source === "mit" && m.animationSet);
  return [
    `# ${c.name} — ${plural(c.count, "free 3D model")} (${categoryMix(c)})`,
    "",
    `> Part of ${SITE.brand} (${absoluteUrl("/")}), ${formatNumber(models.length)} free 3D models. License: ${c.sources.map((s) => `${SOURCES[s].licenseName} — ${SOURCES[s].terms}`).join("; ")}.`,
    "",
    `- Collection page: ${absoluteUrl(`/models/collection/${c.key}/`)}`,
    `- Whole collection as one .zip: ${absoluteUrl("/packs/")} (file list: ${absoluteUrl(`/data/packs/${c.key}.json`)})`,
    `- Every collection: ${absoluteUrl("/llms.txt")}`,
    "",
    ...formatNotes(),
    "",
    `Each line: name and model page — .glb URL · triangles · size · file size, then notes. Total ${formatBytes(c.bytes)}.`,
    "",
    "## Models",
    "",
    ...collectionModels(c, absoluteUrl, 3),
    ...(rigged ? ["", "## Animation clips", "", ...animationLines(absoluteUrl)] : []),
    "",
  ].join("\n");
}

function animationLines(url: (path: string) => string): string[] {
  return biped.map((g) => {
    const side = (label: string, a: (typeof biped)[number]["female"]) => (a ? `${label} ${url(a.file)} (${a.duration.toFixed(1)} s)` : null);
    return `- ${g.label}: ${[side("female", g.female), side("male", g.male)].filter(Boolean).join(" · ")}`;
  });
}

// --- /llms-full.txt ----------------------------------------------------------------------------

export function llmsFullTxt(): string {
  const relative = (path: string) => path;
  return [
    ...header(),
    "",
    `Every model on the site, grouped by collection. Paths are relative to ${SITE.url} — for example the model page`,
    `/models/<slug>/ is ${absoluteUrl("/models/")}<slug>/ and a .glb path /library/… is ${SITE.url}/library/….`,
    "Each line: name and model page — .glb path · triangles · size · file size, then notes (rigged, animations, a license that differs from the collection's, required credit).",
    `Overview, licenses and code samples: ${absoluteUrl("/llms.txt")} · JSON version: ${absoluteUrl("/catalog.json")}`,
    "",
    "## Using the files",
    "",
    ...formatNotes(),
    "",
    "## Licenses",
    "",
    ...licenseLines(),
    "",
    ...allCollections().flatMap((c) => [
      `## ${c.name} — ${plural(c.count, "model")} · ${categoryMix(c)} · ${licenseList(c.sources)}`,
      "",
      `Collection page: /models/collection/${c.key}/`,
      "",
      ...collectionModels(c, relative, 3),
      "",
    ]),
    `## Animation clips — ${clipCount} clips · ${SOURCES.mit.licenseShort}`,
    "",
    "Skeleton-only .glb clips for the rigged humans (female set for female characters, male set for male).",
    "",
    ...animationLines(relative),
    "",
  ].join("\n");
}

// --- /catalog.json -----------------------------------------------------------------------------

export function catalogJson(): string {
  const data = {
    name: SITE.brand,
    url: SITE.url,
    description: SITE.description,
    docs: absoluteUrl("/llms.txt"),
    generated: new Date().toISOString().slice(0, 10),
    count: models.length,
    format: "glTF 2.0 binary (.glb) with EXT_meshopt_compression and EXT_texture_webp; Y-up; size = bounding box in glTF units (metres; a few imported models are not to scale)",
    paths: "Every path is relative to url. Model page: /models/{slug}/. Collection page: /models/collection/{key}/. Category page: /models/category/{slug}/.",
    licenses: Object.fromEntries(
      (Object.keys(SOURCES) as SourceKey[])
        .filter((key) => sourceCount(key) > 0)
        .map((key) => [key, { name: SOURCES[key].licenseName, spdx: SOURCES[key].license, terms: SOURCES[key].terms, url: SOURCES[key].licenseUrl }]),
    ),
    categories: CATEGORIES.filter((c) => countBy(c) > 0).map((c) => ({ name: c, slug: categorySlug(c), count: countBy(c), about: CATEGORY_INFO[c].blurb })),
    collections: allCollections().map((c) => ({
      key: c.key,
      name: c.name,
      category: c.category,
      license: c.source,
      ...(c.sources.length > 1 ? { licenses: c.sources } : {}),
      count: c.count,
      bytes: c.bytes,
      files: `/data/packs/${c.key}.json`,
    })),
    animations: biped.flatMap((g) =>
      [g.female, g.male].filter((a) => a !== null).map((a) => ({ id: a.id, name: a.label, set: a.set, glb: a.file, seconds: a.duration, bytes: a.bytes })),
    ),
    models: models.map((m) => ({
      slug: m.slug,
      title: m.title,
      category: m.category,
      collection: m.collectionKey,
      license: m.source,
      glb: m.glb,
      bytes: m.glbBytes,
      thumb: m.thumb?.src,
      triangles: m.stats.triangles,
      size: m.stats.size,
      rigged: m.rigged || undefined,
      gender: m.gender,
      role: m.role,
      // The Biped clip set (f/m) this character plays; see `animations` at the top level.
      animationSet: isBiped(m) ? m.animationSet : undefined,
      animations: embeddedClips.get(m.id),
      credit: m.credit ?? undefined,
    })),
  };
  return JSON.stringify(data, (_key, value) => (value === null ? undefined : value));
}
