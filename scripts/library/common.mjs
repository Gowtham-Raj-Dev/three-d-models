import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { stampLicense } from "../lib/glb-license.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = path.join(ROOT, ".cache", "library");
export const OUT = path.join(ROOT, "public", "library");
export const LIBRARY_JSON = path.join(ROOT, "src", "data", "library.json");

export const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
export const exists = (p) => fs.existsSync(p);

export function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "building-type-a" / "car_sedan" / "Bench_01" → "Building Type A" / "Car Sedan" / "Bench 01" */
export function titleize(s) {
  return s
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function download(url, dest, { retries = 3 } = {}) {
  if (exists(dest)) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "3d-models-library-build" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const tmp = `${dest}.part`;
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      fs.renameSync(tmp, dest);
      return dest;
    } catch (err) {
      if (attempt >= retries) throw new Error(`download ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

export async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "3d-models-library-build" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

let ioPromise;
export function getIO() {
  // Draco decoding is needed for sources that ship Draco-compressed GLBs (e.g. NASA); output uses meshopt.
  ioPromise ??= Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, draco3d.createDecoderModule()]).then(([, , dracoDecoder]) =>
    new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder, "draco3d.decoder": dracoDecoder }),
  );
  return ioPromise;
}

/**
 * Reads a .glb/.gltf (external textures/buffers resolved from its folder), optimizes it for the
 * web and writes a single self-contained .glb with the license embedded. Returns model stats.
 */
export async function optimizeToGlb(input, output, options) {
  try {
    return await optimize(input, output, { ...options, compress: true });
  } catch (err) {
    // Some source meshes are malformed in ways meshopt's encoder rejects; ship them uncompressed.
    if (!/Assertion failed/.test(String(err?.message))) throw err;
    return optimize(input, output, { ...options, compress: false });
  }
}

/** Trims triangle-list index buffers to a multiple of 3 (a few source files have dangling indices). */
function fixTriangleIndices(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (prim.getMode() !== 4 || !indices) continue;
      const count = indices.getCount();
      if (count % 3 === 0) continue;
      const array = indices.getArray();
      indices.setArray(array.slice(0, count - (count % 3)));
    }
  }
}

function countGeometry(root) {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      if (prim.getMode() === 4) triangles += idx ? idx.getCount() / 3 : (pos?.getCount() ?? 0) / 3;
      vertices += pos?.getCount() ?? 0;
    }
  }
  return { triangles, vertices };
}

async function optimize(input, output, { textureSize = 1024, maxTriangles = 0, license, compress }) {
  const io = await getIO();
  const doc = await io.read(input);
  const root = doc.getRoot();

  // Inputs may be Draco-compressed; the output uses meshopt instead, so drop Draco after decoding.
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === "KHR_draco_mesh_compression") ext.dispose();
  fixTriangleIndices(doc);
  await doc.transform(prune(), dedup());

  // Very dense scans (e.g. some NASA models have 1–2M triangles) are simplified for the web.
  const before = countGeometry(root);
  if (maxTriangles && before.triangles > maxTriangles) {
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: maxTriangles / before.triangles, error: 0.02 }), prune());
  }

  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  const { triangles, vertices } = countGeometry(root);

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality: 86, effort: 4 }),
    ...(compress ? [meshopt({ encoder: MeshoptEncoder, level: "medium" })] : []),
  );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await io.write(output, doc);
  stampLicense(output, license);

  const finite = bounds.min.every(Number.isFinite) && bounds.max.every(Number.isFinite);
  return {
    triangles: Math.round(triangles),
    vertices,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().length,
    rigged: root.listSkins().length > 0,
    size: finite ? bounds.max.map((v, i) => Number((v - bounds.min[i]).toFixed(3))) : [0, 0, 0],
    bytes: fs.statSync(output).size,
  };
}

export async function pool(items, size, fn) {
  let next = 0;
  const failures = [];
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await fn(item);
        } catch (err) {
          failures.push(item);
          console.error(`✗ ${item.id ?? item}: ${err.message}`);
        }
      }
    }),
  );
  return failures;
}

/** Shipped in public-domain models and as public/licenses/PUBLIC-DOMAIN.txt. */
export const PUBLIC_DOMAIN_TEXT = `Public domain

These models are not subject to copyright in the United States and may be used for any purpose, including
commercially.

- Some models show insignia, logos or other marks. Those may be protected and must not be used to imply
  endorsement or sponsorship.
- If a model depicts identifiable people or third-party marks, other rights may apply.`;

export const CC0_TEXT = `Creative Commons Zero v1.0 Universal (CC0 1.0) — Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

The person who associated a work with this deed has dedicated the work to the public domain by waiving all of
their rights to the work worldwide under copyright law, including all related and neighboring rights, to the
extent allowed by law. You can copy, modify, distribute and perform the work, even for commercial purposes, all
without asking permission.`;
