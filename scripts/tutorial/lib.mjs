/**
 * Shared code for the Scene Builder tutorial videos (scripts/tutorial/*). A tutorial is a script that
 * drives the live builder like a person would — a drawn pointer, real mouse and keyboard events —
 * while the Director records it frame by frame on the promo's virtual clock and notes when each
 * narration line, chapter, click and key press happens.
 *
 * The builder keeps its scene in React state, so the page helper (`__tut`) reads it straight from
 * the component (and can dispatch to it): after a real click drops a part, the part is nudged onto
 * the exact spot the finished scene needs — whatever the pointer happened to hit.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { FFMPEG, PROMO, clamp01, easeInOut, grab, lerp, sleep } from "../promo/lib.mjs";

export { FFMPEG, PROMO, SITE, duration, ffmpeg, openBrowser, sleep } from "../promo/lib.mjs";

export const FPS = Number(process.env.FPS ?? 30);
/** The builder's window in CSS px; × DPR = the 1920×1080 video. */
export const WIDTH = 1600;
export const HEIGHT = 900;
export const DPR = 1.2;

/** Everything a tutorial makes (git-ignored, like the promo): voice, raw capture, timeline, final files. */
export const workDir = (id) => path.join(PROMO, "tutorials", id);

/** Loads scripts/tutorial/<id>.mjs. */
export async function loadTutorial(id) {
  if (!id) throw new Error("which tutorial? e.g. haunted-backyard");
  return import(new URL(`./${id}.mjs`, import.meta.url).href);
}

// --- In the page -------------------------------------------------------------------------------------

/** `__tut`: the builder's state and 3D view, element lookups, and the overlays drawn above the page. */
export const PAGE = `(() => {
  const FOV = 45;
  let apiRef = null, dispatch = null;
  const fiberOf = (el) => { for (const k in el) if (k.startsWith("__reactFiber$")) return el[k]; return null; };
  // The builder component is the one holding the undo history; its canvas API sits in a ref beside it.
  const scan = (fiber) => {
    let h = fiber.memoizedState, hist = null, api = null, n = 0;
    while (h && typeof h === "object" && n++ < 400) {
      const s = h.memoizedState;
      if (s && typeof s === "object") {
        if (Array.isArray(s.past) && Array.isArray(s.future) && s.present && h.queue && typeof h.queue.dispatch === "function") hist = h;
        else if (s.current && typeof s.current.getCamera === "function" && typeof s.current.pointAt === "function") api = s;
      }
      h = h.next;
    }
    return hist ? { hist, api } : null;
  };
  const find = () => {
    const el = document.querySelector('input[aria-label="Search parts"]') || document.querySelector("canvas");
    let f = el && fiberOf(el);
    if (!f) return null;
    while (f.return) f = f.return;
    const stack = [f.stateNode && f.stateNode.current ? f.stateNode.current : f];
    while (stack.length) {
      const x = stack.pop();
      if (typeof x.type === "function") { const r = scan(x); if (r) return r; }
      if (x.sibling) stack.push(x.sibling);
      if (x.child) stack.push(x.child);
    }
    return null;
  };
  const state = () => {
    const f = find();
    if (!f) return null;
    dispatch = f.hist.queue.dispatch;
    if (f.api) apiRef = f.api;
    return f.hist.memoizedState;
  };
  const api = () => { if (!apiRef || !apiRef.current) state(); return apiRef && apiRef.current; };
  const view = () => { const c = document.querySelector("canvas"); return c ? c.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight }; };

  const find1 = (t) => {
    let els;
    if (t.field) els = [...document.querySelectorAll("label")].filter((l) => l.firstElementChild && l.firstElementChild.textContent.trim() === t.field).map((l) => l.querySelector("input")).filter(Boolean);
    else {
      els = [...document.querySelectorAll(t.sel || "button, a, [role=option], [role=radio], [role=tab], input, label")];
      if (t.text) els = els.filter((e) => { const s = e.textContent.trim(); return t.exact ? s === t.text : s.startsWith(t.text); });
      if (t.label) els = els.filter((e) => (e.getAttribute("aria-label") || "").startsWith(t.label));
    }
    els = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return els[t.idx || 0] || null;
  };
  const scrollerOf = (e) => { for (let n = e.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 2) return n; } return null; };

  const make = () => {
    let root = document.getElementById("tut-ui");
    if (root) return root;
    const css = document.createElement("style");
    css.textContent = \`
      #tut-ui { position: fixed; inset: 0; z-index: 2147483600; pointer-events: none; }
      #tut-ui > * { position: absolute; opacity: 0; }
      #tut-chip { display: flex; align-items: center; gap: 10px; padding: 7px 16px 7px 7px; border-radius: 999px; background: rgb(15 13 24 / .86); border: 1px solid rgb(167 139 250 / .5); box-shadow: 0 10px 34px rgb(0 0 0 / .55); color: #fff; font-size: 15px; font-weight: 600; letter-spacing: -.005em; white-space: nowrap; }
      #tut-chip b { display: grid; place-items: center; height: 26px; padding: 0 11px; border-radius: 999px; background: #a78bfa; color: #150f24; font-size: 11px; font-weight: 700; letter-spacing: .09em; }
      #tut-keys { display: flex; align-items: center; gap: 7px; transform: translateX(-50%); color: #cfc8ea; font-size: 15px; font-weight: 600; white-space: nowrap; }
      #tut-keys kbd { min-width: 38px; padding: 8px 12px; border-radius: 10px; background: rgb(22 19 34 / .94); border: 1px solid rgb(255 255 255 / .22); border-bottom-width: 3px; box-shadow: 0 8px 26px rgb(0 0 0 / .55); color: #fff; font: 600 16px/1 ui-monospace, "Cascadia Mono", Consolas, monospace; text-align: center; }
      #tut-lapse { display: flex; align-items: center; gap: 8px; padding: 7px 13px; border-radius: 999px; background: rgb(15 13 24 / .86); border: 1px solid rgb(251 191 36 / .55); color: #fde68a; font-size: 13px; font-weight: 600; letter-spacing: .04em; white-space: nowrap; }
      #tut-ring { border: 2px solid #a78bfa; border-radius: 12px; box-shadow: 0 0 0 5px rgb(167 139 250 / .2), 0 0 26px rgb(167 139 250 / .55); }
      #tut-card { inset: 0; display: grid; place-items: center; text-align: center; color: #fff; }
      #tut-card .in { max-width: 1100px; padding: 0 60px; }
      #tut-card .eb { display: inline-block; padding: 7px 16px; border-radius: 999px; border: 1px solid rgb(167 139 250 / .55); background: rgb(167 139 250 / .14); color: #d6c9ff; font-size: 15px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; }
      #tut-card h1 { margin: 26px 0 0; font-size: 86px; line-height: 1.02; font-weight: 700; letter-spacing: -.035em; text-shadow: 0 6px 40px rgb(0 0 0 / .7); }
      #tut-card p { margin: 22px 0 0; font-size: 27px; color: #d9d5ea; text-shadow: 0 3px 20px rgb(0 0 0 / .8); }
      #tut-card .ft { margin-top: 44px; font-size: 19px; font-weight: 600; color: #a78bfa; letter-spacing: .02em; }
    \`;
    document.head.append(css);
    root = document.createElement("div");
    root.id = "tut-ui";
    root.innerHTML = '<div id="tut-card"><div class="in"><span class="eb"></span><h1></h1><p></p><div class="ft"></div></div></div><div id="tut-ring"></div><div id="tut-chip"><b></b><span></span></div><div id="tut-lapse">&#9193; <span></span></div><div id="tut-keys"></div>';
    document.documentElement.append(root);
    return root;
  };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  window.__tut = {
    ready() { return !!state() && !!api(); },
    doc() { return state().present; },
    count() { return state().present.items.length; },
    ids() { return state().present.items.map((i) => i.id); },
    dispatch(a) { state(); dispatch(a); },
    camera() { return api().getCamera(); },
    setCamera(v) { api().setCamera(v); },
    view() { const r = view(); return { l: r.left, t: r.top, w: r.width, h: r.height }; },
    /** Screen point of a world point, as the 3D view draws it now. */
    project(p) {
      const a = api();
      if (!a) return null;
      const { position: c, target: t } = a.getCamera();
      const r = view();
      const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const norm = (u) => { const l = Math.hypot(u[0], u[1], u[2]) || 1; return [u[0] / l, u[1] / l, u[2] / l]; };
      const f = norm(sub(t, c)), s = norm(cross(f, [0, 1, 0])), up = cross(s, f), d = sub(p, c);
      const z = dot(d, f);
      if (z < 0.2) return null;
      const h = Math.tan((FOV * Math.PI) / 360);
      const nx = dot(d, s) / (z * h * (r.width / r.height)), ny = dot(d, up) / (z * h);
      return { x: r.left + ((nx + 1) / 2) * r.width, y: r.top + ((1 - ny) / 2) * r.height, inside: Math.abs(nx) < 0.96 && Math.abs(ny) < 0.94 };
    },
    /** Centre (or fx/fy point) and box of an element: { sel, text, exact, label, idx } or { field: "Copies" }. */
    rect(t) {
      const e = find1(t);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width * (t.fx ?? 0.5) + (t.dx ?? 0), y: r.top + r.height * (t.fy ?? 0.5) + (t.dy ?? 0), l: r.left, t: r.top, w: r.width, h: r.height };
    },
    attr(t, name) { const e = find1(t); return e ? e.getAttribute(name) : null; },
    /** Where the element's scrolling panel is, and where it should be to show the element. */
    scroll(t) {
      const e = find1(t), s = e && scrollerOf(e);
      if (!s) return null;
      const er = e.getBoundingClientRect(), sr = s.getBoundingClientRect();
      const seen = er.top >= sr.top + 8 && er.bottom <= sr.bottom - 8;
      const want = Math.max(0, Math.min(s.scrollHeight - s.clientHeight, s.scrollTop + (er.top + er.height / 2) - (sr.top + sr.height * 0.45)));
      window.__tutScroller = s;
      return { top: s.scrollTop, want, seen };
    },
    /** True once every one of these items has its model in the scene. */
    loaded(ids) {
      const a = api();
      if (!a) return false;
      const kinds = new Map(state().present.items.map((i) => [i.id, i.kind]));
      return ids.every((id) => { if (kinds.get(id) !== "model") return true; try { return a.dropY(id) !== null; } catch { return false; } });
    },
    /** Draws this frame's pointer and overlays, moves the camera if asked, then steps the page's clock. */
    frame(o, ms) {
      const root = make(), r = view();
      const el = (id) => root.querySelector("#" + id);
      const chip = el("tut-chip");
      chip.style.opacity = o.chip ? o.chip.k : 0;
      if (o.chip) { chip.style.left = r.left + 16 + "px"; chip.style.top = r.top + 16 - (1 - o.chip.k) * 8 + "px"; chip.firstChild.textContent = o.chip.tag; chip.lastChild.textContent = o.chip.title; chip.firstChild.style.display = o.chip.tag ? "" : "none"; chip.style.paddingLeft = o.chip.tag ? "7px" : "16px"; }
      const keys = el("tut-keys");
      keys.style.opacity = o.keys ? o.keys.k : 0;
      if (o.keys) { keys.style.left = r.left + r.width / 2 + "px"; keys.style.top = r.bottom - 118 + "px"; keys.innerHTML = o.keys.keys.map((k, i, all) => (k.startsWith("~") ? "<span>" + esc(k.slice(1)) + "</span>" : (i && !all[i - 1].startsWith("~") ? "<span>+</span>" : "") + "<kbd>" + esc(k) + "</kbd>")).join(""); }
      const lapse = el("tut-lapse");
      lapse.style.opacity = o.lapse ? o.lapse.k : 0;
      if (o.lapse) { lapse.style.left = "auto"; lapse.style.right = innerWidth - r.right + 16 + "px"; lapse.style.top = r.top + 18 + "px"; lapse.lastChild.textContent = o.lapse.text; }
      const ring = el("tut-ring");
      const rr = o.ring && find1(o.ring.t);
      ring.style.opacity = rr ? o.ring.k : 0;
      if (rr) { const b = rr.getBoundingClientRect(), pad = o.ring.pad ?? 5; ring.style.left = b.left - pad + "px"; ring.style.top = b.top - pad + "px"; ring.style.width = b.width + pad * 2 + "px"; ring.style.height = b.height + pad * 2 + "px"; }
      const card = el("tut-card");
      card.style.opacity = o.card ? o.card.k : 0;
      if (o.card) {
        card.style.background = "radial-gradient(ellipse at center, rgb(8 6 14 / " + o.card.dim * 0.72 + ") 0%, rgb(8 6 14 / " + o.card.dim + ") 78%)";
        const [eb, h1, p, ft] = card.firstChild.children;
        eb.textContent = o.card.eyebrow; h1.textContent = o.card.title; p.textContent = o.card.sub; ft.textContent = o.card.foot;
        card.firstChild.style.transform = "translateY(" + (1 - o.card.k) * 14 + "px)";
      }
      if (o.scroll != null && window.__tutScroller) window.__tutScroller.scrollTop = o.scroll;
      window.__pointer.set(o.p[0], o.p[1], !!o.p[2], !!o.p[3], o.rp);
      if (o.cam) { const a = api(); if (a) a.setCamera(o.cam); }
      window.__vt.step(ms);
      const now = view();
      return Math.round(now.width) + "x" + Math.round(now.height);
    },
  };
})()`;

// --- The recorder ------------------------------------------------------------------------------------

/** Thrown by chapter() to end a test run early (UNTIL="STEP 3"). */
export class Stop extends Error {}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const fade = (t, t0, t1, i = 0.25, o = 0.3) => clamp01(Math.min((t - t0) / i, (t1 - t) / o));

export class Director {
  /**
   * @param voice  { [line key]: { seconds } } — how long each narration line takes
   * @param sink   async (jpeg: Buffer, frame: number) => void
   */
  constructor({ page, cdp, voice, sink, parts, quality = 90 }) {
    Object.assign(this, { page, cdp, voice, sink, parts, quality });
    this.n = 0;
    this.cursor = { x: WIDTH * 0.55, y: HEIGHT * 0.55 };
    this.sent = null;
    this.shown = false;
    this.down = false;
    this.ripple = null;
    this.chip = null;
    this.keys = null;
    this.lapse = null;
    this.ring = null;
    this.card = null;
    this.cam = null;
    this.scroll = null;
    this.line = null;
    this.voiceEnd = 0;
    this.view = null;
    this.placing = null;
    // Test runs: FROM="STEP 5" plays everything before that chapter without recording it (and mostly
    // without drawing it); `must` counts frames that have to be drawn anyway, around clicks and keys.
    this.skip = !!process.env.FROM;
    this.must = 0;
    this.timeline = { lines: [], chapters: [], events: [] };
    this.started = Date.now();
    // Requests in flight: the clock waits for them, so no frame shows a half-loaded part.
    this.inflight = new Map();
    this.lastDone = 0;
    cdp.on("Network.requestWillBeSent", (e) => {
      if (/^(data|blob):/.test(e.request.url) || e.type === "EventSource" || e.type === "WebSocket") return;
      this.inflight.set(e.requestId, Date.now());
    });
    const done = (e) => {
      if (this.inflight.delete(e.requestId)) this.lastDone = Date.now();
    };
    cdp.on("Network.loadingFinished", done);
    cdp.on("Network.loadingFailed", done);
  }

  get t() {
    return this.n / FPS;
  }

  eval(js) {
    return this.page.evaluate(js);
  }

  call(fn, ...args) {
    return this.page.evaluate(`__tut.${fn}(${args.map((a) => JSON.stringify(a)).join(",")})`);
  }

  event(type, at = this.t) {
    this.timeline.events.push({ t: +at.toFixed(3), type });
  }

  async settle() {
    const start = Date.now();
    for (;;) {
      for (const [id, at] of this.inflight) if (Date.now() - at > 20_000) this.inflight.delete(id);
      if (!this.inflight.size && Date.now() - this.lastDone >= 120) return;
      if (Date.now() - start > 15_000) return console.warn(`  ${this.t.toFixed(1)} s: still loading after 15 s (${this.inflight.size} requests) — going on`);
      await sleep(30);
    }
  }

  /** One video frame: overlays and pointer as they are now, 1/FPS s of page time, a screenshot. */
  async frame() {
    if (this.skip) {
      const draw = !!this.cam || this.must > 0 || this.n % 8 === 0;
      if (this.must > 0) this.must--;
      if (!draw) return void this.n++;
    }
    const t = this.t;
    const o = { p: [this.cursor.x, this.cursor.y, this.shown, this.down], rp: null, scroll: this.scroll };
    if (this.ripple) {
      const k = (t - this.ripple.t0) / 0.45;
      if (k < 1) o.rp = { x: this.ripple.x, y: this.ripple.y, k };
      else this.ripple = null;
    }
    if (this.chip) o.chip = { tag: this.chip.tag, title: this.chip.title, k: fade(t, this.chip.t0, this.chip.t1 ?? Infinity, 0.35, 0.35) };
    if (this.keys) {
      if (t >= this.keys.t1) this.keys = null;
      else o.keys = { keys: this.keys.keys, k: fade(t, this.keys.t0, this.keys.t1, 0.08, 0.25) };
    }
    if (this.lapse) {
      if (t >= (this.lapse.t1 ?? Infinity)) this.lapse = null;
      else o.lapse = { text: this.lapse.text, k: fade(t, this.lapse.t0, this.lapse.t1 ?? Infinity, 0.2, 0.3) };
    }
    if (this.ring) {
      if (t >= this.ring.t1) this.ring = null;
      else o.ring = { t: this.ring.target, pad: this.ring.pad, k: fade(t, this.ring.t0, this.ring.t1, 0.18, 0.3) };
    }
    if (this.card) {
      if (t >= this.card.t1) this.card = null;
      else o.card = { ...this.card.text, dim: this.card.dim, k: fade(t, this.card.t0, this.card.t1, this.card.in, this.card.out) };
    }
    if (this.cam) {
      o.cam = this.cam;
      this.cam = null;
    }
    this.scroll = null;
    if (!this.sent || Math.hypot(this.cursor.x - this.sent.x, this.cursor.y - this.sent.y) > 0.25) {
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      this.sent = { ...this.cursor };
    }
    await this.settle();
    const view = await this.page.evaluate(`__tut.frame(${JSON.stringify(o)}, ${1000 / FPS})`);
    if (this.view && view !== this.view) {
      // The 3D view changed size (a panel opened or closed). The page only resizes its canvas when the
      // browser next paints — which here is a screenshot — and would be caught with it cleared: take
      // one for nothing, let it lay itself out, and draw again without moving the clock.
      await grab(this.cdp, 20);
      await sleep(120);
      await this.settle();
      await this.page.evaluate("__vt.step(0)");
    }
    this.view = view;
    if (!this.skip) await this.sink(() => grab(this.cdp, this.quality), this.n);
    this.n++;
    if (this.n % (FPS * 10) === 0) console.log(`  ${this.t.toFixed(0).padStart(4)} s recorded  (${((Date.now() - this.started) / 1000).toFixed(0)} s)`);
  }

  async wait(seconds) {
    await this.until(this.t + seconds);
  }

  async until(t) {
    while (this.t < t - 1e-6) await this.frame();
  }

  // --- Narration, chapters, overlays ---

  /** Starts a narration line now (after the last one has finished) and returns its length. */
  async say(key, gap = 0.35) {
    const v = this.voice[key];
    if (!v) throw new Error(`no voice line "${key}"`);
    await this.until(this.voiceEnd + gap);
    this.line = { key, t: this.t, seconds: v.seconds };
    this.timeline.lines.push({ key, t: +this.t.toFixed(3) });
    this.voiceEnd = this.t + v.seconds;
    return v.seconds;
  }

  /** Waits until this fraction of the current line has been spoken. */
  async cue(fraction) {
    await this.until(this.line.t + this.line.seconds * fraction);
  }

  /** Waits for the current line to end. */
  async spoken(pad = 0) {
    await this.until(this.voiceEnd + pad);
  }

  chapter(tag, title, label = title) {
    if (process.env.UNTIL === tag) throw new Stop();
    if (process.env.FROM === tag) this.skip = false;
    this.timeline.chapters.push({ t: +this.t.toFixed(3), label });
    this.chip = { tag, title, t0: this.t };
    this.event("chapter");
  }

  hideChip() {
    if (this.chip) this.chip.t1 = this.t + 0.35;
  }

  showKeys(keys, seconds = 1.3) {
    this.keys = { keys, t0: this.t, t1: this.t + seconds };
  }

  timelapse(text) {
    if (text) this.lapse = { text, t0: this.t };
    else if (this.lapse) this.lapse.t1 = this.t + 0.3;
    this.event(text ? "lapse-on" : "lapse-off");
  }

  /** A glowing box around an element for a moment — "this is the control I mean". */
  highlight(target, seconds = 1.6, pad) {
    this.ring = { target, pad, t0: this.t, t1: this.t + seconds };
  }

  titleCard(text, seconds, { dim = 0.78, fadeIn = 0.5, fadeOut = 0.6 } = {}) {
    this.card = { text: { eyebrow: "", title: "", sub: "", foot: "", ...text }, dim, t0: this.t - (fadeIn ? 0 : 1), t1: this.t + seconds, in: fadeIn || 0.01, out: fadeOut };
  }

  // --- Pointer, mouse, keyboard ---

  async resolve(target) {
    if (target.x !== undefined && !target.sel && !target.field) return target;
    if (target.world) return this.call("project", target.world);
    return this.call("rect", target);
  }

  /** Glides the pointer to a screen point, an element or a world point (following it if it moves). */
  async move(target, seconds = 0.6, { track = true } = {}) {
    let to = await this.resolve(target);
    if (!to) {
      console.warn(`  ${this.t.toFixed(1)} s: target not found ${JSON.stringify(target)}`);
      return false;
    }
    this.shown = true;
    const from = { ...this.cursor };
    const frames = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= frames; i++) {
      const k = easeInOut(i / frames);
      if (track && i % 4 === 0 && i < frames) to = (await this.resolve(target)) ?? to;
      const dx = to.x - from.x, dy = to.y - from.y, bow = Math.sin(Math.PI * k) * 0.07;
      this.cursor = { x: lerp(from.x, to.x, k) - dy * bow, y: lerp(from.y, to.y, k) + dx * bow };
      await this.frame();
    }
    return true;
  }

  async click({ shift = false, sound = "click", button = "left" } = {}) {
    if (shift) await this.page.keyboard.down("Shift");
    await this.page.mouse.move(this.cursor.x, this.cursor.y);
    this.sent = { ...this.cursor };
    await this.page.mouse.down({ button });
    this.down = true;
    this.must = 3;
    this.ripple = { x: this.cursor.x, y: this.cursor.y, t0: this.t };
    if (sound) this.event(sound);
    await this.frame();
    await this.page.mouse.up({ button });
    this.down = false;
    if (shift) await this.page.keyboard.up("Shift");
    await this.frame();
  }

  /** Moves to a target and clicks it. */
  async press(target, { seconds = 0.6, pause = 0.12, after = 0.2, ring = false, ...click } = {}) {
    if (await this.reveal(target)) await this.wait(0.1);
    if (!(await this.move(target, seconds))) return false;
    if (ring) this.highlight(target, typeof ring === "number" ? ring : 1.2);
    if (pause) await this.wait(pause);
    await this.click(click);
    if (after) await this.wait(after);
    return true;
  }

  /** Scrolls the element's panel so it shows (a quick, smooth scroll). Returns whether it moved. */
  async reveal(target, seconds = 0.45) {
    if (target.world || target.x !== undefined) return false;
    const s = await this.call("scroll", target);
    if (!s || s.seen || Math.abs(s.want - s.top) < 4) return false;
    const frames = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= frames; i++) {
      this.scroll = lerp(s.top, s.want, easeInOut(i / frames));
      await this.frame();
    }
    return true;
  }

  async type(text, cps = 13) {
    for (const ch of String(text)) {
      this.must = 2;
      await this.page.keyboard.type(ch);
      this.event("key");
      await this.wait(1 / cps);
    }
  }

  /** Presses a key or a combination ("Control+d"); `show` lists the key caps to flash on screen. */
  async key(combo, { show = null, seconds = 1.2, after = 0.12 } = {}) {
    const keys = combo === "+" ? ["+"] : combo.split("+");
    this.must = 3;
    if (show) this.showKeys(show, seconds);
    for (const k of keys.slice(0, -1)) await this.page.keyboard.down(k);
    await this.page.keyboard.press(keys.at(-1));
    for (const k of keys.slice(0, -1).reverse()) await this.page.keyboard.up(k);
    this.event("key");
    await this.wait(after);
  }

  /** Drags from where the pointer is (orbit with the left button, pan with the right). */
  async drag(by, seconds = 1.5, button = "left") {
    await this.page.mouse.move(this.cursor.x, this.cursor.y);
    await this.page.mouse.down({ button });
    this.down = true;
    const from = { ...this.cursor };
    const frames = Math.max(2, Math.round(seconds * FPS));
    for (let i = 1; i <= frames; i++) {
      const k = easeInOut(i / frames);
      this.cursor = { x: from.x + by[0] * k, y: from.y + by[1] * k };
      await this.frame();
    }
    await this.page.mouse.up({ button });
    this.down = false;
    this.sent = { ...this.cursor };
    await this.frame();
  }

  /** Turns the mouse wheel (zoom): `delta` px in total, spread over the time. */
  async wheel(delta, seconds = 1) {
    const frames = Math.max(2, Math.round(seconds * FPS));
    for (let i = 0; i < frames; i++) {
      if (i % 2 === 0) await this.page.mouse.wheel({ deltaY: (delta / frames) * 2 });
      await this.frame();
    }
  }

  // --- Camera ---

  /** Flies the view to { position, target } on an arc around the target. `ease: false` = constant speed. */
  async camera(to, seconds = 1.6, { ease = true, during = null } = {}) {
    const from = await this.call("camera");
    const polar = (v) => {
      const d = sub3(v.position, v.target), r = Math.hypot(...d);
      return { r, th: Math.atan2(d[0], d[2]), ph: Math.acos(Math.max(-1, Math.min(1, d[1] / r))) };
    };
    const a = polar(from), b = polar(to);
    let dth = b.th - a.th;
    if (!to.long) dth = ((((dth + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const frames = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= frames; i++) {
      const k = ease ? easeInOut(i / frames) : i / frames;
      const r = lerp(a.r, b.r, k), th = a.th + dth * k, ph = lerp(a.ph, b.ph, k);
      const target = [0, 1, 2].map((j) => lerp(from.target[j], to.target[j], k));
      this.cam = { target, position: [target[0] + r * Math.sin(ph) * Math.sin(th), target[1] + r * Math.cos(ph), target[2] + r * Math.sin(ph) * Math.cos(th)] };
      if (during) await during(i / frames);
      await this.frame();
    }
  }

  /** Circles the current target by `angle` radians. */
  async orbit(angle, seconds, opts = {}) {
    const v = await this.call("camera");
    const d = sub3(v.position, v.target), c = Math.cos(angle), s = Math.sin(angle);
    await this.camera({ target: v.target, position: [v.target[0] + d[0] * c + d[2] * s, v.position[1], v.target[2] - d[0] * s + d[2] * c], long: true }, seconds, { ease: false, ...opts });
  }

  // --- The builder ---

  doc() {
    return this.call("doc");
  }

  /** Changes the scene directly, and gives React a moment to draw it. */
  async dispatch(action) {
    await this.call("dispatch", action);
    await this.page.evaluate("new Promise((r) => setTimeout(r, 25))");
  }

  /** Waits (real time; the page's clock stands still) until `test` passes in the page. */
  async poll(js, timeout = 6000) {
    const end = Date.now() + timeout;
    for (;;) {
      if (await this.page.evaluate(js).catch(() => false)) return true;
      if (Date.now() > end) return false;
      await sleep(40);
    }
  }

  async loaded(ids) {
    if (!(await this.poll(`__tut.loaded(${JSON.stringify(ids)})`, 12_000))) console.warn(`  ${this.t.toFixed(1)} s: a model is still loading — going on`);
  }

  tile(partId) {
    if (partId === "light") return { sel: "button[aria-pressed]", text: "Point light" };
    const p = this.parts.get(partId);
    if (!p) throw new Error(`no part ${partId}`);
    return { sel: `button[title^="${p.title} — ${p.collection} ·"]` };
  }

  /** Picks a part in the parts panel (scrolling to it), unless it's already in hand. */
  async pick(partId, opts = {}) {
    const tile = this.tile(partId);
    // The list re-filters a moment after a search is typed or cleared.
    await this.poll(`!!__tut.rect(${JSON.stringify(tile)}) || !!__tut.scroll(${JSON.stringify(tile)})`, 3000);
    if ((await this.call("attr", tile, "aria-pressed")) === "true") return;
    await this.press(tile, { seconds: 0.5, ...opts });
    this.placing = partId;
  }

  /**
   * Drops the part in hand where the finished scene has `item`: a real click on that spot, then the
   * new part takes the item's exact place (and turn, size, animation…) — except the properties
   * listed in `keep`, left as the click made them for the tutorial to change by hand.
   */
  async place(item, { shift = false, seconds = 0.5, pause = 0.12, after = 0.15, keep = [], wait = true } = {}) {
    const before = new Set(await this.call("ids"));
    const aim = [item.position[0], item.kind === "light" ? 0 : item.position[1], item.position[2]];
    const spot = await this.call("project", aim);
    let id = null;
    if (spot?.inside) {
      await this.move({ world: aim }, seconds);
      if (pause) await this.wait(pause);
      if (shift) await this.page.keyboard.down("Shift");
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.page.mouse.down();
      this.down = true;
      this.must = 3;
      this.ripple = { x: this.cursor.x, y: this.cursor.y, t0: this.t };
      this.event("place");
      await this.frame();
      await this.page.mouse.up();
      this.down = false;
      if (shift) await this.page.keyboard.up("Shift");
      await this.poll(`__tut.count() > ${before.size}`, 1500);
      id = (await this.call("ids")).find((i) => !before.has(i)) ?? null;
    }
    const patch = { position: item.position, rotation: item.rotation, scale: item.scale };
    if (item.animation !== undefined) patch.animation = item.animation;
    if (item.light) patch.light = item.light;
    for (const k of keep) delete patch[k];
    if (id) await this.dispatch({ type: "update", id, patch });
    else {
      // The click missed (off screen, or something swallowed it): add the part directly.
      console.warn(`  ${this.t.toFixed(1)} s: placed ${item.name} without a click`);
      id = `tut${this.n}x${Math.round(Math.abs(item.position[0] * 100 + item.position[2] * 7))}`;
      await this.dispatch({ type: "add", items: [{ ...item, id }] });
      this.event("place");
    }
    if (wait) await this.loaded([id]);
    await this.frame();
    if (after) await this.wait(after);
    return id;
  }

  /**
   * Stamps many items with Shift+click, `each` seconds apart: part by part, each part's items in a
   * tidy order — or, with `inOrder`, exactly as listed (changing part whenever the next one differs).
   */
  async stamp(items, { each = 0.12, switching = 0.3, inOrder = false, escape = true } = {}) {
    if (!items.length) return [];
    const partOf = (item) => (item.kind === "light" ? "light" : item.part);
    let runs = [];
    if (inOrder) {
      for (const item of items) {
        if (runs.at(-1)?.[0] === partOf(item)) runs.at(-1)[1].push(item);
        else runs.push([partOf(item), [item]]);
      }
    } else {
      const groups = new Map();
      for (const item of items) groups.set(partOf(item), [...(groups.get(partOf(item)) ?? []), item]);
      let at = (await this.call("camera")).target;
      for (const [partId, group] of groups) {
        // Nearest neighbour from the last part dropped, so the hand doesn't zig-zag.
        const todo = [...group], sorted = [];
        while (todo.length) {
          let best = 0;
          for (let i = 1; i < todo.length; i++) if (Math.hypot(todo[i].position[0] - at[0], todo[i].position[2] - at[2]) < Math.hypot(todo[best].position[0] - at[0], todo[best].position[2] - at[2])) best = i;
          const [item] = todo.splice(best, 1);
          at = item.position;
          sorted.push(item);
        }
        runs.push([partId, sorted]);
      }
    }
    const ids = [];
    for (const [partId, run] of runs) {
      await this.pick(partId, { seconds: switching, pause: 0.04, after: 0.05 });
      for (const item of run) ids.push(await this.place(item, { shift: true, seconds: each, pause: 0, after: 0, wait: false }));
      await this.loaded(ids.slice(-run.length));
    }
    if (escape) {
      await this.key("Escape", { after: 0.1 });
      this.placing = null;
    }
    return ids;
  }

  /**
   * Parts the builder itself just made (the Array tool's copies): each takes the place, turn and size
   * of the nearest of `targets` — or only the properties in `only`. Returns the pairs.
   */
  async adopt(before, targets, { only = ["position", "rotation", "scale"] } = {}) {
    const fresh = (await this.doc()).items.filter((i) => !before.has(i.id));
    const pool = [...targets], matched = [];
    for (const item of fresh) {
      let best = -1, near = 1.5;
      pool.forEach((t, i) => {
        const far = Math.hypot(t.position[0] - item.position[0], t.position[2] - item.position[2]);
        if (far < near) [best, near] = [i, far];
      });
      if (best < 0) continue;
      const [target] = pool.splice(best, 1);
      matched.push({ id: item.id, part: item.part, target });
    }
    if (matched.length) await this.dispatch({ type: "updateMany", patches: matched.map((m) => ({ id: m.id, patch: Object.fromEntries(only.map((k) => [k, m.target[k]])) })) });
    if (matched.length !== fresh.length) console.warn(`  ${this.t.toFixed(1)} s: ${fresh.length - matched.length} new part(s) matched nothing in the finished scene`);
    return { matched, unmatched: pool };
  }

  /** Types a value into one of the inspector's number boxes (by its label) and presses Enter. */
  async field(name, value, { idx = 0, seconds = 0.5, ring = true } = {}) {
    const target = { field: name, idx };
    await this.press(target, { seconds, ring, after: 0.1 });
    await this.key("Control+a", { after: 0.05 });
    await this.type(String(value), 9);
    await this.wait(0.15);
    await this.key("Enter", { after: 0.25 });
  }

  /** Opens one of the site's dropdowns (by its label) and picks an option, typing to filter first if asked. */
  async dropdown(label, option, { search = null, seconds = 0.55, ring = true } = {}) {
    await this.press({ sel: `button[aria-label^="${label}:"]` }, { seconds, ring, after: 0.3 });
    await this.poll(`!!document.querySelector("[role=option]")`, 3000);
    await this.wait(0.25);
    if (search) {
      await this.type(search, 11);
      await this.wait(0.35);
    }
    await this.press({ sel: "[role=option]", text: option }, { seconds: 0.45, after: 0.3 });
  }
}

// --- Capture sinks -----------------------------------------------------------------------------------

/** Pipes JPEG frames straight into ffmpeg (no frame files on disk) → an H.264 video without sound. */
export function videoSink(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ff = spawn(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  const exited = once(ff, "exit");
  return {
    write: async (shoot) => {
      if (!ff.stdin.write(await shoot())) await once(ff.stdin, "drain");
    },
    close: async () => {
      ff.stdin.end();
      const [code] = await exited;
      if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    },
  };
}

/** Preview: a small JPEG every `every` frames, to check the choreography before the real run. */
export function stillsSink(dir, every = FPS) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return {
    write: async (shoot, n) => {
      if (n % every === 0) fs.writeFileSync(path.join(dir, `${String(n).padStart(6, "0")}.jpg`), await shoot());
    },
    close: async () => {},
  };
}

/** 83.4 → "1:23". */
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
