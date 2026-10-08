#!/usr/bin/env node
/**
 * Voice-over: every storyboard line spoken by Kokoro (open-source neural TTS, Apache-2.0, voice
 * af_heart — its most natural female voice), trimmed, then measured for the lip sync (mouth opening
 * per video frame) and the subtitles (pauses inside each line, used to time its chunks).
 *
 *   KOKORO=path/to/kokoro-js/dist/kokoro.js node scripts/promo/voice.mjs
 *
 * Writes promo/work/vo/<line>.wav (48 kHz mono) and promo/work/vo/voice.json. Lines whose text has
 * not changed are kept.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FPS, WORK, ffmpeg } from "./lib.mjs";
import { lines, scenes } from "./storyboard.mjs";

const KOKORO = process.env.KOKORO ?? "C:/Users/gowth/AppData/Local/Temp/claude/e--Gowtham-Live-3d-models/2ef13690-caad-4734-8035-906d563e2641/scratchpad/tts/node_modules/kokoro-js/dist/kokoro.js";
const VOICE = process.env.VOICE ?? "af_heart";
const SPEED = Number(process.env.SPEED ?? 1);
const dir = path.join(WORK, "vo");
fs.mkdirSync(dir, { recursive: true });

const hash = (text) => crypto.createHash("sha1").update(`${VOICE}|${SPEED}|${text}`).digest("hex").slice(0, 10);
const todo = lines.filter((l) => !fs.existsSync(path.join(dir, `${l.key}-${hash(l.say)}.raw.wav`)));
if (todo.length) {
  console.log(`Kokoro "${VOICE}": ${todo.length} line(s)…`);
  const script = `
    const { KokoroTTS } = await import(${JSON.stringify(pathToFileURL(KOKORO).href)});
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
    for (const [file, text] of ${JSON.stringify(todo.map((l) => [path.join(dir, `${l.key}-${hash(l.say)}.raw.wav`).split(path.sep).join("/"), l.say]))}) {
      const audio = await tts.generate(text, { voice: ${JSON.stringify(VOICE)}, speed: ${SPEED} });
      audio.save(file);
      console.log("  " + text);
    }`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: path.dirname(KOKORO), stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Kokoro failed:\n${r.stderr.split("\n").filter((l) => !/Warning/.test(l)).slice(-8).join("\n")}`);
}

/** 16-bit mono PCM samples of a WAV written by ffmpeg (plain 44-byte header). */
function samples(file) {
  const b = fs.readFileSync(file);
  let o = 12;
  while (o < b.length - 8) {
    const id = b.toString("ascii", o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === "data") return new Int16Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + size));
    o += 8 + size;
  }
  throw new Error("no data chunk in " + file);
}

const RATE = 48000;
const out = [];
for (const l of lines) {
  const raw = path.join(dir, `${l.key}-${hash(l.say)}.raw.wav`);
  const wav = path.join(dir, `${l.key}.wav`);
  // Trim silent ends (keep a breath of room), resample to 48 kHz.
  ffmpeg(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse", "-ar", String(RATE), "-ac", "1", "-c:a", "pcm_s16le", wav]);
  const s = samples(wav);
  const seconds = s.length / RATE;
  // Mouth: RMS per video frame (20 ms window centred on the frame), normalised to the line's loud parts.
  const per = RATE / FPS;
  const env = [];
  for (let f = 0; f * per < s.length; f++) {
    const c = Math.round(f * per + per / 2), w = RATE * 0.02;
    let sum = 0, n = 0;
    for (let i = Math.max(0, c - w); i < Math.min(s.length, c + w); i++, n++) sum += (s[i] / 32768) ** 2;
    env.push(Math.sqrt(sum / Math.max(1, n)));
  }
  const sorted = [...env].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 1;
  const mouth = env.map((v) => Math.round(Math.min(1, v / loud) * 100) / 100);
  // Pauses: runs of ≥ 90 ms below -38 dB of the loud level (where subtitle chunks may change).
  const quiet = env.map((v) => v < loud * 0.0126);
  const pauses = [];
  for (let f = 0; f < quiet.length; ) {
    if (!quiet[f]) { f++; continue; }
    let e = f;
    while (e < quiet.length && quiet[e]) e++;
    if ((e - f) / FPS >= 0.09) pauses.push([+(f / FPS).toFixed(3), +(e / FPS).toFixed(3)]);
    f = e;
  }
  out.push({ key: l.key, scene: l.scene, t: l.t, sub: l.sub, file: path.relative(WORK, wav).split(path.sep).join("/"), seconds: +seconds.toFixed(3), mouth, pauses });
}
fs.writeFileSync(path.join(dir, "voice.json"), JSON.stringify(out));

// Report: each line's slot (until the next line or its scene's end).
for (const [i, v] of out.entries()) {
  const scene = scenes.find((s) => s.id === v.scene);
  const next = out[i + 1]?.scene === v.scene ? out[i + 1].t : scene.start + scene.dur;
  const room = next - v.t;
  const flag = v.seconds > room - 0.25 ? `  !! ${(v.seconds - room + 0.25).toFixed(2)} s too long` : "";
  console.log(`${v.t.toFixed(2).padStart(6)} s  ${v.seconds.toFixed(2)} s / ${room.toFixed(2)} s  ${v.sub}${flag}`);
}
