#!/usr/bin/env node
/**
 * Converts the Microsoft Rocketbox library (FBX + TGA, pulled into vendor/Microsoft-Rocketbox
 * by `npm run models:fetch`) into web-ready assets:
 *
 *   public/models/<slug>.glb       optimized glTF binary (WebP textures, meshopt geometry)
 *   public/thumbs/<slug>.webp      trimmed preview image
 *   public/animations/<id>.glb     curated Biped animation clips (shared by every human avatar)
 *   src/data/catalog.json          metadata consumed by the Next.js site
 *
 * Usage:
 *   node scripts/build-models.mjs                  build everything that is missing
 *   node scripts/build-models.mjs --force          rebuild everything
 *   node scripts/build-models.mjs --only Female_Adult_01,Dog_Beagle_01
 *   node scripts/build-models.mjs --catalog-only   only regenerate catalog.json from existing outputs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { stampLicense } from "./lib/glb-license.mjs";
import { decodeTGA } from "./lib/tga.mjs";

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "vendor", "Microsoft-Rocketbox");
const CACHE = path.join(ROOT, ".cache", "build");
const OUT_MODELS = path.join(ROOT, "public", "models");
const OUT_THUMBS = path.join(ROOT, "public", "thumbs");
const OUT_ANIMS = path.join(ROOT, "public", "animations");
const CATALOG = path.join(ROOT, "src", "data", "catalog.json");

const TEXTURE_SIZE = Number(process.env.TEXTURE_SIZE ?? 1024);
/** The MIT copyright notice, which must travel with every copy. Keep in sync with scripts/stamp-licenses.mjs. */
const COPYRIGHT = "Copyright (c) 2020 Microsoft. MIT License.";
/** Full MIT text embedded in every .glb so single-file downloads carry the notice. */
const licenseStamp = () => ({
  copyright: COPYRIGHT,
  license: "MIT",
  licenseText: fs.readFileSync(path.join(SRC, "LICENSE.md"), "utf8").replace(/\r\n/g, "\n").trim(),
});

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const CATALOG_ONLY = args.includes("--catalog-only");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
const CONCURRENCY = Math.max(2, Math.min(6, Math.floor(os.cpus().length / 2)));

const FBX2GLTF = path.join(
  ROOT,
  "node_modules",
  "fbx2gltf",
  "bin",
  os.type(),
  os.type() === "Windows_NT" ? "FBX2glTF.exe" : "FBX2glTF",
);

/** Curated animation clips. Each exists as f_<id> and m_<id> in the Rocketbox repo. */
const ANIMATIONS = [
  { id: "idle_neutral_01", label: "Idle", folder: "all_animations_max_motextr_static" },
  { id: "idle_look_around_01", label: "Look around", folder: "all_animations_max_motextr_static" },
  { id: "gestic_talk_neutral_01", label: "Talk", folder: "all_animations_max_motextr_static" },
  { id: "gestic_thoughtful_01", label: "Thoughtful", folder: "all_animations_max_motextr_static" },
  { id: "wave_01", label: "Wave", folder: "all_animations_max_motextr_static" },
  { id: "cheer_01", label: "Cheer", folder: "all_animations_max_motextr_static" },
  { id: "claphands_01", label: "Clap", folder: "all_animations_max_motextr_static" },
  { id: "dancing_neutral", label: "Dance", folder: "all_animations_max_motextr_static" },
  { id: "walk_neutral_01", label: "Walk", folder: "all_animations_max_motextr_xy" },
  { id: "run_neutral_01", label: "Run", folder: "all_animations_max_motextr_xy" },
];

/** Folder prefix → [filter label, person noun]. */
const ROLES = {
  Business: ["Business", { female: "Businesswoman", male: "Businessman" }],
  Chef: ["Chef", "Chef"],
  Construction: ["Construction", "Construction Worker"],
  Delivery: ["Delivery", "Delivery Courier"],
  Fire: ["Firefighter", "Firefighter"],
  Gardener: ["Gardener", "Gardener"],
  Medical: ["Medical", "Medical Worker"],
  Military: ["Military", "Soldier"],
  Pilot: ["Pilot", "Pilot"],
  Police: ["Police", "Police Officer"],
  Security: ["Security", "Security Guard"],
  Sports: ["Sports", "Athlete"],
  Wood: ["Lumberjack", "Lumberjack"],
};

const WORD_LABELS = {
  GermanShepard: "German Shepherd",
  LightBrown: "Light brown",
  OneHump: "Dromedary",
  TwoHump: "Bactrian",
  Saddle: "Saddled",
};

// ---------------------------------------------------------------------------------------------

const slugify = (id) => id.toLowerCase().replace(/_/g, "-");
const exists = (p) => fs.existsSync(p);
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

function describe(id, category) {
  const parts = id.split("_");
  const number = /^\d+$/.test(parts.at(-1)) ? parts.pop() : null;

  if (category === "Animals") {
    const isBird = parts[0] === "Bird";
    const words = isBird ? parts.slice(1) : parts;
    const species = words[0];
    const variants = words.slice(1).map((w) => WORD_LABELS[w] ?? w);
    const tags = isBird ? ["Bird"] : [];
    let title = species;
    if (species === "Dog") {
      title = variants.shift();
      tags.push("Dog");
    } else if (species === "Deer" && variants[0] === "Roe") {
      variants.shift();
      title = "Roe Deer";
    } else if (species === "Camel") {
      const type = variants.shift();
      title = `${type} Camel`;
      tags.push(type === "Dromedary" ? "One hump" : "Two humps");
    }
    return {
      title,
      subtitle: [...tags, ...variants].join(" · ") || "Animal",
      kind: "animal",
      gender: null,
      role: null,
      species,
    };
  }

  const gender = parts.includes("Female") ? "female" : "male";
  const genderLabel = gender === "female" ? "Female" : "Male";
  if (category === "Professions") {
    const [role, noun] = ROLES[parts[0]] ?? [parts[0], parts[0]];
    const person = typeof noun === "string" ? noun : noun[gender];
    const title = typeof noun === "string" ? `${genderLabel} ${person} ${number}` : `${person} ${number}`;
    return { title, subtitle: `${genderLabel} · ${role}`, kind: "human", gender, role, species: null };
  }
  const age = category === "Children" ? "Child" : "Adult";
  const extra = parts.includes("Party") ? "Party" : age;
  return { title: `${genderLabel} ${extra} ${number}`, subtitle: `${genderLabel} · ${age}`, kind: "human", gender, role: null, species: null };
}

// The clone is blob-less: any git command that needs file *contents or sizes* of files outside the
// sparse checkout would silently download them (GBs). Forbid lazy fetching for our git calls.
const GIT_ENV = { ...process.env, GIT_NO_LAZY_FETCH: "1" };

/** Every file path in the upstream repo, including files outside the sparse checkout. */
async function listRepoFiles() {
  const { stdout } = await run("git", ["-C", SRC, "ls-tree", "-r", "--name-only", "HEAD"], {
    maxBuffer: 64 * 1024 * 1024,
    env: GIT_ENV,
  });
  return new Set(stdout.split("\n").filter(Boolean));
}

async function repoCommit() {
  const { stdout } = await run("git", ["-C", SRC, "rev-parse", "HEAD"], { env: GIT_ENV });
  return stdout.trim();
}

function discoverModels(repoFiles) {
  const models = [];
  for (const file of repoFiles) {
    let m = file.match(/^Assets\/Avatars\/(Adults|Children|Professions)\/([^/]+)\/Export\/\2\.fbx$/);
    if (m) models.push({ id: m[2], category: m[1], dir: `Assets/Avatars/${m[1]}/${m[2]}` });
    m = file.match(/^Assets\/Animals\/([^/]+)\/Export\/\1\.fbx$/);
    if (m) models.push({ id: m[1], category: "Animals", dir: `Assets/Animals/${m[1]}` });
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/** Texture basenames referenced inside a binary FBX (paths are absolute 3ds Max paths). */
function referencedTextures(fbxBuffer) {
  const names = new Set();
  const text = fbxBuffer.toString("latin1");
  for (const [run] of text.matchAll(/[\x20-\x7e]{5,}/g)) {
    for (const [file] of run.matchAll(/[^\\/:]+\.(?:tga|png|jpe?g|bmp|psd)/gi)) names.add(file.toLowerCase());
  }
  return names;
}

function isOpaque(raw) {
  if (raw.channels !== 4) return true;
  for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i] < 250) return false;
  return true;
}

function isGrayscale(raw) {
  if (raw.channels === 1) return true;
  const { data, channels } = raw;
  const step = Math.max(1, Math.floor(data.length / channels / 4096)) * channels;
  for (let i = 0; i < data.length; i += step) {
    if (Math.abs(data[i] - data[i + 1]) > 6 || Math.abs(data[i] - data[i + 2]) > 6) return false;
  }
  return true;
}

/** Converts a grayscale bump (height) map to a tangent-space normal map. */
function bumpToNormal(raw, strength = 3) {
  const { width: w, height: h, channels, data } = raw;
  const height = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * channels] / 255;
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * strength;
      const dy = (height(x, y + 1) - height(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 3;
      out[o] = Math.round((-dx / len) * 127.5 + 127.5);
      out[o + 1] = Math.round((dy / len) * 127.5 + 127.5);
      out[o + 2] = Math.round((1 / len) * 127.5 + 127.5);
    }
  }
  return { width: w, height: h, channels: 3, data: out };
}

async function stageModel(model) {
  const stage = path.join(CACHE, "stage", model.id);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  const fbxPath = path.join(SRC, model.dir, "Export", `${model.id}.fbx`);
  const fbx = fs.readFileSync(fbxPath);
  fs.writeFileSync(path.join(stage, `${model.id}.fbx`), fbx);

  const wanted = referencedTextures(fbx);
  const texDir = path.join(SRC, model.dir, "Textures");
  const tgas = exists(texDir) ? fs.readdirSync(texDir).filter((f) => /\.tga$/i.test(f)) : [];
  const used = tgas.filter((f) => wanted.has(f.toLowerCase()) && !/specular|wrinkle/i.test(f));

  for (const file of used) {
    let raw = decodeTGA(fs.readFileSync(path.join(texDir, file)));
    // Shrink before any per-pixel work so bump conversion runs on the final resolution.
    if (raw.width > TEXTURE_SIZE || raw.height > TEXTURE_SIZE) {
      const { data, info } = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } })
        .resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: "inside", kernel: "lanczos3" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      raw = { width: info.width, height: info.height, channels: info.channels, data };
    }
    if (/bump/i.test(file) && isGrayscale(raw)) raw = bumpToNormal(raw);

    let img = sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } });
    if (raw.channels === 4 && isOpaque(raw)) img = img.removeAlpha();
    await img.png({ compressionLevel: 1 }).toFile(path.join(stage, file.replace(/\.tga$/i, ".png")));
  }
  return { stage, fbxBytes: fbx.length, textures: used };
}

async function fbxToGlb(stageDir, id, outBase) {
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const { stdout, stderr } = await run(
    FBX2GLTF,
    ["--binary", "--no-khr-lights-punctual", "--anim-framerate", "bake30", "-i", path.join(stageDir, `${id}.fbx`), "-o", outBase],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  fs.writeFileSync(`${outBase}.log`, stdout + stderr);
  return `${outBase}.glb`;
}

function createIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
}

async function optimizeModel(rawGlb, outGlb) {
  const io = createIO();
  const doc = await io.read(rawGlb);
  const root = doc.getRoot();
  root.getAsset().copyright = COPYRIGHT;

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      // 3ds Max exports leave arbitrary vertex colours that would tint the texture in glTF viewers.
      prim.setAttribute("COLOR_0", null);
    }
  }

  for (const mat of root.listMaterials()) {
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(/head|skin|face/i.test(mat.getName()) ? 0.62 : 0.82);
    mat.setEmissiveFactor([0, 0, 0]);
    if (mat.getAlphaMode() === "BLEND") {
      // Hair cards / lashes: alpha-tested renders correctly in every engine without sorting issues.
      mat.setAlphaMode("MASK");
      mat.setAlphaCutoff(0.4);
      mat.setDoubleSided(true);
    }
  }

  for (const anim of root.listAnimations()) {
    if (anim.listChannels().length === 0) anim.dispose();
  }

  await doc.transform(prune(), dedup());

  // Measure before quantization (meshopt stores normalized positions).
  const bounds = getBounds(root.listScenes()[0]);
  let triangles = 0;
  let vertices = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      triangles += idx ? idx.getCount() / 3 : (pos?.getCount() ?? 0) / 3;
      vertices += pos?.getCount() ?? 0;
    }
  }

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^normalTexture$/, quality: 90, effort: 5 }),
    textureCompress({ encoder: sharp, targetFormat: "webp", formats: /png|jpeg/, quality: 84, effort: 5 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(outGlb, doc);
  stampLicense(outGlb, licenseStamp());

  return {
    triangles: Math.round(triangles),
    vertices,
    bones: root.listSkins().reduce((n, s) => Math.max(n, s.listJoints().length), 0),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    size: bounds.max.map((v, i) => Number((v - bounds.min[i]).toFixed(3))),
  };
}

async function buildThumb(model, outFile) {
  const png = path.join(SRC, model.dir, `${model.id}.png`);
  if (!exists(png)) return null;
  const trimmed = await sharp(png).ensureAlpha().trim({ threshold: 12 }).toBuffer();
  const info = await sharp(trimmed)
    .resize({ width: 560, height: 720, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 90, effort: 5 })
    .toFile(outFile);
  return { width: info.width, height: info.height };
}

async function buildModel(model) {
  const slug = slugify(model.id);
  const outGlb = path.join(OUT_MODELS, `${slug}.glb`);
  const outThumb = path.join(OUT_THUMBS, `${slug}.webp`);
  const metaFile = path.join(CACHE, "meta", `${model.id}.json`);

  if (!FORCE && exists(outGlb) && exists(outThumb) && exists(metaFile)) return JSON.parse(fs.readFileSync(metaFile, "utf8"));

  const t0 = Date.now();
  const { stage, textures } = await stageModel(model);
  const rawGlb = await fbxToGlb(stage, model.id, path.join(CACHE, "raw", model.id));
  const stats = await optimizeModel(rawGlb, outGlb);
  const thumb = await buildThumb(model, outThumb);
  fs.rmSync(stage, { recursive: true, force: true });

  const meta = { stats, thumb, textures, glbBytes: fs.statSync(outGlb).size };
  fs.mkdirSync(path.dirname(metaFile), { recursive: true });
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  log(`✓ ${model.id}  ${(meta.glbBytes / 1e6).toFixed(2)} MB  ${stats.triangles} tris  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return meta;
}

async function buildAnimation(file, outGlb) {
  const stage = path.join(CACHE, "stage-anim", path.basename(file, ".max.fbx"));
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const id = path.basename(file, ".max.fbx");
  fs.copyFileSync(file, path.join(stage, `${id}.fbx`));
  const rawGlb = await fbxToGlb(stage, id, path.join(CACHE, "raw-anim", id));
  fs.rmSync(stage, { recursive: true, force: true });

  const io = createIO();
  const doc = await io.read(rawGlb);
  const root = doc.getRoot();
  root.getAsset().copyright = COPYRIGHT;

  // Keep only skeleton motion: bone rotations plus the Biped root (Bip01) translation. Per-bone
  // translations are dropped so clips retarget cleanly onto avatars with other proportions
  // (children, tall/short adults); the viewer rescales the root translation per avatar.
  for (const node of root.listNodes()) node.setMesh(null).setSkin(null);
  let duration = 0;
  for (const anim of root.listAnimations()) {
    for (const channel of anim.listChannels()) {
      const name = channel.getTargetNode()?.getName() ?? "";
      const pathName = channel.getTargetPath();
      const isBone = /^Bip01( |$)/.test(name) && name !== "Bip01 Footsteps";
      const keep = isBone && (pathName === "rotation" || (pathName === "translation" && name === "Bip01"));
      if (!keep) {
        channel.getSampler()?.dispose();
        channel.dispose();
        continue;
      }
      if (pathName === "translation") {
        // Locomotion clips travel forward; remove the linear horizontal drift so they loop in place.
        const input = channel.getSampler().getInput();
        const output = channel.getSampler().getOutput();
        const times = input.getArray();
        const values = output.getArray().slice();
        const n = output.getCount();
        const t0 = times[0];
        const span = times[n - 1] - t0 || 1;
        const dx = values[(n - 1) * 3] - values[0];
        const dz = values[(n - 1) * 3 + 2] - values[2];
        for (let i = 0; i < n; i++) {
          const f = (times[i] - t0) / span;
          values[i * 3] -= dx * f;
          values[i * 3 + 2] -= dz * f;
        }
        output.setArray(values);
      }
    }
    for (const sampler of anim.listSamplers()) {
      const input = sampler.getInput();
      if (input) duration = Math.max(duration, input.getMax([0])[0]);
    }
  }

  await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(outGlb, doc);
  stampLicense(outGlb, licenseStamp());
  return { duration: Number(duration.toFixed(3)), bytes: fs.statSync(outGlb).size };
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  const failures = [];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = await fn(items[i], i);
        } catch (err) {
          failures.push({ item: items[i], err });
          console.error(`✗ ${items[i].id ?? items[i]}: ${err.message}`);
        }
      }
    }),
  );
  return { results, failures };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  if (!exists(path.join(SRC, ".git"))) {
    console.error("Rocketbox source not found. Run `npm run models:fetch` first.");
    process.exit(1);
  }
  for (const dir of [OUT_MODELS, OUT_THUMBS, OUT_ANIMS, path.dirname(CATALOG), CACHE]) fs.mkdirSync(dir, { recursive: true });
  await MeshoptEncoder.ready;

  const commit = await repoCommit();
  const repoFiles = await listRepoFiles();
  let models = discoverModels(repoFiles);
  if (ONLY) models = models.filter((m) => ONLY.has(m.id));
  log(`Found ${models.length} models at ${commit.slice(0, 7)} — texture size ${TEXTURE_SIZE}px, ${CONCURRENCY} workers`);

  // --- Models ---------------------------------------------------------------------------------
  let metas;
  let failures = [];
  if (CATALOG_ONLY) {
    metas = models.map((m) => {
      const f = path.join(CACHE, "meta", `${m.id}.json`);
      return exists(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined;
    });
  } else {
    ({ results: metas, failures } = await pool(models, CONCURRENCY, buildModel));
  }

  // --- Animations -----------------------------------------------------------------------------
  const animations = [];
  for (const anim of ANIMATIONS) {
    for (const prefix of ["f", "m"]) {
      const rel = `Assets/Animations/${anim.folder}/${prefix}_${anim.id}.max.fbx`;
      const file = path.join(SRC, rel);
      const out = path.join(OUT_ANIMS, `${prefix}_${anim.id}.glb`);
      const metaFile = path.join(CACHE, "meta", `anim_${prefix}_${anim.id}.json`);
      if (!exists(file) && !exists(metaFile)) continue;
      let meta;
      if (!CATALOG_ONLY && (FORCE || !exists(out) || !exists(metaFile))) {
        try {
          meta = await buildAnimation(file, out);
          fs.writeFileSync(metaFile, JSON.stringify(meta));
          log(`✓ animation ${prefix}_${anim.id}  ${(meta.bytes / 1e3).toFixed(0)} KB  ${meta.duration}s`);
        } catch (err) {
          console.error(`✗ animation ${prefix}_${anim.id}: ${err.message}`);
          continue;
        }
      } else {
        meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      }
      animations.push({
        id: `${prefix}_${anim.id}`,
        label: anim.label,
        set: prefix,
        file: `/animations/${prefix}_${anim.id}.glb`,
        duration: meta.duration,
        bytes: fs.statSync(out).size,
      });
    }
  }

  // --- Catalog --------------------------------------------------------------------------------
  // Merge with any existing catalog so `--only` runs don't drop other entries.
  const previous = exists(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, "utf8")) : { models: [] };
  const byId = new Map(previous.models.map((m) => [m.id, m]));

  models.forEach((model, i) => {
    const meta = metas[i];
    if (!meta) return;
    const info = describe(model.id, model.category);

    byId.set(model.id, {
      id: model.id,
      slug: slugify(model.id),
      title: info.title,
      subtitle: info.subtitle,
      category: model.category,
      kind: info.kind,
      gender: info.gender,
      role: info.role,
      species: info.species,
      animationSet: info.kind === "human" ? (info.gender === "female" ? "f" : "m") : null,
      glb: `/models/${slugify(model.id)}.glb`,
      glbBytes: fs.statSync(path.join(OUT_MODELS, `${slugify(model.id)}.glb`)).size,
      thumb: meta.thumb ? { src: `/thumbs/${slugify(model.id)}.webp`, ...meta.thumb } : null,
      stats: meta.stats,
    });
  });

  const catalog = {
    license: {
      spdx: "MIT",
      holder: "Microsoft",
      year: 2020,
      text: fs.readFileSync(path.join(SRC, "LICENSE.md"), "utf8").replace(/\r\n/g, "\n").trim(),
    },
    textureSize: TEXTURE_SIZE,
    animations,
    models: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + "\n");

  // Ship the upstream license next to the redistributed assets.
  fs.copyFileSync(path.join(SRC, "LICENSE.md"), path.join(OUT_MODELS, "LICENSE.md"));
  fs.copyFileSync(path.join(SRC, "LICENSE.md"), path.join(OUT_ANIMS, "LICENSE.md"));

  const total = catalog.models.reduce((n, m) => n + m.glbBytes, 0);
  log(`Catalog: ${catalog.models.length} models (${(total / 1e6).toFixed(1)} MB), ${animations.length} animations`);
  if (failures.length) {
    console.error(`${failures.length} model(s) failed: ${failures.map((f) => f.item.id).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
