import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { CACHE, CC0_TEXT, download, exists, fetchText, getIO, log, ROOT, titleize } from "../common.mjs";

const run = promisify(execFile);

export const SOURCE = {
  key: "kenney",
  name: "Kenney",
  /** Site source key (src/lib/catalog.ts SOURCES). */
  license: "cc0",
  textureSize: 512,
};

const CATEGORY_BY_PACK = {
  Characters: ["animated-characters-protagonists", "animated-characters-retro", "animated-characters-survivors", "blocky-characters", "mini-characters"],
  Animals: ["cube-pets"],
  Vehicles: ["car-kit", "toy-car-kit", "racing-kit", "train-kit", "watercraft-kit"],
  Buildings: [
    "building-kit", "city-kit-commercial", "city-kit-industrial", "city-kit-roads", "city-kit-suburban", "modular-buildings",
    "retro-urban-kit", "fantasy-town-kit", "castle-kit", "3d-road-tiles", "brick-kit", "factory-kit",
  ],
  Furniture: ["furniture-kit", "mini-market"],
  Food: ["food-kit"],
  Nature: ["nature-kit", "mini-forest"],
  Space: ["space-kit", "space-station-kit", "modular-space-kit"],
};

function categoryFor(pack) {
  for (const [category, packs] of Object.entries(CATEGORY_BY_PACK)) if (packs.includes(pack)) return category;
  return "Props";
}

async function listPacks() {
  const slugs = new Set();
  for (let page = 1; page < 20; page++) {
    const url = `https://kenney.nl/assets/category:3D${page > 1 ? `/page:${page}` : ""}`;
    // Pages past the end return an error rather than an empty list.
    const html = await fetchText(url).catch(() => "");
    const before = slugs.size;
    for (const [, slug] of html.matchAll(/href=['"]https:\/\/kenney\.nl\/assets\/([a-z0-9-]+)['"]/g)) slugs.add(slug);
    if (slugs.size === before) break;
  }
  return [...slugs].sort();
}

/** Converts the pack's FBX character with FBX2glTF, then writes one GLB per skin texture into glb/. */
async function skinnedCharacters(extracted) {
  const fbx = fs.readdirSync(path.join(extracted, "Model")).find((f) => /\.fbx$/i.test(f));
  if (!fbx) return;
  const bin = path.join(ROOT, "node_modules", "fbx2gltf", "bin", os.type(), os.type() === "Windows_NT" ? "FBX2glTF.exe" : "FBX2glTF");
  const base = path.join(extracted, "converted");
  await run(bin, ["--binary", "-i", path.join(extracted, "Model", fbx), "-o", base]);

  const io = await getIO();
  const glbDir = path.join(extracted, "glb");
  fs.mkdirSync(glbDir, { recursive: true });
  for (const skin of fs.readdirSync(path.join(extracted, "Skins")).filter((f) => /\.png$/i.test(f))) {
    const doc = await io.read(`${base}.glb`);
    const image = fs.readFileSync(path.join(extracted, "Skins", skin));
    const textures = doc.getRoot().listTextures();
    if (textures.length) {
      for (const t of textures) t.setImage(image).setMimeType("image/png").setURI("");
    } else {
      const tex = doc.createTexture(skin).setImage(image).setMimeType("image/png");
      for (const mat of doc.getRoot().listMaterials()) mat.setBaseColorTexture(tex);
    }
    await io.write(path.join(glbDir, `${skin.replace(/\.png$/i, "")}.glb`), doc);
  }
}

/** Yields one item per .glb in every Kenney 3D pack. */
export async function collect({ only } = {}) {
  const dir = path.join(CACHE, "kenney");
  const packs = (await listPacks()).filter((p) => !only || only.has(p));
  log(`Kenney: ${packs.length} packs`);
  const items = [];

  for (const pack of packs) {
    const zipPath = path.join(dir, `${pack}.zip`);
    const extracted = path.join(dir, pack);
    if (!exists(zipPath)) {
      const html = await fetchText(`https://kenney.nl/assets/${pack}`);
      const zipUrl = html.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^'"\s]+\.zip/)?.[0];
      if (!zipUrl) {
        log(`  (skip ${pack}: no download link)`);
        continue;
      }
      await download(zipUrl, zipPath);
    }
    if (!exists(extracted)) {
      const MODEL_DIR = /(^|\/)((GLB|GLTF) format|gLTF)\//i;
      const files = unzipSync(fs.readFileSync(zipPath), {
        filter: (f) =>
          MODEL_DIR.test(f.name) || /^License\.txt$/i.test(f.name) || /^Model\/[^/]+\.fbx$/i.test(f.name) || /^Skins\/[^/]+\.png$/i.test(f.name),
      });
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith("/")) continue;
        const rel = MODEL_DIR.test(name) ? name.replace(/^.*?((GLB|GLTF) format|gLTF)\//i, "glb/") : name;
        const dest = path.join(extracted, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, data);
      }
      // Animated-character packs: one FBX body + several skins → one GLB per skin.
      if (exists(path.join(extracted, "Model")) && exists(path.join(extracted, "Skins"))) {
        await skinnedCharacters(extracted);
      }
    }
    const glbDir = path.join(extracted, "glb");
    if (!exists(glbDir)) {
      log(`  (skip ${pack}: no GLB models)`);
      continue;
    }
    const collection = titleize(pack).replace(/^3d /i, "3D ");
    const files = fs.readdirSync(glbDir).filter((f) => /\.(glb|gltf)$/i.test(f));
    const glbNames = new Set(files.filter((f) => /\.glb$/i.test(f)).map((f) => f.slice(0, -4)));
    // Prefer .glb; fall back to .gltf when a pack only ships that.
    const chosen = files.filter((f) => /\.glb$/i.test(f) || !glbNames.has(f.slice(0, -5))).sort();
    for (const file of chosen) {
      const name = file.replace(/\.(glb|gltf)$/i, "");
      items.push({
        id: `${pack}-${name}`,
        title: titleize(name),
        input: path.join(glbDir, file),
        collection,
        collectionKey: pack,
        category: categoryFor(pack),
      });
    }
  }
  return items;
}

export function licenseStamp() {
  return {
    copyright: "CC0 1.0 (public domain).",
    license: "CC0-1.0",
    licenseText: CC0_TEXT,
  };
}
