#!/usr/bin/env node
/**
 * Embeds the MIT license into every existing .glb in public/models and public/animations and
 * refreshes the file sizes in src/data/catalog.json. Idempotent; needs no Rocketbox checkout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stampLicense } from "./lib/glb-license.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "src", "data", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
// The MIT copyright notice must travel with every copy; nothing else names the original library.
const stamp = {
  copyright: "Copyright (c) 2020 Microsoft. MIT License.",
  license: "MIT",
  licenseText: catalog.license.text,
};

const size = (publicPath) => fs.statSync(path.join(ROOT, "public", publicPath)).size;
for (const m of catalog.models) {
  stampLicense(path.join(ROOT, "public", m.glb), stamp);
  m.glbBytes = size(m.glb);
}
for (const a of catalog.animations) {
  stampLicense(path.join(ROOT, "public", a.file), stamp);
  a.bytes = size(a.file);
}
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Stamped ${catalog.models.length} models and ${catalog.animations.length} animations.`);
