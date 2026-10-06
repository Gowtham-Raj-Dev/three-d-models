import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { CACHE, CC0_TEXT, download, exists, log, titleize } from "../common.mjs";

export const SOURCE = {
  key: "kaykit",
  name: "KayKit",
  /** Site source key (src/lib/catalog.ts SOURCES). */
  license: "cc0",
  textureSize: 1024,
};

/** Free (1.0) KayKit packs published on GitHub, with their site category. */
const REPOS = {
  "KayKit-Character-Pack-Adventures-1.0": "Characters",
  "KayKit-Character-Pack-Skeletons-1.0": "Characters",
  "KayKit-City-Builder-Bits-1.0": "Buildings",
  "KayKit-Dungeon-Remastered-1.0": "Props",
  "KayKit-Furniture-Bits-1.0": "Furniture",
  "KayKit-Halloween-Bits-1.0": "Props",
  "KayKit-Medieval-Hexagon-Pack-1.0": "Buildings",
  "KayKit-Prototype-Bits-1.0": "Props",
  "KayKit-Restaurant-Bits-1.0": "Food",
  "KayKit-Space-Base-Bits-1.0": "Space",
};

const VEHICLE = /(^|_)(car|taxi|police|truck|van|bus|firetruck|ambulance|sedan|hatchback|stationwagon)(_|$)/i;

export async function collect({ only } = {}) {
  const dir = path.join(CACHE, "kaykit");
  const items = [];
  const repos = Object.keys(REPOS).filter((r) => !only || only.has(r));
  log(`KayKit: ${repos.length} packs`);

  for (const repo of repos) {
    const zipPath = path.join(dir, `${repo}.zip`);
    const extracted = path.join(dir, repo);
    await download(`https://codeload.github.com/KayKit-Game-Assets/${repo}/zip/refs/heads/main`, zipPath);
    if (!exists(extracted)) {
      // Keep only the glTF export folders (models + .bin + textures).
      const files = unzipSync(fs.readFileSync(zipPath), { filter: (f) => /\/gltf\//i.test(f.name) && !f.name.endsWith("/") });
      for (const [name, data] of Object.entries(files)) {
        const rel = name.slice(name.toLowerCase().indexOf("/gltf/") + 1);
        const prefix = name.slice(name.indexOf("/") + 1, name.toLowerCase().indexOf("/gltf/")).replace(/[\\/]/g, "__");
        const dest = path.join(extracted, prefix, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, data);
      }
    }
    if (!exists(extracted)) continue;

    const pack = repo.replace(/^KayKit-/, "").replace(/-1\.0$/, "");
    const collection = titleize(pack);
    const seen = new Set();
    for (const group of fs.readdirSync(extracted)) {
      const gltfDir = path.join(extracted, group, "gltf");
      if (!exists(gltfDir)) continue;
      for (const file of fs.readdirSync(gltfDir).filter((f) => /\.(gltf|glb)$/i.test(f)).sort()) {
        const name = file.replace(/\.(gltf|glb)$/i, "");
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        items.push({
          id: `${pack.toLowerCase()}-${name}`,
          title: titleize(name),
          input: path.join(gltfDir, file),
          collection,
          collectionKey: pack.toLowerCase(),
          category: VEHICLE.test(name) ? "Vehicles" : REPOS[repo],
        });
      }
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
