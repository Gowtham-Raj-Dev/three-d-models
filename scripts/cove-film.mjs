/**
 * Cannon Cove's film set, shared by scripts/record-cove-trailer.mjs and scripts/record-cove-card-loop.mjs: the
 * page-side director that stages each shot inside the real game (window.__cannonCove on the dev server) — a
 * trading career with a full fleet, ships placed at sea with pirates around them, ports with the real port
 * screen, the Drowned Queen, and an online battle with three scripted rival captains — plus cinematic cameras
 * and the trailer's captions.
 */

/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
export const VIRTUAL_TIME = `(() => {
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

/** Every sound effect the game makes (logged while filming, replayed into the soundtrack). */
export const SFX = ["cannon", "fuse", "splash", "hit", "hurt", "bump", "sink", "explode", "coin", "repair", "sail", "reloaded", "empty", "waveStart", "waveClear", "boss", "wail", "pick", "gameOver", "ambience"];

export async function connect(url) {
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

/**
 * The director. `shots` (JSON) each have `dur` and `game`: { kind: "sea" | "port" | "online", … } (see the
 * staging functions below), optional `ui` (show the game's own HUD / port screen), `overlay` (keep the labels
 * drawn over the 3D view), and trailer captions (`title`, `head`, `tag`, `pos`, `end`, `endAt`).
 */
export const DIRECTOR = (data) => `(() => {
  const { shots, captions, sfx } = ${JSON.stringify(data)};
  const { game: g } = window.__cannonCove;
  const root = document.querySelector(".g-root");
  const TAU = Math.PI * 2;
  const ink = "#2a170a";
  const css = document.createElement("style");
  css.textContent = \`
    .g-root.cv-hide > :not(canvas):not(#film), nextjs-portal { visibility: hidden !important; }
    .g-root.cv-clean > canvas[aria-hidden] { visibility: hidden !important; }
    .g-root [class*="cove-hint"] { display: none !important; }
    #film { position: absolute; inset: 0; z-index: 100; pointer-events: none; font-family: var(--game-display), serif; color: #fdf3dc; }
    #film .shade { position: absolute; inset: 0; }
    #film .title { position: absolute; left: 0; right: 0; top: 22%; text-align: center; }
    #film .title b { display: block; font-size: 150px; line-height: .95; font-weight: 400; color: #fdf3dc; text-shadow: 5px 5px 0 \${ink}, -4px -4px 0 \${ink}, 4px -4px 0 \${ink}, -4px 4px 0 \${ink}, 0 0 50px #0009; }
    #film .title b i { font-style: normal; color: #fbbf24; }
    #film .title span { display: inline-block; margin-top: 22px; padding: 10px 30px 8px; font-size: 32px; letter-spacing: .06em; color: \${ink}; background: linear-gradient(180deg, #f6e7c8, #e7cf9f); border: 4px solid #6b4423; border-radius: 12px; box-shadow: 0 0 0 4px \${ink}, 0 10px 24px #0008; }
    #film .head { position: absolute; left: 46px; top: 42px; }
    #film .head.bl { top: auto; bottom: 46px; }
    #film .head b { display: inline-block; background: linear-gradient(180deg, #f6e7c8, #e7cf9f); color: \${ink}; font-size: 50px; font-weight: 400; padding: 8px 28px 6px; border: 4px solid #6b4423; border-radius: 12px; box-shadow: 0 0 0 4px \${ink}, 0 10px 22px #0008; transform: rotate(-1.5deg); }
    #film .head span { display: block; margin: 16px 0 0 8px; font-size: 26px; letter-spacing: .03em; text-shadow: 2px 2px 0 \${ink}, -2px -2px 0 \${ink}, 2px -2px 0 \${ink}, -2px 2px 0 \${ink}, 0 0 14px #000a; }
    #film .tag { position: absolute; left: 46px; bottom: 48px; }
    #film .tag b { display: block; font-size: 70px; font-weight: 400; line-height: 1; color: #fdf3dc; text-shadow: 4px 4px 0 \${ink}, -3px -3px 0 \${ink}, 3px -3px 0 \${ink}, -3px 3px 0 \${ink}, 0 0 30px #0009; }
    #film .tag span { display: inline-block; margin-top: 12px; padding: 6px 18px 5px; background: linear-gradient(180deg, #f6e7c8, #e7cf9f); color: \${ink}; border: 3px solid #6b4423; border-radius: 10px; box-shadow: 0 0 0 3px \${ink}; font-size: 28px; }
    #film .tag span em { font-style: normal; color: #b45309; }
    #film .flash { position: absolute; inset: 0; background: #fff; }
    #film .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    #film .end b { font-size: 136px; font-weight: 400; line-height: .95; color: #fdf3dc; text-shadow: 5px 5px 0 \${ink}, -4px -4px 0 \${ink}, 4px -4px 0 \${ink}, -4px 4px 0 \${ink}, 0 0 50px #000a; }
    #film .end b i { font-style: normal; color: #fbbf24; }
    #film .play { margin-top: 30px; display: inline-flex; align-items: center; gap: 16px; background: linear-gradient(180deg, #a2703e, #6b4423); color: #fdf3dc; font-size: 54px; padding: 14px 44px 10px; border: 3px solid \${ink}; border-radius: 14px; box-shadow: 0 8px 0 \${ink}, 0 14px 30px #000a; }
    #film .play svg { width: 40px; height: 40px; }
    #film .url { margin-top: 30px; font-size: 32px; letter-spacing: .02em; text-shadow: 2px 2px 0 \${ink}, -2px -2px 0 \${ink}, 2px -2px 0 \${ink}, -2px 2px 0 \${ink}; }
    #film .small { margin-top: 10px; font-size: 22px; letter-spacing: .04em; color: #f6e7c8; text-shadow: 2px 2px 0 \${ink}, -2px -2px 0 \${ink}, 2px -2px 0 \${ink}, -2px 2px 0 \${ink}; }
  \`;
  document.head.append(css);
  const layer = document.createElement("div");
  layer.id = "film";
  root.append(layer);

  // --- A merchant prince's career: every ship, every port charted, a hold of goods. -------------------
  const ALL = ["skiff", "cutter", "sloop", "brig", "corsair", "galleon", "indiaman", "dread", "steamer", "freighter", "liner", "queen"];
  const PORTS = ["haven", "coral", "palm", "sugar", "iron", "spice", "silk", "gold", "fort", "skull"];
  const SAVE = { v: 1, seed: 7, gold: 184500, xp: 50000, ship: "galleon", fleet: ALL, hull: 1, up: { hold: 3, hull: 3, sails: 2, reload: 3, guns: 1, shot: 2, range: 1, haggle: 1, carpenter: 1, spyglass: 1 },
    cargo: {}, basis: {}, contracts: [], visited: PORTS, port: "haven", sea: null, guideOff: true, queenAt: 1e12,
    stats: { contracts: 64, bounties: 9, pirates: 41, treasures: 4, sold: 5200, earned: 412000, sailed: 96000, queens: 1, played: 99999 } };

  // --- Logged sound effects (time, name, arguments). ---------------------------------------------------
  const fxLog = [];
  let logging = false, tNow = 0, lastAmb = -1;
  const originals = {};
  for (const name of sfx) {
    originals[name] = g.sfx[name].bind(g.sfx);
    g.sfx[name] = (...args) => {
      if (!logging) return;
      if (name === "ambience") { if (tNow - lastAmb < 0.25) return; lastAmb = tNow; }
      fxLog.push([tNow, name, args]);
    };
  }

  // --- Cameras -----------------------------------------------------------------------------------------
  let camFn = null, T = 0;
  const origCam = g.updateCamera.bind(g);
  g.updateCamera = (dt) => {
    origCam(dt);
    if (!camFn) return;
    const c = camFn(T);
    g.camera.position.set(c[0], c[1], c[2]);
    g.camera.lookAt(c[3], c[4], c[5]);
    g.camLook.set(c[3], c[4], c[5]);
  };
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const cams = {
    // Round the ship (or a point), slowly.
    orbit: (o) => (t) => { const p = o.at ? { x: o.at[0], z: o.at[1] } : g.player; const a = (o.a0 ?? 0) + g.player.heading * (o.at ? 0 : 1) + (o.speed ?? 0.12) * t; const r = o.r + (o.zoom ?? 0) * t; return [p.x + Math.sin(a) * r, o.h + (o.rise ?? 0) * t, p.z + Math.cos(a) * r, p.x, o.y ?? 3, p.z]; },
    // Over the ship's shoulder, looking out of one side (where the broadside goes).
    over: (o) => (t) => {
      const p = g.player, s = o.side ?? 1;
      const sx = Math.cos(p.heading) * s, sz = -Math.sin(p.heading) * s, fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const d = o.dist ?? 22, b = (o.back ?? 10) + (o.drift ?? 0) * t;
      return [p.x - sx * d - fx * b, o.h ?? 11, p.z - sz * d - fz * b, p.x + sx * (o.look ?? 24) + fx * 4, 2, p.z + sz * (o.look ?? 24) + fz * 4];
    },
    // Low and alongside, the ship sailing past.
    beside: (o) => (t) => { const p = g.player, s = o.side ?? 1; const sx = Math.cos(p.heading) * s, sz = -Math.sin(p.heading) * s, fx = Math.sin(p.heading), fz = Math.cos(p.heading); const a = (o.ahead ?? 14) - (o.slide ?? 4) * t; return [p.x + sx * o.dist + fx * a, o.h ?? 4, p.z + sz * o.dist + fz * a, p.x + fx * 3, o.y ?? 4, p.z + fz * 3]; },
  };

  // --- Staging -------------------------------------------------------------------------------------------
  const site = (id) => g.sea.ports.find((p) => p.id === id);
  const clearSea = () => {
    for (const e of g.enemies) g.releaseShip(e);
    g.enemies = [];
    g.queen = null;
    g.bounties.clear();
    g.shots = [];
    for (const b of g.balls) { b.active = false; b.obj.visible = false; }
    for (const l of g.loot) g.releaseLoot(l);
    g.loot = [];
    g.smoke.clear(); g.glow.clear(); g.rings.clear();
    g.texts = [];
    g.banner = null; g.bannerQueue = []; g.bannerT = 0;
  };
  const ensureTrade = () => {
    if (g.onlineActive) g.stopOnline();
    if (!g.isTrade) g.startTrade(JSON.parse(JSON.stringify(SAVE)));
  };
  const setShip = (id) => {
    const c = g.career;
    c.s.ship = id;
    c.s.hull = 1;
    g.applyTradeShip();
  };
  const wind = (angle, strength = 1.12) => {
    g.wind.angle = g.windTarget = angle;
    g.wind.strength = g.windStrengthTarget = strength;
    g.windTimer = 1e9;
    g.updateWindVector();
  };
  /** Open water near a point (nothing solid within \`clear\` metres). */
  const openNear = (x, z, clear = 45) => {
    for (let r = 0; r < 260; r += 8) for (let a = 0; a < TAU; a += 0.4) {
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      if (!g.sea.shoals.some((s) => Math.hypot(s.x - px, s.z - pz) < s.r + clear)) return [px, pz];
    }
    return [x, z];
  };
  const clickText = (text) => { const b = [...document.querySelectorAll(".g-root button")].find((b) => b.textContent.trim().startsWith(text)); b?.click(); return !!b; };

  let shot = null, done = new Set(), paths = [];

  const stage = {
    /** A ship at sea: { ship, near: [port, distance out from the harbour, sideways], h (relative to the jetty), foes, fire, queen, auto, wp }. */
    sea(q) {
      ensureTrade();
      if (g.currentPhase === "port") g.setSail();
      clearSea();
      setShip(q.ship);
      let x, z, h;
      if (q.near) {
        const s = site(q.near[0]);
        const fx = Math.sin(s.h), fz = Math.cos(s.h);
        [x, z] = openNear(s.zone.x + fx * q.near[1] + fz * (q.near[2] ?? 0), s.zone.z + fz * q.near[1] - fx * (q.near[2] ?? 0), q.clear ?? 45);
        h = s.h + (q.h ?? 0);
      } else { [x, z] = openNear(q.at[0], q.at[1], q.clear ?? 45); h = q.h ?? 0; }
      const p = g.player;
      p.reset(x, z, h);
      p.sail = q.sail ?? 3;
      p.sailVis = p.sail / 3;
      p.speed = q.speed ?? 8;
      if (!shot.ui) p.maxHp = p.hp = 1e6;
      wind(h + (q.wind ?? Math.PI / 2));
      g.encounterT = g.flotsamT = 1e9;
      g.trafficT = q.traffic === false ? 1e9 : 0;
      g.autopilot = false;
      g.stick = q.steer ?? 0;
      const c = g.career;
      c.s.queenAt = q.queen ? 0 : 1e12;
      c.s.contracts = q.contracts ?? [];
      c.s.waypoint = null;
      if (q.wp) { const w = site(q.wp); c.s.waypoint = { x: w.zone.x, z: w.zone.z, label: w.def.name }; }
      for (const e of q.foes ?? []) {
        const stats = g.scaledStats(e.cls);
        stats.name = "Pirate " + e.cls;
        const s = g.takeShip(e.cls, stats);
        const sx = Math.cos(h), sz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
        g.launchEnemy(s, x + sx * e.side + fx * (e.ahead ?? 0), z + sz * e.side + fz * (e.ahead ?? 0));
        s.heading = h + (e.dh ?? 0);
        s.speed = e.speed ?? 7;
        s.sail = 3;
        s.maxHp = s.hp = e.hp ?? s.maxHp;
        s.reload[1] = s.reload[-1] = e.fireAt ?? 99;
        s.sideTimer = 99;
        s.side = e.side > 0 ? -1 : 1;
      }
      if (q.auto) { p.sail = 3; g.setAutopilot(true); }
      g.camSnap = true;
      g.shoalT = 0;
    },
    /** Moored at a port: { port, ship, cargo, tab, pick, angle }. */
    port(q) {
      ensureTrade();
      clearSea();
      const c = g.career;
      c.s.cargo = q.cargo ?? {};
      c.s.basis = q.basis ?? {};
      c.s.contracts = [];
      setShip(q.ship);
      g.moor(q.port);
      g.portNotices = [];
      g.snapToBerth();
      g.portAngle = site(q.port).h + (q.angle ?? 0.75);
      g.portAct(false);
      g.camSnap = true;
      g.shoalT = 0;
    },
    /** An online battle in the cove against scripted rivals: { me: [x, z, h], rivals: [{ id, name, ship, color, path }], events }. */
    online(q) {
      if (g.isTrade || g.currentPhase === "port") g.toMenu();
      const t0 = performance.now();
      g.startOnline({ me: "me", name: "You", ship: 2, color: 0, start: t0 - 2000, end: t0 + 172000, goal: 5, seed: 11, peers: q.rivals.map(({ id, name, ship, color }) => ({ id, name, ship, color })), now: () => performance.now(), send() {}, emit() {} });
      g.invulnT = 1e9;
      g.startShown = true;
      g.banner = null; g.bannerQueue = []; g.bannerT = 0;
      const p = g.player;
      p.reset(q.me[0], q.me[1], q.me[2]);
      p.maxHp = p.hp = 240;
      p.sail = 2; p.sailVis = 2 / 3; p.speed = 6;
      g.stick = q.steer ?? 0;
      g.camSnap = true;
      paths = q.rivals;
    },
  };

  /** A rival's report for this moment, from its scripted circle: [time, x, z, heading, speed, sail, hull, max, afloat, sinks, sunk, ship]. */
  const rivalState = (r, t) => {
    const [cx, cz, rad, w, ph] = r.path;
    const a = ph + w * t;
    const x = cx + Math.sin(a) * rad, z = cz + Math.cos(a) * rad;
    const h = Math.atan2(Math.cos(a) * w, -Math.sin(a) * w);
    const sunk = r.sinkAt !== undefined && t >= r.sinkAt;
    return [performance.now(), x, z, h, Math.abs(w * rad), 2, sunk ? 0 : r.hp ?? 150, 180, sunk ? 0 : 1, r.k ?? 0, r.d ?? 0, r.ship];
  };

  const setup = (s) => {
    logging = false;
    shot = s;
    done = new Set();
    paths = [];
    T = 0;
    root.classList.toggle("cv-hide", !s.ui);
    root.classList.toggle("cv-clean", !s.ui && !s.overlay);
    stage[s.game.kind](s.game);
    // Draw the islands around the new spot from the very first frame.
    if (g.sea && g.isTrade) g.sea.cull(g.player.x, g.player.z, 460);
    camFn = s.game.cam ? cams[s.game.cam.type](s.game.cam) : null;
    logging = true;
  };

  /** Things that happen at set times in a shot: broadsides, rival fire, sinkings, UI taps. */
  const cues = () => {
    const q = shot.game;
    const p = g.player;
    if (!shot.ui) g.setShowcase(0, 0);
    if (q.kind !== "online") { g.encounterT = g.flotsamT = 1e9; if (!q.wp) g.windTimer = 1e9; }
    (q.fire ?? []).forEach(([at, side], i) => { if (T >= at && !done.has("f" + i)) { done.add("f" + i); p.reload[side] = 0; g.firePlayer(side); } });
    if (q.queen && g.queen && !done.has("barrage")) { done.add("barrage"); g.queen.barrageT = q.barrageAt ?? 0.9; g.queen.reload[1] = g.queen.reload[-1] = 99; }
    if (q.kind === "port" && shot.ui) {
      if (q.tab && !done.has("tab") && T > 0.05) { done.add("tab"); clickText(q.tab); }
      if (q.pick && !done.has("pick") && T > 0.1) { done.add("pick"); const b = [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(q.pick)); b?.click(); }
    }
    if (q.kind === "online") {
      for (const r of paths) g.onlineState(r.id, rivalState(r, T));
      (q.events ?? []).forEach(([at, kind, who], i) => {
        if (T < at || done.has("e" + i)) return;
        done.add("e" + i);
        if (kind === "fire") {
          // A rival's broadside, aimed just ahead of your ship.
          const sh = [0, 1, 2, 3].map((k) => [p.x + Math.sin(p.heading) * (2 + k * 2.4) + (Math.random() - 0.5) * 3, 0, p.z + Math.cos(p.heading) * (2 + k * 2.4) + (Math.random() - 0.5) * 3, 1.0, k * 0.08]);
          g.onlineEvent(who, { k: "f", sd: 1, n: 4, sh, dmg: 10, i: "f" + i });
        } else if (kind === "shoot") { p.reload[who] = 0; g.firePlayer(who); }
        else if (kind === "sink") g.onlineEvent(who, { k: "s", by: "me", i: "s" + i });
      });
    }
  };

  // --- Captions ------------------------------------------------------------------------------------------
  const starts = [];
  shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
  const total = shots.reduce((n, s) => n + s.dur, 0);
  const caption = (s, t, i) => {
    const local = t - starts[i];
    let html = "";
    if (s.title) {
      const k = ease((local - 0.15) / 0.45), out = ease((local - (s.dur - 0.35)) / 0.35);
      html += '<div class="shade" style="background:radial-gradient(ellipse at center, #08142a66, #0000 70%)"></div>';
      html += '<div class="title" style="opacity:' + (k * (1 - out)) + ';transform:scale(' + (1.14 - 0.14 * k) + ') translateY(' + (-40 * out) + 'px)"><b>Cannon <i>Cove</i></b><span>Trade · Sail · Battle</span></div>';
    }
    if (s.head) {
      let first = i;
      while (first > 0 && shots[first - 1].head && shots[first - 1].head[0] === s.head[0]) first--;
      const k = ease((t - starts[first]) / 0.3);
      html += '<div class="head' + (s.pos === "bl" ? " bl" : "") + '" style="transform:translateX(' + (-70 * (1 - k)) + 'px);opacity:' + k + '"><b>' + s.head[0] + '</b>' + (s.head[1] ? '<span>' + s.head[1] + '</span>' : "") + '</div>';
    }
    if (s.tag) {
      const k = ease(local / 0.22);
      html += '<div class="tag" style="transform:translateY(' + (26 * (1 - k)) + 'px);opacity:' + k + '"><b>' + s.tag[0] + '</b><span>' + s.tag[1] + (s.tag[2] ? ' · <em>' + s.tag[2] + '</em>' : "") + '</span></div>';
    }
    if (s.end) {
      const k = ease((local - (s.endAt ?? 0)) / 0.5);
      const pulse = 1 + Math.sin(Math.max(0, local - (s.endAt ?? 0) - 0.6) * 5) * 0.035;
      html += '<div class="shade" style="background:#08142a;opacity:' + (0.55 * k) + '"></div>';
      html += '<div class="end" style="opacity:' + k + ';transform:scale(' + (0.9 + 0.1 * k) + ')"><b>Cannon <i>Cove</i></b>' +
        '<div class="play" style="transform:scale(' + pulse + ')"><svg viewBox="0 0 24 24" fill="#fdf3dc"><path d="M7 4.5v15l12.5-7.5z"/></svg>Play now — free</div>' +
        '<div class="url">models.codelove.in/games/cannon-cove</div><div class="small">No download · no sign-up · phone &amp; PC</div></div>';
    }
    const montage = i > 0 && s.tag && shots[i - 1].tag && s.head && shots[i - 1].head && shots[i - 1].head[0] === s.head[0];
    if (i > 0 && !montage && local < 0.16) html += '<div class="flash" style="opacity:' + (0.45 * (1 - local / 0.16)) + '"></div>';
    if (t < 0.3) html += '<div class="shade" style="background:#000;opacity:' + (1 - t / 0.3) + '"></div>';
    if (t > total - 0.35) html += '<div class="shade" style="background:#000;opacity:' + ((t - (total - 0.35)) / 0.35) + '"></div>';
    layer.innerHTML = html;
  };

  let current = -1;
  window.__film = {
    /** Trailer: frame n of the whole storyboard (switches shots, steps the clock, draws the captions). */
    frame(n, fps) {
      const t = n / fps;
      tNow = t;
      let i = 0;
      while (i + 1 < shots.length && t >= starts[i + 1]) i++;
      if (i !== current) { current = i; setup(shots[i]); }
      T = t - starts[i];
      cues();
      window.__vt.step(1000 / fps);
      if (captions) caption(shots[i], t, i);
    },
    /** Card loop: start shot i, then step it on its own. */
    play(i) { setup(shots[i]); },
    step(dt) { cues(); window.__vt.step(dt * 1000); T += dt; },
    /** Forget the warm-up: no logged sounds, the storyboard starts again. */
    reset() { fxLog.length = 0; current = -1; },
    fx: () => fxLog,
    originals,
    total,
  };
  return shots.length;
})()`;
