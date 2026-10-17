#!/usr/bin/env node
/**
 * Writes src/data/sitemap.xml: every page search engines should index (home, categories, collections, tutorials, models
 * and the about / contact / policy pages), each with its preview image. Reads the same catalog the
 * site renders, so new models are listed on their own — it runs before every `next build` (prebuild), or
 * by hand with `npm run sitemap`. A new page with a fixed address is not found by itself: add it to `pages` below.
 * src/app/sitemap.xml/route.ts serves it. Not from public/: App Hosting serves public files with a 1980
 * Last-Modified and a size-only ETag, so Google kept getting "304 Not Modified" and never re-read it.
 * public/robots.txt is a plain file: edit it directly.
 */
import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/sitemap.xml");

async function siteData() {
  const r = await esbuild.build({
    stdin: {
      contents: [
        `export { allCollections, CATEGORIES, categorySlug, countBy, models } from "@/lib/catalog";`,
        `export { absoluteUrl } from "@/lib/site";`,
        `export { tutorials } from "@/lib/tutorials";`,
      ].join("\n"),
      resolveDir: ROOT,
      loader: "ts",
    },
    tsconfig: path.join(ROOT, "tsconfig.json"),
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "error",
  });
  const tmp = path.join(os.tmpdir(), `sitemap-data-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { allCollections, CATEGORIES, categorySlug, countBy, models, absoluteUrl, tutorials } = await siteData();

// Same pages, in the same order, as the site's navigation: the most important first.
const pages = [
  { path: "/" },
  { path: "/models/" },
  ...CATEGORIES.filter((c) => countBy(c) > 0).map((c) => ({
    path: `/models/category/${categorySlug(c)}/`,
    images: [`/og/category-${categorySlug(c)}.jpg`],
  })),
  ...allCollections().map((c) => ({ path: `/models/collection/${c.key}/` })),
  { path: "/packs/" },
  { path: "/developers/" },
  { path: "/animations/" },
  { path: "/builder/" },
  { path: "/tutorials/" },
  ...tutorials.map((t) => ({ path: `/tutorials/${t.slug}/`, images: [t.og] })),
  { path: "/viewer/" },
  { path: "/license/" },
  { path: "/about/" },
  { path: "/contact/" },
  { path: "/privacy/" },
  { path: "/terms/" },
  ...models.map((m) => ({ path: `/models/${m.slug}/`, images: m.thumb ? [m.thumb.src] : [] })),
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
// Date only, so rebuilding on the same day leaves the file unchanged.
const today = new Date().toISOString().slice(0, 10);

// How often each kind of page changes and how it ranks against the site's other pages.
function hints(p) {
  if (p === "/") return { changefreq: "daily", priority: 1 };
  if (p === "/models/") return { changefreq: "daily", priority: 0.9 };
  if (p.startsWith("/models/category/") || p.startsWith("/models/collection/")) return { changefreq: "weekly", priority: 0.8 };
  if (p.startsWith("/models/")) return { changefreq: "monthly", priority: 0.6 };
  if (p.startsWith("/tutorials/")) return { changefreq: "monthly", priority: 0.7 };
  if (["/license/", "/privacy/", "/terms/", "/contact/"].includes(p)) return { changefreq: "yearly", priority: 0.3 };
  return { changefreq: "weekly", priority: 0.7 };
}

// Standard sitemap order: <loc>, <lastmod>, <changefreq>, <priority>, then extension tags like <image:image> last (the sitemap schema requires it).
const urls = pages.map(({ path: p, images = [] }) =>
  [
    "  <url>",
    `    <loc>${esc(absoluteUrl(p))}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${hints(p).changefreq}</changefreq>`,
    `    <priority>${hints(p).priority.toFixed(1)}</priority>`,
    ...images.map((src) => `    <image:image><image:loc>${esc(absoluteUrl(src))}</image:loc></image:image>`),
    "  </url>",
  ].join("\n"),
);

const seen = new Set();
for (const { path: p } of pages) {
  if (seen.has(p)) throw new Error(`build-sitemap: ${p} is listed twice`);
  seen.add(p);
}
if (pages.length > 50000) throw new Error(`build-sitemap: ${pages.length} URLs — over the 50,000 per-file limit, split it`);

const xml = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
  ...urls,
  `</urlset>`,
  "",
].join("\n");

fs.writeFileSync(OUT, xml);
console.log(`build-sitemap: ${pages.length} URLs → src/data/sitemap.xml (${(Buffer.byteLength(xml) / 1024 / 1024).toFixed(2)} MB)`);
