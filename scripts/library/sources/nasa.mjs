import path from "node:path";
import { CACHE, download, exists, log, pool, PUBLIC_DOMAIN_TEXT } from "../common.mjs";

export const SOURCE = {
  key: "nasa",
  name: "NASA",
  /** Site source key (src/lib/catalog.ts SOURCES). */
  license: "public-domain",
  textureSize: 1024,
  /** Some NASA scans have 1–2M triangles; simplify them for real-time use. */
  maxTriangles: 120_000,
  /** Models still heavier than this after optimizing (unsimplifiable science visualizations) are skipped. */
  maxBytes: 8 * 1024 * 1024,
};

const REPO = "nasa/NASA-3D-Resources";
const BRANCH = "master";
/** Skip the few enormous scenes (raw size) — they are too heavy for a web viewer. */
const MAX_BYTES = 25 * 1024 * 1024;

function collectionFor(name) {
  if (/asteroid|comet|moon|planet|mars|jupiter|saturn|venus|pluto|ceres|vesta|bennu|eros|earth|neptune|uranus|crater|terrain/i.test(name)) {
    return ["Planets & Small Bodies", "planets"];
  }
  if (/rover|lander|helicopter|ingenuity|perseverance|curiosity|opportunity|spirit|sojourner|viking|phoenix|insight/i.test(name)) {
    return ["Rovers & Landers", "rovers"];
  }
  if (/suit|helmet|glove|boot|astronaut|emu|tool|camera|hammer/i.test(name)) return ["Astronaut Gear", "gear"];
  if (/station|iss|shuttle|orion|capsule|rocket|launch|saturn v|sls|apollo|gemini|mercury|dragon|soyuz|module/i.test(name)) {
    return ["Rockets & Crewed Craft", "crewed"];
  }
  return ["Satellites & Probes", "satellites"];
}

export async function collect() {
  const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, {
    headers: { "User-Agent": "3d-models-library-build" },
  })).json();
  const glbs = tree.tree.filter((t) => t.type === "blob" && /\.glb$/i.test(t.path) && t.size <= MAX_BYTES);
  log(`NASA: ${glbs.length} models`);

  const items = glbs.map((t) => {
    const name = path.posix.basename(t.path, path.posix.extname(t.path));
    const folder = t.path.split("/").at(-2) ?? name;
    const title = folder.length > 3 ? folder : name;
    const [collection, key] = collectionFor(title);
    return {
      id: title,
      title,
      url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${t.path.split("/").map(encodeURIComponent).join("/")}`,
      input: path.join(CACHE, "nasa", t.path),
      collection,
      collectionKey: key,
      category: "Space",
    };
  });

  // Several folders hold variants with the same name; keep ids unique.
  const seen = new Map();
  for (const item of items) {
    const n = (seen.get(item.id) ?? 0) + 1;
    seen.set(item.id, n);
    if (n > 1) {
      item.id = `${item.id}-${n}`;
      item.title = `${item.title} (${n})`;
    }
  }

  let done = 0;
  await pool(items, 6, async (item) => {
    await download(item.url, item.input);
    if (++done % 50 === 0) log(`  downloaded ${done}/${items.length}`);
  });
  return items.filter((i) => exists(i.input));
}

export function licenseStamp() {
  return {
    copyright: "Public domain.",
    license: "Public domain",
    licenseText: PUBLIC_DOMAIN_TEXT,
  };
}
