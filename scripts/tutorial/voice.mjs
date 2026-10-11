#!/usr/bin/env node
/**
 * Narration for a tutorial: every line spoken by Chatterbox Turbo (Resemble AI's open-source neural
 * voice, MIT) in the voice of a short reference clip — by default "A Moment By" by voice actor Alba
 * MacKenna, from Kyutai's tts-voices collection (CC BY 4.0, credited on the tutorial's page).
 *
 *   node scripts/tutorial/voice.mjs haunted-backyard            speak the lines that changed
 *   node scripts/tutorial/voice.mjs haunted-backyard floor-2    new takes of these lines
 *   ONLY=intro-1,floor-2 VOICE=alba-casual node scripts/tutorial/voice.mjs haunted-backyard    try a voice
 *
 * Each line is then listened to by Whisper (listen.mjs); a line it can't follow gets another take.
 * Writes promo/tutorials/<id>/vo/<line>.wav (48 kHz mono) and vo/voice.json (the length of each
 * line, which record.mjs paces the video by).
 *
 * Made for a small, busy machine: every line is saved as soon as it is spoken, and when the model
 * runs out of memory it is simply started again — finished lines are never spoken twice.
 * Set up once: see promo/tools/README.txt.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PROMO, ffmpeg, loadTutorial, sleep, workDir } from "./lib.mjs";

const TOOLS = path.join(PROMO, "tools");
const PYTHON = process.env.PYTHON ?? path.join(TOOLS, "tts", "venv", "Scripts", "python.exe");
const MODEL = process.env.TTS_MODEL ?? path.join(TOOLS, "tts", "chatterbox-turbo");
const VOICE = process.env.VOICE ?? "alba-a-moment-by";
/** The language model graph in the model's onnx/ folder (full precision; the quantized ones are slower and no lighter on a CPU). */
const LM = process.env.LM ?? "language_model";
const TEMPERATURE = Number(process.env.TEMPERATURE ?? 0.8);
const RATE = 48000;

const [id, ...again] = process.argv.slice(2);
const tutorial = await loadTutorial(id);
const { lines } = tutorial;
/** A tutorial in another language names its own voice: { engine: "gemini", model, name, style } (Gemini TTS, needs an API key). */
const GEMINI = tutorial.voice?.engine === "gemini" ? tutorial.voice : null;
const dir = path.join(workDir(id), "vo");
fs.mkdirSync(dir, { recursive: true });
const slash = (p) => p.split(path.sep).join("/");

// Takes: asking for a line again (or a failed check) moves it to its next take — a new random seed.
const takesFile = path.join(dir, "takes.json");
const takes = fs.existsSync(takesFile) ? JSON.parse(fs.readFileSync(takesFile, "utf8")) : {};
for (const key of again) {
  if (!lines[key]) throw new Error(`no line "${key}"`);
  takes[key] = (takes[key] ?? 0) + 1;
}
const saveTakes = () => fs.writeFileSync(takesFile, JSON.stringify(takes, null, 1));
saveTakes();

const hash = (key) => crypto.createHash("sha1").update(`${GEMINI ? `gemini|${GEMINI.name}|${GEMINI.style}` : `${VOICE}|${LM}|${TEMPERATURE}`}|${takes[key] ?? 0}|${lines[key].say}`).digest("hex").slice(0, 10);
const rawOf = (key) => path.join(dir, `${key}-${hash(key)}.raw.wav`);
const seedOf = (key) => parseInt(crypto.createHash("sha1").update(`${key}|${takes[key] ?? 0}`).digest("hex").slice(0, 8), 16);

// The reference clip as the model wants it (24 kHz mono), and its conditioning, worked out once per voice.
const voiceWav = path.join(dir, `_${VOICE}-24k.wav`);
if (!GEMINI && !fs.existsSync(voiceWav)) ffmpeg(["-i", path.join(TOOLS, "tts", "voices", `${VOICE}.wav`), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", voiceWav]);
const cond = path.join(dir, `_${VOICE}.cond.npz`);

/** Runs a child process, trying again (after a pause) when it fails — on this machine that is nearly always memory. */
async function stubborn(what, command, args, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync(command, args, { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
    if (r.status === 0) return true;
    const why = (r.stderr ?? "").split("\n").filter((l) => /Error|Exception|bad alloc|out of memory/i.test(l)).at(-1) ?? `exit ${r.status}`;
    if (attempt >= tries) {
      console.warn(`  ${what} failed ${tries} times (${why.trim().slice(0, 160)})`);
      return false;
    }
    console.warn(`  ${what} failed (${why.trim().slice(0, 120)}) — again in ${20 * attempt} s`);
    await sleep(20_000 * attempt);
  }
}

/**
 * Gemini API keys, in the order they are tried: GEMINI_TTS_KEYS (comma separated — one per Google Cloud
 * project, since a free key's ten requests a day are counted per project), then GEMINI_API_KEY, from
 * the environment or .env.development.local.
 */
function geminiKeys() {
  const file = path.join(PROMO, "..", ".env.development.local");
  const env = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const read = (name) => process.env[name] ?? new RegExp("^" + name + "=(.+)$", "m").exec(env)?.[1] ?? "";
  const keys = [read("GEMINI_TTS_KEYS"), read("GEMINI_API_KEY"), read("NEXT_PUBLIC_GEMINI_API_KEY")].join(",").split(",").map((k) => k.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  if (!keys.length) throw new Error("no Gemini API key: set GEMINI_TTS_KEYS or GEMINI_API_KEY");
  return [...new Set(keys)];
}

let apiKeys = null;
/**
 * One Gemini TTS request: 24 kHz PCM for the text, or an error once every key is spent. A key that
 * has used up its day hands over to the next; a busy model is asked again after a wait.
 */
async function geminiAudio(text) {
  apiKeys ??= geminiKeys();
  for (let attempt = 1; apiKeys.length; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI.model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKeys[0], "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${GEMINI.style}\n\n${text}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI.name } } } } }),
    }).then((res) => res.json(), (e) => ({ error: { message: String(e) } }));
    const audio = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (audio) return { pcm: Buffer.from(audio.data, "base64"), rate: Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000) };
    const why = (r.error?.message ?? JSON.stringify(r)).slice(0, 110);
    if (/PerDay/.test(JSON.stringify(r.error?.details ?? "")) || r.error?.code === 400 || r.error?.code === 401 || r.error?.code === 403) {
      apiKeys.shift();
      console.warn(`  a key can't be used (${why}) — ${apiKeys.length} key(s) left`);
      attempt = 0;
    } else if (attempt >= 8) throw new Error(`Gemini gave no audio: ${why}`);
    else {
      console.warn(`  ${why} — again in ${10 * attempt} s`);
      await sleep(10_000 * attempt);
    }
  }
  throw new Error("every Gemini key is out of requests for today — finished lines are kept; run this again tomorrow or add a key from another project to GEMINI_TTS_KEYS");
}

const pcmWav = (pcm, rate) => {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVEfmt ", 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
};

/** Gemini TTS, one request per line: every line a clean take of its own, saved as soon as it arrives. */
async function speakGemini(keys) {
  console.log(`Gemini TTS (${GEMINI.model}), voice "${GEMINI.name}": ${keys.length} line(s)…`);
  for (const [n, k] of keys.entries()) {
    const { pcm, rate } = await geminiAudio(lines[k].say);
    fs.writeFileSync(rawOf(k), pcmWav(pcm, rate));
    console.log(`[${n + 1}/${keys.length}] ${(pcm.length / 2 / rate).toFixed(1)} s  ${k}`);
  }
}

/**
 * Gemini TTS a few lines per request (`voice.batch`): one model and one take per block keeps the
 * voice the same from line to line, and a free key's ten requests a day are enough for a whole
 * tutorial. Each block is then cut into its lines at the longest pauses — in the middle of the
 * silence, with a short fade, so no line starts or ends on a click. Blocks are kept: a second run
 * only asks for the missing ones.
 */
async function speakGeminiBlocks(keys) {
  const apiKeys = geminiKeys();
  const all = Object.keys(lines);
  const wavOf = (pcm, rate) => {
    const head = Buffer.alloc(44);
    head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVEfmt ", 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([head, pcm]);
  };
  for (let from = 0, n = 0; from < all.length; from += GEMINI.batch, n++) {
    const block = all.slice(from, from + GEMINI.batch);
    if (!block.some((k) => keys.includes(k))) continue;
    const id = crypto.createHash("sha1").update(`${GEMINI.model}|${GEMINI.name}|${GEMINI.style}|${block.map((k) => `${takes[k] ?? 0}|${lines[k].say}`).join("|")}`).digest("hex").slice(0, 10);
    const file = path.join(dir, `_block${n}-${id}.wav`);
    if (!fs.existsSync(file)) {
      let audio = null, why = "";
      // A key that has used up its day hands over to the next one.
      while (!audio && apiKeys.length) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI.model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": apiKeys[0], "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: `${GEMINI.style}\n\n${block.map((k) => lines[k].say).join("\n\n")}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI.name } } } } }),
        }).then((res) => res.json(), (e) => ({ error: { message: String(e) } }));
        audio = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData ?? null;
        if (audio) break;
        why = (r.error?.message ?? JSON.stringify(r)).slice(0, 160);
        if (r.error?.code === 429 && /PerDay/.test(JSON.stringify(r.error.details ?? ""))) {
          apiKeys.shift();
          console.warn(`  a key is out of requests for today — ${apiKeys.length} key(s) left`);
        } else if (r.error?.code === 429) await sleep(30_000);
        else break;
      }
      if (!audio) throw new Error(`Gemini gave no audio for block ${n + 1} (${block[0]}…): ${why} — finished blocks are kept, run this again later`);
      fs.writeFileSync(file, wavOf(Buffer.from(audio.data, "base64"), Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000)));
    }
    // The block's pauses: runs of quiet 10 ms frames.
    const b = fs.readFileSync(file);
    const rate = b.readUInt32LE(24);
    const pcm = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + 44 + ((b.length - 44) & ~1)));
    const hop = rate / 100;
    const level = [];
    for (let i = 0; i + hop <= pcm.length; i += hop) {
      let sum = 0;
      for (let j = i; j < i + hop; j++) sum += pcm[j] * pcm[j];
      level.push(Math.sqrt(sum / hop));
    }
    const quiet = [...level].sort((x, y) => x - y)[Math.floor(level.length * 0.95)] * 0.04;
    const pauses = [];
    for (let i = 0; i < level.length; ) {
      if (level[i] > quiet) { i++; continue; }
      let e = i;
      while (e < level.length && level[e] <= quiet) e++;
      if (i > 20 && e < level.length - 20 && e - i >= 18) pauses.push({ at: (i + e) / 2, len: e - i });
      i = e;
    }
    // Which pauses end the lines: the set that keeps every line as long as its share of the text
    // says (speech runs at an even pace), preferring the longer pauses — found by dynamic programming.
    const chars = block.map((k) => lines[k].say.length), total = chars.reduce((x, y) => x + y, 0);
    const N = block.length, P = pauses.length;
    if (P < N - 1) throw new Error(`block ${n + 1}: only ${P} pauses for ${N} lines — give it another take`);
    const cost = (from, to, i) => ((to - from) / level.length - chars[i] / total) ** 2 * 400;
    // best[i][p]: lines 0..i end at pause p.
    let best = pauses.map((p) => ({ c: cost(0, p.at, 0) - p.len / 400, prev: -1 }));
    const back = [best];
    for (let i = 1; i < N - 1; i++) {
      const next = pauses.map((p, j) => {
        let c = Infinity, prev = -1;
        for (let q = 0; q < j; q++) {
          const v = best[q].c + cost(pauses[q].at, p.at, i);
          if (v < c) [c, prev] = [v, q];
        }
        return { c: c - p.len / 400, prev };
      });
      back.push(next);
      best = next;
    }
    let end = 0;
    best.forEach((x, j) => {
      const v = x.c + cost(pauses[j].at, level.length, N - 1);
      if (v < best[end].c + cost(pauses[end].at, level.length, N - 1)) end = j;
    });
    const cuts = [];
    for (let i = N - 2, j = end; i >= 0; j = back[i][j].prev, i--) cuts.unshift(pauses[j]);
    const edges = [0, ...cuts.map((c) => Math.round(c.at * hop)), pcm.length];
    console.log(`[block ${n + 1}] ${(pcm.length / rate).toFixed(1)} s  ${block.map((k, i) => `${k} ${((edges[i + 1] - edges[i]) / rate).toFixed(1)}s`).join(", ")}  (pauses ${cuts.map((c) => (c.len / 100).toFixed(2)).join("\n\n")})`);
    block.forEach((k, i) => {
      const part = pcm.slice(edges[i], edges[i + 1]);
      const fade = Math.min(Math.round(rate * 0.03), part.length >> 1);
      for (let j = 0; j < fade; j++) {
        part[j] = (part[j] * j) / fade;
        part[part.length - 1 - j] = (part[part.length - 1 - j] * j) / fade;
      }
      fs.writeFileSync(rawOf(k), wavOf(Buffer.from(part.buffer, part.byteOffset, part.byteLength), rate));
    });
  }
}

async function speak(keys) {
  if (!keys.length) return;
  if (GEMINI) return GEMINI.batch ? speakGeminiBlocks(keys) : speakGemini(keys);
  console.log(`Chatterbox Turbo, voice "${VOICE}": ${keys.length} line(s)…`);
  const job = path.join(dir, "_job.json");
  fs.writeFileSync(job, JSON.stringify({ model: slash(MODEL), voice: slash(voiceWav), cond: slash(cond), lm: LM, temperature: TEMPERATURE, lines: keys.map((key) => ({ text: lines[key].say, out: slash(rawOf(key)), seed: seedOf(key) })) }));
  // The model skips lines it has already written, so a run that died carries on where it stopped;
  // it only gives up after several runs in a row that didn't finish a single line.
  const left = () => keys.filter((key) => !fs.existsSync(rawOf(key))).length;
  for (let stuck = 0, before = left(); before > 0; ) {
    const ok = await stubborn("the voice model", PYTHON, [path.join(import.meta.dirname, "tts_chatterbox.py"), job], 1);
    const now = left();
    if (ok && now > 0) throw new Error("the voice model ended without speaking every line");
    stuck = now < before ? 0 : stuck + 1;
    if (stuck >= 5) throw new Error("the voice model keeps failing — out of memory? Close other programs and run this again; finished lines are kept.");
    before = now;
    if (now > 0) await sleep(15_000 * (stuck + 1));
  }
}

/** Trims the silent ends (keeping a breath of room), resamples; returns the line's length in seconds. */
function finish(key) {
  const wav = path.join(dir, `${key}.wav`);
  ffmpeg(["-i", rawOf(key), "-af", "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.1,areverse", "-ar", String(RATE), "-ac", "1", "-c:a", "pcm_s16le", wav]);
  return (fs.statSync(wav).size - 44) / 2 / RATE;
}

// --- The Whisper check -------------------------------------------------------------------------------

const words = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
/** Roughly the syllables of a line: its groups of vowels. */
const syllables = (s) => words(s).reduce((n, w) => n + Math.max(1, (w.match(/[aeiouy]+/g) ?? []).length), 0);
/** Share of the line's words Whisper heard differently (word-level edit distance). */
function wordErrors(said, heard) {
  const a = words(said), b = words(heard);
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] / Math.max(1, a.length);
}

/** What Whisper hears in each of these lines ({ key: text }); a line it couldn't get to is missing. */
async function listen(keys) {
  const heard = {};
  // Whisper's small English model can't follow Tamil: those lines go unchecked.
  if (!keys.length || process.env.LISTEN === "0" || GEMINI) return heard;
  const out = path.join(dir, "_heard.json");
  for (let from = 0; from < keys.length; from += 6) {
    const batch = keys.slice(from, from + 6);
    fs.rmSync(out, { force: true });
    if (!(await stubborn("the listening check", process.execPath, [path.join(import.meta.dirname, "listen.mjs"), out, ...batch.map((key) => path.join(dir, `${key}.wav`))], 3))) continue;
    const texts = JSON.parse(fs.readFileSync(out, "utf8"));
    batch.forEach((key, i) => texts[i] != null && (heard[key] = texts[i]));
  }
  return heard;
}

// --- Speak, check, retake ----------------------------------------------------------------------------

/** ONLY=intro-1,floor-2 speaks just those lines — for trying a voice without writing voice.json. */
const only = process.env.ONLY?.split(",");
const keys = Object.keys(lines).filter((key) => !only || only.includes(key));
const reportFile = path.join(dir, "report.json");
// What the last run found: lines whose audio hasn't changed since aren't listened to again.
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : {};
let todo = keys.filter((key) => !fs.existsSync(rawOf(key)));
for (let round = 0; round < 4; round++) {
  await speak(todo);
  const seconds = Object.fromEntries(keys.map((key) => [key, finish(key)]));
  const unheard = keys.filter((key) => report[key]?.audio !== hash(key) || report[key].heard == null);
  const heard = await listen(unheard);
  const bad = [];
  for (const key of keys) {
    const text = key in heard ? heard[key] : report[key]?.audio === hash(key) ? report[key].heard : null;
    const errors = text == null ? 0 : wordErrors(lines[key].say, text);
    const pace = seconds[key] / syllables(lines[key].say);
    // Off: a third of the words wrong, or far too fast or slow to be the whole sentence, cleanly said.
    const off = !GEMINI && (errors > 0.3 || pace > 0.42 || pace < 0.13);
    report[key] = { audio: hash(key), seconds: +seconds[key].toFixed(3), heard: text ?? null, errors: +errors.toFixed(2), pace: +pace.toFixed(3), take: takes[key] ?? 0, off };
    if (off && (takes[key] ?? 0) < 5) bad.push(key);
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
  if (!bad.length || round === 3) break;
  console.log(`\nAnother take for: ${bad.join(", ")}`);
  for (const key of bad) takes[key] = (takes[key] ?? 0) + 1;
  saveTakes();
  todo = bad;
}

if (!only) fs.writeFileSync(path.join(dir, "voice.json"), JSON.stringify(keys.map((key) => ({ key, file: `vo/${key}.wav`, seconds: report[key].seconds })), null, 1));
let total = 0;
for (const key of keys) {
  const r = report[key];
  total += r.seconds;
  console.log(`${key.padEnd(11)} ${r.seconds.toFixed(1).padStart(5)} s  take ${r.take}  ${r.heard == null ? "  not checked" : `${Math.round((1 - r.errors) * 100)}%`.padStart(4)}${r.off ? "  !! CHECK" : ""}${r.heard != null && r.errors > 0.12 ? `\n            heard: ${r.heard}` : ""}`);
}
console.log(`${keys.length} lines, ${total.toFixed(1)} s of speech`);
