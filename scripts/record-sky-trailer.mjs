#!/usr/bin/env node
/**
 * Records Sky Hop's trailer from the game itself and saves it for the game's page:
 *   public/games/sky-hop/trailer-1080.mp4     1920×1080, 60 fps — desktops and full screen
 *   public/games/sky-hop/trailer.mp4          1280×720, 30 fps — phones (smaller download)
 *   public/games/sky-hop/trailer-poster.webp  the title frame
 *
 *   npm run dev                                   (in another terminal)
 *   FFMPEG=path/to/ffmpeg KOKORO=path/to/kokoro-js/dist/kokoro.js node scripts/record-sky-trailer.mjs
 *   PREVIEW=1 node scripts/record-sky-trailer.mjs   (three stills per shot into the temp folder, no sound or video)
 *
 * Works like scripts/record-crypt-trailer.mjs: the game runs in headless Chrome on a virtual clock
 * (every frame stepped by exactly 1/60 s and captured) while the hero plays on autopilot along each
 * stage's route (window.__skyHop on the dev server), with captions in the game's own font. Sound: the
 * game's music and sound effects rendered offline by its own synthesizer (every effect is logged with
 * its time and arguments), plus a Kokoro announcer (open-source neural TTS, Apache-2.0). The music
 * ducks under the voice; the mix is normalised to -14 LUFS.
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG (default: ffmpeg on PATH), KOKORO (default:
 * the kokoro-js package), VOICE (Kokoro voice, default af_heart — its most natural voice).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "sky-hop");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const KOKORO = process.env.KOKORO ?? "kokoro-js";
const VOICE = process.env.VOICE ?? "af_heart";
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9358;
/** Layout size (captions are designed for it) and the pixel ratio that makes the capture 1920×1080. */
const W = 1280;
const H = 720;
const DPR = PREVIEW ? 1 : 1.5;
const FPS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Shop data (names and prices for the captions) --------------------------------------------------

async function content() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "src/components/games/sky-hop/content.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const tmp = path.join(os.tmpdir(), `sky-content-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { HEROES, SKINS, WORLDS } = await content();
const byId = (list, id) => list.find((i) => i.id === id);
const price = (item) => (item.price ? `${item.price.toLocaleString("en-US")} coins` : "Free");

// --- Storyboard ------------------------------------------------------------------------------------

/**
 * Each shot: seconds, what the game shows (`game`: a stage played by the autopilot `{ play: [world,
 * stage], at, warp, hero, skin, close }` — `at` is a route point (index, negative from the end, or an
 * act) — or the title-screen showcase `{ show: true, world, hero, skin, first, map }`; `map` opens the
 * stage map, shown with `ui: true`), the captions (`head` section badge, `tag` name + price + perk,
 * `title` / `end` cards), the announcer's lines (`vo`: [seconds into the shot, text]) and trailer
 * sounds (`fx`).
 */
const shots = [];
const add = (shot) => shots.push(shot);

add({ dur: 3.4, game: { show: true, world: "meadow", hero: "oobi", skin: "classic", first: true, still: true }, title: true, vo: [[0.4, "Hop into the sky!"]], fx: [[0.25, "impact"]] });
add({
  dur: 3.8,
  game: { play: ["meadow", 5], at: "jump", warp: 0.6, hero: "oobi", skin: "classic" },
  head: ["Run · Jump · Stomp", "double jump & ground pound"],
  vo: [[0.15, "Run, double jump and stomp across floating islands."]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 3.4,
  game: { show: true, world: "meadow", hero: "oobi", skin: "classic", first: true, map: true },
  ui: true,
  head: ["60 Stages", "3 hidden stars in each"],
  vo: [[0.15, "Sixty stages... find three stars in every one."]],
  fx: [[-0.08, "whoosh"]],
});
// Worlds: each one played by a different hero in a matching skin.
const worldShots = [
  ["meadow", 7, "ride", 0.4, "oodi", "classic", "Sunny Meadow."],
  ["autumn", 3, "jump", 0.6, "bella", "classic", "Autumn Woods."],
  ["frost", 6, "ride", 0.4, "ben", "frost", "Frosty Peaks."],
  ["desert", 2, "jump", 0.6, "max", "gold", "Desert Canyon."],
  ["candy", 1, "spring", 0.2, "lee", "rainbow", "Candy Clouds."],
  ["volcano", 3, "jump", 0.6, "bones", "lava", "And Volcano Peak!"],
];
worldShots.forEach(([id, stage, at, warp, hero, skin, line], i) => {
  const w = byId(WORLDS, id);
  add({
    dur: i === 0 ? 2.7 : 1.8,
    game: { play: [id, stage], at, warp, hero, skin },
    head: ["6 Worlds", "unlock them with your coins"],
    tag: [w.name, price(w), `×${w.coinMult} coins`],
    vo: i === 0 ? [[0.1, "Six sky worlds."], [1.35, line]] : [[0.08, line]],
    fx: [[-0.08, "whoosh"]],
  });
});
// Heroes on the title screen, cheering one after another.
["pixel", "ben", "elf", "vampire", "bones"].forEach((id, i) => {
  const h = byId(HEROES, id);
  add({
    dur: i === 0 ? 1.5 : 0.95,
    game: { show: true, world: "candy", hero: id, skin: "classic", first: i === 0 },
    head: ["15 Heroes", "each with a special power"],
    tag: [h.name, price(h), h.perk],
    vo: i === 0 ? [[0.1, "Unlock fifteen heroes with special powers..."]] : [],
    fx: [i === 0 ? [-0.08, "whoosh"] : [0.02, "pop"]],
  });
});
const skinVo = { shadow: "and ten shiny skins.", gold: "Gold.", galaxy: "Galaxy.", rainbow: "Rainbow!" };
["shadow", "neon", "gold", "galaxy", "rainbow"].forEach((id, i) => {
  const s = byId(SKINS, id);
  add({
    dur: i === 0 ? 1.3 : 0.8,
    game: { show: true, world: "autumn", hero: "knight", skin: id, first: i === 0 },
    head: ["10 Skins", "for every hero"],
    tag: [s.name, price(s), null],
    vo: skinVo[id] ? [[i === 0 ? 0.1 : 0.06, skinVo[id]]] : [],
    fx: [i === 0 ? [-0.08, "whoosh"] : [0.02, "sparkle"]],
  });
});
add({
  dur: 3.6,
  game: { play: ["volcano", 0], at: "spring", warp: 0.1, hero: "vampire", skin: "galaxy" },
  head: ["Lifts · Springs · Saws", "hop your way to the flag"],
  vo: [[0.2, "Ride, bounce and dodge your way to the flag!"]],
  fx: [[-0.08, "whoosh"]],
});
add({
  dur: 4.8,
  game: { play: ["candy", 4], at: -3, warp: 0.2, hero: "oobi", skin: "rainbow", close: 0.8 },
  end: true,
  endAt: 1.3,
  vo: [[1.5, "Sky Hop. Play it free, right now!"]],
  fx: [[-0.08, "whoosh"], [1.35, "jingle"]],
});

const starts = [];
shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
const total = shots.reduce((n, s) => n + s.dur, 0);
const frames = Math.round(total * FPS);
/** Every announcer line and trailer sound, at its time in the video. */
const voiceLines = shots.flatMap((s, i) => (s.vo ?? []).map(([at, text]) => ({ t: starts[i] + at, text })));
const trailerFx = shots.flatMap((s, i) => (s.fx ?? []).map(([at, name]) => [Math.max(0, starts[i] + at), name, []]));

// --- Voice-over ------------------------------------------------------------------------------------

/** Speaks every line with Kokoro in a child process (it needs ~350 MB; Chrome starts after it exits). */
function speak(dir) {
  const kokoro = fs.existsSync(KOKORO) ? pathToFileURL(path.resolve(KOKORO)).href : KOKORO;
  const script = `
    const { KokoroTTS } = await import(${JSON.stringify(kokoro)});
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
    const lines = ${JSON.stringify(voiceLines.map((l) => l.text))};
    for (let i = 0; i < lines.length; i++) {
      const audio = await tts.generate(lines[i], { voice: ${JSON.stringify(VOICE)}, speed: 1.05 });
      audio.save(${JSON.stringify(dir.split(path.sep).join("/"))} + "/vo-" + i + ".wav");
    }`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`voice-over failed (is kokoro-js installed? set KOKORO):\n${r.stderr.split("\n").filter((l) => !/Warning/.test(l)).slice(-6).join("\n")}`);
}

/** Trims a clip's silent ends; returns the trimmed file and its length in seconds. */
function trimVoice(file) {
  const out = file.replace(/\.wav$/, "-trim.wav");
  ffmpeg(["-i", file, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  return { file: out, seconds: (fs.statSync(out).size - 44) / (44100 * 2) };
}

// --- Page side -------------------------------------------------------------------------------------

/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = {
    start() { on = true; now = realNow(); },
    step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); },
  };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** Every sound effect the game can make (logged with its arguments instead of played). */
const SFX = ["jump", "doubleJump", "land", "step", "coin", "star", "oneUp", "heart", "key", "chest", "locked", "spring", "crumbleWarn", "crumble", "stomp", "poundStart", "pound", "crate", "bonk", "hurt", "fall", "lose", "checkpoint", "complete", "go"];

/** The caption layer, the sound-effect log and the per-frame driver (shots come in as JSON). */
const DIRECTOR = (data) => `(() => {
  const { shots, fps, sfx } = ${JSON.stringify(data)};
  const { game: g, records, ui } = window.__skyHop;
  const root = document.querySelector(".g-root");
  const css = document.createElement("style");
  const ink = "#1c1917";
  css.textContent = \`
    .g-root.sh-hide > :not(canvas):not(#trailer), nextjs-portal { visibility: hidden !important; }
    #trailer { position: absolute; inset: 0; z-index: 100; pointer-events: none; font-family: var(--game-display), sans-serif; color: #fff; text-transform: uppercase; }
    #trailer .shade { position: absolute; inset: 0; }
    #trailer .title { position: absolute; left: 0; right: 0; top: 24%; text-align: center; }
    #trailer .title b { display: block; font-size: 150px; line-height: .95; font-weight: 400; letter-spacing: .03em; color: #facc15; text-shadow: 5px 5px 0 ${"${ink}"}, -4px -4px 0 ${"${ink}"}, 4px -4px 0 ${"${ink}"}, -4px 4px 0 ${"${ink}"}, 10px 14px 0 #1c191766; }
    #trailer .title b i { font-style: normal; color: #fff; }
    #trailer .title span { display: inline-block; margin-top: 26px; padding: 10px 26px 6px; font-size: 28px; letter-spacing: .08em; color: ${"${ink}"}; background: #fff7d6; border: 4px solid ${"${ink}"}; border-radius: 999px; box-shadow: 0 6px 0 ${"${ink}"}; }
    #trailer .head { position: absolute; left: 48px; top: 44px; }
    #trailer .head b { display: inline-block; background: #facc15; color: ${"${ink}"}; font-size: 46px; font-weight: 400; padding: 10px 28px 4px; border: 5px solid ${"${ink}"}; border-radius: 999px; box-shadow: 0 7px 0 ${"${ink}"}; transform: rotate(-2deg); }
    #trailer .head span { display: block; margin: 16px 0 0 10px; font-size: 22px; letter-spacing: .06em; text-shadow: 2px 2px 0 ${"${ink}"}, -2px -2px 0 ${"${ink}"}, 2px -2px 0 ${"${ink}"}, -2px 2px 0 ${"${ink}"}; }
    #trailer .tag { position: absolute; left: 48px; bottom: 50px; }
    #trailer .tag b { display: block; font-size: 64px; font-weight: 400; line-height: 1; color: #fff; text-shadow: 4px 4px 0 ${"${ink}"}, -3px -3px 0 ${"${ink}"}, 3px -3px 0 ${"${ink}"}, -3px 3px 0 ${"${ink}"}, 6px 9px 0 #1c191766; }
    #trailer .tag span { display: inline-flex; align-items: center; gap: 10px; margin-top: 14px; padding: 8px 18px 4px 10px; background: #fff7d6; color: ${"${ink}"}; border: 4px solid ${"${ink}"}; border-radius: 999px; box-shadow: 0 5px 0 ${"${ink}"}; font-size: 26px; }
    #trailer .tag span em { font-style: normal; color: #b45309; margin-left: 4px; }
    #trailer .coin { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fef08a, #f59e0b 55%, #c2410c); border: 3px solid ${"${ink}"}; }
    #trailer .flash { position: absolute; inset: 0; background: #fff; }
    #trailer .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    #trailer .end b { font-size: 132px; font-weight: 400; line-height: .95; letter-spacing: .03em; color: #facc15; text-shadow: 5px 5px 0 ${"${ink}"}, -4px -4px 0 ${"${ink}"}, 4px -4px 0 ${"${ink}"}, -4px 4px 0 ${"${ink}"}, 10px 14px 0 #1c191766; }
    #trailer .end b i { font-style: normal; color: #fff; }
    #trailer .play { margin-top: 34px; display: inline-flex; align-items: center; gap: 16px; background: #facc15; color: ${"${ink}"}; font-size: 52px; padding: 16px 44px 8px; border: 5px solid ${"${ink}"}; border-radius: 999px; box-shadow: 0 9px 0 ${"${ink}"}; }
    #trailer .play svg { width: 40px; height: 40px; transform: translateY(-4px); }
    #trailer .url { margin-top: 34px; font-size: 30px; letter-spacing: .03em; text-transform: none; text-shadow: 2px 2px 0 ${"${ink}"}, -2px -2px 0 ${"${ink}"}, 2px -2px 0 ${"${ink}"}, -2px 2px 0 ${"${ink}"}; }
    #trailer .small { margin-top: 12px; font-size: 20px; letter-spacing: .08em; text-shadow: 2px 2px 0 ${"${ink}"}, -2px -2px 0 ${"${ink}"}, 2px -2px 0 ${"${ink}"}, -2px 2px 0 ${"${ink}"}; }
  \`;
  document.head.append(css);
  const layer = document.createElement("div");
  layer.id = "trailer";
  root.append(layer);

  const starts = [];
  shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
  const total = shots.reduce((n, s) => n + s.dur, 0);
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  let current = -1;
  const rescues = [];

  // The game's sound effects are logged (time, name, arguments) instead of played.
  const fxLog = [];
  let logging = false, tNow = 0;
  const originals = {};
  for (const name of sfx) {
    originals[name] = g.sfx[name].bind(g.sfx);
    g.sfx[name] = (...args) => { if (logging) fxLog.push([tNow, name, args]); };
  }

  const setup = (s) => {
    const q = s.game;
    // Setting a shot up (building stages, skipping ahead) makes no sound.
    logging = false;
    if (q.show) {
      if (q.first || g.phase !== "menu") {
        g.autopilot = false;
        g.invincible = false;
        if (g.phase !== "menu") g.toMenu();
        g.setWorld(q.world);
      }
      g.setHero(q.hero);
      g.setSkin(q.skin);
      g.cinema = q.map || q.still ? 1 : 0.8;
      if (q.map) {
        // A player part-way through the first world: six stages starred, the seventh up next.
        const stages = {};
        [3, 3, 2, 3, 3, 1].forEach((n, i) => (stages["meadow:" + i] = { stars: (1 << n) - 1, coins: 50, time: 60 }));
        records.set({ world: q.world, bank: 2400, stages });
        g.setShowcase(true, { x: 0, y: 0.22 });
      } else g.setShowcase(!q.still);
      ui.map(!!q.map);
      if (!q.still && !q.first) g.celebrate();
    } else {
      ui.map(false);
      if (g.phase !== "menu") g.toMenu();
      g.setShowcase(false);
      g.setHero(q.hero);
      g.setSkin(q.skin);
      g.autopilot = true;
      g.invincible = true;
      g.cinema = q.close ?? 0.86;
      g.rescues = 0;
      g.jumpTo({ world: q.play[0], stage: q.play[1] }, q.at ?? 0);
      g.warp(q.warp ?? 0);
    }
    logging = true;
  };

  const caption = (s, t, i) => {
    const local = t - starts[i];
    let html = "";
    if (s.title) {
      const k = ease((local - 0.15) / 0.45), out = ease((local - (s.dur - 0.35)) / 0.35);
      html += '<div class="shade" style="background:radial-gradient(ellipse at center, #0b1e3a55, #0000 70%)"></div>';
      html += '<div class="title" style="opacity:' + (k * (1 - out)) + ';transform:scale(' + (1.15 - 0.15 * k) + ') translateY(' + (-40 * out) + 'px) rotate(' + (-3 * (1 - k)) + 'deg)"><b>Sky <i>Hop</i></b><span>A 3D platformer</span></div>';
    }
    if (s.head) {
      // The badge stays up for the whole section; it pops in with the section's first shot.
      let first = i;
      while (first > 0 && shots[first - 1].head && shots[first - 1].head[0] === s.head[0]) first--;
      const k = ease((t - starts[first]) / 0.3);
      html += '<div class="head" style="transform:translateX(' + (-70 * (1 - k)) + 'px);opacity:' + k + '"><b>' + s.head[0] + '</b>' + (s.head[1] ? '<span>' + s.head[1] + '</span>' : "") + '</div>';
    }
    if (s.tag) {
      const k = ease(local / 0.22);
      const [name, cost, perk] = s.tag;
      html += '<div class="tag" style="transform:translateY(' + (26 * (1 - k)) + 'px);opacity:' + k + '"><b>' + name + '</b><span>' + (cost ? '<i class="coin"></i>' + cost : "") + (perk ? '<em>' + (cost ? '· ' : '') + perk + '</em>' : "") + '</span></div>';
    }
    if (s.end) {
      const k = ease((local - (s.endAt ?? 0)) / 0.5);
      const pulse = 1 + Math.sin(Math.max(0, local - (s.endAt ?? 0) - 0.6) * 5) * 0.035;
      html += '<div class="shade" style="background:#0b1e3a;opacity:' + (0.5 * k) + '"></div>';
      html += '<div class="end" style="opacity:' + k + ';transform:scale(' + (0.9 + 0.1 * k) + ')"><b>Sky <i>Hop</i></b>' +
        '<div class="play" style="transform:scale(' + pulse + ')"><svg viewBox="0 0 24 24" fill="#1c1917"><path d="M7 4.5v15l12.5-7.5z"/></svg>Play now — free</div>' +
        '<div class="url">models.codelove.in/games/sky-hop</div><div class="small">No download · no sign-up · phone &amp; PC</div></div>';
    }
    // A quick white flash on every cut (not inside a showcase section, where items swap in place).
    const cutFlash = i > 0 && !(s.game.show && !s.game.first);
    if (cutFlash && local < 0.16) html += '<div class="flash" style="opacity:' + (0.5 * (1 - local / 0.16)) + '"></div>';
    // Fade in from black at the start, and out at the very end.
    if (t < 0.3) html += '<div class="shade" style="background:#000;opacity:' + (1 - t / 0.3) + '"></div>';
    if (t > total - 0.35) html += '<div class="shade" style="background:#000;opacity:' + ((t - (total - 0.35)) / 0.35) + '"></div>';
    layer.innerHTML = html;
  };

  window.__trailer = {
    frame(n) {
      const t = n / fps;
      tNow = t;
      let i = 0;
      while (i + 1 < shots.length && t >= starts[i + 1]) i++;
      if (i !== current) {
        if (current >= 0 && shots[current].game.play && g.rescues) rescues.push([current, g.rescues]);
        current = i;
        root.classList.toggle("sh-hide", !shots[i].ui);
        setup(shots[i]);
      }
      window.__vt.step(1000 / fps);
      caption(shots[i], t, i);
      return true;
    },
    fx: () => fxLog,
    rescues: () => rescues,
    originals,
  };
  return shots.length;
})()`;

/** Builds the game's audio graph on an OfflineAudioContext (swapped in for the AudioContext while the hub unlocks). */
const OFFLINE_HUB = (seconds) => `
  const { audio, music } = window.__skyHop;
  music.stop();
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * (${seconds} + 0.5)), rate);
  Object.defineProperty(ctx, "state", { get: () => "running" });
  const resume = ctx.resume.bind(ctx);
  ctx.resume = () => Promise.resolve();
  let tick = null;
  const realSetInterval = window.setInterval;
  window.setInterval = (fn) => { tick = fn; return 1; };
  audio.ctx = null;
  const Real = window.AudioContext;
  window.AudioContext = function () { return ctx; };
  audio.unlock();
  window.AudioContext = Real;
`;

/** 16-bit stereo WAV (base64) of the rendered buffer; the game goes back to silence afterwards. */
const TO_WAV = (seconds) => `
  music.stop();
  audio.ctx = null;
  const n = Math.floor(${seconds} * rate);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
`;

/** The music, rendered in 50 ms steps so the scheduler (ticked by hand) only queues the next few notes, as in the game. */
const MUSIC = (seconds) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  music.play(window.__skyHop.song, 2, { restart: true });
  window.setInterval = realSetInterval;
  for (let k = 1; k * 0.05 < ${seconds}; k++) ctx.suspend(k * 0.05).then(() => { tick && tick(); resume(); });
  tick && tick();
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

/** Sound effects: every effect the game logged, played at its time by the game's own Sfx, plus the trailer's whooshes and chimes. */
const EFFECTS = (seconds, extra) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  window.setInterval = realSetInterval;
  const t = window.__trailer;
  const fx = t.fx().concat(${JSON.stringify(extra)});
  const trailer = {
    whoosh: () => audio.noise(0.42, { volume: 0.32, freq: 350, type: "bandpass", slide: 3200, q: 1.1 }),
    impact: () => { audio.tone(110, 0.9, { type: "sine", volume: 0.45, slide: -40 }); audio.jingle([72, 76, 79, 84], { volume: 0.13, step: 0.07 }); },
    pop: () => { audio.tone(988, 0.08, { type: "square", volume: 0.05 }); audio.tone(1480, 0.14, { type: "square", volume: 0.045, delay: 0.05 }); },
    sparkle: () => { audio.tone(1568, 0.12, { type: "triangle", volume: 0.09 }); audio.tone(2093, 0.18, { type: "triangle", volume: 0.07, delay: 0.06 }); },
    jingle: () => audio.jingle([72, 76, 79, 84, 88], { volume: 0.17, step: 0.08 }),
  };
  // Effects grouped by render quantum; rendering pauses at each group to start them right on time.
  const q = 128 / rate;
  const groups = new Map();
  for (const [time, name, args] of fx) {
    const at = Math.max(q, Math.round(time / q) * q);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push([name, args]);
  }
  const realNow = performance.now;
  for (const [at, list] of groups) {
    ctx.suspend(at).then(() => {
      // Rate limits inside the Sfx read the clock: give it the effect's own time.
      performance.now = () => at * 1000;
      for (const [name, args] of list) (trailer[name] ?? t.originals[name])?.(...(args ?? []));
      performance.now = realNow;
      resume();
    });
  }
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

// --- Chrome & ffmpeg -------------------------------------------------------------------------------

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
    if (m.method === "Runtime.exceptionThrown") console.error("  page error:", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
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
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

if (!PREVIEW && spawnSync(FFMPEG, ["-version"]).status !== 0) {
  console.error(`ffmpeg not found (${FFMPEG}) — install it or set FFMPEG=path/to/ffmpeg`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "sky-trailer-"));
const profile = path.join(work, "profile");
const framesDir = PREVIEW ? path.join(os.tmpdir(), "sky-trailer-preview") : path.join(work, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
/** Preview: a few stills per shot. */
const keep = new Set(PREVIEW ? shots.flatMap((s, i) => [0.15, 0.5, 0.9].map((k) => Math.round((starts[i] + s.dur * k) * FPS))) : []);
let chrome = null;
try {
  // 1. Voice-over: each line, trimmed, and fitted into the time before the next line (or the end).
  let voice = [];
  if (!PREVIEW) {
    console.log(`Voice-over: ${voiceLines.length} lines, Kokoro voice "${VOICE}"…`);
    speak(work);
    voice = voiceLines.map((line, i) => {
      const { file, seconds } = trimVoice(path.join(work, `vo-${i}.wav`));
      const room = (voiceLines[i + 1]?.t ?? total) - line.t - 0.05;
      // Too long for its slot: speed it up a little (never more than 25%).
      const tempo = seconds > room ? Math.min(1.25, seconds / room) : 1;
      console.log(`  ${line.t.toFixed(2)} s  "${line.text}"  ${seconds.toFixed(2)} s${tempo > 1 ? ` → ×${tempo.toFixed(2)}` : ""}`);
      if (seconds / tempo > room + 0.01) console.warn(`    runs ${(seconds / tempo - room).toFixed(2)} s into the next line`);
      return { ...line, file, tempo };
    });
  }

  // 2. Picture.
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null);
  }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  // A fresh save: Oobi, classic skin, Sunny Meadow.
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.removeItem("sky-hop:v1")` });
  await page.send("Page.navigate", { url: `${BASE}/games/sky-hop/play/` });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!window.__skyHop && !!document.querySelector("[data-sh-play]")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }

  let musicWav = null;
  if (!PREVIEW) {
    console.log("Music…");
    musicWav = path.join(work, "music.wav");
    fs.writeFileSync(musicWav, Buffer.from(await page.evaluate(MUSIC(total + 0.5)), "base64"));
  }

  console.log("Loading the heroes, skins and worlds…");
  const used = [...new Set(shots.map((s) => s.game.hero))];
  const usedSkins = [...new Set(shots.map((s) => s.game.skin))];
  await page.evaluate(`(async () => {
    const g = __skyHop.game;
    for (const id of ${JSON.stringify(used)}) await g.setHero(id);
    // Compile every skin's shader and every world's materials once, so no frame waits for them.
    for (const id of ${JSON.stringify(usedSkins)}) g.setSkin(id);
    for (const id of ${JSON.stringify(WORLDS.map((w) => w.id))}) g.setWorld(id);
    g.setWorld("meadow");
    await g.setHero("oobi");
    g.setSkin("classic");
  })()`);
  await sleep(1500);
  await page.evaluate("__vt.start()");
  const count = await page.evaluate(DIRECTOR({ shots, fps: FPS, sfx: SFX }));
  console.log(`Recording ${count} shots, ${frames} frames (${total.toFixed(1)} s at ${FPS} fps, ${W * DPR}×${H * DPR})${PREVIEW ? " — preview stills only" : ""}…`);
  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    await page.evaluate(`__trailer.frame(${n})`);
    if (PREVIEW && !keep.has(n)) continue;
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: PREVIEW ? 80 : 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 300 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await page.evaluate(`__trailer.frame(${frames})`);
  const rescues = await page.evaluate("__trailer.rescues()");
  if (rescues.length) console.warn(`  the autopilot was put back on its route in shots ${rescues.map(([i, n]) => `${i} (×${n})`).join(", ")}`);
  if (PREVIEW) {
    console.log(`Preview stills in ${framesDir}`);
  } else {
    console.log("Sound effects…");
    const fxWav = path.join(work, "fx.wav");
    fs.writeFileSync(fxWav, Buffer.from(await page.evaluate(EFFECTS(total + 0.5, trailerFx)), "base64"));
    page.close();

    // 3. Mix: the voice on top (cleaned up and compressed), the music ducking under it, the effects; -14 LUFS.
    console.log("Mixing…");
    const mixWav = path.join(work, "mix.wav");
    const graph = [
      ...voice.map((v, i) => `[${i + 2}:a]${v.tempo > 1 ? `atempo=${v.tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
      `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=80,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,apad[voice]`,
      `[voice]asplit=2[voice1][voice2]`,
      `[0:a]volume=0.85[music]`,
      `[music][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]`,
      `[1:a]volume=1.0[fx]`,
      `[ducked][fx][voice2]amix=inputs=3:normalize=0:duration=first,afade=t=in:d=0.25,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`,
    ].join(";");
    ffmpeg(["-i", musicWav, "-i", fxWav, ...voice.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "[mix]", "-t", total.toFixed(3), mixWav]);

    // 4. Video: Full HD 60 fps for desktops and full screen, 720p 30 fps for phones.
    console.log("Encoding…");
    fs.mkdirSync(OUT, { recursive: true });
    const input = ["-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-i", mixWav];
    const common = ["-map", "0:v", "-map", "1:a", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-shortest"];
    const hd = path.join(OUT, "trailer-1080.mp4");
    const sd = path.join(OUT, "trailer.mp4");
    ffmpeg([...input, ...common, "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", hd]);
    ffmpeg([...input, ...common, "-vf", "fps=30,scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-c:a", "aac", "-b:a", "128k", sd]);
    // Poster: the title frame, once the title is fully up.
    await sharp(path.join(framesDir, `${String(Math.round(1.6 * FPS)).padStart(5, "0")}.jpg`))
      .resize(1280)
      .webp({ quality: 84, effort: 6 })
      .toFile(path.join(OUT, "trailer-poster.webp"));
    console.log(`Length ${total.toFixed(1)} s`);
    for (const f of [hd, sd]) console.log(`${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(2)} MB`);
  }
} finally {
  chrome?.kill();
  await sleep(500);
  if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  else console.log("frames kept in", work);
}
