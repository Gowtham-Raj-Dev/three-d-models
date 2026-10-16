#!/usr/bin/env node
/**
 * Adds free ghost / horror models to the library (category "Ghosts"):
 *   public/library/ghosts/<model>.glb|.webp, and their entries in src/data/library.json.
 * Sources: Poly Pizza (https://poly.pizza) and OpenGameArt. CC BY models carry a `credit` shown on the site.
 *
 *   node scripts/build-ghost-models.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { LIBRARY_JSON, ROOT, download, exists, log, optimizeToGlb, slugify } from "./library/common.mjs";
import { renderThumbnails } from "./library/thumbs.mjs";

const exec = promisify(execFile);
const FBX2GLTF = path.join(ROOT, "node_modules", "fbx2gltf", "bin", os.type(), os.type() === "Windows_NT" ? "FBX2glTF.exe" : "FBX2glTF");
const CACHE = path.join(ROOT, ".cache", "custom-downloads", "ghosts");
fs.mkdirSync(CACHE, { recursive: true });

const pp = (file) => `https://static.poly.pizza/${file}.glb`;
const CC0 = { source: "cc0", spdx: "CC0-1.0", text: "CC0 1.0 Universal (public domain). Free for personal and commercial use." };
const BY3 = { source: "cc-by", spdx: "CC-BY-3.0", text: "Creative Commons Attribution 3.0. Credit the author when you use it." };
const BY4 = { source: "cc-by", spdx: "CC-BY-4.0", text: "Creative Commons Attribution 4.0. Credit the author when you use it." };

const MODELS = [
  // CC0 — Poly Pizza
  { name: "quaternius-ghost", title: "Ghost", author: "Quaternius", page: "https://poly.pizza/m/Iip30bDHmu", glb: pp("810f60a2-6e45-4c4e-a0d5-da91cd7288bd"), lic: CC0 },
  { name: "polygonal-mind-ghost", title: "Ghost Character", author: "Polygonal Mind", page: "https://poly.pizza/m/CKLHPoYhE9", glb: pp("ddf6e96f-abb3-465a-bc45-3013e897f067"), lic: CC0 },
  { name: "quaternius-ghost-skull", title: "Ghost Skull", author: "Quaternius", page: "https://poly.pizza/m/TX8r9WBXpe", glb: pp("0716bf8e-1894-4a90-8d10-34868975a239"), lic: CC0 },
  // CC BY — OpenGameArt (FBX → GLB)
  {
    name: "ghost-lady",
    title: "Ghost Lady",
    author: "Kabrolkin",
    authorUrl: "https://opengameart.org/users/kabrolkin",
    page: "https://opengameart.org/content/ghost-lady-model-untextured",
    zip: "https://opengameart.org/sites/default/files/ghost_2.zip",
    fbx: "ghost.fbx",
    lic: BY4,
  },
];

async function fetchRaw(m) {
  const dir = path.join(CACHE, m.name);
  fs.mkdirSync(dir, { recursive: true });
  if (m.glb) {
    const raw = path.join(dir, "raw.glb");
    await download(m.glb, raw);
    return raw;
  }
  const raw = path.join(dir, "raw.glb");
  if (!exists(raw)) {
    const zip = path.join(dir, "pack.zip");
    await download(m.zip, zip);
    await exec("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${path.join(dir, "x")}'`]);
    const fbx = fs.readdirSync(path.join(dir, "x"), { recursive: true }).find((f) => f.toLowerCase().endsWith(m.fbx));
    await exec(FBX2GLTF, ["--binary", "-i", path.join(dir, "x", fbx), "-o", path.join(dir, "raw")]);
  }
  return raw;
}

const library = JSON.parse(fs.readFileSync(LIBRARY_JSON, "utf8"));
const byId = new Map(library.models.map((x) => [x.id, x]));
const built = [];

for (const m of MODELS) {
  try {
    const raw = await fetchRaw(m);
    const out = path.join(ROOT, "public", "library", "ghosts", `${m.name}.glb`);
    const stats = await optimizeToGlb(raw, out, {
      textureSize: 1024,
      license: { copyright: `${m.orig ?? m.title} by ${m.author} (${m.page})`, license: m.lic.spdx, licenseText: m.lic.text },
    });
    delete stats.bytes;
    const id = `ghosts-${m.name}`;
    const entry = {
      id,
      slug: slugify(id),
      title: m.title,
      source: m.lic.source,
      collection: "Ghosts",
      collectionKey: "ghosts",
      category: "Ghosts",
      glb: `/library/ghosts/${m.name}.glb`,
      glbBytes: fs.statSync(out).size,
      thumb: null,
      stats,
    };
    if (m.lic.source === "cc-by") entry.credit = { title: m.orig ?? m.title, author: m.author, authorUrl: m.authorUrl, url: m.page };
    byId.set(id, entry);
    built.push(entry);
  } catch (err) {
    console.error(`FAILED ${m.name}:`, err.message);
  }
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
log(`Added ${built.length} models: ${built.map((x) => `${x.title} (${x.stats.triangles} tris, ${x.stats.animations} anims)`).join("; ")}`);

