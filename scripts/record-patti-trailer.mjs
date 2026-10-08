#!/usr/bin/env node
/**
 * Records the Patti Veedu overview trailer from the game itself (no dev server: it runs the standalone game
 * from pattyveedu-game/ straight off the disk):
 *   public/games/patti-veedu/trailer-1080.mp4   1920×1080, 60 fps (desktops, full screen)
 *   public/games/patti-veedu/trailer.mp4        1280×720, 30 fps (phones, inline)
 *   public/games/patti-veedu/trailer-poster.webp
 *
 * Picture: the game on a virtual clock, one screenshot per frame, the camera and Paatti directed shot by shot.
 * Sound: everything the game plays while filming (steps, anklet bells, doors, Paatti's lines, the scream) is
 * logged, then replayed with the game's own synth, music box and rain on an OfflineAudioContext. A calm
 * Kokoro voice (af_heart) narrates; the music ducks under it; -14 LUFS.
 *
 *   FFMPEG=path/to/ffmpeg KOKORO=path/to/kokoro-js/dist/kokoro.js node scripts/record-patti-trailer.mjs
 *   PREVIEW=1 …   a quick contact sheet (one small frame every half second, no sound) to check the shots
 *
 * Env: CHROME, FFMPEG, KOKORO, VOICE (default af_heart), KEEP=1 keeps the frames.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "patti-veedu");
const GAME = pathToFileURL(path.join(ROOT, "pattyveedu-game", "PattiVeedu-Project", "game", "index.html")).href + "?desk";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const KOKORO = process.env.KOKORO ?? "kokoro-js";
const VOICE = process.env.VOICE ?? "af_heart";
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9357;
const W = 1280;
const H = 720;
const DPR = PREVIEW ? 0.5 : 1.5;
const FPS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Shots -----------------------------------------------------------------------------------------
// Each shot: dur (s), vo [[at, spoken, caption]], and page-side code (see DIRECTOR): setup(), cam(t) → [x, z, yaw, pitch].
// Kokoro reads "Paatti" as "patty": the spoken text spells it "Paati".
const shots = [
  { id: "gate", dur: 6.4, vo: [[0.7, "This is Paati Veedu... Grandma's house.", "This is Patti Veedu… Grandma's house."]] },
  { id: "door", dur: 5.6, vo: [[0.2, "Every night, she walks these halls with her lantern.", "Every night, she walks these halls with her lantern."]] },
  { id: "locks", dur: 5.0, vo: [[0.2, "You have five nights to escape... and four locks stand in your way.", "You have five nights to escape… and four locks stand in your way."]] },
  { id: "pooja", dur: 3.2, vo: [[0.2, "Find the keys. Read her diary.", "Find the keys. Read her diary."]] },
  { id: "lamps", dur: 3.4, vo: [[0.1, "Solve the old house's puzzles.", "Solve the old house's puzzles."]] },
  { id: "hide", dur: 8.0, vo: [[0.5, "Listen for her anklet bells... and hide.", "Listen for her anklet bells… and hide."]] },
  { id: "chase", dur: 5.4, vo: [[0.3, "If she sees you... run.", "If she sees you… run."]] },
  { id: "black", dur: 0.5 },
  { id: "yard", dur: 5.4, vo: [[0.4, "A Tamil horror game, in Tamil and English.", "A Tamil horror game, in Tamil and English."]] },
  { id: "end", dur: 6.6, vo: [[0.7, "Paati Veedu. Play free, on models dot code love dot in.", "Play free on models.codelove.in"]] },
];
const starts = [];
shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
const total = shots.reduce((n, s) => n + s.dur, 0);
const frames = Math.round(total * FPS);
const voiceLines = shots.flatMap((s, i) => (s.vo ?? []).map(([at, say, sub]) => ({ t: starts[i] + at, say, sub })));

// --- Voice-over (Kokoro in a child process; Chrome starts after it exits) ---------------------------
function speak(dir) {
  const kokoro = fs.existsSync(KOKORO) ? pathToFileURL(path.resolve(KOKORO)).href : KOKORO;
  const script = `
    const { KokoroTTS } = await import(${JSON.stringify(kokoro)});
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
    const lines = ${JSON.stringify(voiceLines.map((l) => l.say))};
    for (let i = 0; i < lines.length; i++) {
      const audio = await tts.generate(lines[i], { voice: ${JSON.stringify(VOICE)}, speed: 0.92 });
      audio.save(${JSON.stringify(dir.split(path.sep).join("/"))} + "/vo-" + i + ".wav");
    }`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`voice-over failed (set KOKORO):\n${r.stderr.split("\n").filter((l) => !/Warning/.test(l)).slice(-6).join("\n")}`);
}
function trimVoice(file) {
  const out = file.replace(/\.wav$/, "-trim.wav");
  ffmpeg(["-i", file, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  return { file: out, seconds: (fs.statSync(out).size - 44) / (44100 * 2) };
}

// --- Page side -------------------------------------------------------------------------------------
/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = { start() { on = true; now = realNow(); }, step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); }, get on() { return on; } };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** The game's AudioContext is an OfflineAudioContext from the start; its music clock (a 100 ms interval) is ticked by hand. */
const AUDIO_HOOK = (seconds) => `(() => {
  const rate = 44100, off = new OfflineAudioContext(2, Math.ceil(rate * ${seconds}), rate);
  const realResume = off.resume.bind(off), realSuspend = off.suspend.bind(off);
  Object.defineProperty(off, "state", { get: () => "running" });
  off.resume = () => Promise.resolve();
  off.suspend = (t) => (t === undefined ? Promise.resolve() : realSuspend(t));
  window.__off = { ctx: off, rate, resume: realResume, musTick: null };
  window.AudioContext = window.webkitAudioContext = function () { return off; };
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...a) { if (fn && fn.name === "musTick") { window.__off.musTick = fn; return 0; } return si(fn, ms, ...a); };
  try { localStorage.setItem("kolusu.gfx2", JSON.stringify("high")); } catch (e) {}
})()`;

/** Sounds the game makes while filming: logged with their arguments (and the listener's place), replayed into the soundtrack. */
const LOGGED = ["anklet", "footstep", "paattiStep", "creak", "thud", "clink", "clang", "pickup", "match", "whoosh", "unlock", "bell", "sting", "scream", "thunder", "hum", "gong", "whisper", "voice", "setChase", "setHeart", "setOutdoor", "listener"];

/** Overlays, the per-frame driver and the shots. */
const DIRECTOR = (data) => `(() => {
  const D = ${JSON.stringify(data)};
  const k = window.__kolusu, A = k.K.Audio, P = k.P, E = k.E, W = k.W, G = k.G;
  // only the 3D view, Paatti's danger vignette and the wardrobe slats: no buttons, chips or prompts
  const st = document.createElement("style");
  st.textContent = \`.topbar,#roomLbl,#timeChip,#toast,#cross,#prompt,#stam,#joy,#joyHint,#hud .slot,#hud .acts,#deskKeys,#clickToPlay,#voiceSub,#hideTxt,#card{display:none!important}
  #tr{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:"Special Elite","Hind Madurai",serif;color:#f3e6d6}
  #tr .blk{position:absolute;inset:0;background:#000;opacity:0}
  #tr .cap{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);max-width:80%;text-align:center;font:400 30px/1.3 "Special Elite",serif;letter-spacing:.02em;text-shadow:0 2px 6px #000,0 0 20px #000;opacity:0}
  #tr .title{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0}
  #tr .ta{font:900 118px/1 "Catamaran","Noto Sans Tamil",sans-serif;color:#c0160d;text-shadow:0 0 28px rgba(220,30,10,.55),0 4px 0 #3a0503}
  #tr .en{margin-top:18px;font:400 58px/1 "Creepster",serif;letter-spacing:.08em;color:#e8d7c2;text-shadow:0 0 18px rgba(0,0,0,.9)}
  #tr .sub{margin-top:14px;font:400 22px/1 "Special Elite",serif;letter-spacing:.42em;color:#bba58e}
  #tr .url{margin-top:34px;font:400 30px/1 "Special Elite",serif;letter-spacing:.06em;color:#ffcf8a}
  #tr .tip{margin-top:16px;font:400 19px/1 "Special Elite",serif;letter-spacing:.2em;color:#9c8a78}\`;
  document.head.appendChild(st);
  const tr = document.createElement("div"); tr.id = "tr";
  tr.innerHTML = '<div class="blk"></div><div class="title" id="trTitle"><div class="ta">பாட்டி வீடு</div><div class="en">PATTI VEEDU</div><div class="sub">GRANDMA\\'S HOUSE</div></div>'
    + '<div class="title" id="trEnd"><div class="ta">பாட்டி வீடு</div><div class="en">PATTI VEEDU</div><div class="url">Play free · models.codelove.in</div><div class="tip">BEST WITH HEADPHONES</div></div><div class="cap"></div>';
  document.body.appendChild(tr);
  const blk = tr.querySelector(".blk"), cap = tr.querySelector(".cap"), tTitle = tr.querySelector("#trTitle"), tEnd = tr.querySelector("#trEnd");
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)), lerp = (a, b, x) => a + (b - a) * x;
  const fade = (t, a, b, f = 0.5) => Math.min(ease((t - a) / f), ease((b - t) / f));

  // the sound log
  const log = []; let now = 0;
  const orig = {};
  for (const name of D.logged) { orig[name] = A[name]; A[name] = (...args) => { log.push([now, name, JSON.parse(JSON.stringify(args))]); }; }
  A.music = () => {}; A.update = () => {}; // the soundtrack has its own music and heartbeat clock
  const extra = []; const sfx = (name, ...args) => extra.push([now, name, args]);

  const torch = (on) => { if (!!P.torch !== on) k.K.Game.toggleTorch(); };
  const paatti = (at, diff, yaw) => { k.noEnemy(false); E.reset(1, Object.assign({ speed: 1, vision: 0, ko: 28 }, diff || {}), at); E.wait = 1e9; if (yaw !== undefined) { E.yaw = yaw; E.lookBase = yaw; } };
  const away = () => paatti({ x: 30, z: 10, lv: 0 });
  const reset = () => { G.state = "play"; G.timers.length = 0; G.overlay = null; if (P.hidden) k.unhide(); P.wake = 0; P.crouch = false; const f = document.getElementById("fade"); if (f) { f.style.transition = "none"; f.style.opacity = 0; } A.setHeart(0); };
  const S = {
    gate: { setup() { reset(); away(); torch(false); }, cam: (t) => { const x = ease(t / 6.4); return [12, lerp(27.6, 24.7, x), 0, lerp(0.16, 0.06, x)]; } },
    door: { setup() { reset(); torch(false); paatti({ x: 12, z: 21.25, lv: 0 }, null, 0); }, cam: (t) => { const x = ease(t / 5.6); return [lerp(13.4, 12.7, x), lerp(24.8, 23.4, x), lerp(0.37, 0.31, x), lerp(0.12, 0.1, x)]; } },
    locks: { setup() { reset(); away(); torch(true); }, cam: (t) => { const x = ease(t / 5); return [12, lerp(16.6, 18.4, x), Math.PI, lerp(0.02, 0.05, x)]; } },
    pooja: { setup() { reset(); away(); torch(true); }, cam: (t) => { const x = ease(t / 3.2); return [lerp(16.2, 16.5, x), lerp(3.6, 2.7, x), lerp(0.12, 0, x), -0.12]; } },
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
    black: { setup() { reset(); away(); A.setChase(false); }, cam: () => [12, 24.7, 0, 0.06] },
    yard: { setup() { reset(); away(); torch(false); }, cam: (t) => { const x = ease(t / 5.4); return [lerp(19.0, 15.8, x), lerp(27.3, 25.4, x), lerp(1.0, 0.75, x), lerp(0.2, 0.12, x)]; } },
    end: { setup() { reset(); torch(false); paatti({ x: 12, z: 21.25, lv: 0 }, null, 0); }, cam: (t) => [lerp(12.6, 12.3, ease(t / 6.6)), lerp(24.4, 23.8, ease(t / 6.6)), 0.1, 0.1] },
  };

  let cur = -1, done = new Set();
  window.__trailer = {
    log: () => log.concat(extra),
    frame(n) {
      now = n / D.fps;
      let i = D.starts.length - 1; while (i > 0 && D.starts[i] > now) i--;
      const shot = D.shots[i], def = S[shot.id], t = now - D.starts[i];
      if (i !== cur) { cur = i; def.setup(); done = new Set(); }
      for (const [j, [at, fn]] of (def.at || []).entries()) if (t >= at && !done.has(j)) { done.add(j); fn(); }
      if (def.cam && G.state === "play") { const [x, z, yaw, pitch] = def.cam(t); k.teleport(x, z, yaw, 0); P.pitch = pitch; }
      // overlays: title over the gate shot, black for the cut after the scream, the end card, captions
      tTitle.style.opacity = shot.id === "gate" ? fade(t, 1.4, 6.0, 0.8) : 0;
      tEnd.style.opacity = shot.id === "end" ? ease((t - 0.4) / 1.0) : 0;
      let b = 0;
      if (now < 0.6) b = 1 - now / 0.6;
      if (shot.id === "chase" && G.state === "caught") b = ease((t - (def.caughtAt ??= t) - 1.3) / 0.15);
      if (shot.id === "black") b = 1;
      if (shot.id === "yard") b = 1 - ease(t / 0.6);
      if (shot.id === "end") b = 0.62 * ease((t - 0.2) / 1.0) + (t > D.dur - 0.8 ? (t - (D.dur - 0.8)) / 0.8 * 0.38 : 0);
      if (shot.id !== "end" && t > shot.dur - 0.25 && ["gate", "door", "locks", "pooja", "lamps", "yard"].includes(shot.id)) b = Math.max(b, (t - (shot.dur - 0.25)) / 0.25 * 0.85);
      blk.style.opacity = Math.min(1, b);
      const line = D.vo.findLast((v) => now >= v.t - 0.05 && now < v.t + v.len + 0.4);
      cap.textContent = line && shot.id !== "end" ? line.sub : "";
      cap.style.opacity = line && shot.id !== "end" ? fade(now, line.t - 0.05, line.t + line.len + 0.4, 0.2) : 0;
      window.__vt.step(1000 / D.fps);
    },
  };
  return D.shots.length;
})()`;

/** Replays the sound log on the game's OfflineAudioContext with its music box and rain, and returns a WAV (base64). */
const SOUNDTRACK = (seconds, cues) => `(async () => {
  const { ctx, rate, resume, musTick } = window.__off, A = window.__kolusu.K.Audio;
  const fx = window.__trailer.log().concat(${JSON.stringify(cues)});
  const q = 128 / rate, groups = new Map();
  const put = (time, item) => { const at = Math.max(q, Math.round(time / q) * q); if (!groups.has(at)) groups.set(at, []); groups.get(at).push(item); };
  for (const e of fx) put(e[0], e);
  for (let t = 0.05; t < ${seconds}; t += 0.1) put(t, [t, "_tick", []]);
  const orig = window.__trailerOrig;
  for (const [at, list] of [...groups].sort((a, b) => a[0] - b[0])) {
    ctx.suspend(at).then(() => {
      for (const [, name, args] of list) {
        try {
          if (name === "_tick") { musTick && musTick(); orig.update(); }
          else if (name === "_music") orig.music(...args);
          else orig[name](...args);
        } catch (e) {}
      }
      resume();
    });
  }
  for (const name in orig) A[name] = orig[name]; // the music box's own anklet bells must sound, not be logged
  const buf = await ctx.startRendering();
  const n = Math.floor(${seconds} * rate), out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(out.buffer); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
})()`;

// --- Chrome & ffmpeg -------------------------------------------------------------------------------
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); if (d.error) p.rej(new Error(d.error.message)); else p.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}

if (spawnSync(FFMPEG, ["-version"]).status !== 0) { console.error(`ffmpeg not found (${FFMPEG}) — set FFMPEG=path/to/ffmpeg`); process.exit(1); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), "patti-trailer-"));
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
let chrome = null;
try {
  // 1. Voice-over: each line trimmed and, when it runs into the next one, sped up a little.
  let voice = [];
  if (!PREVIEW) {
    console.log(`Voice-over: ${voiceLines.length} lines, Kokoro "${VOICE}"…`);
    speak(work);
    voice = voiceLines.map((line, i) => {
      const { file, seconds } = trimVoice(path.join(work, `vo-${i}.wav`));
      const room = (voiceLines[i + 1]?.t ?? total) - line.t - 0.1;
      const tempo = seconds > room ? Math.min(1.2, seconds / room) : 1;
      console.log(`  ${line.t.toFixed(2)} s  "${line.say}"  ${seconds.toFixed(2)} s${tempo > 1 ? ` → ×${tempo.toFixed(2)}` : ""}`);
      return { ...line, file, tempo, len: seconds / tempo };
    });
  } else voice = voiceLines.map((l) => ({ ...l, len: 2.5 }));

  // 2. Picture.
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_HOOK(total + 1) });
  await page.send("Page.navigate", { url: GAME });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!(window.__kolusu && __kolusu.G.state === "menu")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load");
    await sleep(500);
  }
  // Start a run without the opening walk (as the game's own tests do), let the samples and voices decode.
  await page.evaluate(`(() => { const k = __kolusu; k.noEnemy(true); k.start(); k.G.state = "play"; k.G.timers.length = 0; document.getElementById("card").hidden = true; k.K.LampFX && k.K.LampFX.stop(); const f = document.getElementById("fade"); f.style.transition = "none"; f.style.opacity = 0; k.P.wake = 0;
    const A = k.K.Audio; window.__trailerOrig = {}; for (const n of ${JSON.stringify(LOGGED)}.concat(["music", "update", "ambient"])) window.__trailerOrig[n] = A[n]; })()`);
  await page.evaluate(`Promise.all(['900 40px Catamaran', '40px Creepster', '30px "Special Elite"'].map((f) => document.fonts.load(f, "பாட்டி வீடு PATTI")))`);
  await sleep(4000);
  await page.evaluate("__vt.start()");
  await page.evaluate(DIRECTOR({ shots: shots.map(({ id, dur }) => ({ id, dur })), starts, fps: FPS, dur: shots.at(-1).dur, logged: LOGGED, vo: voice.map(({ t, sub, len }) => ({ t, sub, len })) }));
  const step = PREVIEW ? FPS / 2 : 1;
  console.log(`Recording ${shots.length} shots, ${frames} frames (${total.toFixed(1)} s at ${FPS} fps, ${W * DPR}×${H * DPR})…`);
  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    await page.evaluate(`__trailer.frame(${n})`);
    if (n % step) continue;
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: PREVIEW ? 80 : 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(PREVIEW ? n / step : n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 600 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  if (PREVIEW) {
    const files = fs.readdirSync(framesDir).sort(), cols = 8, tw = 320, th = 180;
    const sheet = sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: "#000" } });
    const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(framesDir, f)).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th })));
    const out = path.join(work, "..", "patti-trailer-preview.jpg");
    await sheet.composite(comp).jpeg({ quality: 80 }).toFile(out);
    console.log("preview sheet:", out);
  } else {
    // 3. Soundtrack: the logged game sounds on the game's own synth, with its music box (menu theme, the ending phrase at the end card).
    console.log("Soundtrack…");
    const cues = [[0, "_music", ["menu"]], [0, "ambient", [true]], [starts[shots.findIndex((s) => s.id === "end")] + 0.3, "_music", ["end"]]];
    const gameWav = path.join(work, "game.wav");
    fs.writeFileSync(gameWav, Buffer.from(await page.evaluate(SOUNDTRACK(total + 0.5, cues)), "base64"));
    page.close();

    // 4. Mix: voice on top, the game's sound ducking under it; -14 LUFS.
    console.log("Mixing…");
    const mixWav = path.join(work, "mix.wav");
    const graph = [
      ...voice.map((v, i) => `[${i + 1}:a]${v.tempo > 1 ? `atempo=${v.tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
      `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=80,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.4,aformat=channel_layouts=stereo,apad[voice]`,
      `[voice]asplit=2[voice1][voice2]`,
      `[0:a]volume=2.2[game]`,
      `[game][voice1]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=400[ducked]`,
      `[ducked][voice2]amix=inputs=2:normalize=0:duration=first,afade=t=in:d=0.4,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`,
    ].join(";");
    ffmpeg(["-i", gameWav, ...voice.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "[mix]", "-t", total.toFixed(3), mixWav]);

    // 5. Video.
    console.log("Encoding…");
    fs.mkdirSync(OUT, { recursive: true });
    const input = ["-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-i", mixWav];
    const common = ["-map", "0:v", "-map", "1:a", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-shortest"];
    const hd = path.join(OUT, "trailer-1080.mp4"), sd = path.join(OUT, "trailer.mp4");
    ffmpeg([...input, ...common, "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", hd]);
    ffmpeg([...input, ...common, "-vf", "fps=30,scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-c:a", "aac", "-b:a", "128k", sd]);
    // Poster: Paatti at the door, mid-shot.
    const posterFrame = Math.round((starts[1] + 3.2) * FPS);
    await sharp(path.join(framesDir, `${String(posterFrame).padStart(5, "0")}.jpg`)).resize(1280).webp({ quality: 84, effort: 6 }).toFile(path.join(OUT, "trailer-poster.webp"));
    console.log(`Length ${total.toFixed(1)} s`);
    for (const f of [hd, sd]) console.log(`${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(2)} MB`);
  }
} finally {
  chrome?.kill();
  await sleep(600);
  if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  else console.log("frames kept in", work);
}
