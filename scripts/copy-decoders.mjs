#!/usr/bin/env node
/**
 * Copies three.js's Draco and Basis (KTX2) decoders into public/decoders/, so the GLB viewer can open
 * uploaded files that use Draco geometry or KTX2 textures without loading code from a CDN.
 * Re-run after upgrading three.
 */
import fs from "node:fs";
import path from "node:path";

const LIBS = path.resolve("node_modules/three/examples/jsm/libs");
const OUT = path.resolve("public/decoders");

const FILES = {
  draco: ["draco/gltf/draco_decoder.js", "draco/gltf/draco_decoder.wasm", "draco/gltf/draco_wasm_wrapper.js"],
  basis: ["basis/basis_transcoder.js", "basis/basis_transcoder.wasm"],
};

for (const [dir, files] of Object.entries(FILES)) {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(LIBS, file), path.join(OUT, dir, path.basename(file)));
}
console.log(`copy-decoders: wrote ${Object.values(FILES).flat().length} files to public/decoders/`);
