#!/usr/bin/env node
/**
 * Final assembly: promo/work/final frames + promo/audio/mix.wav →
 *   promo/Website-Overview-2K.mp4   2560×1440, 60 fps, H.264 + AAC (subtitles burned in)
 *   promo/Website-Overview.srt      the same subtitles as a separate file (YouTube, players)
 * and copies the three game clips the video uses into promo/raw/ next to the page captures.
 *
 *   node scripts/promo/finish.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { FPS, PROMO, RAW, ROOT, WORK, duration, ffmpeg } from "./lib.mjs";
import { TOTAL } from "./storyboard.mjs";

const frames = fs.readdirSync(path.join(WORK, "final")).filter((f) => /^\d+\.jpg$/.test(f)).length;
const want = Math.round(TOTAL * FPS);
if (frames < want) throw new Error(`only ${frames}/${want} frames rendered — run compose.mjs first`);

// Subtitles file.
const { subs } = JSON.parse(fs.readFileSync(path.join(WORK, "compose.json"), "utf8"));
const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
const srt = subs.map((c, i) => `${i + 1}\n${stamp(c.t0)} --> ${stamp(c.t1)}\n${c.words.map((w) => w.w).join(" ")}\n`).join("\n");
fs.writeFileSync(path.join(PROMO, "Website-Overview.srt"), srt);

// The game clips shown in the video, kept with the raw captures.
fs.mkdirSync(RAW, { recursive: true });
for (const g of ["skate-rush", "sky-hop", "crypt-knight"]) fs.copyFileSync(path.join(ROOT, "public", "games", g, "card-loop.mp4"), path.join(RAW, `08-game-${g}.mp4`));

const out = path.join(PROMO, "Website-Overview-2K.mp4");
console.log(`Encoding ${frames} frames…`);
ffmpeg([
  "-framerate", String(FPS), "-i", path.join(WORK, "final", "%05d.jpg"),
  "-i", path.join(PROMO, "audio", "mix.wav"),
  "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-profile:v", "high", "-level", "5.1", "-pix_fmt", "yuv420p", "-g", String(FPS * 2),
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
  "-movflags", "+faststart", "-shortest",
  "-metadata", "title=models.codelove.in — website overview",
  out,
]);
console.log(`${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${duration(out).toFixed(2)} s`);
