#!/usr/bin/env node
/**
 * Records Cannon Cove's trailer from the game itself and saves it for the game's page:
 *   public/games/cannon-cove/trailer-1080.mp4     1920×1080, 60 fps — desktops and full screen
 *   public/games/cannon-cove/trailer.mp4          1280×720, 30 fps — phones (smaller download)
 *   public/games/cannon-cove/trailer-poster.webp  the title frame
 *
 *   npm run dev                                   (in another terminal)
 *   FFMPEG=path/to/ffmpeg KOKORO=path/to/kokoro-js/dist/kokoro.js node scripts/record-cove-trailer.mjs
 *   PREVIEW=1 node scripts/record-cove-trailer.mjs   (a contact sheet of the shots, no sound or video)
 *
 * Works like scripts/record-sky-trailer.mjs: the game runs in headless Chrome on a virtual clock (every frame
 * stepped by exactly 1/60 s and captured), staged shot by shot by scripts/cove-film.mjs — the open sea, the
 * real port screen, the fleet, a pirate fight, the Drowned Queen and an online battle against scripted rivals —
 * with captions in the game's own font. Sound: the game's music and effects rendered offline by its own
 * synthesizer (every effect logged with its time and arguments) plus a Kokoro announcer (open-source neural TTS,
 * Apache-2.0); the music ducks under the voice; -14 LUFS.
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG, KOKORO, VOICE (default af_heart).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { connect, DIRECTOR, SFX, VIRTUAL_TIME } from "./cove-film.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "cannon-cove");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const KOKORO = process.env.KOKORO ?? "kokoro-js";
const VOICE = process.env.VOICE ?? "af_heart";
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9362;
const W = 1280;
const H = 720;
const DPR = PREVIEW ? 0.5 : 1.5;
const FPS = 60;
const PI = Math.PI;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Storyboard ------------------------------------------------------------------------------------
// game: see the staging in scripts/cove-film.mjs. vo: [seconds into the shot, line]. fx: trailer sounds.
const shots = [];
const add = (s) => shots.push(s);

add({
  dur: 3.4,
  game: { kind: "sea", ship: "galleon", near: ["silk", 34, 0], h: PI / 2, speed: 7, cam: { type: "orbit", r: 30, h: 8, a0: 2.3, speed: 0.1, y: 9 } },
  title: true,
  vo: [[0.4, "Set sail in Cannon Cove!"]],
  fx: [[0.25, "impact"]],
});
add({
  dur: 3.6,
  game: { kind: "sea", ship: "brig", near: ["spice", 26, -24], h: PI / 2, speed: 8, cam: { type: "beside", side: -1, dist: 36, h: 9, ahead: 14, slide: 3, y: 5 } },
  head: ["Open sea", "ten island ports to explore"],
  vo: [[0.2, "Explore an open sea with ten island ports."]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 3.4,
  game: { kind: "port", port: "spice", ship: "galleon", cargo: { tools: 30 }, basis: { tools: 31 }, pick: "Spices" },
  ui: true,
  head: ["Trade", "buy cheap · sell where it's wanted"],
  vo: [[0.15, "Buy goods cheap, and sell them where they're wanted."]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 3.0,
  game: { kind: "port", port: "iron", ship: "brig", tab: "Contracts", angle: 1.1 },
  ui: true,
  head: ["Contracts", "freight · bounties · salvage"],
  vo: [[0.12, "Take freight, bounty and salvage contracts."]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 3.2,
  game: { kind: "sea", ship: "brig", near: ["palm", 150, 6], h: PI + 0.35, speed: 9, wp: "palm", auto: true },
  ui: true,
  pos: "bl",
  head: ["Auto-sail", "it steers and docks for you"],
  vo: [[0.12, "Set a course, and auto-sail takes you there."]],
  fx: [[-0.08, "whoosh"]],
});
// The fleet, from a little sailboat to an ocean liner, each moored at a different port.
const fleet = [
  ["skiff", "haven", "Sea Sparrow", "Sailboat", 12, 0.6],
  ["sloop", "coral", "Merchant Sloop", "Sloop", 40, 0.9],
  ["galleon", "palm", "Galleon", "Galleon", 100, 0.7],
  ["steamer", "gold", "Steam Freighter", "Steamship", 240, 1.0],
  ["liner", "iron", "Ocean Queen", "Ocean liner", 560, 0.85],
];
fleet.forEach(([ship, port, name, kind, hold, angle], i) => {
  add({
    dur: i === 0 ? 1.4 : i === fleet.length - 1 ? 1.4 : 0.95,
    game: { kind: "port", port, ship, angle },
    head: ["Build a fleet", "twelve ships to buy"],
    tag: [name, kind, `hold ${hold}`],
    vo: i === 0 ? [[0.1, "Earn gold and build your fleet..."]] : i === 3 ? [[0.05, "right up to giant steamships!"]] : [],
    fx: [i === 0 ? [-0.08, "whoosh"] : [0.02, "pop"]],
  });
});
add({
  dur: 4.2,
  game: {
    kind: "sea",
    ship: "galleon",
    at: [-300, 470],
    h: 0.6,
    speed: 6,
    clear: 70,
    foes: [
      { cls: "brig", side: 34, ahead: 4, hp: 60, speed: 6 },
      { cls: "sloop", side: -42, ahead: 24, dh: 0.4, fireAt: 1.4, speed: 7 },
    ],
    fire: [[0.5, 1]],
    cam: { type: "over", side: 1, dist: 18, h: 12, back: 14, look: 30, drift: 2 },
  },
  head: ["Pirates!", "turn side-on · fire broadsides"],
  vo: [[0.15, "Fight off pirates with thundering broadsides!"]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 3.6,
  game: { kind: "sea", ship: "galleon", at: [-790, -700], h: 0.4, speed: 6, clear: 60, queen: true, barrageAt: 0.6, cam: { type: "orbit", r: 58, h: 24, a0: PI + 0.5, speed: 0.06, y: 1 } },
  head: ["The Haunted Sea", "beware the Drowned Queen"],
  vo: [[0.2, "Brave the Haunted Sea, and the Drowned Queen."]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 4.4,
  game: {
    kind: "online",
    me: [8, -8, 0.9],
    rivals: [
      { id: "r1", name: "Arjun", ship: 1, color: 1, path: [8, -8, 38, 0.17, 0.3], k: 2, d: 1 },
      { id: "r2", name: "Meera", ship: 0, color: 2, path: [26, -22, 24, -0.26, 1.9], k: 1, d: 0, sinkAt: 2.7 },
      { id: "r3", name: "Kavin", ship: 2, color: 3, path: [-12, 8, 44, 0.12, 4.2], k: 0, d: 1 },
    ],
    events: [
      [0.5, "fire", "r1"],
      [1.3, "shoot", 1],
      [2.6, "sink", "r2"],
    ],
  },
  ui: true,
  pos: "bl",
  head: ["Online battles", "rooms with friends · quick match"],
  vo: [[0.25, "Then battle your friends online!"]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 4.4,
  game: { kind: "sea", ship: "galleon", near: ["gold", 44, 12], h: PI / 2, speed: 7, cam: { type: "orbit", r: 46, h: 14, a0: 2.0, speed: 0.12 } },
  end: true,
  endAt: 1.1,
  vo: [[1.35, "Cannon Cove. Play it free, right now!"]],
  fx: [[-0.08, "whoosh"], [1.2, "jingle"]],
});

const starts = [];
shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
const total = shots.reduce((n, s) => n + s.dur, 0);
const frames = Math.round(total * FPS);
const voiceLines = shots.flatMap((s, i) => (s.vo ?? []).map(([at, text]) => ({ t: starts[i] + at, text })));
const trailerFx = shots.flatMap((s, i) => (s.fx ?? []).map(([at, name]) => [Math.max(0, starts[i] + at), name, []]));

// --- Voice-over ------------------------------------------------------------------------------------
function speak(dir) {
  const kokoro = fs.existsSync(KOKORO) ? pathToFileURL(path.resolve(KOKORO)).href : KOKORO;
  const script = `
    const { KokoroTTS } = await import(${JSON.stringify(kokoro)});
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
    const lines = ${JSON.stringify(voiceLines.map((l) => l.text))};
    for (let i = 0; i < lines.length; i++) {
      const audio = await tts.generate(lines[i], { voice: ${JSON.stringify(VOICE)}, speed: 1.05 });
      audio.save(${JSON.stringify(dir.split(path.sep).join("/"))} + "/vo-" + i + ".wav");
    }`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`voice-over failed (is kokoro-js installed? set KOKORO):\n${r.stderr.split("\n").filter((l) => !/Warning/.test(l)).slice(-6).join("\n")}`);
}

function trimVoice(file) {
  const out = file.replace(/\.wav$/, "-trim.wav");
  ffmpeg(["-i", file, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  return { file: out, seconds: (fs.statSync(out).size - 44) / (44100 * 2) };
}

// --- Offline audio (the game's own synthesizer) ----------------------------------------------------
const OFFLINE_HUB = (seconds) => `
  const { audio, music } = window.__cannonCove;
  music.stop();
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * (${seconds} + 0.5)), rate);
  Object.defineProperty(ctx, "state", { get: () => "running" });
  const resume = ctx.resume.bind(ctx);
  ctx.resume = () => Promise.resolve();
  let tick = null;
  const realSetInterval = window.setInterval;
  window.setInterval = (fn) => { tick = fn; return 1; };
  audio.ctx = null;
  const Real = window.AudioContext;
  window.AudioContext = function () { return ctx; };
  audio.unlock();
  window.AudioContext = Real;
`;

const TO_WAV = (seconds) => `
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
`;

const MUSIC = (seconds) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  music.play(window.__cannonCove.song, 2, { restart: true });
  window.setInterval = realSetInterval;
  for (let k = 1; k * 0.05 < ${seconds}; k++) ctx.suspend(k * 0.05).then(() => { tick && tick(); resume(); });
  tick && tick();
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

const EFFECTS = (seconds, extra) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  window.setInterval = realSetInterval;
  const film = window.__film;
  const fx = film.fx().concat(${JSON.stringify(extra)});
  const trailer = {
    whoosh: () => audio.noise(0.42, { volume: 0.3, freq: 350, type: "bandpass", slide: 3200, q: 1.1 }),
    impact: () => { audio.tone(82, 1.0, { type: "sine", volume: 0.5, slide: -30 }); audio.noise(0.9, { volume: 0.4, freq: 500, slide: -400 }); audio.jingle([62, 69, 74, 78], { volume: 0.12, step: 0.08 }); },
    pop: () => { audio.tone(784, 0.08, { type: "square", volume: 0.05 }); audio.tone(1175, 0.14, { type: "square", volume: 0.045, delay: 0.05 }); },
    jingle: () => audio.jingle([62, 66, 69, 74, 78, 81], { volume: 0.16, step: 0.09 }),
  };
  const q = 128 / rate;
  const groups = new Map();
  for (const [time, name, args] of fx) {
    const at = Math.max(q, Math.round(time / q) * q);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push([name, args]);
  }
  const realNow = performance.now;
  for (const [at, list] of groups) {
    ctx.suspend(at).then(() => {
      performance.now = () => at * 1000;
      for (const [name, args] of list) (trailer[name] ?? film.originals[name])?.(...(args ?? []));
      performance.now = realNow;
      resume();
    });
  }
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

if (!PREVIEW && spawnSync(FFMPEG, ["-version"]).status !== 0) {
  console.error(`ffmpeg not found (${FFMPEG}) — install it or set FFMPEG=path/to/ffmpeg`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "cove-trailer-"));
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir, { recursive: true });
const keep = new Set(PREVIEW ? shots.flatMap((s, i) => [0.2, 0.55, 0.9].map((k) => Math.round((starts[i] + s.dur * k) * FPS))) : []);
let chrome = null;
try {
  // 1. Voice-over: each line, trimmed, and fitted into the time before the next line (or the end).
  let voice = [];
  if (!PREVIEW) {
    console.log(`Voice-over: ${voiceLines.length} lines, Kokoro voice "${VOICE}"…`);
    speak(work);
    voice = voiceLines.map((line, i) => {
      const { file, seconds } = trimVoice(path.join(work, `vo-${i}.wav`));
      const room = (voiceLines[i + 1]?.t ?? total) - line.t - 0.05;
      const tempo = seconds > room ? Math.min(1.25, seconds / room) : 1;
      console.log(`  ${line.t.toFixed(2)} s  "${line.text}"  ${seconds.toFixed(2)} s${tempo > 1 ? ` → ×${tempo.toFixed(2)}` : ""}`);
      if (seconds / tempo > room + 0.01) console.warn(`    runs ${(seconds / tempo - room).toFixed(2)} s into the next line`);
      return { ...line, file, tempo };
    });
  }

  // 2. Picture.
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

  let musicWav = null;
  if (!PREVIEW) {
    console.log("Music…");
    musicWav = path.join(work, "music.wav");
    fs.writeFileSync(musicWav, Buffer.from(await page.evaluate(MUSIC(total + 0.5)), "base64"));
  }

  console.log("Charting the sea and loading the fleet…");
  await page.evaluate(`__cannonCove.game.warmSea()`);
  await sleep(1500);
  await page.evaluate("__vt.start()");
  const count = await page.evaluate(DIRECTOR({ shots, captions: true, sfx: SFX }));
  // Warm-up: stage every shot once (compiles every ship's materials), then start over.
  for (let i = 0; i < shots.length; i++) {
    await page.evaluate(`__film.play(${i}); for (let k = 0; k < 6; k++) __film.step(1 / 60)`);
  }
  await page.evaluate("__film.reset()");
  console.log(`Recording ${count} shots, ${frames} frames (${total.toFixed(1)} s at ${FPS} fps, ${W * DPR}×${H * DPR})${PREVIEW ? " — preview stills only" : ""}…`);
  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    await page.evaluate(`__film.frame(${n}, ${FPS})`);
    if (PREVIEW && !keep.has(n)) continue;
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: PREVIEW ? 80 : 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 300 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  if (PREVIEW) {
    const files = fs.readdirSync(framesDir).sort();
    const cols = 6;
    const tw = 400;
    const th = 225;
    const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(framesDir, f)).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th })));
    const out = path.join(os.tmpdir(), "cove-trailer-preview.jpg");
    await sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: "#000" } }).composite(comp).jpeg({ quality: 80 }).toFile(out);
    console.log("preview sheet:", out);
  } else {
    console.log("Sound effects…");
    const fxWav = path.join(work, "fx.wav");
    fs.writeFileSync(fxWav, Buffer.from(await page.evaluate(EFFECTS(total + 0.5, trailerFx)), "base64"));
    page.close();

    // 3. Mix: the voice on top, the music ducking under it, the effects; -14 LUFS.
    console.log("Mixing…");
    const mixWav = path.join(work, "mix.wav");
    const graph = [
      ...voice.map((v, i) => `[${i + 2}:a]${v.tempo > 1 ? `atempo=${v.tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
      `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=80,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,apad[voice]`,
      `[voice]asplit=2[voice1][voice2]`,
      `[0:a]volume=0.85[music]`,
      `[music][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]`,
      `[1:a]volume=0.9[fx]`,
      `[ducked][fx][voice2]amix=inputs=3:normalize=0:duration=first,afade=t=in:d=0.25,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`,
    ].join(";");
    ffmpeg(["-i", musicWav, "-i", fxWav, ...voice.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "[mix]", "-t", total.toFixed(3), mixWav]);

    // 4. Video: Full HD 60 fps for desktops and full screen, 720p 30 fps for phones.
    console.log("Encoding…");
    fs.mkdirSync(OUT, { recursive: true });
    const input = ["-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-i", mixWav];
    const common = ["-map", "0:v", "-map", "1:a", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-shortest"];
    const hd = path.join(OUT, "trailer-1080.mp4");
    const sd = path.join(OUT, "trailer.mp4");
    ffmpeg([...input, ...common, "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", hd]);
    ffmpeg([...input, ...common, "-vf", "fps=30,scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-c:a", "aac", "-b:a", "128k", sd]);
    await sharp(path.join(framesDir, `${String(Math.round(1.6 * FPS)).padStart(5, "0")}.jpg`))
      .resize(1280)
      .webp({ quality: 84, effort: 6 })
      .toFile(path.join(OUT, "trailer-poster.webp"));
    console.log(`Length ${total.toFixed(1)} s`);
    for (const f of [hd, sd]) console.log(`${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(2)} MB`);
  }
} finally {
  chrome?.kill();
  await sleep(500);
  if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  else console.log("frames kept in", work);
}
