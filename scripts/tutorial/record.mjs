#!/usr/bin/env node
/**
 * Records a tutorial from the live builder, frame by frame on a virtual clock (each frame is exactly
 * 1/30 s of page time, however long it takes to draw), paced by the narration's line lengths:
 *   promo/tutorials/<id>/capture.mp4     1920×1080, 30 fps, no sound yet
 *   promo/tutorials/<id>/timeline.json   when every line, chapter, click and key press happens
 *
 *   node scripts/tutorial/record.mjs haunted-backyard
 *
 * Test runs (stills into promo/tutorials/<id>/preview/, one per second, small):
 *   PREVIEW=1 FPS=10 node scripts/tutorial/record.mjs haunted-backyard
 *   PREVIEW=1 FPS=10 FROM="STEP 5" UNTIL="STEP 7" node scripts/tutorial/record.mjs haunted-backyard
 *
 * Run voice.mjs first; without it the lines' lengths are guessed from their word counts.
 */
import fs from "node:fs";
import path from "node:path";
import { DPR, Director, FPS, HEIGHT, PAGE, SITE, Stop, WIDTH, clock, loadTutorial, openBrowser, sleep, stillsSink, videoSink, workDir } from "./lib.mjs";

const id = process.argv[2];
const tutorial = await loadTutorial(id);
const dir = workDir(id);
const PREVIEW = !!process.env.PREVIEW;
fs.mkdirSync(dir, { recursive: true });

// How long each line takes to say.
const voiceFile = path.join(dir, "vo", "voice.json");
const voice = {};
if (fs.existsSync(voiceFile)) for (const v of JSON.parse(fs.readFileSync(voiceFile, "utf8"))) voice[v.key] = v;
for (const [key, line] of Object.entries(tutorial.lines)) {
  if (voice[key]) continue;
  if (!PREVIEW) throw new Error(`no voice for "${key}" — run voice.mjs first`);
  voice[key] = { key, seconds: 0.6 + line.say.split(/\s+/).length * 0.34 };
}

const sink = PREVIEW ? stillsSink(path.join(dir, "preview"), Math.round(FPS * Number(process.env.EVERY ?? 1))) : videoSink(path.join(dir, "capture.mp4"));
const { page, cdp, close } = await openBrowser({ width: WIDTH, height: HEIGHT, dpr: PREVIEW ? 0.6 : DPR });
let failed = null;
try {
  await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
  await page.evaluateOnNewDocument(PAGE);
  if (tutorial.before) await page.evaluateOnNewDocument(tutorial.before);
  const director = new Director({ page, cdp, voice, sink: (shoot, n) => sink.write(shoot, n), parts: new Map(), quality: PREVIEW ? 72 : 93 });

  console.log(`${SITE}${tutorial.meta.route}  ${Math.round(WIDTH * (PREVIEW ? 0.6 : DPR))}×${Math.round(HEIGHT * (PREVIEW ? 0.6 : DPR))}, ${FPS} fps${PREVIEW ? " (preview)" : ""}`);
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(SITE + tutorial.meta.route, { waitUntil: "networkidle2", timeout: 120_000 });
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn(`  ${e.message.split("\n")[0]} — retrying`);
      await sleep(4000 * attempt);
    }
  }
  if (!(await director.poll("__tut.ready()", 90_000))) throw new Error("the builder didn't start");
  // Every part of the opening scene on screen before the first frame.
  if (!(await director.poll("__tut.loaded(__tut.ids())", 120_000))) console.warn("  some models of the opening scene are still loading");
  for (const [partId, title, collection] of await page.evaluate(`fetch("/data/parts.json").then((r) => r.json()).then((j) => j.parts.map((p) => [p.id, p.title, (j.collections[p.c] || {}).name || p.c]))`)) {
    director.parts.set(partId, { title, collection });
  }
  await sleep(1500);
  await director.settle();

  // Virtual clock on; a second of page time before the first frame (entrance animations finish).
  await page.evaluate("__vt.start()");
  for (let i = 0; i < FPS; i++) await page.evaluate(`__vt.step(${1000 / FPS})`);

  try {
    await tutorial.run(director);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.log(`  stopped at ${process.env.UNTIL}`);
  }
  const seconds = director.t;
  fs.writeFileSync(path.join(dir, PREVIEW ? "timeline.preview.json" : "timeline.json"), JSON.stringify({ fps: FPS, frames: director.n, seconds: +seconds.toFixed(3), ...director.timeline }, null, 1));
  console.log(`${clock(seconds)} (${director.n} frames) in ${((Date.now() - director.started) / 60000).toFixed(1)} min`);
  for (const c of director.timeline.chapters) console.log(`  ${clock(c.t).padStart(5)}  ${c.label}`);
} catch (e) {
  failed = e;
} finally {
  await sink.close().catch((e) => (failed ??= e));
  await close();
}
if (failed) throw failed;
