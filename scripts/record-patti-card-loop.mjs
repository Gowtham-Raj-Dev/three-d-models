#!/usr/bin/env node
/**
 * Records the muted gameplay loop that plays over Patti Veedu's cover in the /games grid:
 *   public/games/patti-veedu/card-loop.mp4   960×504 (the card's 1200:630 shape), 30 fps, 10 s, no sound
 *
 *   FFMPEG=path/to/ffmpeg node scripts/record-patti-card-loop.mjs
 *   PREVIEW=1 …   a contact sheet of the shots instead of the video
 *
 * Like scripts/record-patti-trailer.mjs it runs the standalone game straight off the disk (no dev server) on a
 * virtual clock, with the camera and Paatti directed shot by shot and every button hidden: five 2 s moments —
 * Paatti and her lantern at the door, watching her through the wardrobe slats, the lit lamps, the yard at
 * night, and the chase. Each shot is played from its start and filmed from `from`; it starts and ends on a cut, so
 * there's no seam when it loops.
 *
 * Env: CHROME, FFMPEG (default: ffmpeg on PATH).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "patti-veedu", "card-loop.mp4");
const GAME = pathToFileURL(path.join(ROOT, "pattyveedu-game", "PattiVeedu-Project", "game", "index.html")).href + "?desk";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9361;
const W = 960;
const H = 504;
const DPR = PREVIEW ? 0.75 : 1.25;
const STEP_FPS = 60;
const FPS = 30;
const SHOT = 2;
/** Which shot, and how far into it filming starts (seconds). */
const SHOTS = [
  { id: "door", from: 1.6 },
  { id: "hide", from: 2.4 },
  { id: "lamps", from: 1.2 },
  { id: "yard", from: 1.2 },
  { id: "chase", from: 0.6 },
];
const frames = SHOTS.length * SHOT * FPS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = { start() { on = true; now = realNow(); }, step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); } };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** Silent: the game gets an OfflineAudioContext that is never rendered (its music clock is never ticked). */
const AUDIO_HOOK = `(() => {
  const off = new OfflineAudioContext(2, 44100, 44100);
  Object.defineProperty(off, "state", { get: () => "running" });
  off.resume = () => Promise.resolve();
  window.AudioContext = window.webkitAudioContext = function () { return off; };
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...a) { return fn && fn.name === "musTick" ? 0 : si(fn, ms, ...a); };
  try { localStorage.setItem("kolusu.gfx2", JSON.stringify("high")); } catch (e) {}
})()`;

/** The shots (the same staging as the trailer's) and a driver that plays one and steps it. */
const DRIVER = `(() => {
  const k = window.__kolusu, P = k.P, E = k.E, W = k.W, G = k.G;
  const st = document.createElement("style");
  st.textContent = ".topbar,#roomLbl,#timeChip,#toast,#cross,#prompt,#stam,#joy,#joyHint,#hud .slot,#hud .acts,#deskKeys,#clickToPlay,#voiceSub,#hideTxt,#card,#fsBtn,.fsBtn,#rotBtn{display:none!important}";
  document.head.appendChild(st);
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)), lerp = (a, b, x) => a + (b - a) * x;
  const torch = (on) => { if (!!P.torch !== on) k.K.Game.toggleTorch(); };
  const paatti = (at, diff, yaw) => { k.noEnemy(false); E.reset(1, Object.assign({ speed: 1, vision: 0, ko: 28 }, diff || {}), at); E.wait = 1e9; if (yaw !== undefined) { E.yaw = yaw; E.lookBase = yaw; } };
  const away = () => paatti({ x: 30, z: 10, lv: 0 });
  const reset = () => { G.state = "play"; G.timers.length = 0; G.overlay = null; if (P.hidden) k.unhide(); P.wake = 0; P.crouch = false; const f = document.getElementById("fade"); if (f) { f.style.transition = "none"; f.style.opacity = 0; } k.K.Audio.setHeart(0); };
  const S = {
    yard: { setup() { reset(); away(); torch(false); }, cam: (t) => { const x = ease(t / 5.4); return [lerp(19.0, 15.8, x), lerp(27.3, 25.4, x), lerp(1.0, 0.75, x), lerp(0.2, 0.12, x)]; } },
    door: { setup() { reset(); torch(false); paatti({ x: 12, z: 21.25, lv: 0 }, null, 0); }, cam: (t) => { const x = ease(t / 5.6); return [lerp(13.4, 12.7, x), lerp(24.8, 23.4, x), lerp(0.37, 0.31, x), lerp(0.12, 0.1, x)]; } },
    lamps: { setup() { reset(); away(); torch(false); for (const l of W.lamps) { l.lit = true; l.flames.forEach((f) => (f.visible = true)); } }, cam: (t) => { const x = ease(t / 3.4); return [lerp(12.9, 12.4, x), lerp(14.6, 13.4, x), lerp(0.19, 0.12, x), -0.18]; } },
    hide: {
      setup() { reset(); torch(false); const s = W.hideSpots.find((h) => h.id === "study-wardrobe"); P.x = s.exit.x; P.z = s.exit.z; k.hide(s); paatti({ x: 16.6, z: 10.2, lv: 0 }, { speed: 1 }, Math.PI / 2); },
      at: [[0.7, () => { E.wait = 0; E.hear(22.3, 11.8, 99, 0); }]],
      cam: null,
    },
    chase: {
      setup() { reset(); torch(true); paatti({ x: 16.8, z: 17.2, lv: 0 }, { speed: 1.1, vision: 1 }, -Math.PI / 2); E.wait = 3; E.catchArmed = true; },
      cam: (t) => [lerp(7.6, 7.2, ease(t / 3)), 17.1, -Math.PI / 2, 0.03],
    },
  };
  let def = null, t = 0, done = new Set();
  window.__loop = {
    play(id) { def = S[id]; t = 0; done = new Set(); def.setup(); },
    step(dt) {
      for (const [j, [at, fn]] of (def.at || []).entries()) if (t >= at && !done.has(j)) { done.add(j); fn(); }
      if (def.cam && G.state === "play") { const [x, z, yaw, pitch] = def.cam(t); k.teleport(x, z, yaw, 0); P.pitch = pitch; }
      window.__vt.step(dt * 1000);
      t += dt;
    },
  };
})()`;

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") console.error("  page error:", d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id);
      pend.delete(d.id);
      if (d.error) p.rej(new Error(d.error.message));
      else p.res(d.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => (pend.set(++id, { res, rej }), ws.send(JSON.stringify({ id, method, params }))));
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate };
}

if (!PREVIEW && spawnSync(FFMPEG, ["-version"]).status !== 0) {
  console.error(`ffmpeg not found (${FFMPEG}) — set FFMPEG=path/to/ffmpeg`);
  process.exit(1);
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), "patti-card-loop-"));
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
let chrome = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--allow-file-access-from-files", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
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
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_HOOK });
  await page.send("Page.navigate", { url: GAME });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!(window.__kolusu && __kolusu.G.state === "menu")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load");
    await sleep(500);
  }
  // Straight into a run, past the opening walk (as the trailer does).
  await page.evaluate(`(() => { const k = __kolusu; k.noEnemy(true); k.start(); k.G.state = "play"; k.G.timers.length = 0; document.getElementById("card").hidden = true; k.K.LampFX && k.K.LampFX.stop(); const f = document.getElementById("fade"); f.style.transition = "none"; f.style.opacity = 0; k.P.wake = 0; })()`);
  await sleep(3000);
  await page.evaluate("__vt.start()");
  await page.evaluate(DRIVER);

  console.log(`Recording ${SHOTS.length} shots, ${frames} frames (${W * DPR}×${H * DPR})…`);
  const dt = 1 / STEP_FPS;
  const perFrame = STEP_FPS / FPS;
  for (let n = 0; n < frames; n++) {
    if (n % (SHOT * FPS) === 0) {
      const s = SHOTS[n / (SHOT * FPS)];
      // Play the shot from its start up to where filming begins.
      await page.evaluate(`(() => { __loop.play(${JSON.stringify(s.id)}); for (let i = 0; i < ${Math.round(s.from * STEP_FPS)}; i++) __loop.step(${dt}); })()`);
    }
    await page.evaluate(`for (let i = 0; i < ${perFrame}; i++) __loop.step(${dt})`);
    if (PREVIEW && n % 15) continue;
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(PREVIEW ? n / 15 : n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  }

  if (PREVIEW) {
    const files = fs.readdirSync(framesDir).sort();
    const cols = 4;
    const tw = 480;
    const th = 252;
    const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(framesDir, f)).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th })));
    const out = path.join(os.tmpdir(), "patti-card-loop-preview.jpg");
    await sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: "#000" } }).composite(comp).jpeg({ quality: 82 }).toFile(out);
    console.log("preview sheet:", out);
  } else {
    console.log("Encoding…");
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const r = spawnSync(
      FFMPEG,
      ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-vf", `scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryslow", "-crf", "26", "-g", String(FPS * 2), "-pix_fmt", "yuv420p", "-profile:v", "high", "-an", "-movflags", "+faststart", OUT],
      { stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error("ffmpeg failed");
    console.log(`${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
  }
} finally {
  chrome?.kill();
  await sleep(600);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
