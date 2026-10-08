/**
 * What each raw capture does on the live site, in seconds from its scene's start (storyboard.mjs).
 * Recording runs from -LEAD to the scene's end + TAIL, so cross-fades have frames on both sides.
 *
 * Steps: { at, move: { to: target, dur } } glides the pointer (a target is { x, y } or an element:
 * { sel, text, label, idx, fx, fy, dx, dy }); { at, click: true, shift? }; { at, type: "text", cps? };
 * { at, key: "Control+A" }; { at, scroll: { to: y | target + offset, dur } }; { at, drag: { by: [dx, dy], dur } };
 * { at, run: async (page) => … }.
 */
import path from "node:path";
import { ROOT } from "./lib.mjs";

export const LEAD = 0.5;
export const TAIL = 0.5;

/** True while a "Loading … N%" overlay shows N < 100 (the viewers keep it in the page, fading out, once loaded). */
const LOADING = `[...document.querySelectorAll("div, p, span")].some((e) => {
  const text = e.textContent.trim();
  const m = /^Loading .*?([0-9]+)%/.exec(text);
  if (text.length > 80 || !m || +m[1] >= 100) return false;
  for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false; }
  return true;
})`;

const tile = (title) => ({ sel: `button[title^="${title}"]` });
const canvas = (fx, fy) => ({ sel: "canvas", fx, fy });

/** An empty grass plot in daylight, opened as the builder's current project. */
const BUILDER_PROJECT = {
  format: "3d-models-scene",
  version: 1,
  name: "My campsite",
  environment: "day",
  ground: { kind: "grass", size: 60, y: 0 },
  camera: { position: [0.6, 3.1, 5.6], target: [0.2, 0.55, 0] },
  items: [],
};

let chooser = null;

export const SHOTS = [
  {
    name: "01-home",
    scene: "home",
    route: "/",
    ready: `!!document.querySelector('[aria-label="Featured characters"]') && !!document.querySelector("canvas") && !${LOADING}`,
    warm: `fetch("/library/bikes/cyberpunk-motorbike.glb").then((r) => r.arrayBuffer())`,
    cursor: { x: 860, y: 420 },
    steps: [
      { at: 0.3, move: { to: { sel: 'button[aria-label^="Show Cyberpunk"]' }, dur: 0.8 } },
      { at: 1.2, click: true },
      { at: 3.5, move: { to: { x: 700, y: 430 }, dur: 1.2, track: false } },
      { at: 3.5, scroll: { to: 560, dur: 2.2 } },
      { at: 6.0, scroll: { to: 1290, dur: 2.2 } },
      { at: 7.4, move: { to: { sel: 'a[href="/models/category/vehicles/"]', fy: 0.4 }, dur: 1.0 } },
    ],
  },
  {
    name: "02-models",
    scene: "models",
    route: "/models/",
    setup: async (page) => {
      // Load the search index now, so typing later never shows "Loading models…".
      await page.type('input[placeholder^="Search"]', "r");
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 30_000 }).catch(() => {});
      await page.click('input[placeholder^="Search"]', { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 30_000 }).catch(() => {});
      await page.evaluate(() => (document.activeElement)?.blur());
    },
    cursor: { x: 640, y: 250 },
    steps: [
      { at: 1.6, move: { to: { sel: "button[aria-pressed]", text: "Characters" }, dur: 0.75 } },
      { at: 2.45, click: true },
      { at: 2.75, move: { to: { sel: "button[aria-pressed]", text: "Animals" }, dur: 0.45 } },
      { at: 3.25, click: true },
      { at: 3.45, move: { to: { sel: "button[aria-pressed]", text: "Vehicles" }, dur: 0.45 } },
      { at: 3.95, click: true },
      { at: 4.15, move: { to: { sel: "button[aria-pressed]", text: "Space" }, dur: 0.5 } },
      { at: 4.7, click: true },
      { at: 5.0, move: { to: { sel: 'input[placeholder^="Search"]', fx: 0.35 }, dur: 0.55 } },
      { at: 5.6, click: true },
      { at: 5.8, type: "rocket", cps: 12 },
      { at: 6.9, move: { to: { x: 700, y: 520 }, dur: 1.0, track: false } },
      { at: 7.0, scroll: { to: 240, dur: 2.0 } },
    ],
  },
  {
    name: "03-character",
    scene: "character",
    route: "/models/business-female-01/",
    ready: `!!document.querySelector("canvas") && !${LOADING}`,
    cursor: { x: 560, y: 420 },
    steps: [
      { at: 0.3, move: { to: { sel: "button[aria-pressed]", text: "Wave", exact: true }, dur: 0.7 } },
      { at: 1.1, click: true },
      { at: 2.3, move: { to: { sel: "button[aria-pressed]", text: "Dance", exact: true }, dur: 0.6 } },
      { at: 3.0, click: true },
      { at: 3.6, move: { to: { x: 470, y: 380 }, dur: 0.6, track: false } },
      { at: 4.3, drag: { by: [170, 0], dur: 1.8 } },
    ],
  },
  {
    name: "04-customize",
    scene: "customize",
    route: "/models/car-kit-sedan-sports/#customize",
    ready: `!!document.querySelector('[role=dialog][aria-label^="Customize colors"] canvas') && !${LOADING}`,
    cursor: { x: 700, y: 430 },
    steps: [
      { at: 0.5, move: { to: { sel: "button", text: "Red", fx: 0.3 }, dur: 0.8 } },
      { at: 1.45, click: true },
      { at: 1.75, move: { to: { sel: 'button[aria-label="Use #1e3a8a"], button[aria-label^="Use #"]', label: "", idx: 12 }, dur: 0.5 } },
      { at: 2.3, click: true },
      { at: 2.6, move: { to: { sel: 'button[aria-label^="Use #"]', idx: 6 }, dur: 0.4 } },
      { at: 3.05, click: true },
      { at: 3.3, move: { to: { sel: 'button[aria-label^="Use #"]', idx: 14 }, dur: 0.4 } },
      { at: 3.75, click: true },
      { at: 4.0, move: { to: { sel: "button", text: "Download", fx: 0.42 }, dur: 0.6 } },
      { at: 4.75, click: true },
      { at: 5.1, move: { to: { x: 470, y: 330 }, dur: 0.6, track: false } },
      { at: 5.8, drag: { by: [-130, 0], dur: 2.0 } },
    ],
  },
  {
    name: "05-viewer",
    scene: "viewer",
    route: "/viewer/",
    cursor: { x: 760, y: 470 },
    ready: `!${LOADING} && !document.querySelector(".animate-spin")`,
    steps: [
      { at: 0.25, move: { to: { sel: "button", text: "Choose a file" }, dur: 0.65 } },
      { at: 0.9, run: async (page) => void (chooser = page.waitForFileChooser({ timeout: 20_000 })) },
      { at: 1.0, click: true },
      { at: 1.1, run: async () => (await chooser).accept([path.join(ROOT, "public/library/character-pack-skeletons/skeleton-warrior.glb")]) },
      { at: 1.45, scroll: { to: 262, dur: 1.1 } },
      { at: 1.4, move: { to: { x: 520, y: 400 }, dur: 0.8, track: false } },
      { at: 2.7, drag: { by: [110, 0], dur: 1.5 } },
      { at: 4.4, move: { to: { sel: "button[aria-pressed]", text: "1H_Melee_Attack_Slice_Diagonal" }, dur: 0.6 } },
      { at: 5.1, click: true },
    ],
  },
  {
    name: "06-developers",
    scene: "developers",
    route: "/developers/",
    cursor: { x: 760, y: 380 },
    steps: [
      { at: 0.35, scroll: { to: { sel: "h2", text: "The whole library", offset: -96 }, dur: 1.4 } },
      { at: 1.2, move: { to: { sel: "a", text: "/catalog.json", fx: 0.12 }, dur: 0.8 } },
      { at: 2.5, move: { to: { sel: "a", text: "/llms.txt", fx: 0.1 }, dur: 0.6 } },
      { at: 3.4, scroll: { to: { sel: "#ai", offset: -40 }, dur: 1.4 } },
      { at: 4.6, move: { to: { sel: "button", text: "Copy" }, dur: 0.6 } },
      { at: 5.35, click: true },
      { at: 5.9, scroll: { to: { sel: "#three", offset: -40 }, dur: 1.6 } },
      { at: 6.2, move: { to: { x: 820, y: 470 }, dur: 1.0, track: false } },
    ],
  },
  {
    name: "07-builder",
    scene: "builder",
    route: "/builder/",
    width: 1600,
    height: 900,
    before: `(() => {
      try {
        if (!localStorage.getItem("promo-seeded")) {
          localStorage.setItem("promo-seeded", "1");
          localStorage.setItem("scene-builder:current", JSON.stringify("promo1"));
          localStorage.setItem("scene-builder:project:promo1", ${JSON.stringify(JSON.stringify(BUILDER_PROJECT))});
          localStorage.setItem("scene-builder:projects", JSON.stringify([{ id: "promo1", name: "My campsite", updatedAt: Date.now(), items: 0 }]));
        }
      } catch {}
    })()`,
    ready: `(() => { const i = document.querySelector('input[aria-label="Search parts"]'); return !!i && i.placeholder.startsWith("Search") && !!document.querySelector("canvas"); })()`,
    setup: async (page) => {
      // Search the whole library, not just the Halloween kit the panel starts on.
      await page.click('button[aria-label^="Kit:"]');
      await page.waitForSelector("[role=option]");
      await page.evaluate(() => [...document.querySelectorAll("[role=option]")].find((o) => o.textContent.trim().startsWith("All kits"))?.click());
    },
    warm: `Promise.all(["/library/mini-forest/tent.glb", "/library/mini-forest/tree-high.glb", "/library/mini-forest/target.glb", "/library/mini-forest/character-archer.glb"].map((u) => fetch(u).then((r) => r.arrayBuffer())))`,
    cursor: { x: 900, y: 500 },
    steps: [
      { at: 1.0, move: { to: { sel: 'input[aria-label="Search parts"]', fx: 0.4 }, dur: 0.9 } },
      { at: 2.05, click: true },
      { at: 2.25, type: "tent", cps: 11 },
      { at: 2.8, move: { to: tile("Tent — Mini Forest"), dur: 0.45 } },
      { at: 3.35, click: true },
      { at: 3.5, move: { to: canvas(0.5, 0.42), dur: 0.65 } },
      { at: 4.3, click: true },
      // Trees: Shift keeps placing.
      { at: 4.55, move: { to: { sel: 'input[aria-label="Search parts"]', fx: 0.4 }, dur: 0.5 } },
      { at: 5.1, click: true },
      { at: 5.2, key: "Control+a" },
      { at: 5.3, type: "tree high", cps: 15 },
      { at: 5.95, move: { to: tile("Tree High — Mini Forest"), dur: 0.4 } },
      { at: 6.4, click: true },
      { at: 6.5, move: { to: canvas(0.27, 0.36), dur: 0.45 } },
      { at: 6.98, click: true, shift: true },
      { at: 7.1, move: { to: canvas(0.71, 0.3), dur: 0.4 } },
      { at: 7.55, click: true, shift: true },
      { at: 7.65, move: { to: canvas(0.8, 0.52), dur: 0.35 } },
      { at: 8.05, click: true, shift: true },
      { at: 8.2, key: "Escape" },
      // An archery target.
      { at: 8.25, move: { to: { sel: 'input[aria-label="Search parts"]', fx: 0.4 }, dur: 0.45 } },
      { at: 8.75, click: true },
      { at: 8.85, key: "Control+a" },
      { at: 8.95, type: "target", cps: 15 },
      { at: 9.35, move: { to: tile("Target — Mini Forest"), dur: 0.4 } },
      { at: 9.8, click: true },
      { at: 9.9, move: { to: canvas(0.36, 0.6), dur: 0.45 } },
      { at: 10.4, click: true },
      // A friend.
      { at: 10.55, move: { to: { sel: 'input[aria-label="Search parts"]', fx: 0.4 }, dur: 0.45 } },
      { at: 11.05, click: true },
      { at: 11.12, key: "Control+a" },
      { at: 11.2, type: "archer", cps: 15 },
      { at: 11.6, move: { to: tile("Character Archer — Mini Forest"), dur: 0.4 } },
      { at: 12.05, click: true },
      { at: 12.15, move: { to: canvas(0.6, 0.6), dur: 0.45 } },
      { at: 12.65, click: true },
      { at: 12.8, key: "Escape" },
      // Sunset, a look around, export.
      { at: 12.85, move: { to: { sel: "[role=radio]", text: "Sunset" }, dur: 0.55 } },
      { at: 13.5, click: true },
      { at: 13.75, move: { to: canvas(0.62, 0.78), dur: 0.5 } },
      { at: 14.35, drag: { by: [-120, 0], dur: 2.3 } },
      { at: 16.8, move: { to: { sel: "button", text: "Export" }, dur: 0.6 } },
      { at: 17.5, click: true },
    ],
  },
];
