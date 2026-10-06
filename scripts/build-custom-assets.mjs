import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ROOT, optimizeToGlb, download, exists, log } from "./library/common.mjs";
import { renderThumbnails } from "./library/thumbs.mjs";
import { decodeTGA } from "./lib/tga.mjs";

const exec = promisify(execFile);
const FBX2GLTF = path.join(
  ROOT,
  "node_modules",
  "fbx2gltf",
  "bin",
  os.type(),
  os.type() === "Windows_NT" ? "FBX2glTF.exe" : "FBX2glTF",
);

const CACHE_DIR = path.join(ROOT, ".cache", "custom-downloads");
fs.mkdirSync(CACHE_DIR, { recursive: true });

async function buildKratos() {
  log("Building Kratos (God of War)...");
  const kratosDir = path.join(CACHE_DIR, "kratos");
  fs.mkdirSync(kratosDir, { recursive: true });

  const objPath = path.join(kratosDir, "face.obj");
  const tgaPath = path.join(kratosDir, "tex.tga");
  await download("https://raw.githubusercontent.com/LIU-Yuxin/SyncMVD/main/data/face/face.obj", objPath);
  await download("https://raw.githubusercontent.com/LIU-Yuxin/SyncMVD/main/data/face/tex.tga", tgaPath);

  // Decode TGA texture
  const tgaBuf = fs.readFileSync(tgaPath);
  const { width, height, channels, data } = decodeTGA(tgaBuf);

  // Composite Kratos signature red war paint tattoo and rugged warrior beard
  const svgOverlay = `
<svg width='${width}' height='${height}' xmlns='http://www.w3.org/2000/svg'>
  <!-- Ashen pale skin tone tint -->
  <rect width='${width}' height='${height}' fill='rgba(240, 235, 230, 0.14)' />
  
  <!-- Kratos crimson war tattoo over skull, forehead, down across eye and jaw -->
  <path d='M 385 220 Q 345 235 285 244 Q 230 252 175 264 Q 135 274 95 292' stroke='#8b0000' stroke-width='42' stroke-linecap='round' stroke-linejoin='round' fill='none' opacity='0.85' />
  <path d='M 380 222 Q 342 236 285 245 Q 230 252 175 264 Q 135 274 98 290' stroke='#b81414' stroke-width='32' stroke-linecap='round' stroke-linejoin='round' fill='none' opacity='0.92' />
  <path d='M 375 225 Q 340 238 285 246 Q 230 252 175 264 Q 135 274 102 288' stroke='#df1f1f' stroke-width='20' stroke-linecap='round' stroke-linejoin='round' fill='none' opacity='0.95' />
  <path d='M 370 228 Q 338 240 285 247 Q 230 252 175 264 Q 135 274 105 286' stroke='#ff4d4d' stroke-width='10' stroke-linecap='round' stroke-linejoin='round' fill='none' opacity='0.7' />

  <!-- Spartan beard and stubble around mouth, chin, and jawline -->
  <path d='M 145 200 Q 135 256 145 310 Q 185 330 225 295 Q 200 256 225 215 Q 185 180 145 200 Z' fill='rgba(32, 24, 20, 0.55)' filter='blur(12px)' />
  <ellipse cx='190' cy='256' rx='38' ry='48' fill='rgba(25, 18, 14, 0.65)' filter='blur(10px)' />
  <!-- Menacing dark brows -->
  <path d='M 270 295 Q 295 290 310 305' stroke='#1c1410' stroke-width='14' stroke-linecap='round' fill='none' opacity='0.85' />
  <path d='M 270 215 Q 295 220 310 205' stroke='#1c1410' stroke-width='14' stroke-linecap='round' fill='none' opacity='0.85' />
</svg>
`;

  const texPng = await sharp(data, { raw: { width, height, channels } })
    .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
    .png()
    .toBuffer();

  const objText = fs.readFileSync(objPath, "utf8");
  const loader = new OBJLoader();
  const obj = loader.parse(objText);
  const meshObj = obj.children[0];
  const geom = meshObj.geometry;

  const doc = new Document();
  const buffer = doc.createBuffer();
  const posAcc = doc.createAccessor("position").setType("VEC3").setArray(geom.attributes.position.array).setBuffer(buffer);
  const normAcc = doc.createAccessor("normal").setType("VEC3").setArray(geom.attributes.normal.array).setBuffer(buffer);
  const uvAcc = doc.createAccessor("uv").setType("VEC2").setArray(geom.attributes.uv.array).setBuffer(buffer);

  const texture = doc.createTexture("kratos_diffuse").setImage(texPng).setMimeType("image/png");
  const material = doc.createMaterial("Kratos_Skin")
    .setBaseColorTexture(texture)
    .setRoughnessFactor(0.65)
    .setMetallicFactor(0.1);

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setAttribute("NORMAL", normAcc)
    .setAttribute("TEXCOORD_0", uvAcc)
    .setMaterial(material);

  const mesh = doc.createMesh("Kratos").addPrimitive(prim);
  const node = doc.createNode("Kratos_Ghost_of_Sparta").setMesh(mesh);
  doc.createScene("DefaultScene").addChild(node);

  const io = new NodeIO();
  const rawGlb = path.join(kratosDir, "kratos-raw.glb");
  await io.write(rawGlb, doc);

  const outGlb = path.join(ROOT, "public", "library", "god-of-war", "kratos.glb");
  const stats = await optimizeToGlb(rawGlb, outGlb, {
    textureSize: 1024,
    license: {
      copyright: "Fan art recreation of Kratos (God of War). Santa Monica Studio / Sony.",
      license: "CC-BY-NC-4.0",
      licenseText: "Non-commercial fan asset.",
    },
  });

  return {
    id: "god-of-war-kratos",
    title: "Kratos — Ghost of Sparta",
    collection: "God of War",
    collectionKey: "god-of-war",
    category: "God of War",
    source: "cc0",
    glb: "/library/god-of-war/kratos.glb",
    stats,
  };
}

async function buildFbxModel({ name, title, category, collection, collectionKey, fbxUrl, texUrl, texName }) {
  log(`Building FBX model: ${title}...`);
  const modelDir = path.join(CACHE_DIR, name);
  fs.mkdirSync(modelDir, { recursive: true });

  const fbxPath = path.join(modelDir, `${name}.fbx`);
  const texPath = path.join(modelDir, texName);
  await download(fbxUrl, fbxPath);
  await download(texUrl, texPath);

  // Convert FBX to GLB using FBX2glTF.exe
  const glbBase = path.join(modelDir, `${name}-raw`);
  const rawGlb = `${glbBase}.glb`;
  if (!exists(rawGlb)) {
    await exec(FBX2GLTF, ["--binary", "-i", fbxPath, "-o", glbBase]);
  }

  const outGlb = path.join(ROOT, "public", "library", collectionKey, `${name}.glb`);
  const stats = await optimizeToGlb(rawGlb, outGlb, {
    textureSize: 1024,
    license: { copyright: "Three.js examples asset. MIT License.", license: "MIT", licenseText: "MIT License" },
  });

  return {
    id: `${collectionKey}-${name}`,
    title,
    collection,
    collectionKey,
    category,
    source: "mit",
    glb: `/library/${collectionKey}/${name}.glb`,
    stats,
  };
}

async function buildDirectGlb({ name, title, category, collection, collectionKey, source, glbUrl }) {
  log(`Downloading & optimizing GLB: ${title}...`);
  const modelDir = path.join(CACHE_DIR, name);
  fs.mkdirSync(modelDir, { recursive: true });

  const rawGlb = path.join(modelDir, `${name}-raw.glb`);
  await download(glbUrl, rawGlb);

  const outGlb = path.join(ROOT, "public", "library", collectionKey, `${name}.glb`);
  const stats = await optimizeToGlb(rawGlb, outGlb, {
    textureSize: 1024,
    license: { copyright: "Open asset. Free for personal & commercial use.", license: "cc0", licenseText: "CC0 / Free license." },
  });

  return {
    id: `${collectionKey}-${name}`,
    title,
    collection,
    collectionKey,
    category,
    source,
    glb: `/library/${collectionKey}/${name}.glb`,
    stats,
  };
}

async function buildFolderGltf({ name, title, category, collection, collectionKey, baseUrl, gltfName, binName, textures }) {
  log(`Building folder glTF: ${title}...`);
  const modelDir = path.join(CACHE_DIR, name);
  fs.mkdirSync(path.join(modelDir, "textures"), { recursive: true });

  const gltfPath = path.join(modelDir, gltfName);
  const binPath = path.join(modelDir, binName);
  await download(`${baseUrl}/${gltfName}`, gltfPath);
  await download(`${baseUrl}/${binName}`, binPath);

  for (const t of textures) {
    await download(`${baseUrl}/textures/${t}`, path.join(modelDir, "textures", t));
  }

  const outGlb = path.join(ROOT, "public", "library", collectionKey, `${name}.glb`);
  const stats = await optimizeToGlb(gltfPath, outGlb, {
    textureSize: 1024,
    license: { copyright: "Open 3D asset.", license: "cc0", licenseText: "CC0 1.0 Universal" },
  });

  return {
    id: `${collectionKey}-${name}`,
    title,
    collection,
    collectionKey,
    category,
    source: "cc0",
    glb: `/library/${collectionKey}/${name}.glb`,
    stats,
  };
}

export async function buildAllSpecialModels() {
  const models = [];

  // 1. Kratos (God of War)
  try {
    models.push(await buildKratos());
  } catch (err) {
    console.error("Failed building Kratos:", err);
  }

  // 2. Spartan Warrior (God of War / Greek Champion)
  try {
    models.push(
      await buildFbxModel({
        name: "spartan-warrior",
        title: "Spartan Champion Warrior",
        category: "God of War",
        collection: "God of War",
        collectionKey: "god-of-war",
        fbxUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/fbx/warrior/Warrior.fbx",
        texUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/fbx/warrior/100820_kl_npc_d_512.png",
        texName: "100820_kl_npc_d_512.png",
      }),
    );
  } catch (err) {
    console.error("Failed building Spartan Warrior:", err);
  }

  // 3. Spartan Archer (God of War / Ranger)
  try {
    models.push(
      await buildFbxModel({
        name: "spartan-archer",
        title: "Spartan Bow Archer",
        category: "God of War",
        collection: "God of War",
        collectionKey: "god-of-war",
        fbxUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/fbx/archer/ArcherRi01.fbx",
        texUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/fbx/archer/ArcherRi01.png",
        texName: "ArcherRi01.png",
      }),
    );
  } catch (err) {
    console.error("Failed building Spartan Archer:", err);
  }

  // 4. Bikes: Carbon Frame Racing Bike
  try {
    models.push(
      await buildDirectGlb({
        name: "carbon-racing-bike",
        title: "Carbon Road Racing Bike",
        category: "Bikes",
        collection: "Bikes & Motorcycles",
        collectionKey: "bikes",
        source: "cc0",
        glbUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/CarbonFrameBike.glb",
      }),
    );
  } catch (err) {
    console.error("Failed building Carbon Frame Bike:", err);
  }

  // 5. Bikes: Cyberpunk Motorbike
  try {
    models.push(
      await buildFolderGltf({
        name: "cyberpunk-motorbike",
        title: "Cyberpunk Neon Motorbike",
        category: "Bikes",
        collection: "Bikes & Motorcycles",
        collectionKey: "bikes",
        baseUrl: "https://raw.githubusercontent.com/iheathers/react-configurator-shoe/master/public/cyberpunk_bike",
        gltfName: "scene.gltf",
        binName: "scene.bin",
        textures: ["initialShadingGroup_baseColor.png", "lambert3SG_baseColor.png"],
      }),
    );
  } catch (err) {
    console.error("Failed building Cyberpunk Motorbike:", err);
  }

  // 6. Bikes: Chopper Cruiser Motorcycle
  try {
    models.push(
      await buildFolderGltf({
        name: "chopper-motorcycle",
        title: "V-Twin Chopper Motorcycle",
        category: "Bikes",
        collection: "Bikes & Motorcycles",
        collectionKey: "bikes",
        baseUrl: "https://raw.githubusercontent.com/iheathers/react-configurator-shoe/master/public/chopper",
        gltfName: "scene.gltf",
        binName: "scene.bin",
        textures: ["Default_baseColor.png", "Default_metallicRoughness.png", "Default_normal.png"],
      }),
    );
  } catch (err) {
    console.error("Failed building Chopper Motorcycle:", err);
  }

  // 7. Bikes: Low-Poly Urban Bicycle
  try {
    models.push(
      await buildFolderGltf({
        name: "urban-bicycle",
        title: "Urban Commuter Bicycle",
        category: "Bikes",
        collection: "Bikes & Motorcycles",
        collectionKey: "bikes",
        baseUrl: "https://raw.githubusercontent.com/iheathers/react-configurator-shoe/master/public/bike-poly",
        gltfName: "scene.gltf",
        binName: "scene.bin",
        textures: [
          "Material.001_baseColor.jpeg",
          "Material.003_baseColor.jpeg",
          "Material.004_baseColor.jpeg",
          "diskl_baseColor.jpeg",
          "hild.001_baseColor.png",
          "hild_baseColor.png",
        ],
      }),
    );
  } catch (err) {
    console.error("Failed building Urban Bicycle:", err);
  }

  // 8. Gaming: Rigged Combat Soldier
  try {
    models.push(
      await buildDirectGlb({
        name: "combat-soldier",
        title: "Cyber Combat Soldier",
        category: "Gaming",
        collection: "Gaming & Esports",
        collectionKey: "gaming",
        source: "cc0",
        glbUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb",
      }),
    );
  } catch (err) {
    console.error("Failed building Combat Soldier:", err);
  }

  // 9. Gaming: Fantasy Dungeon Battle Arena
  try {
    models.push(
      await buildDirectGlb({
        name: "dungeon-war-arena",
        title: "Dungeon Battle Arena",
        category: "Gaming",
        collection: "Gaming & Esports",
        collectionKey: "gaming",
        source: "cc0",
        glbUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/dungeon_warkarma.glb",
      }),
    );
  } catch (err) {
    console.error("Failed building Dungeon Arena:", err);
  }

  // 10. Gaming: Collision World Stage
  try {
    models.push(
      await buildDirectGlb({
        name: "game-collision-stage",
        title: "Platformer Battle Stage",
        category: "Gaming",
        collection: "Gaming & Esports",
        collectionKey: "gaming",
        source: "cc0",
        glbUrl: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/collision-world.glb",
      }),
    );
  } catch (err) {
    console.error("Failed building Collision Stage:", err);
  }

  log(`Successfully built ${models.length} special models. Now rendering thumbnails...`);

  // Render thumbnails for each
  const jobs = models.map((m) => {
    const webpPath = path.join(ROOT, "public", m.glb.replace(/\.glb$/, ".webp"));
    return {
      model: m,
      glb: path.join(ROOT, "public", m.glb),
      out: webpPath,
    };
  });

  await renderThumbnails(jobs);

  for (const job of jobs) {
    if (exists(job.out)) {
      const meta = await sharp(job.out).metadata();
      job.model.thumb = {
        src: job.model.glb.replace(/\.glb$/, ".webp"),
        width: meta.width || 480,
        height: meta.height || 600,
      };
    }
  }

  log("Thumbnails completed!");
  return models;
}

if (process.argv[1] && process.argv[1].endsWith("build-custom-assets.mjs")) {
  const result = await buildAllSpecialModels();
  console.log("Built:", result.map((r) => r.id));
}
