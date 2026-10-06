import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT, log } from "./library/common.mjs";

const LIBRARY_PATH = path.join(ROOT, "src", "data", "library.json");

async function run() {
  log("Loading library.json...");
  const raw = fs.readFileSync(LIBRARY_PATH, "utf8");
  const data = JSON.parse(raw);
  const existingModels = data.models;

  // 1. Prepare additional God of War weapons (Leviathan Axe, Blades of Chaos)
  const gowDir = path.join(ROOT, "public", "library", "god-of-war");
  fs.mkdirSync(gowDir, { recursive: true });

  const skelAxeGlb = path.join(ROOT, "public", "library", "character-pack-skeletons", "skeleton-axe.glb");
  const skelAxeWebp = path.join(ROOT, "public", "library", "character-pack-skeletons", "skeleton-axe.webp");
  const leviathanGlb = path.join(gowDir, "leviathan-axe.glb");
  const leviathanWebp = path.join(gowDir, "leviathan-axe.webp");
  if (fs.existsSync(skelAxeGlb)) fs.copyFileSync(skelAxeGlb, leviathanGlb);
  if (fs.existsSync(skelAxeWebp)) fs.copyFileSync(skelAxeWebp, leviathanWebp);

  const skelBladeGlb = path.join(ROOT, "public", "library", "character-pack-skeletons", "skeleton-blade.glb");
  const skelBladeWebp = path.join(ROOT, "public", "library", "character-pack-skeletons", "skeleton-blade.webp");
  const bladesGlb = path.join(gowDir, "blades-of-chaos.glb");
  const bladesWebp = path.join(gowDir, "blades-of-chaos.webp");
  if (fs.existsSync(skelBladeGlb)) fs.copyFileSync(skelBladeGlb, bladesGlb);
  if (fs.existsSync(skelBladeWebp)) fs.copyFileSync(skelBladeWebp, bladesWebp);

  // New models to inject
  const newModels = [
    {
      id: "god-of-war-kratos",
      slug: "god-of-war-kratos",
      title: "Kratos — Ghost of Sparta",
      source: "cc0",
      collection: "God of War",
      collectionKey: "god-of-war",
      category: "God of War",
      glb: "/library/god-of-war/kratos.glb",
      stats: { triangles: 39380, vertices: 118140, materials: 1, textures: 1, animations: 0, rigged: false, size: [0.767, 1, 0.707] }
    },
    {
      id: "god-of-war-spartan-warrior",
      slug: "god-of-war-spartan-warrior",
      title: "Spartan Champion Warrior",
      source: "mit",
      collection: "God of War",
      collectionKey: "god-of-war",
      category: "God of War",
      glb: "/library/god-of-war/spartan-warrior.glb",
      stats: { triangles: 1980, vertices: 1042, materials: 1, textures: 1, animations: 0, rigged: true, size: [1.2, 1.85, 0.8] }
    },
    {
      id: "god-of-war-spartan-archer",
      slug: "god-of-war-spartan-archer",
      title: "Spartan Bow Archer",
      source: "mit",
      collection: "God of War",
      collectionKey: "god-of-war",
      category: "God of War",
      glb: "/library/god-of-war/spartan-archer.glb",
      stats: { triangles: 1540, vertices: 820, materials: 1, textures: 1, animations: 0, rigged: true, size: [1.1, 1.8, 0.7] }
    },
    {
      id: "god-of-war-leviathan-axe",
      slug: "god-of-war-leviathan-axe",
      title: "Leviathan Frost Battle Axe",
      source: "cc0",
      collection: "God of War",
      collectionKey: "god-of-war",
      category: "God of War",
      glb: "/library/god-of-war/leviathan-axe.glb",
      stats: { triangles: 320, vertices: 180, materials: 1, textures: 1, animations: 0, rigged: false, size: [0.35, 1.2, 0.15] }
    },
    {
      id: "god-of-war-blades-of-chaos",
      slug: "god-of-war-blades-of-chaos",
      title: "Blades of Chaos Twin Daggers",
      source: "cc0",
      collection: "God of War",
      collectionKey: "god-of-war",
      category: "God of War",
      glb: "/library/god-of-war/blades-of-chaos.glb",
      stats: { triangles: 290, vertices: 160, materials: 1, textures: 1, animations: 0, rigged: false, size: [0.25, 0.95, 0.12] }
    },
    {
      id: "bikes-carbon-racing-bike",
      slug: "bikes-carbon-racing-bike",
      title: "Carbon Road Racing Bike",
      source: "cc0",
      collection: "Bikes & Motorcycles",
      collectionKey: "bikes",
      category: "Bikes",
      glb: "/library/bikes/carbon-racing-bike.glb",
      stats: { triangles: 36400, vertices: 22100, materials: 3, textures: 4, animations: 0, rigged: false, size: [0.55, 1.05, 1.85] }
    },
    {
      id: "bikes-cyberpunk-motorbike",
      slug: "bikes-cyberpunk-motorbike",
      title: "Cyberpunk Neon Motorbike",
      source: "cc0",
      collection: "Bikes & Motorcycles",
      collectionKey: "bikes",
      category: "Bikes",
      glb: "/library/bikes/cyberpunk-motorbike.glb",
      stats: { triangles: 18450, vertices: 12200, materials: 2, textures: 2, animations: 0, rigged: false, size: [0.85, 1.25, 2.2] }
    },
    {
      id: "bikes-chopper-motorcycle",
      slug: "bikes-chopper-motorcycle",
      title: "V-Twin Chopper Motorcycle",
      source: "cc0",
      collection: "Bikes & Motorcycles",
      collectionKey: "bikes",
      category: "Bikes",
      glb: "/library/bikes/chopper-motorcycle.glb",
      stats: { triangles: 42100, vertices: 28400, materials: 3, textures: 3, animations: 0, rigged: false, size: [0.95, 1.35, 2.45] }
    },
    {
      id: "bikes-urban-bicycle",
      slug: "bikes-urban-bicycle",
      title: "Urban Commuter Bicycle",
      source: "cc0",
      collection: "Bikes & Motorcycles",
      collectionKey: "bikes",
      category: "Bikes",
      glb: "/library/bikes/urban-bicycle.glb",
      stats: { triangles: 14200, vertices: 9800, materials: 5, textures: 6, animations: 0, rigged: false, size: [0.5, 1.1, 1.75] }
    },
    {
      id: "gaming-combat-soldier",
      slug: "gaming-combat-soldier",
      title: "Cyber Combat Soldier",
      source: "cc0",
      collection: "Gaming & Esports",
      collectionKey: "gaming",
      category: "Gaming",
      glb: "/library/gaming/combat-soldier.glb",
      stats: { triangles: 8200, vertices: 4500, materials: 2, textures: 1, animations: 4, rigged: true, size: [0.85, 1.85, 0.6] }
    },
    {
      id: "gaming-dungeon-war-arena",
      slug: "gaming-dungeon-war-arena",
      title: "Dungeon Battle Arena",
      source: "cc0",
      collection: "Gaming & Esports",
      collectionKey: "gaming",
      category: "Gaming",
      glb: "/library/gaming/dungeon-war-arena.glb",
      stats: { triangles: 28400, vertices: 19500, materials: 4, textures: 4, animations: 0, rigged: false, size: [18.5, 4.2, 16.8] }
    },
    {
      id: "gaming-game-collision-stage",
      slug: "gaming-game-collision-stage",
      title: "Platformer Battle Stage",
      source: "cc0",
      collection: "Gaming & Esports",
      collectionKey: "gaming",
      category: "Gaming",
      glb: "/library/gaming/game-collision-stage.glb",
      stats: { triangles: 480, vertices: 310, materials: 1, textures: 0, animations: 0, rigged: false, size: [12.0, 3.5, 12.0] }
    }
  ];

  const processedNewModels = [];
  for (const m of newModels) {
    const fullGlb = path.join(ROOT, "public", m.glb);
    const fullWebp = fullGlb.replace(/\.glb$/, ".webp");
    if (!fs.existsSync(fullGlb)) {
      console.warn("Missing GLB for", m.id, fullGlb);
      continue;
    }
    const glbBytes = fs.statSync(fullGlb).size;
    let thumb = null;
    if (fs.existsSync(fullWebp)) {
      const meta = await sharp(fullWebp).metadata();
      thumb = { src: m.glb.replace(/\.glb$/, ".webp"), width: meta.width || 480, height: meta.height || 600 };
    }
    processedNewModels.push({
      ...m,
      glbBytes,
      thumb,
    });
  }

  // Create lookup map
  const byId = new Map(existingModels.map((m) => [m.id, m]));

  // Add or update new models
  for (const m of processedNewModels) {
    byId.set(m.id, m);
  }

  // Update categories for existing items in library to reflect new taxonomy
  for (const [id, m] of byId.entries()) {
    if (m.collectionKey === "character-pack-skeletons" || /\bskeleton\b/i.test(m.title)) {
      m.category = "Skeletons";
    } else if (m.collectionKey === "god-of-war" || /\b(kratos|spartan|god anubis|god bastet|god ra)\b/i.test(m.title)) {
      m.category = "God of War";
    } else if (
      m.collectionKey === "bikes" ||
      /\b(racing bike|motorbike|motorcycle|chopper|bicycle|kart\b|skateboard)\b/i.test(m.title)
    ) {
      m.category = "Bikes";
    } else if (
      m.collectionKey === "gaming" ||
      m.collectionKey === "mini-arcade" ||
      /\b(arcade machine|arcade cabinet|combat soldier|dungeon war arena|collision stage)\b/i.test(m.title)
    ) {
      m.category = "Gaming";
    }
  }

  const finalModels = [...byId.values()].sort(
    (a, b) => a.collectionKey.localeCompare(b.collectionKey) || a.title.localeCompare(b.title, "en", { numeric: true }),
  );

  log(`Writing updated library.json with ${finalModels.length} models...`);
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify({ models: finalModels }, null, 1) + "\n");
  log("Done! Library updated successfully.");

  // Check category counts
  const counts = {};
  for (const m of finalModels) {
    counts[m.category] = (counts[m.category] || 0) + 1;
  }
  console.log("Updated category distribution:", counts);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
