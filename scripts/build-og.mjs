#!/usr/bin/env node
/**
 * Renders Open Graph / social share images (1200×630 PNG) with the same renderer Next.js uses:
 *   public/og/default.jpg      site-wide image
 *   public/og/<slug>.jpg       one per model
 * Rendered sequentially at build time (not inside `next build`) to keep deploys fast and memory-light.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import sharp from "sharp";
import { ImageResponse } from "next/og.js";
import { refineCategory } from "../src/lib/refine-category.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "og");
const SITE_NAME = "3D Models";
const SIZE = { width: 1200, height: 630 };
const h = React.createElement;

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "catalog.json"), "utf8"));
const fontDir = path.join(ROOT, "node_modules", "geist", "dist", "fonts", "geist-sans");
const fonts = [
  { name: "Geist", data: fs.readFileSync(path.join(fontDir, "Geist-Regular.ttf")), weight: 400, style: "normal" },
  { name: "Geist", data: fs.readFileSync(path.join(fontDir, "Geist-SemiBold.ttf")), weight: 600, style: "normal" },
];

/** Satori can't decode WebP, so thumbnails become PNG data URLs. */
async function thumb(src, height) {
  const png = await sharp(path.join(ROOT, "public", src)).resize({ height, fit: "inside" }).png().toBuffer();
  const meta = await sharp(png).metadata();
  return { src: `data:image/png;base64,${png.toString("base64")}`, width: meta.width, height: meta.height };
}

function mark() {
  return h(
    "svg",
    { width: 44, height: 44, viewBox: "0 0 64 64" },
    h("defs", null, h("linearGradient", { id: "g", x1: 0, y1: 0, x2: 1, y2: 1 },
      h("stop", { offset: 0, stopColor: "#7c3aed" }),
      h("stop", { offset: 0.55, stopColor: "#4f46e5" }),
      h("stop", { offset: 1, stopColor: "#0891b2" }))),
    h("rect", { width: 64, height: 64, rx: 14, fill: "url(#g)" }),
    h("path", { d: "M32 11.5 50 21.75 32 32 14 21.75z", fill: "#fff" }),
    h("path", { d: "M14 21.75 32 32v20.5L14 42.25z", fill: "#fff", fillOpacity: 0.78 }),
    h("path", { d: "M50 21.75 32 32v20.5l18-10.25z", fill: "#fff", fillOpacity: 0.52 }),
  );
}

function frame({ eyebrow, title, subtitle, chips, art }) {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        fontFamily: "Geist",
        color: "#ededf3",
        backgroundColor: "#07070b",
        backgroundImage:
          "radial-gradient(circle at 10% 0%, rgba(139,92,246,0.38), transparent 50%), radial-gradient(circle at 95% 100%, rgba(34,211,238,0.22), transparent 50%)",
      },
    },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 0 60px 72px", width: 660 } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 16 } }, mark(), h("span", { style: { fontSize: 30, fontWeight: 600 } }, SITE_NAME)),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 18 } },
        h("span", { style: { fontSize: 21, fontWeight: 600, color: "#a78bfa", letterSpacing: 3, textTransform: "uppercase" } }, eyebrow),
        h("span", { style: { fontSize: title.length > 24 ? 56 : 68, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.5 } }, title),
        h("span", { style: { fontSize: 27, color: "#a0a0b2", lineHeight: 1.35 } }, subtitle),
      ),
      h(
        "div",
        { style: { display: "flex", gap: 12 } },
        ...chips.map((chip, i) =>
          h(
            "span",
            {
              key: chip,
              style: {
                display: "flex",
                fontSize: 22,
                padding: "10px 20px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                backgroundColor: i === 0 ? "#ededf3" : "rgba(255,255,255,0.05)",
                color: i === 0 ? "#07070b" : "#ededf3",
                fontWeight: i === 0 ? 600 : 400,
              },
            },
            chip,
          ),
        ),
      ),
    ),
    h("div", { style: { display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "center" } }, art),
  );
}

async function render(element, file) {
  const res = new ImageResponse(element, { ...SIZE, fonts });
  // JPEG keeps each image ~5x smaller than the PNG the renderer produces.
  await sharp(Buffer.from(await res.arrayBuffer())).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
}

fs.mkdirSync(OUT, { recursive: true });
const byId = new Map(catalog.models.map((m) => [m.id, m]));
const libraryFile = path.join(ROOT, "src", "data", "library.json");
const library = (fs.existsSync(libraryFile) ? JSON.parse(fs.readFileSync(libraryFile, "utf8")).models.filter((m) => m.thumb) : []).map((m) => ({
  ...m,
  category: refineCategory({ title: m.title, category: m.category, collectionKey: m.collectionKey, rigged: m.stats.rigged }),
}));
const totalModels = catalog.models.length + library.length;

// Site-wide image.
const lineup = await Promise.all(
  ["Fire_Male_01", "Business_Female_01", "Medical_Male_01"].map((id, i) => thumb(byId.get(id).thumb.src, i === 1 ? 470 : 390)),
);
await render(
  frame({
    eyebrow: "Free download",
    title: `${new Intl.NumberFormat("en-US").format(totalModels)} free 3D models`,
    subtitle: "Rigged characters, vehicles, buildings, furniture and more. Preview in 3D, download GLB.",
    chips: ["100% free", "GLB / glTF", "Commercial use"],
    art: h(
      "div",
      { style: { display: "flex", alignItems: "flex-end", marginBottom: 30 } },
      ...lineup.map((img, i) =>
        h("img", { key: i, src: img.src, width: img.width, height: img.height, style: { marginLeft: i === 0 ? 0 : -150, opacity: i === 1 ? 1 : 0.7 } }),
      ),
    ),
  }),
  path.join(OUT, "default.jpg"),
);

// One image per category, used by the imported library models (thousands — too many for one image each).
const CATEGORY_TEXT = {
  Characters: "Rigged people, professions and stylized characters",
  Animals: "Farm animals, pets, birds and creatures",
  Vehicles: "Cars, trucks, trains, boats and karts",
  Buildings: "Houses, city blocks, castles and roads",
  Furniture: "Home, kitchen, office and outdoor furniture",
  Food: "Meals, fruit, drinks and restaurant props",
  Nature: "Plants, flowers, rocks and terrain",
  Trees: "Oaks, pines, palms, autumn and snowy trees",
  Space: "Spacecraft, rovers, planets and space bases",
  Weapons: "Swords, shields, bows, blasters and siege engines",
  Hair: "Long, bob, bun and anime hairstyles",
  Props: "Game kits, dungeons, tools and decorations",
};
for (const [category, text] of Object.entries(CATEGORY_TEXT)) {
  const pool = library.filter((m) => m.category === category);
  if (!pool.length) continue;
  // Three picks from different collections, skipping the very heaviest and the tiny parts.
  const picks = [];
  const used = new Set();
  for (const m of [...pool].sort((a, b) => b.stats.triangles - a.stats.triangles).slice(Math.floor(pool.length * 0.1))) {
    if (picks.length === 3) break;
    if (used.has(m.collectionKey)) continue;
    picks.push(m);
    used.add(m.collectionKey);
  }
  // Categories with fewer than three collections (e.g. Hair) fill up from the same one.
  for (const m of pool) if (picks.length < 3 && !picks.includes(m)) picks.push(m);
  const imgs = await Promise.all(picks.map((m, i) => thumb(m.thumb.src, i === 1 ? 320 : 250)));
  await render(
    frame({
      eyebrow: "Free 3D models",
      title: `Free ${category.toLowerCase()} 3D models`,
      subtitle: `${new Intl.NumberFormat("en-US").format(pool.length)} models · ${text}.`,
      chips: ["Free download", "GLB", "Commercial use"],
      art: h(
        "div",
        { style: { display: "flex", alignItems: "flex-end", marginBottom: 60 } },
        ...imgs.map((img, i) => {
          const width = Math.min(img.width, 190);
          return h("img", { key: i, src: img.src, width, height: Math.round(img.height * (width / img.width)), style: { marginLeft: i === 0 ? 0 : -40 } });
        }),
      ),
    }),
    path.join(OUT, `category-${category.toLowerCase()}.jpg`),
  );
}

// One image per Rocketbox model (skipped with --categories).
let count = 0;
for (const m of process.argv.includes("--categories") ? [] : catalog.models) {
  const img = m.thumb ? await thumb(m.thumb.src, m.kind === "animal" ? 420 : 540) : null;
  await render(
    frame({
      eyebrow: `${m.category} · Free 3D model`,
      title: m.title,
      subtitle: `${m.subtitle} · ${new Intl.NumberFormat("en-US").format(m.stats.triangles)} triangles · ${m.stats.bones} bones`,
      chips: ["Free download", "GLB", m.kind === "human" ? "Animation-ready" : "Rigged"],
      art: img
        ? h("img", { src: img.src, width: Math.min(img.width, 500), height: Math.round(img.height * (Math.min(img.width, 500) / img.width)), style: { marginBottom: 40 } })
        : h("div"),
    }),
    path.join(OUT, `${m.slug}.jpg`),
  );
  count++;
}
console.log(`OG images: default + ${count} models → public/og/`);
