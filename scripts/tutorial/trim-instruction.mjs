#!/usr/bin/env node
/**
 * Gemini TTS sometimes reads its style instruction aloud before the line. This finds those takes
 * (Whisper hears the English instruction in the first seconds) and cuts the instruction off at the
 * long pause that follows it. The untouched take is kept beside it as <name>.full.wav.
 *
 *   node scripts/tutorial/trim-instruction.mjs haunted-backyard-ta
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FFMPEG, ffmpeg, workDir } from "./lib.mjs";

const dir = path.join(workDir(process.argv[2]), "vo");
const raws = fs.readdirSync(dir).filter((f) => f.endsWith(".raw.wav"));
const heads = raws.map((f) => path.join(dir, `_head-${f}`));
raws.forEach((f, i) => ffmpeg(["-i", path.join(dir, f), "-t", "13", heads[i]]));
const out = path.join(dir, "_heads.json");
const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "listen.mjs"), out, ...heads], { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
if (r.status !== 0) throw new Error("Whisper failed: " + r.stderr.slice(-300));
const heard = JSON.parse(fs.readFileSync(out, "utf8"));
for (const [i, f] of raws.entries()) {
  fs.rmSync(heads[i], { force: true });
  const spoken = /warm|smooth|friendly|youtuber|female voice|read this/i.test(heard[i]);
  if (!spoken) { console.log(`ok       ${f.slice(0, 12).padEnd(12)} ${heard[i].slice(0, 70)}`); continue; }
  const file = path.join(dir, f);
  const log = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.3", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const pauses = [...log.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ end: +m[1], len: +m[2] })).filter((p) => p.end > 8 && p.end < 15.5);
  const cut = pauses.sort((a, b) => b.len - a.len)[0];
  if (!cut) { console.log(`!! NO PAUSE ${f}`); continue; }
  const full = file.replace(/\.raw\.wav$/, ".full.wav");
  if (!fs.existsSync(full)) fs.copyFileSync(file, full);
  ffmpeg(["-ss", (cut.end - 0.08).toFixed(3), "-i", full, "-af", "afade=t=in:d=0.04", "-c:a", "pcm_s16le", file]);
  console.log(`trimmed  ${f.slice(0, 12).padEnd(12)} at ${cut.end.toFixed(1)} s (pause ${cut.len.toFixed(2)} s)`);
}
fs.rmSync(out, { force: true });
