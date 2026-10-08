#!/usr/bin/env node
/**
 * Records the raw screen captures for the promo from the live site, frame by frame on a virtual clock
 * (each frame is exactly 1/60 s of page time, however slow the capture), at 2560×1440:
 *   promo/raw/<shot>.mp4                 the raw capture (kept for editing elsewhere)
 *   promo/work/frames/<shot>/NNNNN.jpg   the same frames, read by compose.mjs
 *   promo/work/frames/<shot>/events.json clicks and key presses (for the sound effects)
 *
 *   node scripts/promo/capture.mjs [shot…]          all shots, or only the named ones (e.g. 01-home)
 *   PREVIEW=1 node scripts/promo/capture.mjs 01-home  every 12th frame, small, into promo/work/preview
 *
 * While the page loads something (network, images, a 3D model) the clock stands still, so no frame
 * shows a half-loaded page. A drawn pointer stands in for the mouse; real mouse/keyboard events are
 * sent with it, so hovers, clicks and typing are the site's own.
 */
import fs from "node:fs";
import path from "node:path";
import { FPS, RAW, SITE, WORK, easeInOut, ffmpeg, freeMB, grab, lerp, openBrowser, sleep } from "./lib.mjs";
import { SHOTS, LEAD, TAIL } from "./shots.mjs";
import { scenes } from "./storyboard.mjs";

const PREVIEW = !!process.env.PREVIEW;
const only = process.argv.slice(2);
const todo = SHOTS.filter((s) => !only.length || only.includes(s.name));
if (!todo.length) throw new Error(`no shot named ${only.join(", ")} — shots: ${SHOTS.map((s) => s.name).join(", ")}`);

/** Viewport point of a target: {x, y} as is, or the centre of an element (+ fx/fy fractions, dx/dy px). */
const RESOLVE = `(t) => {
  if (t.x !== undefined && !t.sel && !t.text) return { x: t.x, y: t.y };
  let els = [...document.querySelectorAll(t.sel || "button, a, [role=option], [role=radio], [role=tab], input")];
  if (t.text) els = els.filter((e) => (t.exact ? e.textContent.trim() === t.text : e.textContent.trim().startsWith(t.text)));
  if (t.label) els = els.filter((e) => (e.getAttribute("aria-label") || "").includes(t.label));
  els = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const e = els[t.idx ?? 0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width * (t.fx ?? 0.5) + (t.dx ?? 0), y: r.top + r.height * (t.fy ?? 0.5) + (t.dy ?? 0), top: r.top + scrollY };
}`;

async function record(shot) {
  const scene = scenes.find((s) => s.id === shot.scene);
  const dur = scene.dur + LEAD + TAIL;
  const frames = Math.round(dur * FPS);
  const dir = path.join(PREVIEW ? path.join(WORK, "preview") : path.join(WORK, "frames"), shot.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { width = 1280, height = 720 } = shot;
  const dpr = PREVIEW ? 1 : 2560 / width;
  console.log(`\n${shot.name}: ${SITE}${shot.route}  ${frames} frames (${dur.toFixed(1)} s), ${Math.round(width * dpr)}×${Math.round(height * dpr)}, free RAM ${freeMB()} MB`);
  const { page, cdp, close } = await openBrowser({ width, height, dpr });
  try {
    // Requests in flight (the clock waits for them).
    const inflight = new Map();
    let lastDone = 0;
    cdp.on("Network.requestWillBeSent", (e) => {
      if (/^(data|blob):/.test(e.request.url) || e.type === "EventSource" || e.type === "WebSocket") return;
      inflight.set(e.requestId, Date.now());
    });
    const done = (e) => {
      if (inflight.delete(e.requestId)) lastDone = Date.now();
    };
    cdp.on("Network.loadingFinished", done);
    cdp.on("Network.loadingFailed", done);
    await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
    if (shot.before) await page.evaluateOnNewDocument(shot.before);

    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(SITE + shot.route, { waitUntil: "networkidle2", timeout: 120_000 });
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.warn(`  ${e.message.split("\n")[0]} — retrying`);
        await sleep(4000 * attempt);
      }
    }
    if (shot.setup) await shot.setup(page);
    await waitFor(page, shot.ready, 60_000);
    if (shot.warm) await page.evaluate(shot.warm).catch((e) => console.warn("  warm-up:", e.message));
    await sleep(1500);

    // Network: wait up to 15 s. Images / the shot's own check: up to 2 s, since some loaders (a spinner
    // that clears once the 3D canvas has drawn) need frames to finish and would never settle otherwise.
    const settle = async () => {
      const start = Date.now();
      for (;;) {
        for (const [id, at] of inflight) if (Date.now() - at > 20_000) inflight.delete(id);
        const busy = inflight.size > 0 || Date.now() - lastDone < 150;
        if (busy) {
          if (Date.now() - start > 15_000) return console.warn(`  still loading after 15 s (${inflight.size} requests) — going on`);
        } else {
          if (!(await page.evaluate(PENDING, shot.ready ?? null))) return;
          if (Date.now() - start > 2_000) return;
        }
        await sleep(40);
      }
    };

    // Virtual clock on; a second of page time before the first frame (entrance animations finish).
    await page.evaluate("__vt.start()");
    for (let i = 0; i < 60; i++) await page.evaluate("__vt.step(1000/60)");

    const resolve = (target) => page.evaluate(`(${RESOLVE})(${JSON.stringify(target)})`);
    const events = [];
    const steps = shot.steps.map((s) => ({ ...s, fired: false }));
    let cursor = { ...(shot.cursor ?? { x: width * 0.62, y: height * 0.55 }) };
    let shown = shot.cursorVisible ?? true;
    let moving = null, scrolling = null, dragging = null, ripple = null, down = false;
    let lastMouse = null;
    const t0 = Date.now();

    for (let n = 0; n < frames; n++) {
      const t = n / FPS - LEAD;
      // Start the steps that are due.
      for (const s of steps) {
        if (s.fired || s.at > t) continue;
        s.fired = true;
        if (s.move) {
          const to = await resolve(s.move.to);
          if (!to) console.warn(`  ${t.toFixed(2)} s: target not found`, JSON.stringify(s.move.to));
          moving = { from: { ...cursor }, target: s.move.to, to: to ?? cursor, t0: s.at, dur: s.move.dur ?? 0.6, track: s.move.track !== false };
        }
        if (s.show !== undefined) shown = s.show;
        if (s.scroll) {
          const y0 = await page.evaluate("scrollY");
          let y1 = s.scroll.to;
          if (typeof y1 === "object") y1 = Math.max(0, ((await resolve(y1))?.top ?? y0) + (s.scroll.to.offset ?? 0));
          scrolling = { y0, y1, t0: s.at, dur: s.scroll.dur ?? 1.5 };
        }
        if (s.click) {
          if (s.shift) await page.keyboard.down("Shift");
          await page.mouse.move(cursor.x, cursor.y);
          await page.mouse.down();
          down = true;
          ripple = { x: cursor.x, y: cursor.y, t0: s.at };
          events.push({ t: s.at, type: "click" });
          s.release = true;
        }
        if (s.drag) {
          await page.mouse.move(cursor.x, cursor.y);
          await page.mouse.down({ button: s.drag.button ?? "left" });
          dragging = { from: { ...cursor }, by: s.drag.by, t0: s.at, dur: s.drag.dur ?? 1, button: s.drag.button ?? "left" };
          events.push({ t: s.at, type: "drag" });
        }
        if (s.type) {
          const cps = s.cps ?? 13;
          [...s.type].forEach((ch, i) => steps.push({ at: s.at + i / cps, char: ch, fired: false }));
        }
        if (s.char) {
          await page.keyboard.type(s.char);
          events.push({ t: s.at, type: "key" });
        }
        if (s.key) {
          for (const k of s.key.split("+").slice(0, -1)) await page.keyboard.down(k);
          await page.keyboard.press(s.key.split("+").pop());
          for (const k of s.key.split("+").slice(0, -1).reverse()) await page.keyboard.up(k);
          events.push({ t: s.at, type: "key" });
        }
        if (s.run) await s.run(page);
      }
      // A click is released two frames later.
      for (const s of steps) {
        if (s.release && t >= s.at + 0.05) {
          s.release = false;
          await page.mouse.up();
          down = false;
          if (s.shift) await page.keyboard.up("Shift");
        }
      }
      if (moving) {
        const k = easeInOut((t - moving.t0) / moving.dur);
        if (moving.track && k < 1) moving.to = (await resolve(moving.target)) ?? moving.to;
        // A slight arc, as a hand moves.
        const dx = moving.to.x - moving.from.x, dy = moving.to.y - moving.from.y;
        const bow = Math.sin(Math.PI * k) * 0.08;
        cursor = { x: lerp(moving.from.x, moving.to.x, k) - dy * bow, y: lerp(moving.from.y, moving.to.y, k) + dx * bow };
        if (k >= 1) moving = null;
      }
      if (dragging) {
        const k = easeInOut((t - dragging.t0) / dragging.dur);
        cursor = { x: dragging.from.x + dragging.by[0] * k, y: dragging.from.y + dragging.by[1] * k };
        if (k >= 1) {
          await page.mouse.move(cursor.x, cursor.y);
          await page.mouse.up({ button: dragging.button });
          dragging = null;
        }
      }
      if (!lastMouse || Math.hypot(cursor.x - lastMouse.x, cursor.y - lastMouse.y) > 0.25) {
        await page.mouse.move(cursor.x, cursor.y);
        lastMouse = { ...cursor };
      }
      let scrollY = null;
      if (scrolling) {
        const k = easeInOut((t - scrolling.t0) / scrolling.dur);
        scrollY = lerp(scrolling.y0, scrolling.y1, k);
        if (k >= 1) scrolling = null;
      }
      const rk = ripple ? (t - ripple.t0) / 0.45 : 1;
      await page.evaluate(
        `(() => { ${scrollY !== null ? `scrollTo({ top: ${scrollY}, behavior: "instant" });` : ""} __pointer.set(${cursor.x}, ${cursor.y}, ${shown}, ${down}, ${ripple && rk < 1 ? JSON.stringify({ ...ripple, k: rk }) : "null"}); })()`,
      );
      await settle();
      await page.evaluate("__vt.step(1000/60)");
      if (PREVIEW && n % 12) continue;
      fs.writeFileSync(path.join(dir, `${String(n).padStart(5, "0")}.jpg`), await grab(cdp, PREVIEW ? 70 : 93));
      if (n % 120 === 0) console.log(`  ${n}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s  (free RAM ${freeMB()} MB)`);
    }
    fs.writeFileSync(path.join(dir, "events.json"), JSON.stringify({ lead: LEAD, events }));
  } finally {
    await close();
  }
  if (!PREVIEW) {
    fs.mkdirSync(RAW, { recursive: true });
    const out = path.join(RAW, `${shot.name}.mp4`);
    ffmpeg(["-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    console.log(`  → ${path.relative(process.cwd(), out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
  } else console.log(`  preview stills in ${dir}`);
}

/** Images on screen still loading, or the shot's own "not ready" check. */
const PENDING = (ready) => {
  const vh = innerHeight, vw = innerWidth;
  const imgs = [...document.images].filter((img) => {
    if (img.complete) return false;
    const r = img.getBoundingClientRect();
    return r.bottom > -100 && r.top < vh + 100 && r.right > 0 && r.left < vw && r.width > 0;
  }).length;
  if (imgs) return imgs;
  if (ready) return (0, eval)(ready) ? 0 : 1;
  return 0;
};

async function waitFor(page, ready, timeout) {
  if (!ready) return;
  const end = Date.now() + timeout;
  while (!(await page.evaluate(ready).catch(() => false))) {
    if (Date.now() > end) throw new Error(`page not ready: ${ready}`);
    await sleep(250);
  }
}

for (const shot of todo) await record(shot);
