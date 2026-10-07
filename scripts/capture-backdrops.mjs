#!/usr/bin/env node
/**
 * Captures each game's loading-screen backdrop from the game itself, in full quality:
 *   public/games/<slug>/backdrop-wide-{1920,2560}.webp   2560×1440 render (desktops, phones held sideways)
 *   public/games/<slug>/backdrop-tall-1170.webp          1170×2532 render (phones held upright)
 *   src/data/game-backdrops.json                         the games that have them (read by the loading screen)
 * The game runs in headless Chrome on the real GPU with every button and menu hidden, at one CSS pixel
 * per image pixel, so games that cap their pixel ratio still render at full size.
 *
 *   npm run dev                                      (in another terminal)
 *   node scripts/capture-backdrops.mjs [slug …]      default: every game with a cover
 *
 * Env: BASE (default http://localhost:3000), CHROME (path to Chrome). One game at a time, and it waits
 * while free memory is low (this PC has little to spare).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = path.join(ROOT, "public", "games");
const LIST = path.join(ROOT, "src", "data", "game-backdrops.json");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335;

/** Rendered size, and the widths saved from it. */
const SHOTS = [
  { name: "wide", width: 2560, height: 1440, widths: [1920, 2560] },
  { name: "tall", width: 1170, height: 2532, widths: [1170] },
];

/**
 * Per game (or per game and shot, under `wide` / `tall`): `init` runs before the page's own scripts
 * (seed a save), `script` once the game is up (start a round, move the camera…), then `wait` seconds
 * before the shot. Default: the scene the game opens on.
 */
const PREP = {
  // A new player's menu shows the first level, a lone plank: unlock every castle so it opens on the
  // last one played, the Crown Citadel at sunset.
  "siege-smash": {
    init: `localStorage.setItem("siege-smash:v1", JSON.stringify({ stars: Array(14).fill(3), best: [], last: 13, plays: 1 }))`,
  },
  // Upright, the menu camera lifts the kart into a corner: start a race, skip the fly-over and shoot
  // the chase camera on the grid during the countdown.
  "turbo-karts": {
    tall: {
      script: `(async () => {
        const enter = () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        enter();
        await new Promise((r) => setTimeout(r, 2000));
        enter();
      })()`,
      wait: 1.6,
    },
  },
  // Upright, the menu camera shows a small island far off: start a round (Enter) and zoom in.
  "hex-haven": {
    tall: {
      script: `(async () => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await new Promise((r) => setTimeout(r, 2500));
        const canvas = document.querySelector("canvas");
        for (let i = 0; i < 4; i++) canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -150, bubbles: true, cancelable: true }));
      })()`,
      wait: 4,
    },
  },
  // A fresh browser is a brand-new player with a bare village: show a big campaign village instead
  // (the dev server exposes the engine as __kc; one warrior is enough to open the raid).
  "kingdom-clash": {
    script: `(() => { const kc = window.__kc; kc.raidArmy = () => ({ troops: [{ kind: "warrior", level: 1, count: 1 }], spells: [] }); kc.startRaid(70); })()`,
    wait: 5,
  },
};

/** Everything but the 3D view (the largest canvas) disappears: buttons, menus, mini-maps, the dev-mode badge. */
const HIDE_UI = `(() => {
  const area = (c) => c.clientWidth * c.clientHeight;
  const view = [...document.querySelectorAll("canvas")].sort((a, b) => area(b) - area(a))[0];
  view.dataset.backdrop = "";
  const s = document.createElement("style");
  s.textContent = "body *{visibility:hidden!important} canvas[data-backdrop]{visibility:visible!important} nextjs-portal{display:none!important}";
  document.head.append(s);
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal Chrome DevTools Protocol client over one page. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
  return { send, evaluate, close: () => ws.close() };
}

async function waitForMemory() {
  for (let i = 0; os.freemem() < 450 * 1024 * 1024; i++) {
    if (i === 0) console.log(`  waiting: only ${Math.round(os.freemem() / 1024 / 1024)} MB free`);
    if (i > 60) throw new Error("Not enough free memory — close something and run again.");
    await sleep(2000);
  }
}

async function capture(page, slug, shot) {
  await waitForMemory();
  const prep = PREP[slug]?.[shot.name] ?? PREP[slug];
  await page.send("Emulation.setDeviceMetricsOverride", { width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: false });
  const init = prep?.init ? await page.send("Page.addScriptToEvaluateOnNewDocument", { source: prep.init }) : null;
  await page.send("Page.navigate", { url: `${BASE}/games/${slug}/play/` });
  await sleep(1500);
  // The loading screen leaves the page once the game is up.
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!document.querySelector("canvas") && !document.querySelector(".lg")`))) {
    if (Date.now() > deadline) throw new Error(`${slug} did not finish loading`);
    await sleep(500);
  }
  if (prep?.script) await page.evaluate(prep.script);
  await sleep((prep?.wait ?? 4) * 1000);
  await page.evaluate(HIDE_UI);
  await sleep(600);
  const { data } = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const png = Buffer.from(data, "base64");
  for (const width of shot.widths) {
    const file = path.join(GAMES, slug, `backdrop-${shot.name}-${width}.webp`);
    await sharp(png).resize({ width }).webp({ quality: 86, effort: 6, smartSubsample: true }).toFile(file);
    console.log(`  ${path.relative(ROOT, file)}  ${Math.round(fs.statSync(file).size / 1024)} KB`);
  }
  if (init) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: init.identifier });
  await page.send("Page.navigate", { url: "about:blank" });
  await sleep(1000);
}

const slugs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(GAMES).filter((s) => fs.existsSync(path.join(GAMES, s, "cover.webp")));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "backdrops-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let failed = 0;
try {
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null);
  }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  // Games pause when they lose focus: a headless page never has it otherwise.
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  for (const slug of slugs) {
    console.log(slug);
    for (const shot of SHOTS) {
      try {
        await capture(page, slug, shot);
      } catch (err) {
        failed++;
        console.error(`  ${shot.name}: ${err.message}`);
      }
    }
  }
  page.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

// The loading screen only asks for backdrops that exist.
const have = fs
  .readdirSync(GAMES)
  .filter((s) => SHOTS.every((shot) => shot.widths.every((w) => fs.existsSync(path.join(GAMES, s, `backdrop-${shot.name}-${w}.webp`)))))
  .sort();
fs.writeFileSync(LIST, `${JSON.stringify(have, null, 2)}\n`);
console.log(`${path.relative(ROOT, LIST)}: ${have.length} games${failed ? ` — ${failed} shot(s) failed` : ""}`);
process.exit(failed ? 1 : 0);
