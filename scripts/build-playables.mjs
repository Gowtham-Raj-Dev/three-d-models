#!/usr/bin/env node
/**
 * Builds Skate Rush for YouTube Playables (https://developers.google.com/youtube/gaming/playables):
 *
 *   npm run playables:build
 *     → dist-playables/skate-rush/              index.html, game.js, game.css, fonts, models, pictures
 *     → dist-playables/skate-rush-playables.zip the same, zipped for upload
 *
 * A stand-alone page (no Next.js): every path is relative and nothing is fetched from outside the
 * bundle except YouTube's SDK, which index.html loads before the game. The game itself follows the
 * SDK's rules (src/components/games/shared/playables.ts): cloud saves instead of localStorage,
 * pause / resume and mute from YouTube, firstFrameReady / gameReady, sendScore for the best score.
 *
 * Test it locally with `npx serve dist-playables/skate-rush` (the SDK does nothing outside
 * YouTube), then with YouTube's Playables test suite before submitting.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { zipSync } from "fflate";

const SLUG = "skate-rush";
const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SRC = path.join(ROOT, "scripts", "playables");
const OUT_ROOT = path.join(ROOT, "dist-playables");
const OUT = path.join(OUT_ROOT, SLUG);
const SDK = "https://www.youtube.com/game_api/v1";
/** YouTube's limits: initial bundle < 30 MiB (should be < 15), every file < 30 MiB, at most 8000 files. */
const LIMITS = { initial: 30 * 1024 * 1024, file: 30 * 1024 * 1024, files: 8000 };

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

function fail(message) {
  console.error(`\nbuild-playables: ${message}`);
  process.exit(1);
}

function copy(from, to) {
  if (!fs.existsSync(from)) fail(`missing ${path.relative(ROOT, from)}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return fs.statSync(to).size;
}

/** The game's manifest and shop lists (bundled on the fly; they have no browser-only code). */
async function gameData() {
  const result = await esbuild.build({
    stdin: {
      contents: `export { GAME, BASE_MODELS } from "./src/components/games/${SLUG}/manifest";\nexport { SKATERS, STAGES } from "./src/components/games/${SLUG}/content";`,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = path.join(OUT_ROOT, `.manifest-${process.pid}.mjs`);
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(tmp, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** glTF extensions a .glb needs (to ship the Draco / Basis decoders only when a model uses them). */
function glbExtensions(file) {
  const buf = fs.readFileSync(file);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8")).extensionsUsed ?? [];
}

const { GAME, BASE_MODELS, SKATERS, STAGES } = await gameData();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. Models (and the shop's pictures of the skaters).
const models = [...new Set(GAME.models)];
const sizes = {};
const extensions = new Set();
let modelBytes = 0;
for (const key of models) {
  const rel = key.startsWith("/") ? `${key.slice(1)}.glb` : `library/${key}.glb`;
  const bytes = copy(path.join(PUBLIC, rel), path.join(OUT, rel));
  sizes[key] = bytes;
  modelBytes += bytes;
  for (const ext of glbExtensions(path.join(PUBLIC, rel))) extensions.add(ext);
}
let pictureBytes = 0;
for (const s of SKATERS) pictureBytes += copy(path.join(PUBLIC, "library", `${s.key}.webp`), path.join(OUT, "library", `${s.key}.webp`));
for (const st of STAGES) pictureBytes += copy(path.join(PUBLIC, "games", SLUG, "stages", `${st.id}.webp`), path.join(OUT, "games", SLUG, "stages", `${st.id}.webp`));
// The loading screen: the game's backdrops (if captured) over its cover.
for (const f of fs.readdirSync(path.join(PUBLIC, "games", SLUG))) {
  if (/^(cover|backdrop-.*)\.webp$/.test(f)) pictureBytes += copy(path.join(PUBLIC, "games", SLUG, f), path.join(OUT, "games", SLUG, f));
}
for (const d of [extensions.has("KHR_draco_mesh_compression") && "draco", extensions.has("KHR_texture_basisu") && "basis"].filter(Boolean)) {
  for (const f of fs.readdirSync(path.join(PUBLIC, "decoders", d))) copy(path.join(PUBLIC, "decoders", d, f), path.join(OUT, "decoders", d, f));
}

// 2. Script: the game alone, every asset path relative to index.html.
const js = await esbuild.build({
  entryPoints: [path.join(SRC, `${SLUG}.tsx`)],
  outfile: path.join(OUT, "game.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "chrome90", "safari15", "firefox90"],
  jsx: "automatic",
  legalComments: "none",
  metafile: true,
  logOverride: { "module-level-directive": "silent" },
  // Some three.js loaders resolve default paths against import.meta.url, which a single script doesn't have.
  banner: { js: "var process={env:{}},__importMetaUrl=document.baseURI;" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_BASE_PATH": '"."',
    __MODEL_SIZES__: JSON.stringify(sizes),
    "import.meta.url": "__importMetaUrl",
  },
});
const external = Object.keys(js.metafile.inputs).filter((f) => /(^|\/)node_modules\/(next|firebase|@firebase)\//.test(f));
if (external.length) fail(`the game pulled in site-only code:\n  ${external.slice(0, 8).join("\n  ")}`);

// 3. Styles: Tailwind + the game UI classes, and the game's fonts.
const cssEntry = path.join(SRC, `${SLUG}.css`);
const css = await postcss([tailwind({ optimize: { minify: true } })]).process(fs.readFileSync(cssEntry, "utf8"), { from: cssEntry, to: path.join(OUT, "game.css") });
fs.writeFileSync(path.join(OUT, "game.css"), css.css);
for (const f of fs.readdirSync(path.join(SRC, "fonts"))) copy(path.join(SRC, "fonts", f), path.join(OUT, "fonts", f));
const absolute = [...css.css.matchAll(/url\(\s*["']?(\/[^"')]+)/g)].map((m) => m[1]);
if (absolute.length) fail(`game.css points outside the bundle: ${absolute.join(", ")}`);

// 4. The page. YouTube's SDK must load before any game code.
fs.writeFileSync(
  path.join(OUT, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>${GAME.title}</title>
<script src="${SDK}"></script>
<link rel="stylesheet" href="./game.css">
</head>
<body>
<div id="game"></div>
<script src="./game.js"></script>
</body>
</html>
`,
);

// 5. Check YouTube's limits and zip it.
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs);
    else files.push({ rel: path.relative(OUT, abs).split(path.sep).join("/"), bytes: fs.statSync(abs).size });
  }
};
walk(OUT);
const total = files.reduce((n, f) => n + f.bytes, 0);
const largest = files.reduce((a, b) => (b.bytes > a.bytes ? b : a));
const byName = new Map(files.map((f) => [f.rel, f.bytes]));
const stageBase = new Set(BASE_MODELS);
const initial =
  ["index.html", "game.js", "game.css"].reduce((n, f) => n + (byName.get(f) ?? 0), 0) +
  files.filter((f) => f.rel.startsWith("fonts/")).reduce((n, f) => n + f.bytes, 0) +
  [...stageBase].reduce((n, k) => n + (sizes[k] ?? 0), 0);
if (files.length > LIMITS.files) fail(`${files.length} files (YouTube allows ${LIMITS.files})`);
if (largest.bytes > LIMITS.file) fail(`${largest.rel} is ${mb(largest.bytes)} (YouTube allows 30 MiB per file)`);
if (initial > LIMITS.initial) fail(`initial download ${mb(initial)} (YouTube allows 30 MiB)`);

const zip = zipSync(Object.fromEntries(files.map((f) => [f.rel, [fs.readFileSync(path.join(OUT, f.rel)), { level: /\.(glb|webp|woff2)$/.test(f.rel) ? 0 : 9 }]])));
const zipFile = path.join(OUT_ROOT, `${SLUG}-playables.zip`);
fs.writeFileSync(zipFile, zip);

console.log(`${GAME.title} for YouTube Playables → ${path.relative(ROOT, OUT)}`);
console.log(`  game.js ${kb(byName.get("game.js"))} · game.css ${kb(byName.get("game.css"))} · ${models.length} models ${mb(modelBytes)} · pictures ${mb(pictureBytes)}`);
console.log(`  ${files.length} files, ${mb(total)} in all; first load (to the menu) ≈ ${mb(initial)}; largest file ${largest.rel} ${kb(largest.bytes)}`);
console.log(`  zip: ${path.relative(ROOT, zipFile)} (${mb(zip.length)})`);
