#!/usr/bin/env node
/**
 * Renders the promo's frames: stage.js in headless Chrome at 1280×720 CSS px × 2 = 2560×1440 (2K),
 * one JPEG per 1/60 s into promo/work/final/, from the raw captures (capture.mjs), the game clips,
 * the voice data (voice.mjs) and Mia, the 3D presenter.
 *
 *   node scripts/promo/compose.mjs                  every frame
 *   node scripts/promo/compose.mjs 3.2,40,71.5      stills at those times → promo/work/stills/
 *   FROM=40 TO=50 node scripts/promo/compose.mjs    a range (re-render part of the video)
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import esbuild from "esbuild";
import { FPS, PROMO, ROOT, WORK, ffmpeg, freeMB, grab, openBrowser } from "./lib.mjs";
import { LEAD } from "./shots.mjs";
import { TOTAL, scenes } from "./storyboard.mjs";

const stillTimes = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
const OUT = path.join(WORK, stillTimes ? "stills" : "final");
const PORT = 9431;

// --- Data ------------------------------------------------------------------------------------------

const voice = JSON.parse(fs.readFileSync(path.join(WORK, "vo", "voice.json"), "utf8"));
const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));

/** Content zoom per scene: [local t, scale, focus x, focus y] (focus in 0–1 of the page view). */
const ZOOM = {
  home: [[0, 1, 0.5, 0.5], [0.45, 1, 0.5, 0.5], [1.15, 1.22, 0.74, 0.6], [3.0, 1.22, 0.74, 0.6], [3.7, 1, 0.5, 0.5]],
  models: [[0, 1, 0.5, 0.5], [1.3, 1, 0.5, 0.5], [2.0, 1.27, 0.45, 0.5], [5.0, 1.27, 0.45, 0.5], [5.5, 1.3, 0.24, 0.52], [6.6, 1.3, 0.24, 0.52], [7.2, 1, 0.5, 0.5]],
  character: [[0, 1, 0.5, 0.5], [0.5, 1, 0.5, 0.5], [1.2, 1.2, 0.3, 0.62], [6.4, 1.26, 0.3, 0.6]],
  customize: [[0, 1, 0.5, 0.5], [8.4, 1.04, 0.4, 0.5]],
  viewer: [[0, 1, 0.5, 0.5], [2.4, 1, 0.5, 0.5], [3.1, 1.12, 0.36, 0.52], [6, 1.16, 0.36, 0.52]],
  developers: [[0, 1.05, 0.45, 0.45], [8, 1.11, 0.45, 0.45]],
  builder: [[0, 1, 0.5, 0.5], [1.1, 1, 0.5, 0.5], [1.8, 1.16, 0.4, 0.45], [12.6, 1.16, 0.4, 0.45], [13.2, 1, 0.5, 0.5], [18.6, 1, 0.5, 0.5]],
};

const sceneData = scenes.map((s) => {
  let capture = null;
  if (s.capture) {
    const dir = path.join(WORK, "frames", s.capture);
    const frames = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.jpg$/.test(f)).length : 0;
    if (!frames) console.warn(`  no frames for ${s.capture} yet (run capture.mjs)`);
    capture = { dir: `/frames/${s.capture}/`, frames: Math.max(1, frames), lead: LEAD };
  }
  return { id: s.id, start: s.start, dur: s.dur, title: s.title ?? null, url: s.url ?? null, capture, zoom: ZOOM[s.id] ?? null };
});

/** Splits at punctuation followed by a space (so "models.codelove.in" and "6,700" stay whole). */
const segments = (text) => text.split(/(?<=[.,!?…—])\s+/).filter(Boolean);
const spoken = (s) => s.replace(/[^a-z0-9]/gi, "").length + 2;

/** Subtitle chunks with per-word times, from each line's text and the pauses measured in its audio. */
function subtitles() {
  const out = [];
  voice.forEach((v, li) => {
    const line = scenes.flatMap((s) => s.vo.map((x) => ({ ...x, scene: s.id }))).find((x) => x.sub === v.sub && x.scene === v.scene);
    const sub = segments(line.sub);
    let say = segments(line.say);
    // Timing comes from the spoken text; if it splits differently, from the subtitle itself.
    if (say.length !== sub.length) say = sub;
    // Segment boundaries: proportional to spoken length over the speech (pauses excluded), snapped to a pause.
    const pauses = v.pauses.filter(([a, b]) => a > 0.05 && b < v.seconds - 0.05);
    const speech = v.seconds - pauses.reduce((n, [a, b]) => n + b - a, 0);
    const weights = say.map(spoken), all = weights.reduce((a, b) => a + b, 0);
    const toReal = (st) => {
      let t = st;
      for (const [a, b] of pauses) if (a < t) t += b - a;
      return t;
    };
    const used = new Set();
    let acc = 0;
    const starts = [0];
    for (let i = 0; i < say.length - 1; i++) {
      acc += weights[i];
      let t = toReal((acc / all) * speech);
      let best = null;
      pauses.forEach(([a, b], j) => {
        const mid = (a + b) / 2;
        if (!used.has(j) && Math.abs(mid - t) < 0.55 && (!best || Math.abs(mid - t) < Math.abs(best[1] - t))) best = [j, b];
      });
      if (best) {
        used.add(best[0]);
        t = best[1];
      }
      starts.push(Math.max(starts[starts.length - 1] + 0.15, t));
    }
    const ends = starts.slice(1).concat([v.seconds]);
    // Display chunks: whole segments, up to ~46 characters each.
    const chunks = [];
    sub.forEach((text, i) => {
      const last = chunks[chunks.length - 1];
      if (last && last.text.length + text.length + 1 <= 46 && !/[.!?]$/.test(last.text)) {
        last.text += " " + text;
        last.end = ends[i];
        last.parts.push({ text, start: starts[i], end: ends[i] });
      } else chunks.push({ text, start: starts[i], end: ends[i], parts: [{ text, start: starts[i], end: ends[i] }] });
    });
    const nextLine = voice[li + 1];
    chunks.forEach((c, ci) => {
      const words = [];
      for (const p of c.parts) {
        const ws = p.text.split(/\s+/);
        const total = ws.reduce((n, w) => n + w.length + 1, 0);
        let a = 0;
        for (const w of ws) {
          words.push({ w, t: v.t + p.start + ((a / total) * (p.end - p.start)) });
          a += w.length + 1;
        }
      }
      const t0 = v.t + c.start;
      let t1 = ci + 1 < chunks.length ? v.t + chunks[ci + 1].start : v.t + v.seconds + 0.45;
      if (nextLine) t1 = Math.min(t1, nextLine.t - 0.02);
      out.push({ t0, t1, words });
    });
  });
  return out;
}

const subs = subtitles();
const moves = scenes.flatMap((s) => s.moves.map(([at, clip]) => [+(s.start + at).toFixed(3), clip]));

const intro = byId.intro, outro = byId.outro, games = byId.games;
const data = {
  total: TOTAL,
  scenes: sceneData,
  subs,
  mouth: voice.map((v) => ({ t: v.t, v: v.mouth })),
  moves,
  presenter: {
    model: "/public/models/business-female-01.glb",
    clips: Object.fromEntries(
      [["idle", "f_idle_neutral_01"], ["talk", "f_gestic_talk_neutral_01"], ["thoughtful", "f_gestic_thoughtful_01"], ["wave", "f_wave_01"], ["cheer", "f_cheer_01"], ["clap", "f_claphands_01"], ["dance", "f_dancing_neutral"]].map(([k, f]) => [k, `/public/animations/${f}.glb`]),
    ),
    jawAxis: { x: 0, y: 0, z: 1 },
    jawOpen: 0.13,
    blinkAxis: { x: 0, y: 1, z: 0 },
    blinkClose: 0.025,
  },
  // Canvas x (CSS px), scale, turn (radians; negative faces the window on her right).
  presenterPath: [
    [0, 620, 1.16, -0.16],
    [5.5, 620, 1.16, -0.16],
    [6.45, 900, 1.0, -0.3],
    [outro.start - 0.15, 900, 1.0, -0.3],
    [outro.start + 0.75, 640, 1.14, -0.1],
    [TOTAL, 640, 1.14, -0.1],
  ],
  subsCenterKeys: [[0, 390], [5.5, 390], [6.3, 528], [outro.start - 0.1, 528], [outro.start + 0.6, 400], [TOTAL, 400]],
  gameFocus: [[0, 1], [3.5, 1], [3.85, 0], [4.2, 0], [4.55, 1], [4.75, 1], [5.1, 2], [5.55, 2], [6.0, 1], [9.6, 1]],
  thumbs: pickThumbs(),
  games: gameClips(),
};
if (process.env.DEBUG_FACE) {
  // DEBUG_FACE=axis:jaw:blink, e.g. "z:0.5:1" — forces the mouth/blink to test bone axes.
  const [axis, jaw, blink] = process.env.DEBUG_FACE.split(":");
  const v = { x: 0, y: 0, z: 0, [axis.replace("-", "")]: axis.startsWith("-") ? -1 : 1 };
  data.presenter.jawAxis = v;
  data.presenter.blinkAxis = v;
  data.presenter.jawOpen = Number(jaw);
  data.presenter.blinkClose = Number(process.env.BLINK ?? 1);
  data.debug = { mouth: 1, blink: Number(blink) };
}
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, "compose.json"), JSON.stringify({ subs, moves, gameFocus: data.gameFocus }, null, 1));

/** A varied set of transparent model thumbnails for the floating wall. */
function pickThumbs() {
  const want = [
    ["library/bikes", 2], ["library/car-kit", 5], ["library/cube-pets", 4], ["library/mini-characters", 3], ["library/character-pack-skeletons", 2],
    ["library/planets", 2], ["library/rovers", 2], ["library/space-kit", 2], ["library/pirate-kit", 2], ["library/castle-kit", 2],
    ["library/food-kit", 3], ["library/nature-kit", 2], ["library/toy-car-kit", 2], ["library/watercraft-kit", 2], ["library/train-kit", 2], ["thumbs", 5],
  ];
  const out = [];
  for (const [dir, n] of want) {
    const abs = path.join(ROOT, "public", dir);
    if (!fs.existsSync(abs)) continue;
    const files = fs.readdirSync(abs).filter((f) => f.endsWith(".webp"));
    for (let i = 0; i < n && files.length; i++) out.push(`/public/${dir}/${files[Math.floor(((i + 0.5) * files.length) / n)]}`);
  }
  // Interleave so neighbours differ.
  return out.map((u, i) => [((i * 7) % out.length), u]).sort((a, b) => a[0] - b[0]).map(([, u]) => u);
}

/** The three games' 10 s card loops, as frames. */
function gameClips() {
  const list = [
    ["skate-rush", "Skate Rush", "Endless skate runner"],
    ["sky-hop", "Sky Hop", "3D platformer"],
    ["crypt-knight", "Crypt Knight", "Dungeon action"],
  ];
  return list.map(([slug, name, tag], i) => {
    const dir = path.join(WORK, "games", slug);
    if (!fs.existsSync(path.join(dir, "00000.jpg"))) {
      fs.mkdirSync(dir, { recursive: true });
      ffmpeg(["-i", path.join(ROOT, "public", "games", slug, "card-loop.mp4"), "-q:v", "2", "-start_number", "0", path.join(dir, "%05d.jpg")]);
    }
    const frames = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
    return { slug, name, tag, dir: `/games/${slug}/`, frames, offset: i * 47 };
  });
}

// --- Page ------------------------------------------------------------------------------------------

const bundle = (
  await esbuild.build({ entryPoints: [path.join(import.meta.dirname, "stage.js")], bundle: true, format: "iife", platform: "browser", write: false, minify: false, logLevel: "error" })
).outputFiles[0].text;

const FONT_DIR = path.join(ROOT, "node_modules", "geist", "dist", "fonts", "geist-sans");
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600, 700, 800].map((w) => `@font-face { font-family: Geist; font-weight: ${w}; src: url(/fonts/Geist-${{ 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold" }[w]}.woff2) format("woff2"); }`).join("\n")}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1280px; height: 720px; overflow: hidden; background: #07070b; }
#stage { position: relative; width: 1280px; height: 720px; overflow: hidden; font-family: Geist, system-ui, sans-serif; color: #ededf3; -webkit-font-smoothing: antialiased; }
#stage > * { position: absolute; }
.bg { inset: 0; background: #07070b; }
.bg i { position: absolute; display: block; border-radius: 50%; filter: blur(70px); }
.bg .b1 { width: 620px; height: 620px; left: 760px; top: -220px; background: radial-gradient(circle, #7c3aed88, #7c3aed00 70%); }
.bg .b2 { width: 680px; height: 680px; left: -260px; top: 330px; background: radial-gradient(circle, #0891b266, #0891b200 70%); }
.bg .b3 { width: 520px; height: 520px; left: 380px; top: 120px; background: radial-gradient(circle, #4f46e533, #4f46e500 70%); }
.bg .grid { inset: -40px; border-radius: 0; filter: none; background-image: radial-gradient(rgb(255 255 255 / .07) 1px, transparent 1.4px); background-size: 26px 26px; -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 40%, #000 30%, transparent 80%); }
.wall { inset: -40px -200px; display: flex; flex-direction: column; justify-content: center; gap: 26px; transform: perspective(1200px) rotateX(14deg) rotateZ(-6deg); -webkit-mask-image: linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent); }
.wall .row { display: flex; gap: 46px; height: 150px; align-items: center; white-space: nowrap; will-change: transform; }
.wall img { height: 130px; width: auto; flex: none; filter: saturate(1.1) blur(0.8px) drop-shadow(0 10px 18px rgb(0 0 0 / .5)); }
.intro { left: 70px; top: 0; width: 640px; height: 720px; display: flex; flex-direction: column; justify-content: center; }
.logo { display: flex; align-items: center; gap: 12px; transform-origin: left center; }
.logo img { width: 46px; height: 46px; border-radius: 12px; box-shadow: 0 0 40px #7c3aed66; }
.logo b { font-size: 26px; font-weight: 700; letter-spacing: -.01em; }
.logo span { font-size: 15px; color: #a0a0b2; margin-left: 4px; padding: 4px 11px; border: 1px solid rgb(255 255 255 / .12); border-radius: 999px; background: rgb(255 255 255 / .04); }
.intro h1 { margin-top: 30px; font-size: 76px; line-height: 1.02; font-weight: 700; letter-spacing: -.035em; }
.intro h1 .w, .outro h2 .w { display: inline-block; }
.intro h1 em { font-style: normal; background: linear-gradient(90deg, #c4b5fd, #a78bfa 35%, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; padding-bottom: 6px; }
.intro h1 em .w { background: inherit; -webkit-background-clip: text; background-clip: text; color: transparent; }
.chips { display: flex; gap: 10px; margin-top: 30px; flex-wrap: wrap; }
.chips i { font-style: normal; font-size: 16px; color: #c7c7d4; padding: 8px 15px; border-radius: 999px; border: 1px solid rgb(255 255 255 / .12); background: rgb(20 20 28 / .75); backdrop-filter: blur(8px); }
.chips i b { color: #fff; font-weight: 700; }
.intro .chips i:nth-child(3) { color: #4ade80; border-color: #4ade8055; background: #052e1688; }
.win { left: ${44}px; top: ${96}px; width: ${968}px; border-radius: 14px; overflow: hidden; background: #0d0d13; box-shadow: 0 40px 90px rgb(0 0 0 / .65), 0 0 0 1px rgb(255 255 255 / .1), 0 0 80px #7c3aed22; transform-origin: 50% 60%; }
.win .bar { height: 32px; display: flex; align-items: center; gap: 7px; padding: 0 13px; background: #15151e; border-bottom: 1px solid rgb(255 255 255 / .06); position: relative; }
.win .bar > i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57; }
.win .bar > i:nth-child(2) { background: #febc2e; } .win .bar > i:nth-child(3) { background: #28c840; }
.win .url { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); width: 430px; height: 20px; border-radius: 999px; background: rgb(255 255 255 / .06); font-size: 11.5px; color: #b4b4c4; display: flex; align-items: center; justify-content: center; }
.win .url svg { position: absolute; left: 11px; top: 4.5px; width: 11px; height: 11px; color: #4ade80; }
.win .url span { position: absolute; left: 0; right: 0; top: 3px; text-align: center; white-space: nowrap; }
.win .view { position: relative; width: ${968}px; height: ${(968 * 9) / 16}px; overflow: hidden; background: #07070b; }
.win .view img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; }
.games { left: 0; top: 0; width: 1280px; height: 720px; z-index: 0; }
.card { left: 0; top: 150px; width: 600px; position: absolute; transform-origin: 50% 50%; }
.card .clip { width: 600px; height: 315px; border-radius: 18px; overflow: hidden; box-shadow: 0 30px 70px rgb(0 0 0 / .6), 0 0 0 1px rgb(255 255 255 / .12); background: #111; }
.card .clip img { width: 100%; height: 100%; object-fit: cover; display: block; }
.card .label { margin-top: 16px; display: flex; align-items: baseline; gap: 12px; justify-content: center; opacity: .55; }
.card.on .label { opacity: 1; }
.card .label b { font-size: 30px; font-weight: 700; letter-spacing: -.02em; }
.card .label span { font-size: 15px; color: #a78bfa; font-weight: 500; }
.card.on .clip { box-shadow: 0 30px 80px rgb(0 0 0 / .65), 0 0 0 2px #a78bfa, 0 0 60px #7c3aed55; }
.more { position: absolute; left: 500px; top: 590px; font-size: 16px; padding: 9px 18px; border-radius: 999px; background: rgb(20 20 28 / .85); border: 1px solid rgb(255 255 255 / .14); color: #d4d4de; white-space: nowrap; }
.more b { color: #67e8f9; }
.outro { left: 70px; top: 0; width: 700px; height: 720px; display: flex; flex-direction: column; justify-content: center; }
.outro .logo img { width: 40px; height: 40px; }
.outro .logo b { font-size: 24px; }
.outro h2 { margin-top: 26px; font-size: 62px; line-height: 1.05; font-weight: 700; letter-spacing: -.035em; }
.outro .url { margin-top: 10px; font-size: 64px; font-weight: 800; letter-spacing: -.035em; line-height: 1.1; background: linear-gradient(90deg, #c4b5fd, #a78bfa, #67e8f9, #a78bfa, #c4b5fd); background-size: 400px 100%; -webkit-background-clip: text; background-clip: text; color: transparent; padding-bottom: 8px; }
.outro .chips i { font-size: 15px; }
.outro .cta { margin-top: 28px; font-size: 18px; color: #4ade80; font-weight: 600; }
.title { left: 46px; top: 22px; display: flex; flex-direction: column; gap: 2px; }
.title .lab { font-size: 13px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #a78bfa; }
.title .head { font-size: 34px; font-weight: 700; letter-spacing: -.03em; line-height: 1.15; }
.brand { right: 34px; top: 30px; display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 600; color: #c7c7d4; }
.brand img { width: 26px; height: 26px; border-radius: 7px; }
.glow { left: 0; top: 0; width: 520px; height: 620px; border-radius: 50%; background: radial-gradient(ellipse at center, #7c3aed40, #0891b215 45%, transparent 70%); filter: blur(10px); transform-origin: 50% 100%; }
.p3d { left: 0; top: 0; width: ${520}px; height: ${720}px; transform-origin: 50% 100%; }
.subs { bottom: 20px; left: 528px; transform: translateX(-50%); max-width: 860px; text-align: center; }
.subs p { display: inline-block; font-size: 25px; font-weight: 600; line-height: 1.32; letter-spacing: -.005em; padding: 7px 18px 9px; border-radius: 12px; background: rgb(8 8 12 / .78); backdrop-filter: blur(10px); box-shadow: 0 0 0 1px rgb(255 255 255 / .08), 0 10px 30px rgb(0 0 0 / .4); color: #fff; }
.subs span { display: inline; }
.nametag { left: 990px; top: 560px; display: flex; flex-direction: column; gap: 2px; padding: 10px 16px 11px; border-radius: 14px; background: rgb(14 14 20 / .82); border: 1px solid rgb(255 255 255 / .12); backdrop-filter: blur(10px); box-shadow: 0 14px 40px rgb(0 0 0 / .45); border-left: 3px solid #a78bfa; }
.nametag b { font-size: 21px; font-weight: 700; letter-spacing: -.01em; }
.nametag span { font-size: 13px; color: #a0a0b2; }
.flash { inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.fade { inset: 0; background: #000; pointer-events: none; }
</style></head><body><div id="stage"></div><script>${bundle.replace(/<\/script/g, "<\\/script")}</script></body></html>`;

// --- Server ----------------------------------------------------------------------------------------

const TYPES = { ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = null;
  if (url === "/") return res.writeHead(200, { "content-type": "text/html" }), res.end(HTML);
  if (url.startsWith("/frames/")) file = path.join(WORK, "frames", url.slice(8));
  else if (url.startsWith("/games/")) file = path.join(WORK, "games", url.slice(7));
  else if (url.startsWith("/fonts/")) file = path.join(FONT_DIR, url.slice(7));
  else if (url === "/public/icon.svg") file = path.join(ROOT, "src", "app", "icon.svg");
  else if (url.startsWith("/public/")) file = path.join(ROOT, "public", url.slice(8));
  if (!file || !fs.existsSync(file)) return res.writeHead(404), res.end();
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "max-age=3600" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// --- Render ----------------------------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
const { page, cdp, close } = await openBrowser({ width: 1280, height: 720, dpr: 2, virtual: false, pointer: false });
try {
  page.on("console", (m) => m.type() === "error" && console.error("  page:", m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.evaluate((d) => window.__init(d), data);
  const times = stillTimes ?? [];
  if (!stillTimes) {
    const from = Math.round(Number(process.env.FROM ?? 0) * FPS), to = Math.min(Math.round(TOTAL * FPS), Math.round(Number(process.env.TO ?? TOTAL) * FPS));
    for (let n = from; n < to; n++) times.push(n);
  }
  const t0 = Date.now();
  for (const [i, x] of times.entries()) {
    const t = stillTimes ? x : x / FPS;
    await page.evaluate((t) => window.__render(t), t);
    const name = stillTimes ? `t${t.toFixed(2).padStart(6, "0")}.jpg` : `${String(x).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, name), await grab(cdp, 93));
    if (!stillTimes && i % 300 === 0) console.log(`  ${i}/${times.length} frames  ${((Date.now() - t0) / 1000).toFixed(0)} s  (free RAM ${freeMB()} MB)`);
  }
  console.log(`${times.length} frame(s) → ${path.relative(PROMO, OUT)}`);
} finally {
  await close();
  server.close();
}
