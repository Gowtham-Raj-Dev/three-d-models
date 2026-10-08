/**
 * The promo's compositor, running in headless Chrome (bundled by compose.mjs). `window.__render(t)`
 * draws the frame at time t: background, the browser window showing the raw captures, the game clips,
 * the intro / outro cards, section titles, subtitles and Mia — the presenter, a rigged character from
 * the site (Businesswoman 01) playing the site's own Biped clips, with her jaw driven by the voice.
 * Everything is a pure function of t, so frames can be rendered in any order.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { recordRestPose, retarget } from "../../src/lib/retarget";

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => ((x = clamp01(x)), x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeBack = (x) => {
  x = clamp01(x);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const lerp = (a, b, k) => a + (b - a) * k;
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const pad = (n) => String(n).padStart(5, "0");

/** Value of a keyframed track [[t, ...values]] at t (eased between keys). */
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const k = ease((t - a[0]) / (b[0] - a[0] || 1));
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
    }
  }
  return keys[keys.length - 1].slice(1);
}

// Window geometry (CSS px of the 1280×720 stage; the page is captured at 2× → 2560×1440).
const WIN = { x: 44, y: 96, w: 968, bar: 32 };
WIN.h = (WIN.w * 9) / 16;
const PW = 520, PH = 720;

let D;
const imgs = new Set();
/** Points an <img> at a URL; resolves once it is decoded (so the screenshot never shows a blank). */
function show(img, url) {
  if (img.dataset.src === url) return null;
  img.dataset.src = url;
  img.src = url;
  return img.decode().catch(() => {});
}

// --- Presenter -------------------------------------------------------------------------------------

const presenter = {
  async init(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(2);
    r.setSize(PW, PH, false);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    this.camera = new THREE.PerspectiveCamera(22, PW / PH, 0.1, 50);
    this.camera.position.set(0, 1.2, 4.35);
    this.camera.lookAt(0, 1.16, 0);
    const light = (color, intensity, x, y, z) => {
      const l = new THREE.DirectionalLight(color, intensity);
      l.position.set(x, y, z);
      scene.add(l);
    };
    light(0xfff0e4, 2.3, -2.2, 3.2, 4); // key
    light(0xd6e6ff, 0.65, 3, 1.4, 3); // fill
    light(0xa78bfa, 3.2, -3, 2.6, -2.6); // violet rim
    light(0x67e8f9, 2.4, 3, 2.2, -2.8); // cyan rim

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(D.presenter.model);
    const root = (this.root = gltf.scene);
    root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    recordRestPose(root);
    const box = new THREE.Box3().setFromObject(root, true);
    const c = box.getCenter(new THREE.Vector3());
    this.holder = new THREE.Group();
    root.position.set(-c.x, -box.min.y, -c.z);
    this.holder.add(root);
    scene.add(this.holder);
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [name, url] of Object.entries(D.presenter.clips)) {
      const g = await loader.loadAsync(url);
      const a = this.mixer.clipAction(retarget(g.animations[0], root));
      a.play();
      a.setEffectiveWeight(0);
      this.actions[name] = a;
    }
    // Face bones the voice and blinks drive (reset to rest each frame, then offset).
    this.face = {};
    for (const n of ["MJaw", "MBottomLip", "LMouthBottom", "RMouthBottom", "REyeBlinkTop", "LEyeBlinkTop", "REyeBlinkBottom", "LEyeBlinkBottom"]) {
      const b = root.getObjectByName("Bip01_" + n) ?? root.getObjectByName("Bip01 " + n);
      if (b) this.face[n] = { bone: b, rest: b.quaternion.clone(), restPos: b.position.clone() };
    }
    this.segments = D.moves.map(([t, clip]) => ({ t, clip }));
    for (const k of ["jawAxis", "blinkAxis"]) D.presenter[k] = new THREE.Vector3().copy(D.presenter[k]).normalize();
  },

  mouth(t) {
    for (const v of D.mouth) {
      const k = (t - v.t) * 60;
      if (k >= 0 && k < v.v.length - 1) {
        const i = Math.floor(k), f = k - i;
        return lerp(v.v[i], v.v[i + 1], f);
      }
    }
    return 0;
  },

  render(t, state) {
    // Clip mix: the current move fades in over 0.5 s on top of the previous one.
    const segs = this.segments;
    let i = 0;
    while (i + 1 < segs.length && segs[i + 1].t <= t) i++;
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    const set = (seg, w) => {
      const a = this.actions[seg.clip];
      const d = a.getClip().duration;
      a.enabled = true;
      a.setEffectiveWeight(a.getEffectiveWeight() + w);
      a.time = ((Math.max(0, t - seg.t) % d) + d) % d;
    };
    const cur = segs[i], prev = segs[i - 1];
    const k = prev && prev.clip !== cur.clip ? ease((t - cur.t) / 0.5) : 1;
    set(cur, k);
    if (k < 1) set(prev, 1 - k);
    for (const f of Object.values(this.face)) {
      f.bone.quaternion.copy(f.rest);
      f.bone.position.copy(f.restPos);
    }
    this.mixer.update(0);

    // Lip sync: open the jaw with the voice (smoothed over ~3 frames).
    let m = (this.mouth(t - 1 / 60) + 2 * this.mouth(t) + this.mouth(t + 1 / 60)) / 4;
    if (D.debug?.mouth !== undefined) m = D.debug.mouth;
    const jaw = this.face.MJaw;
    if (jaw) jaw.bone.rotateOnAxis(D.presenter.jawAxis, Math.pow(m, 0.8) * D.presenter.jawOpen);
    // Blinks every ~3.4 s (and a double blink now and then).
    const blinkAt = (x) => {
      const p = x % 3.4;
      return Math.max(0, 1 - Math.abs(p - 0.08) / 0.08) + (Math.floor(x / 3.4) % 3 === 1 ? Math.max(0, 1 - Math.abs(p - 0.36) / 0.08) : 0);
    };
    let b = Math.min(1, blinkAt(t + 1.3));
    if (D.debug?.blink !== undefined) b = D.debug.blink;
    for (const n of ["REyeBlinkTop", "LEyeBlinkTop"]) {
      const f = this.face[n];
      if (f) f.bone.position.copy(f.restPos).addScaledVector(D.presenter.blinkAxis, b * D.presenter.blinkClose);
    }
    this.holder.rotation.y = state.rot;
    this.renderer.render(this.scene, this.camera);
  },
};

// --- Stage -----------------------------------------------------------------------------------------

const S = {};

function build() {
  const stage = $("#stage");
  stage.append((S.bg = el("div", "bg", '<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="grid"></i>')));

  // Floating wall of model thumbnails (intro and outro).
  S.wall = el("div", "wall");
  S.rows = [0, 1, 2].map((r) => {
    const row = el("div", "row");
    const list = D.thumbs.filter((_, i) => i % 3 === r);
    for (let k = 0; k < 2; k++) for (const u of list) {
      const im = el("img");
      im.src = u;
      imgs.add(im);
      row.append(im);
    }
    S.wall.append(row);
    return row;
  });
  stage.append(S.wall);

  // Intro.
  S.intro = el("div", "intro");
  S.intro.innerHTML = `
    <div class="logo"><img src="/public/icon.svg"><b>3D Models</b><span>models.codelove.in</span></div>
    <h1>${"Free 3D models,".split(" ").map((w) => `<span class="w">${w}</span>`).join(" ")}<br><em>${"games & tools.".split(" ").map((w) => `<span class="w">${w}</span>`).join(" ")}</em></h1>
    <div class="chips"><i><b>6,781</b> free models</i><i><b>90</b> collections</i><i><b>100%</b> free</i></div>`;
  stage.append(S.intro);

  // Browser window.
  S.win = el("div", "win");
  S.win.innerHTML = `<div class="bar"><i></i><i></i><i></i><div class="url"><svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg><span class="u1"></span><span class="u2"></span></div></div><div class="view"><img class="a"><img class="b"></div>`;
  stage.append(S.win);
  S.va = S.win.querySelector("img.a");
  S.vb = S.win.querySelector("img.b");
  S.u1 = S.win.querySelector(".u1");
  S.u2 = S.win.querySelector(".u2");

  // Games coverflow.
  S.games = el("div", "games");
  S.cards = D.games.map((g) => {
    const c = el("div", "card", `<div class="clip"><img></div><div class="label"><b>${g.name}</b><span>${g.tag}</span></div>`);
    S.games.append(c);
    return { el: c, img: c.querySelector("img"), g };
  });
  S.more = el("div", "more", "<b>+</b> more free games — no download, no sign-up");
  S.games.append(S.more);
  stage.append(S.games);

  // Outro.
  S.outro = el("div", "outro");
  S.outro.innerHTML = `
    <div class="logo"><img src="/public/icon.svg"><b>3D Models</b></div>
    <h2>${"Start creating today".split(" ").map((w) => `<span class="w">${w}</span>`).join(" ")}</h2>
    <div class="url">models.codelove.in</div>
    <div class="chips"><i>6,781 free 3D models</i><i>Scene Builder</i><i>GLB Viewer</i><i>Free games</i><i>Developer files</i></div>
    <div class="cta">100% free · no sign-up · commercial use</div>`;
  stage.append(S.outro);

  // Section title, brand mark, presenter, subtitles.
  S.title = el("div", "title", '<span class="lab"></span><b class="head"></b>');
  S.lab = S.title.querySelector(".lab");
  S.head = S.title.querySelector(".head");
  stage.append(S.title);
  S.brand = el("div", "brand", '<img src="/public/icon.svg"><span>models.codelove.in</span>');
  stage.append(S.brand);
  S.glow = el("div", "glow");
  stage.append(S.glow);
  S.canvas = el("canvas", "p3d");
  stage.append(S.canvas);
  S.tag = el("div", "nametag", "<b>Mia</b><span>Your guide · 3D Models</span>");
  stage.append(S.tag);
  S.subs = el("div", "subs", "<p></p>");
  S.subText = S.subs.querySelector("p");
  stage.append(S.subs);
  S.flash = el("div", "flash");
  stage.append(S.flash);
  S.fade = el("div", "fade");
  stage.append(S.fade);
}

const sceneAt = (t) => {
  let s = D.scenes[0];
  for (const x of D.scenes) if (x.start <= t) s = x;
  return s;
};
const byId = (id) => D.scenes.find((s) => s.id === id);

/** Frame URL of a capture at a scene-local time (clamped to what was recorded). */
function captureFrame(s, local) {
  const c = s.capture;
  const n = Math.min(c.frames - 1, Math.max(0, Math.round((local + c.lead) * 60)));
  return `${c.dir}${pad(n)}.jpg`;
}

/** Content zoom (scale around a focus point, clamped so the page always fills the view). */
function zoomTransform(s, local) {
  const [z, fx, fy] = s.zoom ? track(s.zoom, local) : [1, 0.5, 0.5];
  const w = WIN.w, h = WIN.h;
  const ox = Math.min(0, Math.max(w - z * w, w / 2 - fx * z * w));
  const oy = Math.min(0, Math.max(h - z * h, h / 2 - fy * z * h));
  return `translate(${ox}px, ${oy}px) scale(${z})`;
}

const WINDOW_SCENES = ["home", "models", "character", "customize", "viewer", "developers", "builder"];

async function render(t) {
  const waits = [];
  const sc = sceneAt(t);
  const local = t - sc.start;
  const total = D.total;

  // Background drifts slowly; a black fade at both ends.
  S.bg.style.setProperty("--t", t.toFixed(3));
  S.bg.querySelector(".b1").style.transform = `translate(${Math.sin(t * 0.21) * 60}px, ${Math.cos(t * 0.17) * 40}px)`;
  S.bg.querySelector(".b2").style.transform = `translate(${Math.cos(t * 0.19) * 70}px, ${Math.sin(t * 0.23) * 50}px)`;
  S.bg.querySelector(".b3").style.transform = `translate(${Math.sin(t * 0.13) * 90}px, ${Math.sin(t * 0.29) * 30}px)`;
  S.bg.querySelector(".grid").style.backgroundPosition = `${-t * 6}px ${-t * 10}px`;
  S.fade.style.opacity = String(Math.max(1 - t / 0.5, (t - (total - 0.7)) / 0.7, 0));

  // Thumbnail wall: intro and outro.
  const outro = byId("outro");
  const wallK = Math.max(Math.min(easeOut((t - 0.15) / 1.0), 1 - ease((t - 5.3) / 0.8)), ease((t - outro.start + 0.1) / 1.0));
  S.wall.style.opacity = String(0.2 * wallK);
  S.rows.forEach((row, r) => {
    const span = row.scrollWidth / 2 || 1;
    const x = ((t * (22 + r * 9) + r * 210) % span) * (r % 2 ? 1 : -1);
    row.style.transform = `translateX(${r % 2 ? x - span : x}px)`;
  });

  // Intro card.
  const intro = byId("intro");
  {
    const out = ease((t - 5.25) / 0.6);
    S.intro.style.display = t < intro.start + intro.dur + 0.2 ? "" : "none";
    S.intro.style.opacity = String(1 - out);
    S.intro.style.transform = `translateX(${-70 * out}px)`;
    const logo = S.intro.querySelector(".logo");
    const lk = easeBack((t - 0.3) / 0.55);
    logo.style.opacity = String(clamp01((t - 0.3) / 0.25));
    logo.style.transform = `scale(${lerp(0.7, 1, lk)})`;
    S.intro.querySelectorAll(".w").forEach((w, i) => {
      const k = easeOut((t - 0.7 - i * 0.12) / 0.5);
      w.style.opacity = String(k);
      w.style.transform = `translateY(${30 * (1 - k)}px)`;
      w.style.filter = `blur(${6 * (1 - k)}px)`;
    });
    S.intro.querySelectorAll(".chips i").forEach((c, i) => {
      const k = easeBack((t - 2.0 - i * 0.14) / 0.45);
      c.style.opacity = String(clamp01((t - 2.0 - i * 0.14) / 0.2));
      c.style.transform = `translateY(${16 * (1 - k)}px) scale(${lerp(0.85, 1, k)})`;
    });
  }

  // Browser window: rises in after the intro, steps aside for the games, leaves before the outro.
  const games = byId("games"), builder = byId("builder");
  let winOn = 0, winY = 0, winS = 1, winRX = 0;
  {
    const rise = easeOut((t - 5.55) / 0.95);
    const outG = ease((t - (games.start - 0.25)) / 0.55);
    const backB = easeOut((t - (builder.start - 0.3)) / 0.8);
    const outO = ease((t - (outro.start - 0.3)) / 0.6);
    if (t < games.start + 0.4) {
      winOn = rise * (1 - outG);
      winY = lerp(420, 0, rise) + 70 * outG;
      winS = lerp(0.9, 1, rise) * lerp(1, 0.9, outG);
      winRX = lerp(16, 0, rise);
    } else {
      winOn = backB * (1 - outO);
      winY = lerp(70, 0, backB) + 60 * outO;
      winS = lerp(0.9, 1, backB) * lerp(1, 0.88, outO);
    }
    S.win.style.display = winOn > 0.001 ? "" : "none";
    S.win.style.opacity = String(Math.min(1, winOn * 1.4));
    S.win.style.transform = `perspective(1600px) translateY(${winY}px) rotateX(${winRX}deg) scale(${winS})`;
  }

  // Window content: the current capture, cross-pushed into the next one around each cut.
  if (S.win.style.display !== "none") {
    const caps = D.scenes.filter((s) => s.capture);
    const joined = (x, y) => x && y && Math.abs(x.start + x.dur - y.start) < 0.01;
    let a = null, b = null, k = 0;
    for (let i = 0; i < caps.length; i++) {
      const s = caps[i], prev = caps[i - 1], next = caps[i + 1];
      const end = s.start + s.dur;
      const from = joined(prev, s) ? s.start + 0.3 : s.start - 0.6;
      const to = joined(s, next) ? end - 0.3 : end + 0.6;
      if (t >= from && t < to) a = s;
      if (joined(s, next) && t >= end - 0.3 && t < end + 0.3) {
        a = s;
        b = next;
        k = ease((t - (end - 0.3)) / 0.6);
      }
    }
    if (!a) a = caps.find((s) => s.start > t) ?? caps[caps.length - 1];
    const layer = (img, s, kk, dir) => {
      const loc = t - s.start;
      const p = show(img, captureFrame(s, loc));
      if (p) waits.push(p);
      img.style.opacity = String(kk);
      img.style.transform = `translateX(${dir * 90 * (1 - kk)}px) ${zoomTransform(s, loc)}`;
      img.style.filter = kk < 1 ? `blur(${(7 * (1 - kk)).toFixed(2)}px)` : "none";
      img.style.display = kk > 0.001 ? "" : "none";
    };
    if (b) {
      layer(S.va, a, 1 - k, -1);
      layer(S.vb, b, k, 1);
    } else {
      layer(S.va, a, 1, 0);
      S.vb.style.display = "none";
    }
    // Address bar.
    const ua = a.url ?? "", ub = b?.url ?? "";
    S.u1.textContent = ua;
    S.u2.textContent = ub;
    S.u1.style.opacity = String(b ? 1 - k : 1);
    S.u2.style.opacity = String(b ? k : 0);
  }

  // Games: three cards in a coverflow, each playing its 10 s loop.
  {
    const gl = t - games.start;
    const on = t > games.start - 0.4 && t < games.start + games.dur + 0.6;
    S.games.style.display = on ? "" : "none";
    if (on) {
      const focus = track(D.gameFocus, gl)[0];
      const exit = ease((gl - (games.dur - 0.35)) / 0.55);
      S.cards.forEach((c, i) => {
        const enter = easeOut((gl + 0.15 - i * 0.12) / 0.75);
        const d = i - focus;
        const ad = Math.abs(d);
        const x = 500 + d * 300;
        const sc = lerp(1, 0.62, Math.min(1, ad));
        const op = enter * (1 - exit) * lerp(1, 0.55, Math.min(1, ad));
        c.el.style.opacity = String(op);
        c.el.style.zIndex = String(10 - Math.round(ad * 3));
        c.el.style.transform = `translate(${x - 300}px, ${lerp(260, 0, enter) - 80 * exit}px) perspective(1400px) rotateY(${-d * 24}deg) rotateX(${lerp(18, 0, enter)}deg) scale(${sc * lerp(0.86, 1, enter)})`;
        c.el.classList.toggle("on", ad < 0.5);
        const frame = Math.floor((Math.max(0, gl + 0.4) * 30 + c.g.offset) % c.g.frames);
        const p = show(c.img, `${c.g.dir}${pad(frame)}.jpg`);
        if (p) waits.push(p);
      });
      const mk = easeBack((gl - 5.7) / 0.5);
      S.more.style.opacity = String(clamp01((gl - 5.7) / 0.25) * (1 - exit));
      S.more.style.transform = `translateX(-50%) translateY(${16 * (1 - mk)}px) scale(${lerp(0.8, 1, mk)})`;
    }
  }

  // Outro card.
  {
    const ol = t - outro.start;
    S.outro.style.display = ol > -0.1 ? "" : "none";
    const logo = S.outro.querySelector(".logo");
    const lk = easeBack((ol - 0.1) / 0.55);
    logo.style.opacity = String(clamp01((ol - 0.1) / 0.25));
    logo.style.transform = `scale(${lerp(0.7, 1, lk)})`;
    S.outro.querySelectorAll(".w").forEach((w, i) => {
      const k = easeOut((ol - 0.35 - i * 0.11) / 0.5);
      w.style.opacity = String(k);
      w.style.transform = `translateY(${26 * (1 - k)}px)`;
      w.style.filter = `blur(${6 * (1 - k)}px)`;
    });
    const uk = easeOut((ol - 0.9) / 0.6);
    const url = S.outro.querySelector(".url");
    url.style.opacity = String(uk);
    url.style.transform = `translateY(${20 * (1 - uk)}px)`;
    url.style.backgroundPosition = `${(ol * 40) % 400}px 0`;
    S.outro.querySelectorAll(".chips i").forEach((c, i) => {
      const k = easeBack((ol - 1.5 - i * 0.12) / 0.45);
      c.style.opacity = String(clamp01((ol - 1.5 - i * 0.12) / 0.2));
      c.style.transform = `translateY(${14 * (1 - k)}px) scale(${lerp(0.85, 1, k)})`;
    });
    const ck = easeOut((ol - 2.4) / 0.5);
    const cta = S.outro.querySelector(".cta");
    cta.style.opacity = String(ck);
    cta.style.transform = `translateY(${12 * (1 - ck)}px)`;
  }

  // Section title (top left) and the brand mark (top right) during the page tour.
  {
    const titled = D.scenes.filter((s) => s.title);
    let s = null;
    for (const x of titled) if (t >= x.start - 0.05 && t < x.start + x.dur + 0.05) s = x;
    if (s) {
      const l = t - s.start;
      const kin = easeOut((l - 0.1) / 0.45), kin2 = easeOut((l - 0.2) / 0.5);
      const kout = ease((l - (s.dur - 0.32)) / 0.3);
      S.lab.textContent = s.title[0];
      S.head.textContent = s.title[1][0].toUpperCase() + s.title[1].slice(1);
      S.lab.style.opacity = String(kin * (1 - kout));
      S.lab.style.transform = `translateY(${14 * (1 - kin) - 10 * kout}px)`;
      S.head.style.opacity = String(kin2 * (1 - kout));
      S.head.style.transform = `translateY(${20 * (1 - kin2) - 12 * kout}px)`;
      S.head.style.filter = `blur(${5 * (1 - kin2) + 4 * kout}px)`;
      S.title.style.display = "";
    } else S.title.style.display = "none";
    const bk = Math.min(easeOut((t - 6.0) / 0.6), 1 - ease((t - (outro.start - 0.2)) / 0.4));
    S.brand.style.opacity = String(Math.max(0, bk));
  }

  // Presenter: placement keyframes, her turn toward the window, the 3D render.
  {
    const [x, s, rot] = track(D.presenterPath, t);
    S.canvas.style.transform = `translate(${x}px, 0) scale(${s})`;
    S.glow.style.transform = `translate(${x + PW / 2 - 260}px, ${PH - 560 * s}px) scale(${s})`;
    presenter.render(t, { rot });
  }

  // Mia's name tag while she introduces herself.
  {
    const k = easeOut((t - 0.9) / 0.5) * (1 - ease((t - 4.9) / 0.4));
    S.tag.style.opacity = String(k);
    S.tag.style.transform = `translateX(${24 * (1 - k)}px)`;
  }

  // Subtitles: the current chunk, words lighting up as they're spoken.
  {
    let cur = null;
    for (const c of D.subs) if (t >= c.t0 - 0.05 && t < c.t1) cur = c;
    if (cur) {
      const k = clamp01((t - (cur.t0 - 0.05)) / 0.12) * clamp01((cur.t1 - t) / 0.12);
      if (S.subText.dataset.key !== String(cur.t0)) {
        S.subText.dataset.key = String(cur.t0);
        S.subText.innerHTML = cur.words.map((w) => `<span>${w.w}</span>`).join(" ");
      }
      S.subText.querySelectorAll("span").forEach((sp, i) => {
        const w = cur.words[i];
        sp.style.opacity = String(lerp(0.5, 1, clamp01((t - w.t + 0.06) / 0.12)));
      });
      S.subs.style.opacity = String(k);
      S.subs.style.transform = `translateX(-50%) translateY(${6 * (1 - k)}px)`;
      // Clear of the window while it is away (intro, games, outro): centre on the stage instead.
      S.subs.style.left = `${D.subsCenter(t)}px`;
    } else S.subs.style.opacity = "0";
  }

  // A soft white flash on the hard cuts into and out of the games.
  {
    const cuts = [games.start, builder.start];
    let f = 0;
    for (const c of cuts) f = Math.max(f, 1 - Math.abs(t - c) / 0.12);
    S.flash.style.opacity = String(0.12 * f);
  }

  await Promise.all(waits);
}

window.__init = async (data) => {
  D = data;
  const centers = D.subsCenterKeys;
  D.subsCenter = (t) => track(centers, t)[0];
  build();
  await document.fonts.ready;
  await Promise.all([...imgs].map((i) => i.decode().catch(() => {})));
  await presenter.init(S.canvas);
  return true;
};
window.__render = render;
