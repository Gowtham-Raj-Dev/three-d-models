#!/usr/bin/env node
/**
 * Records the muted gameplay loop that plays over Crypt Knight's cover in the /games grid:
 *   public/games/crypt-knight/card-loop.mp4   960×504 (the card's 1200:630 shape), 30 fps, 10 s, no sound
 *
 *   npm run dev                                   (in another terminal)
 *   FFMPEG=path/to/ffmpeg node scripts/record-crypt-card-loop.mjs
 *
 * Five 2 s fights, one in each world with a different hero and skin,
 * played by the autopilot with the HUD hidden. As in record-skate-card-loop.mjs the game runs in
 * headless Chrome on a virtual clock (stepped 1/60 s, every other frame captured), so slow frames never
 * stutter the clip. It starts and ends on a cut: no seam when it loops.
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG (default: ffmpeg on PATH).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "crypt-knight", "card-loop.mp4");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PORT = 9356;
/** Captured at 1200×630 and scaled down, which smooths the edges. */
const W = 960;
const H = 504;
const DPR = 1.25;
const STEP_FPS = 60;
const FPS = 30;
const SHOT = 2;
const SHOTS = [
  { world: "crypt", room: 4, hero: "knight", skin: "classic", warp: 4.5 },
  { world: "frozen", room: 3, hero: "rogue", skin: "frost", warp: 4.5 },
  { world: "poison", room: 5, hero: "barbarian", skin: "toxic", warp: 4.5 },
  { world: "lava", room: 6, hero: "mage", skin: "lava", warp: 4.5 },
  { world: "vault", room: 7, hero: "knight", skin: "gold", warp: 4.5 },
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

/** Hides everything but the 3D view and starts a shot's fight, already under way. */
const DRIVER = `(() => {
  const g = window.__cryptKnight.game;
  const css = document.createElement("style");
  css.textContent = ".g-root > :not(canvas), nextjs-portal { visibility: hidden !important; }";
  document.head.append(css);
  window.__loop = {
    async run(s) {
      g.toMenu();
      g.setWorld(s.world);
      await g.setHero(s.hero);
      g.setSkin(s.skin);
      g.autopilot = true;
      g.invincible = true;
      g.cinema = 0.74;
      g.jumpTo(s.room);
      g.warp(s.warp);
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

const work = fs.mkdtempSync(path.join(os.tmpdir(), "crypt-card-loop-"));
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
  await page.send("Page.navigate", { url: `${BASE}/games/crypt-knight/play/` });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!window.__cryptKnight && !!document.querySelector("[data-ck-play]")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }

  console.log("Loading the heroes, skins and worlds…");
  await page.evaluate(`(async () => {
    const g = __cryptKnight.game;
    while (!g.laterReady) await new Promise((r) => setTimeout(r, 200));
    for (const s of ${JSON.stringify(SHOTS)}) {
      await g.setHero(s.hero);
      g.setSkin(s.skin);
      g.setWorld(s.world);
    }
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
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
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
