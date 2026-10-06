#!/usr/bin/env node
/**
 * Builds the Kingdom Clash Android app (android/kingdom-clash/): a small native Java app — one
 * full-screen, landscape WebView — that plays the game from files packed inside the APK (offline).
 *
 *   npm run build            # the static site → out/
 *   npm run android:build    # this script
 *
 * 1. Packs the game into app/src/main/assets/www: its play page from out/, every script, stylesheet
 *    and font that page loads (followed through the chunks), the library models it uses and its
 *    cover (the loading screen's background art).
 * 2. Renders the launcher and splash icons from android/kingdom-clash/art/*.svg.
 * 3. Runs Gradle (assembleRelease, signed with android/kingdom-clash/keystore.properties) and copies
 *    the APK to public/downloads/kingdom-clash.apk (+ out/downloads/ when out/ exists), with
 *    kingdom-clash.json (version, size, SHA-256) that the download button on /games/kingdom-clash/ reads.
 *
 * Options: --pack-only  (steps 1–2 only, no Gradle)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import ts from "typescript";

const SLUG = "kingdom-clash";
const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "android", SLUG);
const WWW = path.join(APP, "app/src/main/assets/www");
const RES = path.join(APP, "app/src/main/res");
const OUT = path.join(ROOT, "out");
const PUBLIC = path.join(ROOT, "public");
const ENTRY = `games/${SLUG}/play/index.html`;
const packOnly = process.argv.includes("--pack-only");

const ANDROID_VERSIONS = { 21: "5.0", 23: "6.0", 24: "7.0", 26: "8.0", 28: "9", 29: "10", 30: "11", 31: "12", 33: "13", 34: "14", 35: "15" };
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function fail(message) {
  console.error(`\nbuild-android: ${message}`);
  process.exit(1);
}

/** The game's manifest (transpiled on the fly; it has no runtime imports). */
async function gameManifest() {
  const src = fs.readFileSync(path.join(ROOT, `src/components/games/${SLUG}/manifest.ts`), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tmp = path.join(os.tmpdir(), `${SLUG}-manifest-${process.pid}.mjs`);
  fs.writeFileSync(tmp, js);
  try {
    return (await import(pathToFileURL(tmp).href)).GAME;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** The play page plus everything it loads from /_next/static, followed through scripts and styles. */
function webFiles() {
  const files = new Set([ENTRY]);
  const queue = [ENTRY];
  const missing = [];
  while (queue.length) {
    const rel = queue.shift();
    const abs = path.join(OUT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    if (!/\.(html|js|css)$/.test(rel)) continue;
    const text = fs.readFileSync(abs, "utf8");
    const refs = [];
    for (const m of text.matchAll(/\/_next\/static\/[\w\-.~/%]+/g)) refs.push(m[0].slice(1));
    // The Turbopack runtime lists chunks relative to /_next/.
    for (const m of text.matchAll(/(?<![\w/])static\/(?:chunks|media)\/[\w\-.~/%]+/g)) refs.push(`_next/${m[0]}`);
    if (rel.endsWith(".css")) {
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        if (/^(data:|https?:|#|\/)/.test(m[1])) continue;
        refs.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
      }
    }
    for (let ref of refs) {
      ref = decodeURIComponent(ref.replace(/[?#].*$/, ""));
      // Only files (a directory prefix like "static/chunks/" is not one).
      if (!/\.[a-z0-9]+$/i.test(ref) || files.has(ref)) continue;
      files.add(ref);
      queue.push(ref);
    }
  }
  return { files: [...files], missing };
}

/** glTF extensions a .glb needs (to ship the Draco / Basis decoders only when a model uses them). */
function glbExtensions(file) {
  const buf = fs.readFileSync(file);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
  return json.extensionsUsed ?? [];
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return fs.statSync(to).size;
}

async function pack() {
  const entry = path.join(OUT, ENTRY);
  if (!fs.existsSync(entry)) fail(`${path.relative(ROOT, entry)} not found — run \`npm run build\` first.`);
  const html = fs.readFileSync(entry, "utf8");
  if (/Coming Soon/i.test(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "")) fail("out/ has the 'Coming soon' placeholder for the game — rebuild the site (`npm run build`).");
  console.log(`Using the static export from ${fs.statSync(entry).mtime.toLocaleString()}`);

  fs.rmSync(WWW, { recursive: true, force: true });
  const { files, missing } = webFiles();
  if (missing.length) fail(`the play page references files missing from out/:\n  ${missing.join("\n  ")}`);
  let webBytes = 0;
  for (const rel of files) webBytes += copy(path.join(OUT, rel), path.join(WWW, rel));

  const game = await gameManifest();
  const models = [...new Set(game.models)];
  let modelBytes = 0;
  const extensions = new Set();
  for (const key of models) {
    const url = key.startsWith("/") ? `${key}.glb` : `/library/${key}.glb`;
    const src = path.join(PUBLIC, url);
    if (!fs.existsSync(src)) fail(`model ${key} not found at public${url}`);
    modelBytes += copy(src, path.join(WWW, url));
    for (const ext of glbExtensions(src)) extensions.add(ext);
  }
  const decoders = [];
  if (extensions.has("KHR_draco_mesh_compression")) decoders.push("draco");
  if (extensions.has("KHR_texture_basisu")) decoders.push("basis");
  for (const d of decoders) {
    for (const f of fs.readdirSync(path.join(PUBLIC, "decoders", d))) copy(path.join(PUBLIC, "decoders", d, f), path.join(WWW, "decoders", d, f));
  }
  // The loading screen draws the cover behind its progress bar.
  const cover = path.join(PUBLIC, game.cover);
  if (!fs.existsSync(cover)) fail(`cover not found at public${game.cover}`);
  webBytes += copy(cover, path.join(WWW, game.cover));
  console.log(`Packed ${files.length + 1} page files (${mb(webBytes)}) + ${models.length} models (${mb(modelBytes)})${decoders.length ? ` + ${decoders.join(", ")} decoder` : ""} → ${path.relative(ROOT, WWW)}`);
}

async function icons() {
  const art = (name) => fs.readFileSync(path.join(APP, "art", name));
  const fg = art("icon-foreground.svg");
  const bg = art("icon-background.svg");
  // SVG viewBox is 108 units; render at `px` pixels.
  const render = (svg, px) => sharp(svg, { density: (72 * px) / 108 }).resize(px, px).png();
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, k] of Object.entries(densities)) {
    const dir = path.join(RES, `mipmap-${name}`);
    fs.mkdirSync(dir, { recursive: true });
    const full = Math.round(108 * k);
    await render(fg, full).toFile(path.join(dir, "ic_launcher_foreground.png"));
    await render(bg, full).toFile(path.join(dir, "ic_launcher_background.png"));
    // Legacy (pre-Android 8) icon: the middle 72 of 108 units as a rounded square.
    const size = Math.round(48 * k);
    const layered = await sharp(await render(bg, full).toBuffer())
      .composite([{ input: await render(fg, full).toBuffer() }])
      .png()
      .toBuffer();
    const inset = Math.round(18 * k);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#fff"/></svg>`);
    await sharp(layered)
      .extract({ left: inset, top: inset, width: full - 2 * inset, height: full - 2 * inset })
      .resize(size, size)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toFile(path.join(dir, "ic_launcher.png"));
  }
  // Splash logo: 144dp at xxhdpi (the system scales it for other screens).
  const splashDir = path.join(RES, "drawable-xxhdpi");
  fs.mkdirSync(splashDir, { recursive: true });
  await render(fg, 432).toFile(path.join(splashDir, "splash_icon.png"));
  console.log("Rendered launcher + splash icons");
}

function gradle() {
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !fs.existsSync(path.join(APP, "local.properties"))) {
    fail("Android SDK not found — set ANDROID_HOME (or write sdk.dir=... to android/kingdom-clash/local.properties).");
  }
  const signed = fs.existsSync(path.join(APP, "keystore.properties"));
  if (!signed) console.warn("build-android: no android/kingdom-clash/keystore.properties — the APK is signed with the DEBUG key.");
  const win = process.platform === "win32";
  // Full path: Windows may not look in the current folder (NoDefaultCurrentDirectoryInExePath).
  const gradlew = path.join(APP, win ? "gradlew.bat" : "gradlew");
  const r = spawnSync(win ? `"${gradlew}"` : gradlew, ["assembleRelease", "--console=plain", "--no-daemon"], { cwd: APP, stdio: "inherit", shell: win });
  if (r.status !== 0) fail("Gradle failed (see above).");

  const apk = path.join(APP, "app/build/outputs/apk/release/app-release.apk");
  const gradleFile = fs.readFileSync(path.join(APP, "app/build.gradle"), "utf8");
  const version = gradleFile.match(/versionName\s+"([^"]+)"/)[1];
  const versionCode = Number(gradleFile.match(/versionCode\s+(\d+)/)[1]);
  const minSdk = Number(gradleFile.match(/minSdk\s+(\d+)/)[1]);
  const buf = fs.readFileSync(apk);
  const info = {
    version,
    versionCode,
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    minAndroid: ANDROID_VERSIONS[minSdk] ?? `API ${minSdk}`,
    built: new Date().toISOString().slice(0, 10),
  };
  for (const dir of [path.join(PUBLIC, "downloads"), ...(fs.existsSync(OUT) ? [path.join(OUT, "downloads")] : [])]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(apk, path.join(dir, `${SLUG}.apk`));
    fs.writeFileSync(path.join(dir, `${SLUG}.json`), `${JSON.stringify(info, null, 2)}\n`);
  }
  console.log(`\nKingdom Clash ${version} (${versionCode}) — ${mb(buf.length)}${signed ? "" : " (debug-signed)"} → public/downloads/${SLUG}.apk`);
}

await pack();
await icons();
if (!packOnly) gradle();
