#!/usr/bin/env node
/**
 * Imports free (CC0 / public-domain) 3D models from external sources into the site:
 *   public/library/<collection>/<model>.glb   optimized, license embedded
 *   public/library/<collection>/<model>.webp  rendered thumbnail
 *   src/data/library.json                     catalog consumed by the site
 *
 * Usage:
 *   node scripts/build-library.mjs                       all sources
 *   node scripts/build-library.mjs --source kenney       one or more sources (comma-separated)
 *   node scripts/build-library.mjs --source kenney --only car-kit,furniture-kit
 *   node scripts/build-library.mjs --force               re-optimize and re-render everything
 *   node scripts/build-library.mjs --reoptimize          re-optimize GLBs, keep thumbnails
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { exists, LIBRARY_JSON, log, OUT, pool, ROOT, optimizeToGlb, slugify } from "./library/common.mjs";
import { renderThumbnails } from "./library/thumbs.mjs";
import * as kaykit from "./library/sources/kaykit.mjs";
import * as kenney from "./library/sources/kenney.mjs";
import * as nasa from "./library/sources/nasa.mjs";
import * as polygonalMind from "./library/sources/polygonal-mind.mjs";

const SOURCES = { kenney, kaykit, "polygonal-mind": polygonalMind, nasa };

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const FORCE = args.includes("--force");
const NO_THUMBS = args.includes("--no-thumbs");
/** Rebuild the GLBs (e.g. after changing optimizer settings) but keep existing thumbnails. */
const REOPTIMIZE = args.includes("--reoptimize");
const selected = (arg("--source")?.split(",") ?? Object.keys(SOURCES)).filter((s) => SOURCES[s]);
const only = arg("--only") ? new Set(arg("--only").split(",")) : null;
const WORKERS = Math.max(2, Math.min(6, Math.floor(os.cpus().length / 2)));

const META = path.join(ROOT, ".cache", "library", "meta");
fs.mkdirSync(META, { recursive: true });

const previous = exists(LIBRARY_JSON) ? JSON.parse(fs.readFileSync(LIBRARY_JSON, "utf8")) : { models: [] };
const byId = new Map(previous.models.map((m) => [m.id, m]));

/** Persists progress after every source, so an interrupted run loses at most one source. */
function save() {
  const models = [...byId.values()].sort(
    (a, b) => a.collectionKey.localeCompare(b.collectionKey) || a.title.localeCompare(b.title, "en", { numeric: true }),
  );
  fs.writeFileSync(LIBRARY_JSON, JSON.stringify({ models }, null, 1) + "\n");
  const total = models.reduce((n, m) => n + m.glbBytes, 0);
  log(`Library saved: ${models.length} models, ${(total / 1e6).toFixed(1)} MB of GLB`);
}

for (const key of selected) {
  const mod = SOURCES[key];
  const { SOURCE } = mod;
  const items = await mod.collect({ only });
  log(`${SOURCE.name}: ${items.length} models`);

  let done = 0;
  const failures = await pool(items, WORKERS, async (item) => {
    const slug = slugify(item.id);
    // Folder per collection; file name from the (unique) id.
    const rel = `${item.collectionKey}/${slug.replace(`${slugify(item.collectionKey)}-`, "")}`;
    const glb = path.join(OUT, `${rel}.glb`);
    const metaFile = path.join(META, `${slug}.json`);
    let stats = byId.get(item.id)?.stats ?? (exists(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : null);
    if (FORCE || REOPTIMIZE || !exists(glb) || !stats) {
      stats = await optimizeToGlb(item.input, glb, {
        textureSize: SOURCE.textureSize,
        maxTriangles: SOURCE.maxTriangles,
        license: mod.licenseStamp(item),
      });
      delete stats.bytes;
      fs.writeFileSync(metaFile, JSON.stringify(stats));
    }
    if (SOURCE.maxBytes && fs.statSync(glb).size > SOURCE.maxBytes) {
      // Too heavy for a web viewer even after optimizing — leave it out.
      fs.rmSync(glb);
      fs.rmSync(glb.replace(/.glb$/, ".webp"), { force: true });
      byId.delete(item.id);
      log(`  (skip ${item.id}: over the size limit)`);
      return;
    }
    byId.set(item.id, {
      id: item.id,
      slug,
      title: item.title,
      source: SOURCE.license,
      collection: item.collection,
      collectionKey: item.collectionKey,
      category: item.category,
      glb: `/library/${rel}.glb`,
      glbBytes: fs.statSync(glb).size,
      thumb: byId.get(item.id)?.thumb ?? null,
      stats,
    });
    if (++done % 200 === 0) log(`  optimized ${done}/${items.length}`);
  });
  if (failures.length) log(`  ${failures.length} model(s) failed`);
  save();

  if (NO_THUMBS) continue;
  const built = new Set(items.map((i) => i.id));
  const models = [...byId.values()].filter((m) => built.has(m.id));
  // Reuse thumbnails already on disk (e.g. from an interrupted run) unless forced.
  for (const m of models) {
    const webp = path.join(ROOT, "public", m.glb.replace(/\.glb$/, ".webp"));
    if (!FORCE && !m.thumb && exists(webp)) {
      const { width, height } = await sharp(webp).metadata();
      m.thumb = { src: m.glb.replace(/\.glb$/, ".webp"), width, height };
    }
  }
  const jobs = models
    .filter((m) => FORCE || !m.thumb)
    .map((m) => ({ model: m, glb: path.join(ROOT, "public", m.glb), out: path.join(ROOT, "public", m.glb.replace(/\.glb$/, ".webp")) }));
  log(`${SOURCE.name}: rendering ${jobs.length} thumbnails…`);
  await renderThumbnails(jobs);
  for (const job of jobs) {
    if (job.width) job.model.thumb = { src: job.model.glb.replace(/\.glb$/, ".webp"), width: job.width, height: job.height };
  }
  save();
}
