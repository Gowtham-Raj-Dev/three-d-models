#!/usr/bin/env node
/**
 * Records the muted gameplay loop that plays over Skate Rush's cover in the /games grid:
 *   public/games/skate-rush/card-loop.mp4   960×504 (the card's 1200:630 shape), 30 fps, 10 s, no sound
 *
 *   npm run dev                                   (in another terminal)
 *   FFMPEG=path/to/ffmpeg node scripts/record-skate-card-loop.mjs
 *
 * Five 2 s runs on different stages, played by the autopilot with the HUD hidden. As in
 * record-skate-trailer.mjs the game runs in headless Chrome on a virtual clock (stepped 1/60 s, every
 * other frame captured), so slow frames never stutter the clip. It starts and ends on a cut: no seam
 * when it loops.
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG (default: ffmpeg on PATH).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "skate-rush", "card-loop.mp4");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PORT = 9354;
/** Captured at 1200×630 and scaled down, which smooths the edges. */
const W = 960;
const H = 504;
const DPR = 1.25;
const STEP_FPS = 60;
const FPS = 30;
const SHOT = 2;
const SHOTS = [
  { stage: "city", skater: "skate-boy", board: "classic", warp: 9 },
  { stage: "docks", skater: "officer", board: "street", warp: 7 },
  { stage: "snow", skater: "dj-mia", board: "ocean", warp: 7 },
  { stage: "neon", skater: "agent", board: "neon", warp: 7 },
  { stage: "pirate", skater: "elf", board: "tiger", warp: 7 },
];
const frames = SHOTS.length * SHOT * FPS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = {
    start() { on = true; now = realNow(); },
    step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); },
  };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** Hides everything but the 3D view and starts a run on a shot's stage, already in busy traffic. */
const DRIVER = `(() => {
  const g = window.__skateRush.game;
  const css = document.createElement("style");
  css.textContent = ".g-root > :not(canvas), nextjs-portal { visibility: hidden !important; }";
  document.head.append(css);
  window.__loop = {
    async run(s) {
      g.toMenu();
      g.setShowcase("menu");
      await g.setStage(s.stage);
      if (g.currentLoadout.skater !== s.skater) await g.setSkater(s.skater);
      g.setSkin("classic");
      g.setBoard(s.board);
      g.autopilot = true;
      g.invincible = true;
      g.start();
      g.camBlend = 1;
      g.warp(s.warp);
      g.camPos.set(0, 0, 0);
    },
  };
})()`;

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") console.error("  page error:", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

if (spawnSync(FFMPEG, ["-version"]).status !== 0) {
  console.error(`ffmpeg not found (${FFMPEG}) — install it or set FFMPEG=path/to/ffmpeg`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "skate-card-loop-"));
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
  await page.send("Page.navigate", { url: `${BASE}/games/skate-rush/play/` });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!window.__skateRush && /Play/i.test(document.body.innerText)`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }

  console.log("Loading the stages and skaters…");
  await page.evaluate(`(async () => {
    const g = __skateRush.game;
    for (const id of ${JSON.stringify(SHOTS.map((s) => s.stage))}) await g.setStage(id);
    for (const id of ${JSON.stringify(SHOTS.map((s) => s.skater))}) await g.setSkater(id);
  })()`);
  await sleep(1500);
  await page.evaluate("__vt.start()");
  await page.evaluate(DRIVER);

  console.log(`Recording ${SHOTS.length} shots, ${frames} frames (${W * DPR}×${H * DPR})…`);
  const perFrame = STEP_FPS / FPS;
  for (let n = 0; n < frames; n++) {
    if (n % (SHOT * FPS) === 0) await page.evaluate(`__loop.run(${JSON.stringify(SHOTS[n / (SHOT * FPS)])})`);
    await page.evaluate(`for (let i = 0; i < ${perFrame}; i++) __vt.step(${1000 / STEP_FPS})`);
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  }
  page.close();

  console.log("Encoding…");
  const r = spawnSync(
    FFMPEG,
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-vf", `scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryslow", "-crf", "27", "-g", String(FPS * 2), "-pix_fmt", "yuv420p", "-profile:v", "high", "-an", "-movflags", "+faststart", OUT],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("ffmpeg failed");
  console.log(`${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  chrome?.kill();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
