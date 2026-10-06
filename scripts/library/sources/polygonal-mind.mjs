import path from "node:path";
import { CACHE, CC0_TEXT, download, exists, log, pool, titleize } from "../common.mjs";

export const SOURCE = {
  key: "polygonal-mind",
  name: "Polygonal Mind",
  /** Site source key (src/lib/catalog.ts SOURCES). */
  license: "cc0",
  // Stylized textures, many per model: 512 px keeps the collection light without visible loss.
  textureSize: 512,
};

const REGISTRY = "https://raw.githubusercontent.com/ToxSam/open-source-3D-assets/main/data";

const CATEGORY_MAP = [
  ["Buildings", ["Architecture", "Structure", "Infrastructure", "Monument"]],
  ["Nature", ["Nature", "Environment", "Terrain", "Water Feature"]],
  ["Animals", ["Creature", "Wildlife"]],
  ["Furniture", ["Furniture", "Park Furniture", "Office", "Urban Furniture"]],
  ["Food", ["Food & Drink", "Tableware"]],
  ["Vehicles", ["Vehicle", "Transportation"]],
  ["Space", ["Space"]],
  ["Characters", ["Avatar", "Character"]],
];
/** The studio's own brand names, removed from collection, model and node names. */
export const BRAND = /_?(cryptoavatars[-_ ]?|polygonal[-_ ]?(mind)?)/gi;

/** Brand logos / UI widgets — skipped (may contain third-party marks, not useful as models). */
const SKIP = new Set(["Branding", "UI Element", "UI"]);

function mapCategory(value) {
  for (const [category, values] of CATEGORY_MAP) if (values.includes(value)) return category;
  return "Props";
}

export async function collect({ only } = {}) {
  const projects = await (await fetch(`${REGISTRY}/projects.json`)).json();
  const list = (Array.isArray(projects) ? projects : projects.projects).filter(
    (p) => p.license === "CC0" && p.is_public !== false && (!only || only.has(p.id)),
  );
  log(`Polygonal Mind: ${list.length} collections`);

  const items = [];
  for (const project of list) {
    const assets = await (await fetch(`${REGISTRY}/${project.asset_data_file}`)).json();
    const folder = project.id.replace(/^pm-/, "");
    const key = folder.replace(BRAND, "");
    const collection = titleize(project.name.replace(BRAND, ""));
    for (const a of assets) {
      if (a.is_public === false || a.is_draft || a.format !== "GLB") continue;
      const category = a.metadata?.attributes?.find((t) => t.trait_type === "Category")?.value ?? "";
      if (SKIP.has(category)) continue;
      const name = a.name.replace(BRAND, "") || a.name;
      items.push({
        id: `${key}-${name}`,
        title: titleize(name),
        url: a.model_file_url,
        input: path.join(CACHE, "polygonal-mind", folder, `${a.name}.glb`),
        collection,
        collectionKey: key,
        category: mapCategory(category),
      });
    }
  }

  let done = 0;
  await pool(items, 6, async (item) => {
    await download(item.url, item.input);
    if (++done % 100 === 0) log(`  downloaded ${done}/${items.length}`);
  });
  return items.filter((i) => exists(i.input));
}

export function licenseStamp() {
  return {
    copyright: "CC0 1.0 (public domain).",
    license: "CC0-1.0",
    licenseText: CC0_TEXT,
    scrub: BRAND,
  };
}
