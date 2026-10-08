#!/usr/bin/env node
/**
 * The promo's sound: an original backing track played by the games' own synthesizer
 * (src/components/games/shared/music.ts — no audio files), synthesized sound effects for every cut,
 * click and key press, and the voice-over, mixed to -14 LUFS:
 *   promo/audio/music.wav, sfx.wav, voice-over.wav, mix.wav
 *
 *   node scripts/promo/audio.mjs
 */
import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { PROMO, ROOT, WORK, ffmpeg, openBrowser } from "./lib.mjs";
import { SHOTS } from "./shots.mjs";
import { TOTAL, scenes } from "./storyboard.mjs";

const OUT = path.join(PROMO, "audio");
fs.mkdirSync(OUT, { recursive: true });
const RATE = 48000;
const LEN = TOTAL + 0.6;
const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));

// --- Backing track ---------------------------------------------------------------------------------

const FOUR = "x . . . x . . . x . . . x . . .";
const BACKBEAT = ". . . . x . . . . . . . x . . .";
const OFF8 = ". . x . . . x . . . x . . . x .";
const HATS16 = "x x x x x x x x x x x x x x x x";
const WHOLE = "x . . . . . . . . . . . . . . .";

/** "Make It Yours" — bright pop in D major, I–V–vi–IV; builds from pads (intro) to a full groove (builder). */
const SONG = {
  name: "Make It Yours",
  bpm: 116,
  root: 50,
  scale: [0, 2, 4, 5, 7, 9, 11],
  chords: [0, 4, 5, 3],
  sevenths: true,
  echoSteps: 3,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], gain: 0.75 },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 4 7 4 2 4 7 9 0 4 7 4 2 4 7 4", "0 4 7 4 2 4 7 9 11 9 7 4 2 4 7 4"], gain: 0.5 },
    { inst: "shaker", bars: [OFF8], to: 0, gain: 0.55 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0, gain: 0.8 },
    { inst: "kick", bars: [FOUR], from: 1, gain: 0.85 },
    { inst: "clap", bars: [BACKBEAT], from: 1, gain: 0.6 },
    { inst: "hat", bars: [OFF8], from: 1, to: 1, gain: 0.5 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.42 },
    { inst: "openhat", bars: [". . . . . . . . . . . . . . x ."], from: 2, gain: 0.6 },
    { inst: "bass", mode: "rel", bars: ["0 . 0 . 0 . 7 . 0 . 0 . 4 . 2 .", "0 . 0 . 0 . 7 . 0 . 4 . 7 . 9 ."], from: 1, gain: 0.8 },
    { inst: "piano", mode: "chord", bars: [". . x . . . x . . . x . . x . ."], from: 1, gain: 0.32 },
    {
      inst: "bell",
      mode: "abs",
      octave: 1,
      from: 2,
      gain: 0.36,
      bars: ["4 . . 2 4 . 7 . . . 6 . 4 . . .", "4 . . 2 4 . 8 . . . 7 . 6 . . .", "5 . . 4 5 . 9 . . . 7 . 5 . . .", "3 . 4 . 5 . 7 . 6 . 5 . 4 . . ."],
    },
  ],
};
/** Intensity changes (seconds): calm under the intro, the groove for the tour, everything for the builder. */
const INTENSITY = [[0, 0], [byId.home.start - 0.4, 1], [byId.builder.start - 0.4, 2], [byId.outro.start + 0.2, 1]];

// --- Sound effects ---------------------------------------------------------------------------------

const fx = [];
const add = (t, name) => t >= 0 && t < TOTAL && fx.push([+t.toFixed(4), name]);
// Intro.
add(0.28, "impact");
add(0.66, "whooshSoft");
[0, 1, 2].forEach((i) => add(2.0 + i * 0.14, "pop"));
add(5.5, "rise");
// Cuts between pages, section titles.
const caps = scenes.filter((s) => s.capture);
caps.forEach((s, i) => {
  const next = caps[i + 1];
  if (next && Math.abs(s.start + s.dur - next.start) < 0.01) add(next.start - 0.34, "whoosh");
});
scenes.filter((s) => s.title).forEach((s) => add(s.start + 0.12, "tick"));
// Games.
const g = byId.games;
add(g.start - 0.3, "whooshDown");
add(g.start + 0.05, "swish");
for (const at of [3.5, 4.2, 4.75, 5.55]) add(g.start + at, "swish");
add(g.start + 5.7, "pop");
add(byId.builder.start - 0.35, "whoosh");
// Outro.
const o = byId.outro;
add(o.start - 0.32, "whooshDown");
add(o.start + 0.1, "impact");
add(o.start + 0.95, "chime");
[0, 1, 2, 3, 4].forEach((i) => add(o.start + 1.5 + i * 0.12, "pop"));
// Clicks, key presses and drops in the captures (from the shot lists).
for (const shot of SHOTS) {
  const s = byId[shot.scene];
  let target = null;
  for (const st of shot.steps) {
    if (st.move) target = st.move.to;
    if (st.click) {
      add(s.start + st.at, "click");
      if (shot.scene === "builder" && target?.sel === "canvas") add(s.start + st.at + 0.03, "place");
      if (String(target?.sel ?? "").includes("Use #")) add(s.start + st.at + 0.04, "sparkle");
    }
    if (st.type) [...st.type].forEach((_, i) => add(s.start + st.at + i / (st.cps ?? 13), "key"));
    if (st.key) add(s.start + st.at, "key");
  }
}
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
const TO_WAV = `
  const n = Math.floor(${LEN} * rate);
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
const MUSIC = `(async () => {
  ${HUB}
  music.play(${JSON.stringify(SONG)}, 0, { restart: true });
  window.setInterval = realSetInterval;
  const changes = ${JSON.stringify(INTENSITY)};
  for (let k = 1; k * 0.05 < ${LEN}; k++) ctx.suspend(k * 0.05).then(() => {
    const t = k * 0.05;
    for (const [at, lvl] of changes) if (at > 0 && Math.abs(at - t) < 0.025) music.setIntensity(lvl);
    tick && tick();
    resume();
  });
  tick && tick();
  const buf = await ctx.startRendering();
  ${TO_WAV}
})()`;
const EFFECTS = `(async () => {
  ${HUB}
  window.setInterval = realSetInterval;
  const fx = ${JSON.stringify(fx)};
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const S = {
    whoosh: () => audio.noise(0.5, { volume: 0.26, freq: 300, type: "bandpass", slide: 3400, q: 1.0 }),
    whooshSoft: () => audio.noise(0.7, { volume: 0.14, freq: 500, type: "bandpass", slide: 2200, q: 0.8 }),
    whooshDown: () => audio.noise(0.55, { volume: 0.22, freq: 3200, type: "bandpass", slide: -2700, q: 1.0 }),
    rise: () => { audio.noise(0.95, { volume: 0.16, freq: 250, type: "bandpass", slide: 4200, q: 1.4 }); audio.tone(220, 0.9, { type: "sine", volume: 0.07, slide: 440 }); },
    swish: () => audio.noise(0.28, { volume: 0.13, freq: 900, type: "bandpass", slide: 2600, q: 1.3 }),
    impact: () => { audio.tone(98, 1.0, { type: "sine", volume: 0.5, slide: -38 }); audio.noise(0.35, { volume: 0.12, freq: 1800, type: "lowpass", slide: -1500 }); audio.jingle([74, 78, 81, 86], { volume: 0.1, step: 0.07 }); },
    pop: () => { audio.tone(880 + rnd() * 120, 0.07, { type: "triangle", volume: 0.09 }); audio.tone(1320 + rnd() * 160, 0.1, { type: "triangle", volume: 0.07, delay: 0.035 }); },
    tick: () => audio.tone(1568, 0.06, { type: "triangle", volume: 0.05 }),
    click: () => { audio.tone(2100, 0.025, { type: "triangle", volume: 0.09 }); audio.noise(0.02, { volume: 0.09, freq: 4200, type: "highpass" }); },
    key: () => { audio.noise(0.022, { volume: 0.07, freq: 2600 + rnd() * 1800, type: "bandpass", q: 2 }); audio.tone(240 + rnd() * 60, 0.02, { type: "sine", volume: 0.05 }); },
    place: () => { audio.tone(520, 0.14, { type: "sine", volume: 0.2, slide: -260 }); audio.noise(0.08, { volume: 0.08, freq: 700, type: "lowpass" }); },
    sparkle: () => { audio.tone(1760, 0.12, { type: "triangle", volume: 0.07 }); audio.tone(2349, 0.16, { type: "triangle", volume: 0.055, delay: 0.05 }); audio.tone(2794, 0.2, { type: "triangle", volume: 0.04, delay: 0.1 }); },
    chime: () => audio.jingle([74, 78, 81, 86, 90], { volume: 0.14, step: 0.08 }),
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
  const buf = await ctx.startRendering();
  ${TO_WAV}
})()`;

const musicWav = path.join(OUT, "music.wav"), sfxWav = path.join(OUT, "sfx.wav");
const { page, close } = await openBrowser({ width: 400, height: 300, dpr: 1, virtual: false, pointer: false });
try {
  await page.setContent(`<!doctype html><html><body><script>${bundle.replace(/<\/script/g, "<\\/script")}</script></body></html>`);
  console.log(`Music "${SONG.name}" (${LEN.toFixed(1)} s)…`);
  fs.writeFileSync(musicWav, Buffer.from(await page.evaluate(MUSIC), "base64"));
  console.log(`Sound effects (${fx.length})…`);
  fs.writeFileSync(sfxWav, Buffer.from(await page.evaluate(EFFECTS), "base64"));
} finally {
  await close();
}

// --- Voice track and mix ---------------------------------------------------------------------------

const voice = JSON.parse(fs.readFileSync(path.join(WORK, "vo", "voice.json"), "utf8"));
const voWav = path.join(OUT, "voice-over.wav");
{
  const inputs = voice.flatMap((v) => ["-i", path.join(WORK, v.file)]);
  const graph =
    voice.map((v, i) => `[${i}:a]adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`).join(";") +
    `;${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,` +
    // Warm, present, even: low cut, a touch of presence and air, gentle compression, a small room.
    `highpass=f=75,equalizer=f=220:t=q:w=1:g=1.5,equalizer=f=3200:t=q:w=1.2:g=2.2,equalizer=f=9000:t=q:w=1:g=1.5,` +
    `acompressor=threshold=0.09:ratio=3:attack=6:release=140:makeup=1.8,aecho=0.85:0.9:23|41:0.07|0.045,` +
    `apad=whole_dur=${LEN.toFixed(2)},aformat=channel_layouts=stereo[out]`;
  ffmpeg([...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", String(RATE), "-t", LEN.toFixed(2), voWav]);
}
const mix = path.join(OUT, "mix.wav");
ffmpeg([
  "-i", musicWav, "-i", sfxWav, "-i", voWav,
  "-filter_complex",
  [
    `[2:a]volume=1.55,asplit=2[vo1][vo2]`,
    `[0:a]volume=0.62[mus]`,
    `[mus][vo1]sidechaincompress=threshold=0.025:ratio=5:attack=25:release=420[ducked]`,
    `[1:a]volume=0.95[sfx]`,
    `[ducked][sfx][vo2]amix=inputs=3:normalize=0:duration=first,afade=t=in:d=0.3,afade=t=out:st=${(TOTAL - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=${RATE}[mix]`,
  ].join(";"),
  "-map", "[mix]", "-t", TOTAL.toFixed(3), "-ar", String(RATE), mix,
]);
console.log(`→ ${path.relative(PROMO, mix)}`);
