/**
 * Shared helpers for the site promo video (scripts/promo/*): paths, ffmpeg, headless Chrome with a
 * virtual clock, and easing.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
/** Everything the promo makes lives here (git-ignored): raw/ captures, work/ files, the final video. */
export const PROMO = path.join(ROOT, "promo");
export const RAW = path.join(PROMO, "raw");
export const WORK = path.join(PROMO, "work");
export const SITE = process.env.SITE ?? "https://models.codelove.in";
export const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const FFMPEG = process.env.FFMPEG ?? "E:/Gowtham-Live/CodeLove Websites/video-automate/node_modules/ffmpeg-static/ffmpeg.exe";
export const FPS = 60;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const easeInOut = (x) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const lerp = (a, b, k) => a + (b - a) * k;

export function ffmpeg(args, opts = {}) {
  const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 300)}\n${r.stderr ?? ""}`);
  return r;
}

/** Length of a media file in seconds. */
export function duration(file) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

export function freeMB() {
  return Math.round(os.freemem() / 1024 / 1024);
}

/**
 * Virtual clock for the page: requestAnimationFrame and performance.now only move when the recorder
 * steps them, and every CSS animation / transition is paused and seeked to the virtual time, so each
 * captured frame is exactly 1/60 s after the last however long the capture takes.
 */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [], ids = 0;
  const born = new WeakMap();
  const syncCss = () => {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) { born.set(a, now); try { a.pause(); } catch {} }
      try { a.currentTime = now - born.get(a); } catch {}
    }
  };
  window.__vt = {
    get on() { return on; },
    get now() { return now; },
    start() { on = true; now = realNow(); syncCss(); },
    step(ms) {
      now += ms;
      const q = queue; queue = [];
      for (const [, cb] of q) { try { cb(now); } catch (e) { console.error(e); } }
      syncCss();
    },
  };
  window.requestAnimationFrame = (cb) => { if (!on) return raf(cb); queue.push([++ids, cb]); return ids; };
  window.cancelAnimationFrame = (id) => { if (!on) return caf(id); queue = queue.filter(([i]) => i !== id); };
  performance.now = () => (on ? now : realNow());
  // UI timers (≥ 100 ms: "Copied" labels, toasts, debounces) run on the virtual clock too; short ones
  // stay real so loaders and schedulers never wait for the next frame.
  const st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  const timers = new Map();
  let tid = 1e7;
  window.setTimeout = (fn, d, ...a) => { if (!on || !(d >= 100) || typeof fn !== "function") return st(fn, d, ...a); timers.set(++tid, { due: now + d, fn, a }); return tid; };
  window.clearTimeout = (id) => { if (!timers.delete(id)) ct(id); };
  window.setInterval = (fn, d, ...a) => { if (!on || !(d >= 100) || typeof fn !== "function") return si(fn, d, ...a); timers.set(++tid, { due: now + d, fn, a, every: d }); return tid; };
  window.clearInterval = (id) => { if (!timers.delete(id)) ci(id); };
  const fire = () => {
    for (;;) {
      let next = null;
      for (const [id, tm] of timers) if (tm.due <= now && (!next || tm.due < next[1].due)) next = [id, tm];
      if (!next) return;
      const [id, tm] = next;
      if (tm.every) tm.due += tm.every; else timers.delete(id);
      try { tm.fn(...tm.a); } catch (e) { console.error(e); }
    }
  };
  const step = window.__vt.step;
  window.__vt.step = (ms) => { step(ms); fire(); };
})()`;

/** A fake mouse pointer (headless screenshots have none) plus a click ripple, drawn above the page. */
const POINTER = `(() => {
  const make = () => {
    if (document.getElementById("promo-pointer")) return;
    const css = document.createElement("style");
    css.textContent = \`
      html { scroll-behavior: auto !important; }
      #promo-pointer { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 30px; height: 30px; will-change: transform; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .45)); }
      #promo-ripple { position: fixed; left: 0; top: 0; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #a78bfa; background: rgb(167 139 250 / .25); opacity: 0; }
    \`;
    document.head.append(css);
    const p = document.createElement("div");
    p.id = "promo-pointer";
    p.innerHTML = '<svg viewBox="0 0 26 26" width="30" height="30"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.6 14.6 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    p.style.opacity = "0";
    const r = document.createElement("div");
    r.id = "promo-ripple";
    document.documentElement.append(p, r);
  };
  window.__pointer = {
    set(x, y, visible, press, ripple) {
      make();
      const p = document.getElementById("promo-pointer");
      p.style.opacity = visible ? "1" : "0";
      p.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px) scale(" + (press ? 0.86 : 1) + ")";
      const r = document.getElementById("promo-ripple");
      if (ripple && ripple.k < 1) {
        r.style.left = ripple.x + "px"; r.style.top = ripple.y + "px";
        r.style.opacity = String(1 - ripple.k);
        r.style.transform = "scale(" + (0.3 + ripple.k * 1.1) + ")";
      } else r.style.opacity = "0";
    },
  };
})()`;

/** Launches headless Chrome (fresh profile) and opens one page at width×height CSS px × dpr. */
export async function openBrowser({ width = 1280, height = 720, dpr = 1.5, virtual = true, pointer = true } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "promo-chrome-"));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: profile,
    protocolTimeout: 0,
    defaultViewport: null,
    args: ["--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--disable-features=Translate", `--window-size=${width},${height}`],
  });
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  const cdp = await page.createCDPSession();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  // Screenshots go through this session, and device metrics are per session: set them here too.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
  // Keep the recorder's visits out of the site's analytics.
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: ["*google-analytics.com*", "*googletagmanager.com*", "*firebaselogging*", "*firebaseinstallations*", "*analytics.google.com*"] });
  if (virtual) await page.evaluateOnNewDocument(VIRTUAL_TIME);
  if (pointer) await page.evaluateOnNewDocument(POINTER);
  page.on("pageerror", (e) => console.error("  page error:", String(e.message ?? e).split("\n")[0]));
  const close = async () => {
    await browser.close().catch(() => {});
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  };
  return { browser, page, cdp, close };
}

/** One frame as JPEG bytes (fromSurface so WebGL canvases are included). */
export async function grab(cdp, quality = 92) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality, fromSurface: true, optimizeForSpeed: true });
  return Buffer.from(data, "base64");
}

/** Waits (in real time, the virtual clock stands still) until every image on screen has loaded. */
export async function settleImages(page, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const pending = await page.evaluate(() => {
      const vh = innerHeight, vw = innerWidth;
      return [...document.images].filter((img) => {
        if (img.complete) return false;
        const r = img.getBoundingClientRect();
        return r.bottom > -200 && r.top < vh + 200 && r.right > 0 && r.left < vw && r.width > 0;
      }).length;
    });
    if (!pending) return true;
    await sleep(60);
  }
  return false;
}
