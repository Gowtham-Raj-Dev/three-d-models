#!/usr/bin/env node
/**
 * Records the muted gameplay loop that plays over Cannon Cove's cover in the /games grid:
 *   public/games/cannon-cove/card-loop.mp4   960×504 (the card's 1200:630 shape), 30 fps, 10 s, no sound
 *
 *   npm run dev                                   (in another terminal)
 *   FFMPEG=path/to/ffmpeg node scripts/record-cove-card-loop.mjs
 *   PREVIEW=1 …   a contact sheet instead of the video
 *
 * Five 2 s moments staged by scripts/cove-film.mjs with no HUD or captions — a pirate ship blown apart, a port
 * town, the Drowned Queen's barrage, an ocean liner under way, a broadside fired at the camera — on a virtual clock (stepped
 * 1/60 s, every other frame captured). Each shot is played from its start and filmed from `from`; the clip
 * starts and ends on a cut, so there's no seam when it loops.
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG (default: ffmpeg on PATH).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { connect, DIRECTOR, SFX, VIRTUAL_TIME } from "./cove-film.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "cannon-cove", "card-loop.mp4");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9363;
const W = 960;
const H = 504;
const DPR = PREVIEW ? 0.75 : 1.25;
const STEP_FPS = 60;
const FPS = 30;
const SHOT = 2;
const PI = Math.PI;
const fight = (cam) => ({
  kind: "sea",
  ship: "galleon",
  at: [-300, 470],
  h: 0.6,
  speed: 6,
  clear: 70,
  foes: [
    { cls: "brig", side: 34, ahead: 4, hp: 60, speed: 6 },
    { cls: "sloop", side: -42, ahead: 24, dh: 0.4, fireAt: 1.0, speed: 7 },
  ],
  fire: [[0.25, 1]],
  cam,
});
const SHOTS = [
  { from: 0.05, dur: SHOT, game: fight({ type: "over", side: 1, dist: 18, h: 11, back: 14, look: 30, drift: 2 }) },
  { from: 0.3, dur: SHOT, game: { kind: "port", port: "silk", ship: "galleon", angle: 0.5, cam: { type: "orbit", r: 44, h: 17, a0: 0.9, speed: 0.1, y: 2 } } },
  { from: 0.5, dur: SHOT, game: { kind: "sea", ship: "galleon", at: [-790, -700], h: 0.4, speed: 6, clear: 60, queen: true, barrageAt: 0.3, cam: { type: "orbit", r: 50, h: 20, a0: PI + 0.6, speed: 0.08, y: 1 } } },
  { from: 0, dur: SHOT, game: { kind: "sea", ship: "liner", near: ["gold", 40, 30], h: PI / 2, speed: 9, cam: { type: "beside", side: -1, dist: 44, h: 8, ahead: 20, slide: 5, y: 6 } } },
  { from: 0.15, dur: SHOT, game: { kind: "sea", ship: "dread", near: ["skull", 60, 0], h: PI / 2, speed: 6, fire: [[0.35, 1]], cam: { type: "beside", side: 1, dist: 30, h: 3.5, ahead: 8, slide: 2, y: 4 } } },
];
const frames = SHOTS.length * SHOT * FPS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!PREVIEW && spawnSync(FFMPEG, ["-version"]).status !== 0) {
  console.error(`ffmpeg not found (${FFMPEG}) — install it or set FFMPEG=path/to/ffmpeg`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "cove-card-loop-"));
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
let chrome = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null);
  }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.navigate", { url: `${BASE}/games/cannon-cove/play/` });
  const deadline = Date.now() + 300_000;
  while (!(await page.evaluate(`!!window.__cannonCove && window.__cannonCove.game.currentPhase === "menu"`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }
  await page.evaluate(`__cannonCove.game.warmSea()`);
  await sleep(1500);
  await page.evaluate("__vt.start()");
  await page.evaluate(DIRECTOR({ shots: SHOTS, captions: false, sfx: SFX }));
  // Warm-up: stage every shot once so every ship's materials are compiled before filming.
  for (let i = 0; i < SHOTS.length; i++) await page.evaluate(`__film.play(${i}); for (let k = 0; k < 6; k++) __film.step(1 / 60)`);

  console.log(`Recording ${SHOTS.length} shots, ${frames} frames (${W * DPR}×${H * DPR})…`);
  const dt = 1 / STEP_FPS;
  const perFrame = STEP_FPS / FPS;
  for (let n = 0; n < frames; n++) {
    if (n % (SHOT * FPS) === 0) {
      const i = n / (SHOT * FPS);
      await page.evaluate(`(() => { __film.play(${i}); for (let k = 0; k < ${Math.round(SHOTS[i].from * STEP_FPS)}; k++) __film.step(${dt}); })()`);
    }
    await page.evaluate(`for (let k = 0; k < ${perFrame}; k++) __film.step(${dt})`);
    if (PREVIEW && n % 15) continue;
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(PREVIEW ? n / 15 : n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  }
  page.close();

  if (PREVIEW) {
    const files = fs.readdirSync(framesDir).sort();
    const cols = 4;
    const tw = 480;
    const th = 252;
    const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(framesDir, f)).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th })));
    const out = path.join(os.tmpdir(), "cove-card-loop-preview.jpg");
    await sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: "#000" } }).composite(comp).jpeg({ quality: 82 }).toFile(out);
    console.log("preview sheet:", out);
  } else {
    console.log("Encoding…");
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const r = spawnSync(
      FFMPEG,
      ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-vf", `scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryslow", "-crf", "27", "-g", String(FPS * 2), "-pix_fmt", "yuv420p", "-profile:v", "high", "-an", "-movflags", "+faststart", OUT],
      { stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error("ffmpeg failed");
    console.log(`${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
  }
} finally {
  chrome?.kill();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
