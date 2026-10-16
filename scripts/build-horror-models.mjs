#!/usr/bin/env node
/**
 * Imports the horror models downloaded from Sketchfab into .cache/ghost-downloads/ (category "Ghosts"):
 *   public/library/ghosts/<name>.glb|.webp, and their entries in src/data/library.json.
 * Author, license and source URL come from the GLB's own asset.extras (Sketchfab writes them there).
 * Embedded animation clips are renamed (Idle / Walk / Run) so the viewer and games can pick them by name.
 *
 *   node scripts/build-horror-models.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ROOT, LIBRARY_JSON, log, optimizeToGlb, slugify } from "./library/common.mjs";
import { renderThumbnails } from "./library/thumbs.mjs";

const DOWNLOADS = path.join(ROOT, ".cache", "ghost-downloads");
const WORK = path.join(ROOT, ".cache", "ghost-work");
fs.mkdirSync(WORK, { recursive: true });

const LICENSES = {
  "CC-BY-4.0": { source: "cc-by", name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  "CC-BY-ND-4.0": { source: "cc-by-nd", name: "CC BY-ND 4.0", url: "https://creativecommons.org/licenses/by-nd/4.0/" },
};

/** file → site name/title, clip names (the file's only clip, in order) and a triangle budget for the web. */
const MODELS = {
  "horror_ghost_character_-_blood_stained_spirit.glb": { name: "blood-stained-spirit", title: "Blood-Stained Spirit", maxTriangles: 16000 },
  "psx_ghost.glb": { name: "psx-ghost", title: "PSX Ghost" },
  "psx_snatcher_-_low_poly_horror.glb": { name: "psx-snatcher", title: "PSX Snatcher", clips: ["Idle"] },
  "smily_horror_monster.glb": { name: "smiley-horror-monster", title: "Smiley Horror Monster", clips: ["Idle"] },
  "terrifying_hooded_horror_woman.glb": { name: "hooded-horror-woman", title: "Hooded Horror Woman", clips: ["Run"] },
  "the_human_deer.glb": { name: "human-deer", title: "The Human Deer", clips: ["Walk"], maxTriangles: 45000 },
  "devitalizer_-_3d_horror.glb": { name: "devitalizer", title: "Devitalizer" },
};

const io = new NodeIO();
const library = JSON.parse(fs.readFileSync(LIBRARY_JSON, "utf8"));
const byId = new Map(library.models.map((m) => [m.id, m]));
const built = [];

for (const [file, cfg] of Object.entries(MODELS)) {
  const input = path.join(DOWNLOADS, file);
  if (!fs.existsSync(input)) {
    log(`skip ${file}: not in ${DOWNLOADS}`);
    continue;
  }
  // Read provenance, rename the clips, then optimize.
  const doc = await io.read(input);
  const extras = doc.getRoot().getAsset().extras ?? {};
  const [, author, authorUrl] = /^(.*?)\s*\((.*)\)$/.exec(extras.author ?? "") ?? [null, extras.author ?? "Unknown", ""];
  const licKey = (extras.license ?? "").split(" ")[0];
  const lic = LICENSES[licKey];
  if (!lic) throw new Error(`${file}: unexpected license "${extras.license}"`);
  doc.getRoot().listAnimations().forEach((a, i) => cfg.clips?.[i] && a.setName(cfg.clips[i]));
  const prepared = path.join(WORK, `${cfg.name}.glb`);
  await io.write(prepared, doc);

  const out = path.join(ROOT, "public", "library", "ghosts", `${cfg.name}.glb`);
  const stats = await optimizeToGlb(prepared, out, {
    textureSize: 1024,
    maxTriangles: cfg.maxTriangles ?? 0,
    license: {
      copyright: `${extras.title} by ${author} (${extras.source})`,
      license: licKey,
      licenseText: `${lic.name} (${lic.url}): free to use, including commercially, as long as you credit the author${lic.source === "cc-by-nd" ? ". You may share it only unmodified" : ""}.`,
    },
  });
  delete stats.bytes;
  const id = `ghosts-${cfg.name}`;
  const entry = {
    id,
    slug: slugify(id),
    title: cfg.title,
    source: lic.source,
    collection: "Ghosts",
    collectionKey: "ghosts",
    category: "Ghosts",
    glb: `/library/ghosts/${cfg.name}.glb`,
    glbBytes: fs.statSync(out).size,
    thumb: null,
    stats,
    credit: { title: extras.title, author, authorUrl, url: extras.source },
  };
  byId.set(id, entry);
  built.push(entry);
}

const jobs = built.map((x) => ({
  model: x,
  glb: path.join(ROOT, "public", x.glb),
  out: path.join(ROOT, "public", x.glb.replace(/\.glb$/, ".webp")),
}));
await renderThumbnails(jobs);
for (const j of jobs) {
  const { width, height } = await sharp(j.out).metadata();
  j.model.thumb = { src: j.model.glb.replace(/\.glb$/, ".webp"), width, height };
}

const models = [...byId.values()].sort(
  (a, b) => a.collectionKey.localeCompare(b.collectionKey) || a.title.localeCompare(b.title, "en", { numeric: true }),
);
fs.writeFileSync(LIBRARY_JSON, JSON.stringify({ models }, null, 1) + "\n");
log(`Added ${built.length}: ${built.map((x) => `${x.title} (${x.stats.triangles} tris, ${x.stats.animations} clips, ${(x.glbBytes / 1e6).toFixed(1)} MB)`).join("; ")}`);
