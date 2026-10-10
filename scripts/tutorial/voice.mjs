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
const { lines } = await loadTutorial(id);
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

const hash = (key) => crypto.createHash("sha1").update(`${VOICE}|${LM}|${TEMPERATURE}|${takes[key] ?? 0}|${lines[key].say}`).digest("hex").slice(0, 10);
const rawOf = (key) => path.join(dir, `${key}-${hash(key)}.raw.wav`);
const seedOf = (key) => parseInt(crypto.createHash("sha1").update(`${key}|${takes[key] ?? 0}`).digest("hex").slice(0, 8), 16);

// The reference clip as the model wants it (24 kHz mono), and its conditioning, worked out once per voice.
const voiceWav = path.join(dir, `_${VOICE}-24k.wav`);
if (!fs.existsSync(voiceWav)) ffmpeg(["-i", path.join(TOOLS, "tts", "voices", `${VOICE}.wav`), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", voiceWav]);
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

async function speak(keys) {
  if (!keys.length) return;
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
  if (!keys.length || process.env.LISTEN === "0") return heard;
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
    const off = errors > 0.3 || pace > 0.42 || pace < 0.13;
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
