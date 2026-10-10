#!/usr/bin/env node
/**
 * Sound and final files for a recorded tutorial (after voice.mjs and record.mjs):
 *
 *   promo/tutorials/<id>/audio/            music.wav, sfx.wav, voice.wav, mix.wav (-15 LUFS)
 *   promo/tutorials/<id>/<id>-1080p.mp4    the master, for YouTube — with <id>.srt and <id>-chapters.txt
 *   public/tutorials/<id>/                 what the site plays: 1080.mp4, 720.mp4, poster.webp, og.jpg, captions.vtt
 *   src/data/tutorials/<id>.json           length, chapters and transcript, read by the tutorials page
 *
 *   node scripts/tutorial/finish.mjs haunted-backyard
 *
 * The backing track is played by the games' own synthesizer (src/components/games/shared/music.ts,
 * no audio files), like the site tour's; clicks, key presses and drops get the same synthesized
 * effects, placed from the recording's timeline.
 */
import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import sharp from "sharp";
import { ROOT } from "../promo/lib.mjs";
import { clock, duration, ffmpeg, loadTutorial, openBrowser, workDir } from "./lib.mjs";

const id = process.argv[2];
const { lines, meta } = await loadTutorial(id);
const dir = workDir(id);
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const voice = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir, "vo", "voice.json"), "utf8")).map((v) => [v.key, v]));
const capture = path.join(dir, "capture.mp4");
const TOTAL = timeline.seconds;
const RATE = 48000;
const LEN = TOTAL + 0.5;
const OUT = path.join(dir, "audio");
fs.mkdirSync(OUT, { recursive: true });

// --- Backing track -----------------------------------------------------------------------------------

const WHOLE = "x . . . . . . . . . . . . . . .";
/** "Lantern Light" — slow and a little eerie: D minor, i–VI–iv–v, pads and far-off bells; a soft pulse joins for the time-lapses. */
const SONG = {
  name: "Lantern Light",
  bpm: 72,
  root: 50,
  scale: [0, 2, 3, 5, 7, 8, 10],
  chords: [0, 5, 3, 4],
  sevenths: true,
  echoSteps: 3,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], gain: 0.7 },
    { inst: "sub", mode: "rel", bars: [WHOLE], gain: 0.5 },
    { inst: "bell", mode: "rel", octave: 1, gain: 0.2, bars: ["0 . . . . . 4 . . . . . 2 . . .", "4 . . . . . 2 . . . 0 . . . . .", "0 . . . 2 . 4 . . . . . 7 . . .", "4 . . . . . . . 2 . . . . . . ."] },
    { inst: "pluck", mode: "rel", from: 1, gain: 0.3, bars: ["0 . 4 . 7 . 4 . 2 . 4 . 7 . 4 .", "0 . 4 . 7 . 4 . 9 . 7 . 4 . 2 ."] },
    { inst: "shaker", from: 1, gain: 0.28, bars: [". . x . . . x . . . x . . . x ."] },
  ],
};
/** Intensity changes [seconds, level]: the pulse plays under the title, the time-lapses and the end card. */
const firstLine = timeline.lines[0]?.t ?? 0;
const lastLine = timeline.lines.at(-1);
const intensity = [[0, 1], [Math.max(0.5, firstLine - 0.3), 0]];
for (const e of timeline.events) {
  if (e.type === "lapse-on") intensity.push([e.t, 1]);
  if (e.type === "lapse-off") intensity.push([e.t, 0]);
}
if (lastLine) intensity.push([lastLine.t + voice[lastLine.key].seconds + 0.3, 1]);
intensity.sort((a, b) => a[0] - b[0]);

// --- Sound effects -----------------------------------------------------------------------------------

const fx = [[0.25, "impact"]];
let lastDrop = -1;
for (const e of timeline.events) {
  if (e.type === "click") fx.push([e.t, "click"]);
  if (e.type === "key") fx.push([e.t, "key"]);
  if (e.type === "place") {
    fx.push([e.t, "click"]);
    // In a time-lapse the drops come too fast for a thud each.
    if (e.t - lastDrop > 0.25) fx.push([e.t + 0.03, "place"]);
    lastDrop = e.t;
  }
  if (e.type === "chapter") fx.push([Math.max(0, e.t - 0.1), "whooshSoft"], [e.t + 0.25, "tick"]);
  if (e.type === "lapse-on") fx.push([e.t, "swish"]);
}
if (lastLine) fx.push([lastLine.t + voice[lastLine.key].seconds + 0.5, "chime"]);
fx.sort((a, b) => a[0] - b[0]);

// --- Render (headless Chrome, OfflineAudioContext) -------------------------------------------------

const bundle = (
  await esbuild.build({
    stdin: { contents: `import { audio } from "./src/components/games/shared/audio"; import { music } from "./src/components/games/shared/music"; window.__a = { audio, music };`, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    format: "iife",
    write: false,
    logLevel: "error",
  })
).outputFiles[0].text;

const HUB = `
  const { audio, music } = window.__a;
  const rate = ${RATE};
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * ${LEN}), rate);
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
const MUSIC = `(async () => {
  ${HUB}
  const changes = ${JSON.stringify(intensity)};
  music.play(${JSON.stringify(SONG)}, changes[0][1], { restart: true });
  window.setInterval = realSetInterval;
  for (let k = 1; k * 0.05 < ${LEN}; k++) ctx.suspend(k * 0.05).then(() => {
    const t = k * 0.05;
    for (const [at, lvl] of changes) if (at > 0 && Math.abs(at - t) < 0.025) music.setIntensity(lvl);
    tick && tick();
    resume();
  });
  tick && tick();
  window.__buf = await ctx.startRendering();
})()`;
const EFFECTS = `(async () => {
  ${HUB}
  window.setInterval = realSetInterval;
  const fx = ${JSON.stringify(fx)};
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const S = {
    whooshSoft: () => audio.noise(0.7, { volume: 0.14, freq: 500, type: "bandpass", slide: 2200, q: 0.8 }),
    swish: () => audio.noise(0.28, { volume: 0.11, freq: 900, type: "bandpass", slide: 2600, q: 1.3 }),
    impact: () => { audio.tone(98, 1.0, { type: "sine", volume: 0.4, slide: -38 }); audio.noise(0.35, { volume: 0.1, freq: 1800, type: "lowpass", slide: -1500 }); audio.jingle([62, 65, 69, 74], { volume: 0.09, step: 0.09 }); },
    tick: () => audio.tone(1568, 0.06, { type: "triangle", volume: 0.05 }),
    click: () => { audio.tone(2100, 0.025, { type: "triangle", volume: 0.09 }); audio.noise(0.02, { volume: 0.09, freq: 4200, type: "highpass" }); },
    key: () => { audio.noise(0.022, { volume: 0.07, freq: 2600 + rnd() * 1800, type: "bandpass", q: 2 }); audio.tone(240 + rnd() * 60, 0.02, { type: "sine", volume: 0.05 }); },
    place: () => { audio.tone(520, 0.14, { type: "sine", volume: 0.17, slide: -260 }); audio.noise(0.08, { volume: 0.07, freq: 700, type: "lowpass" }); },
    chime: () => audio.jingle([62, 69, 74, 77, 81], { volume: 0.13, step: 0.1 }),
  };
  const q = 128 / rate;
  const groups = new Map();
  for (const [time, name] of fx) {
    const at = Math.max(q, Math.round(time / q) * q);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(name);
  }
  const realNow = performance.now;
  for (const [at, list] of groups) {
    ctx.suspend(at).then(() => {
      performance.now = () => at * 1000;
      for (const name of list) S[name]();
      performance.now = realNow;
      resume();
    });
  }
  window.__buf = await ctx.startRendering();
})()`;
/** 16-bit stereo PCM of frames [from, to) of the rendered buffer, as base64 (in slices: the whole file is too big for one message). */
const SLICE = `(from, to) => {
  const L = window.__buf.getChannelData(0), R = window.__buf.getChannelData(1);
  const out = new Int16Array((to - from) * 2);
  for (let i = from; i < to; i++) {
    out[(i - from) * 2] = Math.max(-1, Math.min(1, L[i])) * 32767;
    out[(i - from) * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}`;

function wavHeader(frames) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + frames * 4, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(frames * 4, 40);
  return h;
}

const musicWav = path.join(OUT, "music.wav"), sfxWav = path.join(OUT, "sfx.wav");
{
  const { page, close } = await openBrowser({ width: 400, height: 300, dpr: 1, virtual: false, pointer: false });
  try {
    await page.setContent(`<!doctype html><html><body><script>${bundle.replace(/<\/script/g, "<\\/script")}</script></body></html>`);
    const frames = Math.floor(LEN * RATE);
    for (const [label, script, file] of [[`Music "${SONG.name}"`, MUSIC, musicWav], [`Sound effects (${fx.length})`, EFFECTS, sfxWav]]) {
      console.log(`${label} (${clock(LEN)})…`);
      await page.evaluate(script);
      const fd = fs.openSync(file, "w");
      fs.writeSync(fd, wavHeader(frames));
      for (let from = 0; from < frames; from += RATE * 20) fs.writeSync(fd, Buffer.from(await page.evaluate(`(${SLICE})(${from}, ${Math.min(frames, from + RATE * 20)})`), "base64"));
      fs.closeSync(fd);
    }
  } finally {
    await close();
  }
}

// --- Voice track and mix -----------------------------------------------------------------------------

/** Gain that brings a line to the same loudness as the others (RMS of its voiced samples → -23 dBFS). */
function levelOf(file) {
  const b = fs.readFileSync(file);
  const s = new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) >> 1);
  let sum = 0, n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = s[i] / 32768;
    if (Math.abs(v) > 0.01) {
      sum += v * v;
      n++;
    }
  }
  return Math.min(3, Math.max(0.4, 0.0708 / Math.sqrt(sum / Math.max(1, n))));
}

const voWav = path.join(OUT, "voice.wav");
{
  const said = timeline.lines.map((l) => ({ ...l, file: path.join(dir, voice[l.key].file) }));
  const graph =
    said.map((l, i) => `[${i}:a]volume=${levelOf(l.file).toFixed(3)},adelay=${Math.round(l.t * 1000)}:all=1[v${i}]`).join(";") +
    `;${said.map((_, i) => `[v${i}]`).join("")}amix=inputs=${said.length}:normalize=0,` +
    // Kept natural: a low cut, a little presence, gentle compression — no reverb.
    `highpass=f=70,equalizer=f=3000:t=q:w=1.2:g=1.5,acompressor=threshold=0.1:ratio=2.5:attack=8:release=160:makeup=1.5,` +
    `apad=whole_dur=${LEN.toFixed(2)},aformat=channel_layouts=stereo[out]`;
  const script = path.join(OUT, "voice.graph");
  fs.writeFileSync(script, graph);
  ffmpeg([...said.flatMap((l) => ["-i", l.file]), "-filter_complex_script", script, "-map", "[out]", "-ar", String(RATE), "-t", LEN.toFixed(2), voWav]);
}
const mix = path.join(OUT, "mix.wav");
ffmpeg([
  "-i", musicWav, "-i", sfxWav, "-i", voWav,
  "-filter_complex",
  [
    `[2:a]asplit=2[vo1][vo2]`,
    `[0:a]volume=0.5[mus]`,
    `[mus][vo1]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=500[ducked]`,
    `[1:a]volume=0.6[sfx]`,
    `[ducked][sfx][vo2]amix=inputs=3:normalize=0:duration=first,afade=t=in:d=0.4,afade=t=out:st=${(TOTAL - 1.8).toFixed(2)}:d=1.8,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=${RATE}[mix]`,
  ].join(";"),
  "-map", "[mix]", "-t", TOTAL.toFixed(3), "-ar", String(RATE), mix,
]);
console.log(`→ ${path.relative(ROOT, mix)}`);

// --- Captions, chapters ------------------------------------------------------------------------------

/** A line's caption in pieces of at most two 42-character rows, timed by their share of the line. */
function cuesOf(line) {
  const text = lines[line.key].sub ?? lines[line.key].say;
  const pieces = [];
  let now = "";
  // Break at sentence ends and commas first; a piece never runs past 84 characters.
  for (const clause of text.match(/[^.!?,]+[.!?,]*\s*/g) ?? [text]) {
    if (now && (now + clause).trim().length > 84) {
      pieces.push(now.trim());
      now = "";
    }
    now += clause;
  }
  if (now.trim()) pieces.push(now.trim());
  const total = pieces.reduce((n, p) => n + p.length, 0);
  let t = line.t;
  return pieces.map((p) => {
    const t0 = t;
    t += (voice[line.key].seconds * p.length) / total;
    return { t0, t1: t, text: p };
  });
}
const cues = timeline.lines.flatMap(cuesOf);
const stamp = (t, sep) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
};
/** Two balanced rows when the text is long. */
const rows = (text) => {
  if (text.length <= 42) return text;
  const mid = text.length / 2;
  let cut = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
  return cut < 0 ? text : `${text.slice(0, cut)}\n${text.slice(cut + 1)}`;
};
const vtt = `WEBVTT\n\n${cues.map((c) => `${stamp(c.t0, ".")} --> ${stamp(c.t1, ".")}\n${rows(c.text)}\n`).join("\n")}`;
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.t0, ",")} --> ${stamp(c.t1, ",")}\n${rows(c.text)}\n`).join("\n");
fs.writeFileSync(path.join(dir, `${id}.srt`), srt);
fs.writeFileSync(path.join(dir, `${id}-chapters.txt`), timeline.chapters.map((c) => `${clock(c.t)} ${c.label}`).join("\n") + "\n");

// --- Video files -------------------------------------------------------------------------------------

const site = path.join(ROOT, "public", "tutorials", id);
fs.mkdirSync(site, { recursive: true });
const size = (file) => `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
const encode = (out, video, audio) => {
  ffmpeg(["-i", capture, "-i", mix, "-map", "0:v", "-map", "1:a", ...video, "-pix_fmt", "yuv420p", "-g", "60", "-c:a", "aac", "-ar", String(RATE), ...audio, "-movflags", "+faststart", "-shortest", "-metadata", `title=${meta.title}`, out]);
  console.log(`${path.relative(ROOT, out)}  ${size(out)}, ${clock(duration(out))}`);
};
console.log("Encoding…");
const master = path.join(dir, `${id}-1080p.mp4`);
encode(master, ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-profile:v", "high"], ["-b:a", "256k"]);
// The site's copies: small enough to keep in the repository (GitHub refuses files over 100 MB).
encode(path.join(site, "1080.mp4"), ["-c:v", "libx264", "-preset", "slow", "-crf", process.env.CRF ?? "27", "-maxrate", "3M", "-bufsize", "6M", "-profile:v", "high"], ["-b:a", "128k"]);
encode(path.join(site, "720.mp4"), ["-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", process.env.CRF720 ?? "26", "-maxrate", "1500k", "-bufsize", "3M", "-profile:v", "main"], ["-b:a", "112k"]);
fs.writeFileSync(path.join(site, "captions.vtt"), vtt);

// Poster and share image: the finished scene, just after the title card has gone.
const posterAt = Number(process.env.POSTER ?? Math.min(TOTAL - 1, (timeline.lines[1]?.t ?? 8) - 0.5));
const still = path.join(dir, "poster.png");
ffmpeg(["-ss", posterAt.toFixed(2), "-i", capture, "-frames:v", "1", still]);
await sharp(still).resize(1280, 720).webp({ quality: 82 }).toFile(path.join(site, "poster.webp"));
await sharp(still).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(site, "og.jpg"));

// --- What the page reads -----------------------------------------------------------------------------

const data = {
  seconds: +TOTAL.toFixed(1),
  recorded: new Date().toISOString().slice(0, 10),
  chapters: timeline.chapters.map((c) => ({ at: +c.t.toFixed(1), label: c.label })),
  transcript: timeline.lines.map((l) => ({ at: +l.t.toFixed(1), text: lines[l.key].sub ?? lines[l.key].say })),
};
const dataFile = path.join(ROOT, "src", "data", "tutorials", `${id}.json`);
fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n");
console.log(`${path.relative(ROOT, dataFile)}  ${clock(TOTAL)}, ${data.chapters.length} chapters, ${cues.length} captions`);
