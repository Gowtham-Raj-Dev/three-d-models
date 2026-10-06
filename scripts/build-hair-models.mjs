/**
 * Builds the Hair category from hairstyles downloaded from Sketchfab (CC BY / CC BY-ND — credit required):
 *
 *   .cache/hair-raw/<file>.glb             the downloads (git-ignored; re-download from the source URLs below)
 *   public/library/hair/<name>.glb/.webp   web-ready copy + thumbnail
 *   src/data/library.json                  the Hair entries (replaced on every run)
 *
 * The models are shipped as they are: only converted to a compressed single-file .glb (meshopt geometry, WebP
 * textures), which CC licenses allow as a technical change — so NoDerivatives models can be shipped too.
 * Usage: node scripts/build-hair-models.mjs [--no-thumbs]
 */
import fs from "node:fs";
import path from "node:path";
import { prune } from "@gltf-transform/functions";
import { getIO, LIBRARY_JSON, log, optimizeToGlb, OUT, ROOT } from "./library/common.mjs";
import { renderThumbnails } from "./library/thumbs.mjs";

const RAW = path.join(ROOT, ".cache", "hair-raw");
const WORK = path.join(ROOT, ".cache", "hair");
const DIR = path.join(OUT, "hair");

/** Licenses the site can ship, by the SPDX id Sketchfab writes into each download. NonCommercial can't be. */
const LICENSES = {
  "CC-BY-4.0": { source: "cc-by", name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  "CC-BY-ND-4.0": { source: "cc-by-nd", name: "CC BY-ND 4.0", url: "https://creativecommons.org/licenses/by-nd/4.0/" },
};

/** `keep` (material names) drops everything else in a download — only for CC BY ones, which allow changes. */
const HAIRSTYLES = [
  // https://sketchfab.com/3d-models/honoka-hair-6f00d54f5f234b61a7b7d9eaa1b2efa8 — also has a tiny character body under the hair
  { file: "honoka_hair.glb", name: "honoka-hair", title: "Honoka Hair", keep: /^hair/ },
  // https://sketchfab.com/3d-models/long-black-hair-for-character-6c06611cf3454b978c01bb98368198b2
  { file: "long_black_hair_for_character.glb", name: "long-black-hair", title: "Long Black Hair" },
  // https://sketchfab.com/3d-models/p8-alyson-hair-black-reduced-polys-0b70f16f8aca4d48bc0496f177ea5d0d
  { file: "p8_alyson-_hair_black_reduced_polys.glb", name: "alyson-black-hair", title: "Alyson Black Hair" },
  // https://sketchfab.com/3d-models/p8-alyson-hair-bum-c905952a03f74acca6082c551c0686c7
  { file: "p8_alyson-_hair_bum.glb", name: "alyson-hair-bun", title: "Alyson Hair Bun" },
  // https://sketchfab.com/3d-models/side-swept-bob-haircut-f3c0f129fcce45e99991959ac2b9c8ce
  { file: "side_swept_bob_haircut.glb", name: "side-swept-bob", title: "Side Swept Bob Haircut" },
  // https://sketchfab.com/3d-models/stylized-hair-aniso-test-9f8e1715671d49e6ab5066e1f99c9c72
  { file: "stylized_hair_aniso_test.glb", name: "stylized-hair", title: "Stylized Hair" },
];

/** Sketchfab writes the credit and license into asset.extras; the build refuses anything it can't ship. */
async function readCredit(file) {
  const doc = await (await getIO()).read(file);
  const extras = doc.getRoot().getAsset().extras ?? {};
  const author = /^(.*?)\s*\((https?:[^)]+)\)$/.exec(extras.author ?? "");
  const spdx = (extras.license ?? "").split(" ")[0];
  const license = LICENSES[spdx];
  if (!author || !extras.source || !extras.title) throw new Error(`${file}: no Sketchfab credit in asset.extras`);
  if (!license) throw new Error(`${file}: license "${spdx || "unknown"}" can't be shipped (only ${Object.keys(LICENSES).join(", ")})`);
  return { credit: { title: extras.title, author: author[1], authorUrl: author[2], url: extras.source }, spdx, license };
}

/** Writes a copy of `file` holding only the primitives whose material matches `keep`. */
async function keepOnly(file, keep, out) {
  const io = await getIO();
  const doc = await io.read(file);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) if (!keep.test(prim.getMaterial()?.getName() ?? "")) mesh.removePrimitive(prim);
    if (!mesh.listPrimitives().length) node.setMesh(null).setSkin(null);
  }
  await doc.transform(prune());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  return out;
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const entries = [];

  for (const item of HAIRSTYLES) {
    log(`${item.title} ← ${item.file}`);
    let raw = path.join(RAW, item.file);
    const { credit, spdx, license } = await readCredit(raw);
    if (item.keep) {
      if (license.source !== "cc-by") throw new Error(`${item.file}: ${license.name} doesn't allow removing parts`);
      raw = await keepOnly(raw, item.keep, path.join(WORK, item.file));
    }
    const glb = path.join(DIR, `${item.name}.glb`);
    const changes = `Converted to a compressed .glb (meshopt geometry, WebP textures)${item.keep ? "; hair only" : ""}; otherwise unchanged.`;
    const stats = await optimizeToGlb(raw, glb, {
      // Keep the authors' texture sizes; only the format changes.
      textureSize: 8192,
      license: {
        copyright: `“${credit.title}” by ${credit.author} (${credit.authorUrl}), ${credit.url} — ${license.name}, ${license.url}. ${changes}`,
        license: spdx,
        licenseText: `${license.name}: free to use, including commercially, as long as you credit the author (see copyright)${license.source === "cc-by-nd" ? ". You may share it only unmodified" : ""}.`,
      },
    });
    log(`  ${stats.triangles} triangles, ${(stats.bytes / 1024).toFixed(0)} KB · ${license.name} · ${credit.author}`);
    entries.push({
      id: `hair-${item.name}`,
      slug: `hair-${item.name}`,
      title: item.title,
      source: license.source,
      collection: "Hairstyles & Hair Packs",
      collectionKey: "hair",
      category: "Hair",
      glb: `/library/hair/${item.name}.glb`,
      glbBytes: stats.bytes,
      stats,
      credit,
      thumb: null,
    });
  }

  const thumbOf = (entry) => path.join(ROOT, "public", entry.glb.replace(/\.glb$/, ".webp"));
  if (!process.argv.includes("--no-thumbs")) {
    log("Rendering thumbnails…");
    const jobs = entries.map((entry) => ({ entry, glb: path.join(ROOT, "public", entry.glb), out: thumbOf(entry) }));
    const failed = new Set(await renderThumbnails(jobs));
    for (const job of jobs) if (!failed.has(job)) job.entry.thumb = { src: job.entry.glb.replace(/\.glb$/, ".webp"), width: job.width, height: job.height };
  } else {
    // Keep thumbnails from an earlier run.
    const previous = new Map(JSON.parse(fs.readFileSync(LIBRARY_JSON, "utf8")).models.map((m) => [m.id, m]));
    for (const entry of entries) if (fs.existsSync(thumbOf(entry))) entry.thumb = previous.get(entry.id)?.thumb ?? null;
  }

  // This folder holds only what this script builds.
  const keep = new Set(entries.flatMap((e) => [path.basename(e.glb), path.basename(thumbOf(e))]));
  for (const f of fs.readdirSync(DIR)) {
    if (keep.has(f)) continue;
    fs.rmSync(path.join(DIR, f));
    log(`  removed stale ${f}`);
  }

  const library = JSON.parse(fs.readFileSync(LIBRARY_JSON, "utf8"));
  const models = [...library.models.filter((m) => m.collectionKey !== "hair" && m.category !== "Hair"), ...entries].sort(
    (a, b) => a.collectionKey.localeCompare(b.collectionKey) || a.title.localeCompare(b.title, "en", { numeric: true }),
  );
  fs.writeFileSync(LIBRARY_JSON, JSON.stringify({ models }, null, 1) + "\n");
  const missing = entries.filter((e) => !e.thumb).map((e) => e.id);
  log(`library.json: ${entries.length} hairstyles${missing.length ? ` (no thumbnail, hidden on the site: ${missing.join(", ")})` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
