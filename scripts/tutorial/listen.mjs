#!/usr/bin/env node
/**
 * What Whisper hears in each wav — voice.mjs's check that a narration line says what it should.
 * Its own process, so running out of memory here costs a retry, not the narration.
 *
 *   node scripts/tutorial/listen.mjs out.json a.wav b.wav …     → out.json: ["text of a", "text of b", …]
 *
 * Needs promo/tools/asr (see promo/tools/README.txt); the model (Whisper base, English) downloads once.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FFMPEG, PROMO } from "./lib.mjs";

const ASR = process.env.ASR ?? path.join(PROMO, "tools", "asr", "node_modules", "@huggingface", "transformers", "dist", "transformers.node.mjs");
const [out, ...files] = process.argv.slice(2);
const { pipeline } = await import(pathToFileURL(ASR).href);
const whisper = await pipeline("automatic-speech-recognition", "Xenova/whisper-base.en", { dtype: "q8" });
const texts = [];
for (const file of files) {
  // 16 kHz mono float samples, straight from ffmpeg.
  const pcm = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 64 * 1024 * 1024 }).stdout;
  const heard = await whisper(new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.length & ~3))), { chunk_length_s: 30 });
  texts.push(heard.text.trim());
}
fs.writeFileSync(out, JSON.stringify(texts));
