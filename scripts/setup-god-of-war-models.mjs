import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getIO, ROOT, log } from "./library/common.mjs";
import { renderThumbnails } from "./library/thumbs.mjs";

const GOW_DIR = path.join(ROOT, "public", "library", "god-of-war");
const LIBRARY_PATH = path.join(ROOT, "src", "data", "library.json");

const MODEL_SPECS = [
  {
    originalFile: "blade_of_olympus_-_god_of_war.glb",
    targetFile: "blade-of-olympus.glb",
    id: "god-of-war-blade-of-olympus",
    slug: "god-of-war-blade-of-olympus",
    title: "Blade of Olympus",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "blades_of_chaos_from_god_of_war.glb",
    targetFile: "blades-of-chaos-detailed.glb",
    id: "god-of-war-blades-of-chaos-detailed",
    slug: "god-of-war-blades-of-chaos-detailed",
    title: "Blades of Chaos — High Fidelity Twin Blades",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "god_of_war_chest_-_yurim3d.glb",
    targetFile: "god-of-war-chest.glb",
    id: "god-of-war-chest",
    slug: "god-of-war-chest",
    title: "Nornir Mythic Chest — God of War",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "god_of_war_ragnarok_mjolnir.glb",
    targetFile: "god-of-war-ragnarok-mjolnir.glb",
    id: "god-of-war-ragnarok-mjolnir",
    slug: "god-of-war-ragnarok-mjolnir",
    title: "Mjölnir Warhammer — God of War Ragnarök",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "kratos_-_god_of_war_4.glb",
    targetFile: "kratos-god-of-war-4.glb",
    id: "god-of-war-kratos-gow4",
    slug: "god-of-war-kratos-gow4",
    title: "Kratos — God of War (2018 / Ragnarök)",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "kratos_god_of_war_2_god_armour.glb",
    targetFile: "kratos-god-armor-gow2.glb",
    id: "god-of-war-kratos-god-armor-gow2",
    slug: "god-of-war-kratos-god-armor-gow2",
    title: "Kratos with God Armor — God of War II",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "kratos_model_gow_1_god_of_war_1.glb",
    targetFile: "kratos-gow1.glb",
    id: "god-of-war-kratos-gow1",
    slug: "god-of-war-kratos-gow1",
    title: "Kratos — God of War I",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "kratos_model_gow_3.glb",
    targetFile: "kratos-gow3.glb",
    id: "god-of-war-kratos-gow3",
    slug: "god-of-war-kratos-gow3",
    title: "Kratos — God of War III",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
  {
    originalFile: "play_station_2_-_god_of_war_-_kratos.glb",
    targetFile: "kratos-ps2-classic.glb",
    id: "god-of-war-kratos-ps2",
    slug: "god-of-war-kratos-ps2",
    title: "Kratos — Classic PS2 Edition",
    source: "cc0",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
  },
];

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
  return { triangles: Math.round(triangles), vertices };
}

function computeBounds(root) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const count = pos.getCount();
      for (let i = 0; i < count; i++) {
        const el = pos.getElement(i, []);
        min[0] = Math.min(min[0], el[0]);
        min[1] = Math.min(min[1], el[1]);
        min[2] = Math.min(min[2], el[2]);
        max[0] = Math.max(max[0], el[0]);
        max[1] = Math.max(max[1], el[1]);
        max[2] = Math.max(max[2], el[2]);
      }
    }
  }

  if (!Number.isFinite(min[0])) return [1, 1, 1];
  return [
    Number((max[0] - min[0]).toFixed(3)),
    Number((max[1] - min[1]).toFixed(3)),
    Number((max[2] - min[2]).toFixed(3)),
  ];
}

async function main() {
  log("Starting God of War model processing...");
  const io = await getIO();

  // 1. Move/Rename files to clean kebab-case names
  for (const spec of MODEL_SPECS) {
    const origPath = path.join(GOW_DIR, spec.originalFile);
    const targetPath = path.join(GOW_DIR, spec.targetFile);
    if (fs.existsSync(origPath) && origPath !== targetPath) {
      log(`Renaming ${spec.originalFile} -> ${spec.targetFile}`);
      fs.copyFileSync(origPath, targetPath);
      fs.unlinkSync(origPath);
    }
  }

  // 2. Generate Thumbnails for any missing WebP files
  const thumbJobs = [];
  for (const spec of MODEL_SPECS) {
    const glbPath = path.join(GOW_DIR, spec.targetFile);
    const webpPath = glbPath.replace(/\.glb$/, ".webp");
    if (!fs.existsSync(glbPath)) {
      console.warn("GLB does not exist:", glbPath);
      continue;
    }
    thumbJobs.push({ glb: glbPath, out: webpPath });
  }

  log(`Rendering thumbnails for ${thumbJobs.length} models...`);
  const failures = await renderThumbnails(thumbJobs);
  if (failures.length > 0) {
    console.warn(`Warning: ${failures.length} thumbnail(s) failed`);
  }

  // 3. Extract exact geometry stats
  const processedModels = [];
  for (const spec of MODEL_SPECS) {
    const glbPath = path.join(GOW_DIR, spec.targetFile);
    const webpPath = glbPath.replace(/\.glb$/, ".webp");
    if (!fs.existsSync(glbPath)) continue;

    const glbBytes = fs.statSync(glbPath).size;
    const doc = await io.read(glbPath);
    const root = doc.getRoot();
    const { triangles, vertices } = countGeometry(root);
    const size = computeBounds(root);

    let thumb = null;
    if (fs.existsSync(webpPath)) {
      const meta = await sharp(webpPath).metadata();
      thumb = {
        src: `/library/god-of-war/${path.basename(webpPath)}`,
        width: meta.width || 480,
        height: meta.height || 600,
      };
    }

    const modelRecord = {
      id: spec.id,
      slug: spec.slug,
      title: spec.title,
      source: spec.source,
      collection: spec.collection,
      collectionKey: spec.collectionKey,
      category: spec.category,
      glb: `/library/god-of-war/${spec.targetFile}`,
      glbBytes,
      thumb,
      stats: {
        triangles,
        vertices,
        materials: root.listMaterials().length,
        textures: root.listTextures().length,
        animations: root.listAnimations().length,
        rigged: root.listSkins().length > 0,
        size,
      },
    };

    log(`Processed ${spec.title}: ${triangles} triangles, ${vertices} vertices, ${glbBytes} bytes`);
    processedModels.push(modelRecord);
  }

  // 4. Update library.json
  log("Updating library.json...");
  const rawLib = fs.readFileSync(LIBRARY_PATH, "utf8");
  const lib = JSON.parse(rawLib);
  const byId = new Map(lib.models.map((m) => [m.id, m]));

  for (const m of processedModels) {
    byId.set(m.id, m);
  }

  const updatedModels = [...byId.values()].sort(
    (a, b) => a.collectionKey.localeCompare(b.collectionKey) || a.title.localeCompare(b.title, "en", { numeric: true }),
  );

  fs.writeFileSync(LIBRARY_PATH, JSON.stringify({ models: updatedModels }, null, 1) + "\n");
  log(`Updated library.json with ${updatedModels.length} models total!`);

  // Print God of War models count
  const gowModels = updatedModels.filter((m) => m.category === "God of War");
  console.log(`Total God of War models in catalog: ${gowModels.length}`);
  for (const m of gowModels) {
    console.log(` - [${m.id}] ${m.title} (${m.glb})`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
