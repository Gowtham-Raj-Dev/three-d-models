#!/usr/bin/env node
/**
 * Records Skate Rush's 36-second trailer from the game itself and saves it for the game's page:
 *   public/games/skate-rush/trailer.mp4          1280×720, 30 fps, H.264 + AAC (the game's "City Rush" music)
 *   public/games/skate-rush/trailer-poster.webp  its first frame
 *
 *   npm run dev                                   (in another terminal)
 *   FFMPEG=path/to/ffmpeg node scripts/record-skate-trailer.mjs
 *
 * The game runs in headless Chrome on a virtual clock: every frame is stepped by exactly 1/30 s and
 * captured, so slow frames never stutter the video. The autopilot plays (window.__skateRush on the dev
 * server), captions are drawn over the game in its own font, and the music is rendered offline by the
 * game's synthesizer. Env: BASE (default http://localhost:3000), CHROME, FFMPEG (default: ffmpeg on PATH).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "skate-rush");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PORT = 9353;
const W = 1280;
const H = 720;
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Shop data (names and prices for the captions) --------------------------------------------------

async function content() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "src/components/games/skate-rush/content.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const tmp = path.join(os.tmpdir(), `skate-content-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { SKATERS, SKINS, BOARDS, STAGES } = await content();
const byId = (list, id) => list.find((i) => i.id === id);
const price = (item) => (item.price ? `${item.price.toLocaleString("en-US")} coins` : "Free");

// --- Storyboard ------------------------------------------------------------------------------------

/**
 * Each shot: seconds, what the game shows (`game`, run in the page at the shot's first frame), and the
 * captions: `head` (section badge), `tag` (item name + price + perk), `title` / `end` cards.
 */
const shots = [];
const add = (shot) => shots.push(shot);

add({ dur: 3.4, game: { run: "city", skater: "skate-boy", board: "classic", warp: 9 }, title: true });
const stageClips = ["docks", "snow", "neon", "haunted", "pirate", "moon"];
const stageLoadout = { docks: ["officer", "street"], snow: ["dj-mia", "ocean"], neon: ["agent", "neon"], haunted: ["vampire", "galaxy"], pirate: ["elf", "tiger"], moon: ["knight", "hover"] };
stageClips.forEach((id, i) => {
  const st = byId(STAGES, id);
  const [skater, board] = stageLoadout[id];
  add({ dur: 1.85, game: { run: id, skater, board, warp: 7 }, head: i === 0 ? ["7 Stages", "unlock new worlds with coins"] : null, tag: [st.name, price(st), st.perks[0]] });
});
["skate-girl", "pixel", "dj-mia", "officer", "knight", "orc", "vampire", "skeleton"].forEach((id, i) => {
  const sk = byId(SKATERS, id);
  add({ dur: 0.75, game: { show: "skater", stage: "pirate", skater: id, skin: "classic", board: "classic", first: i === 0 }, head: ["18 Skaters", null], tag: [sk.name, price(sk), null] });
});
["shadow", "frost", "neon", "lava", "gold", "galaxy", "rainbow"].forEach((id, i) => {
  const s = byId(SKINS, id);
  add({ dur: 0.8, game: { show: "skater", stage: "snow", skater: "skate-boy", skin: id, board: "classic", first: i === 0 }, head: ["10 Skins", "for every skater"], tag: [s.name, price(s), null] });
});
// Boards: three close up (floating, turning), then three under a skater at night, kickflipping.
["checker", "flames", "galaxy"].forEach((id, i) => {
  const b = byId(BOARDS, id);
  add({ dur: 0.85, game: { show: "board", stage: "neon", skater: "skate-girl", board: id, first: i === 0 }, head: ["13 Boards", "with glowing trails"], tag: [b.name, price(b), b.trail ? "Trail" : "Deck art"] });
});
["neon", "rainbow", "hover"].forEach((id, i) => {
  const b = byId(BOARDS, id);
  add({ dur: 0.95, game: { run: i === 0 ? "neon" : null, skater: "skate-girl", board: id, warp: 6, jump: 0.1 }, head: ["13 Boards", "with glowing trails"], tag: [b.name, price(b), b.art === "hover" ? "Floats!" : "Trail"] });
});
add({ dur: 4.5, game: { run: "moon", skater: "skate-boy", skin: "gold", board: "rainbow", warp: 8 }, end: true });

const total = shots.reduce((n, s) => n + s.dur, 0);
const frames = Math.round(total * FPS);

// --- Page side -------------------------------------------------------------------------------------

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

/** The caption layer and the per-frame driver (shots come in as JSON). */
const DIRECTOR = (data) => `(() => {
  const { shots, fps } = ${JSON.stringify(data)};
  const sr = window.__skateRush, g = sr.game;
  const root = document.querySelector(".g-root");
  const css = document.createElement("style");
  css.textContent = \`
    .g-root > :not(canvas):not(#trailer), nextjs-portal { visibility: hidden !important; }
    #trailer { position: absolute; inset: 0; z-index: 100; pointer-events: none; font-family: var(--game-display), sans-serif; color: #fff; text-transform: uppercase; }
    #trailer .shade { position: absolute; inset: 0; }
    #trailer .title { position: absolute; left: 0; right: 0; top: 34%; text-align: center; }
    #trailer .title b { display: block; font-size: 126px; line-height: .95; font-weight: 400; text-shadow: 5px 5px 0 #111, 10px 10px 0 #f59e0b88; }
    #trailer .title b i { font-style: normal; color: #facc15; }
    #trailer .title span { display: inline-block; margin-top: 18px; font-size: 30px; letter-spacing: .04em; text-shadow: 3px 3px 0 #111; }
    #trailer .head { position: absolute; left: 52px; top: 56px; }
    #trailer .head b { display: inline-block; background: #facc15; color: #111; font-size: 46px; font-weight: 400; padding: 6px 22px 2px; border: 4px solid #111; border-radius: 12px; transform: skewX(-6deg); box-shadow: 6px 6px 0 #111; }
    #trailer .head span { display: block; margin-top: 12px; font-size: 22px; text-shadow: 2px 2px 0 #111; letter-spacing: .03em; }
    #trailer .tag { position: absolute; left: 52px; bottom: 58px; }
    #trailer .tag b { display: block; font-size: 58px; font-weight: 400; line-height: 1; text-shadow: 4px 4px 0 #111; }
    #trailer .tag span { display: inline-flex; align-items: center; gap: 10px; margin-top: 12px; padding: 7px 16px 5px 10px; background: #111111d9; border: 3px solid #ffffff55; border-radius: 12px; font-size: 26px; }
    #trailer .tag span em { font-style: normal; color: #facc15; margin-left: 6px; }
    #trailer .coin { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fef08a, #f59e0b 55%, #c2410c); box-shadow: 0 0 0 3px #b45309aa; }
    #trailer .flash { position: absolute; inset: 0; background: #fff; }
    #trailer .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    #trailer .end b { font-size: 112px; font-weight: 400; line-height: .95; text-shadow: 5px 5px 0 #111, 10px 10px 0 #f59e0b88; }
    #trailer .end b i { font-style: normal; color: #facc15; }
    #trailer .play { margin-top: 30px; display: inline-flex; align-items: center; gap: 16px; background: #facc15; color: #111; font-size: 52px; padding: 16px 40px 10px; border: 5px solid #111; border-radius: 18px; box-shadow: 8px 8px 0 #111; transform: skewX(-6deg); }
    #trailer .play svg { width: 40px; height: 40px; transform: translateY(-3px); }
    #trailer .url { margin-top: 30px; font-size: 32px; letter-spacing: .03em; text-shadow: 3px 3px 0 #111; text-transform: none; }
    #trailer .small { margin-top: 10px; font-size: 20px; opacity: .9; text-shadow: 2px 2px 0 #111; }
  \`;
  document.head.append(css);
  const layer = document.createElement("div");
  layer.id = "trailer";
  root.append(layer);

  const starts = [];
  shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
  const total = shots.reduce((n, s) => n + s.dur, 0);
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  let current = -1;
  let jumpAt = -1;

  const setup = (s) => {
    const q = s.game;
    if (q.run) {
      g.toMenu();
      g.setShowcase("menu");
      g.setStage(q.run);
    }
    if (q.show && q.first) {
      g.toMenu();
      g.setStage(q.stage);
      g.setShowcase(q.show, { x: 0, y: 0 }, q.show === "skater" ? 0.72 : 0.8);
      // Start at the close-up instead of zooming in from the title screen.
      g.preset.ready = false;
      g.camPos.set(0, 0, 0);
    }
    if (q.skater && g.currentLoadout.skater !== q.skater) g.setSkater(q.skater);
    g.setSkin(q.skin ?? "classic");
    if (q.board) g.setBoard(q.board);
    if (q.run) {
      g.autopilot = true;
      g.invincible = true;
      g.start();
      g.camBlend = 1;
      g.warp(q.warp ?? 6);
      g.camPos.set(0, 0, 0);
    }
    jumpAt = q.jump != null ? q.jump : -1;
  };

  const caption = (s, t, i) => {
    const local = t - starts[i];
    let html = "";
    if (s.title) {
      const k = ease(local / 0.35), out = ease((local - (s.dur - 0.35)) / 0.35);
      html += '<div class="shade" style="background:radial-gradient(ellipse at center, #0006, #0000 70%)"></div>';
      html += '<div class="title" style="opacity:' + (k * (1 - out)) + ';transform:scale(' + (0.85 + 0.15 * k) + ') translateY(' + (-40 * out) + 'px)"><b>Skate <i>Rush</i></b><span>The endless 3D skateboard runner</span></div>';
    }
    if (s.head) {
      // The badge stays up for the whole section; it slides in with the section's first shot.
      let first = i;
      while (first > 0 && shots[first - 1].head && shots[first - 1].head[0] === s.head[0]) first--;
      const k = ease((t - starts[first]) / 0.3);
      html += '<div class="head" style="transform:translateX(' + (-60 * (1 - k)) + 'px);opacity:' + k + '"><b>' + s.head[0] + '</b>' + (s.head[1] ? '<span>' + s.head[1] + '</span>' : "") + '</div>';
    }
    if (s.tag) {
      const k = ease(local / 0.22);
      const [name, cost, perk] = s.tag;
      html += '<div class="tag" style="transform:translateY(' + (24 * (1 - k)) + 'px);opacity:' + k + '"><b>' + name + '</b><span><i class="coin"></i>' + cost + (perk ? '<em>· ' + perk + '</em>' : "") + '</span></div>';
    }
    if (s.end) {
      const k = ease(local / 0.5);
      const pulse = 1 + Math.sin(Math.max(0, local - 0.6) * 5) * 0.035;
      html += '<div class="shade" style="background:#0a0a18;opacity:' + (0.62 * k) + '"></div>';
      html += '<div class="end" style="opacity:' + k + ';transform:scale(' + (0.9 + 0.1 * k) + ')"><b>Skate <i>Rush</i></b>' +
        '<div class="play" style="transform:skewX(-6deg) scale(' + pulse + ')"><svg viewBox="0 0 24 24" fill="#111"><path d="M7 4.5v15l12.5-7.5z"/></svg>Play now — free</div>' +
        '<div class="url">models.codelove.in/games/skate-rush</div><div class="small">No download · no sign-up · phone &amp; PC</div></div>';
    }
    // A quick white flash on every cut (not inside a shop section, where items swap in place).
    const cutFlash = i > 0 && !(s.game.show && !s.game.first) && !(s.game.board && !s.game.run && !s.game.show);
    if (cutFlash && local < 0.16) html += '<div class="flash" style="opacity:' + (0.55 * (1 - local / 0.16)) + '"></div>';
    // Fade in from black at the start, and out at the very end.
    if (t < 0.3) html += '<div class="shade" style="background:#000;opacity:' + (1 - t / 0.3) + '"></div>';
    if (t > total - 0.35) html += '<div class="shade" style="background:#000;opacity:' + ((t - (total - 0.35)) / 0.35) + '"></div>';
    layer.innerHTML = html;
  };

  window.__trailer = {
    frame(n) {
      const t = n / fps;
      let i = 0;
      while (i + 1 < shots.length && t >= starts[i + 1]) i++;
      if (i !== current) {
        current = i;
        setup(shots[i]);
      }
      const local = t - starts[i];
      if (jumpAt >= 0 && local >= jumpAt) {
        g.input("jump");
        jumpAt = -1;
      }
      window.__vt.step(1000 / fps);
      caption(shots[i], t, i);
      return true;
    },
  };
  return shots.length;
})()`;

/**
 * Renders the music offline with the game's own synthesizer: an OfflineAudioContext stands in for the
 * AudioContext, and rendering pauses every 50 ms so the scheduler (ticked by hand) only ever has the
 * next few notes queued — like in the game. Returns a 16-bit WAV (base64).
 */
const MUSIC = (seconds) => `(async () => {
  const { audio, music, song } = window.__skateRush;
  music.stop();
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * (${seconds} + 0.5)), rate);
  Object.defineProperty(ctx, "state", { get: () => "running" });
  const resume = ctx.resume.bind(ctx);
  ctx.resume = () => Promise.resolve();
  let tick = null;
  const realSetInterval = window.setInterval;
  window.setInterval = (fn, ms) => { tick = fn; return 1; };
  audio.ctx = null;
  const Real = window.AudioContext;
  window.AudioContext = function () { return ctx; };
  audio.unlock();
  window.AudioContext = Real;
  music.play(song, 2, { restart: true });
  window.setInterval = realSetInterval;
  for (let k = 1; k * 0.05 < ${seconds}; k++) ctx.suspend(k * 0.05).then(() => { tick && tick(); resume(); });
  tick && tick();
  const buf = await ctx.startRendering();
  // The game goes back to silence (no AudioContext until a tap, which never comes here).
  music.stop();
  audio.ctx = null;
  const n = Math.floor(${seconds} * rate);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
})()`;

// --- Chrome ----------------------------------------------------------------------------------------

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

const work = fs.mkdtempSync(path.join(os.tmpdir(), "skate-trailer-"));
const profile = path.join(work, "profile");
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
try {
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
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.navigate", { url: `${BASE}/games/skate-rush/play/` });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!window.__skateRush && /Play/i.test(document.body.innerText)`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }

  console.log("Rendering the music…");
  const wav = path.join(work, "music.wav");
  fs.writeFileSync(wav, Buffer.from(await page.evaluate(MUSIC(total + 0.5)), "base64"));

  console.log("Loading every stage and skater…");
  await page.evaluate(`(async () => {
    const g = __skateRush.game;
    for (const id of ${JSON.stringify(STAGES.map((s) => s.id))}) await g.setStage(id);
    for (const id of ${JSON.stringify(SKATERS.map((s) => s.id))}) await g.setSkater(id);
    // Compile every skin's shader once, so no frame waits for it.
    for (const id of ${JSON.stringify(SKINS.map((s) => s.id))}) g.setSkin(id);
    g.setSkin("classic");
    await g.setStage("city");
    await g.setSkater("skate-boy");
  })()`);
  await sleep(1500);
  await page.evaluate("__vt.start()");
  const count = await page.evaluate(DIRECTOR({ shots, fps: FPS }));
  console.log(`Recording ${count} shots, ${frames} frames (${total.toFixed(1)} s)…`);
  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    await page.evaluate(`__trailer.frame(${n})`);
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 90 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  page.close();

  console.log("Encoding…");
  const mp4 = path.join(OUT, "trailer.mp4");
  const enc = spawnSync(
    FFMPEG,
    [
      "-y",
      "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", path.join(framesDir, "%05d.jpg"),
      "-i", wav,
      "-filter_complex", `[1:a]afade=t=in:d=0.3,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a]`,
      "-map", "0:v", "-map", "[a]",
      "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest",
      mp4,
    ],
    { stdio: "inherit" },
  );
  if (enc.status !== 0) throw new Error("ffmpeg failed");
  // Poster: the title frame, once the title is fully up.
  await sharp(path.join(framesDir, `${String(Math.round(1.2 * FPS)).padStart(5, "0")}.jpg`))
    .webp({ quality: 82, effort: 6 })
    .toFile(path.join(OUT, "trailer-poster.webp"));
  console.log(`${path.relative(ROOT, mp4)}  ${(fs.statSync(mp4).size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
