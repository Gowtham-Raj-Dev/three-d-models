import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, type Fit, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { SEA_SHANTY } from "../shared/songs";
import { Sfx } from "./audio";
import { createWakeMaterial, Particles, Rings } from "./fx";
import { ARMS, ISLAND, LOOT, MODELS, PROPS, SHIPS } from "./manifest";
import { HAUNTED, Ocean, sea, Sky, SUNNY, waveHeight } from "./ocean";
import { ENEMY_STATS, PLAYER_STATS, pointOfSail, polar, Ship, type DeckSlot, type ShipClass, type ShipStats, type Side, type Wind } from "./ships";
import { ARENA, World, type FortSite } from "./world";

// --- Tuning ---------------------------------------------------------------------------------------

const G = 22;
const FORT_RANGE = 60;
const MAX_ACTIVE = 5;
const COMBAT_RANGE = 90;
const SUN_DIR = new THREE.Vector3(0.5, 0.58, 0.42).normalize();
const SHADOW_EXTENT = 70;
const SHIP_MODELS = [SHIPS.playerSmall, SHIPS.playerMedium, SHIPS.playerLarge];
const SHIP_NAMES = ["Sloop", "Brigantine", "Galleon"];
const GHOST_TINT = new THREE.Color("#0d4a33");
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (c: number, t: number, l: number, dt: number) => c + wrap(t - c) * (1 - Math.exp(-l * dt));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Public types ---------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "upgrade" | "sinking" | "over" | "error";

export type UpgradeId = "reload" | "guns" | "hull" | "sails" | "shot" | "range" | "ship" | "carpenter" | "plunder";

export interface Card {
  id: UpgradeId;
  title: string;
  text: string;
  level: number;
  max: number;
  rare: boolean;
}

export interface Offer {
  wave: number;
  cards: Card[];
  gold: number;
  repairCost: number;
  repairAmount: number;
  hull: number;
  maxHull: number;
}

export interface Banner {
  id: number;
  title: string;
  sub: string;
  tone: "info" | "good" | "boss" | "bad";
}

export interface Hud {
  hull: number;
  maxHull: number;
  gold: number;
  wave: number;
  enemies: number;
  sunk: number;
  sail: number;
  speed: number;
  /** Wind arrow rotation on screen (degrees, clockwise from up). */
  wind: number;
  windStrength: number;
  trim: string;
  trimEff: number;
  reloadL: number;
  reloadR: number;
  guns: number;
  ship: string;
  boss: { name: string; hp: number; max: number } | null;
  banner: Banner | null;
  warn: string | null;
  combat: boolean;
}

export interface VoyageResult {
  wave: number;
  sunk: number;
  gold: number;
  forts: number;
  seconds: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  offer(offer: Offer | null): void;
  over(result: VoyageResult): void;
  error(message: string): void;
}

export const EMPTY_HUD: Hud = {
  hull: 100,
  maxHull: 100,
  gold: 0,
  wave: 0,
  enemies: 0,
  sunk: 0,
  sail: 2,
  speed: 0,
  wind: 0,
  windStrength: 1,
  trim: "Beam reach",
  trimEff: 1,
  reloadL: 1,
  reloadR: 1,
  guns: 3,
  ship: "Sloop",
  boss: null,
  banner: null,
  warn: null,
  combat: false,
};

// --- Upgrades -------------------------------------------------------------------------------------

const UPGRADES: Record<UpgradeId, { title: string; text: (level: number) => string; max: number; rare?: boolean }> = {
  reload: { title: "Quick Hands", text: () => "Both broadsides reload 18% faster.", max: 5 },
  guns: { title: "Extra Cannons", text: () => "+1 cannon on each side of the ship.", max: 3 },
  hull: { title: "Oak Planking", text: () => "+25 max hull, and the hull is fully repaired.", max: 5 },
  sails: { title: "Bigger Sails", text: () => "+10% top speed and sharper turns.", max: 4 },
  shot: { title: "Heavy Shot", text: () => "Cannonballs hit 25% harder.", max: 4 },
  range: { title: "Long Guns", text: () => "Your cannons reach 18% further.", max: 3 },
  ship: {
    title: "New Ship",
    text: (level) =>
      level === 0 ? "Refit as a Brigantine: +40 hull, +1 cannon each side, full repair." : "Refit as a Galleon: +50 hull, +1 cannon each side, full repair.",
    max: 2,
    rare: true,
  },
  carpenter: { title: "Ship's Carpenter", text: () => "Repairs the hull slowly whenever you're out of the fight.", max: 1 },
  plunder: { title: "Plunderer", text: () => "+50% gold from loot and bounties.", max: 1 },
};

type Upgrades = Record<UpgradeId, number>;
const NO_UPGRADES: Upgrades = { reload: 0, guns: 0, hull: 0, sails: 0, shot: 0, range: 0, ship: 0, carpenter: 0, plunder: 0 };

// --- Waves ----------------------------------------------------------------------------------------

function roster(n: number): ShipClass[] {
  if (n % 5 === 0) {
    const escorts = Math.min(4, Math.floor(n / 5));
    return ["ghost", ...Array.from({ length: escorts }, (_, i): ShipClass => (n >= 10 && i % 2 === 1 ? "brig" : "sloop"))];
  }
  const fixed: Record<number, ShipClass[]> = {
    1: ["sloop", "sloop"],
    2: ["sloop", "sloop", "sloop"],
    3: ["sloop", "brig", "sloop"],
    4: ["brig", "sloop", "brig", "sloop"],
  };
  if (fixed[n]) return fixed[n];
  const out: ShipClass[] = [];
  let budget = 3 + n * 0.85;
  const frigates = Math.min(0.4, (n - 5) * 0.07);
  while (budget > 0.9 && out.length < 9) {
    const r = Math.random();
    const kind: ShipClass = r < frigates && budget >= 3 ? "frigate" : r < frigates + 0.42 && budget >= 2 ? "brig" : "sloop";
    out.push(kind);
    budget -= kind === "frigate" ? 3 : kind === "brig" ? 2 : 1.1;
  }
  return out;
}

function describe(list: ShipClass[]) {
  if (list.includes("ghost")) {
    const escorts = list.length - 1;
    return escorts ? `The Drowned Queen and ${escorts} escort${escorts > 1 ? "s" : ""} — mind the green rings!` : "The Drowned Queen — mind the green rings!";
  }
  const count = (k: ShipClass) => list.filter((s) => s === k).length;
  const words = (["frigate", "brig", "sloop"] as const)
    .map((k) => [count(k), k] as const)
    .filter(([c]) => c > 0)
    .map(([c, k]) => `${c} ${k}${c > 1 ? "s" : ""}`);
  return `${words.join(", ")} on the horizon`;
}

// --- Internal types -------------------------------------------------------------------------------

interface Fort {
  site: FortSite;
  tower: THREE.Object3D;
  gun: THREE.Object3D;
  x: number;
  z: number;
  gx: number;
  gz: number;
  height: number;
  hp: number;
  maxHp: number;
  reload: number;
  aimT: number;
  gunYaw: number;
  down: boolean;
  downWave: number;
  fallT: number;
}

interface Ball {
  obj: THREE.Object3D;
  mesh: THREE.Mesh | null;
  active: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  hostile: boolean;
  damage: number;
  ghost: boolean;
  trailT: number;
  age: number;
}

interface Shot {
  t: number;
  ship: Ship | null;
  fort: Fort | null;
  side: Side;
  i: number;
  n: number;
  tx: number;
  /** Height to arrive at (0 = the water line, more for fort towers). */
  ty: number;
  tz: number;
  T: number;
  hostile: boolean;
  damage: number;
  ghost: boolean;
  quiet: boolean;
}

type LootKind = "barrel" | "crate" | "bottles" | "chest";

interface Loot {
  kind: LootKind;
  obj: THREE.Object3D;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  phase: number;
  yaw: number;
  spin: number;
  taken: number;
  size: number;
}

interface FloatText {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  big: boolean;
}

interface Target {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  len: number;
  heading: number;
}

const LOOT_KEYS: Record<LootKind, string> = { barrel: LOOT.barrel, crate: LOOT.crate, bottles: LOOT.bottles, chest: LOOT.chest };

// --- Game -----------------------------------------------------------------------------------------

export class CannonCoveGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
  private readonly sun = new THREE.DirectionalLight("#fff1dc", 2.5);
  private readonly hemi = new THREE.HemisphereLight("#d9f0ff", "#4a7d8c", 1.1);
  private readonly fog = new THREE.Fog("#cfe9f6", 90, 300);
  private readonly ocean = new Ocean();
  private readonly sky = new Sky();
  private readonly smoke = new Particles(2000);
  private readonly glow = new Particles(700, { additive: true });
  private readonly rings = new Rings(48);
  private readonly wakeMaterial = createWakeMaterial();
  private readonly protos = new Map<string, Proto>();
  private readonly timer = new THREE.Timer();
  private world: World | null = null;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private overlay: CanvasRenderingContext2D | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private view = { w: 1, h: 1, dpr: 1 };
  private portrait = false;
  private font = "ui-sans-serif, system-ui, sans-serif";

  private phase: Phase = "loading";
  private player!: Ship;
  private enemies: Ship[] = [];
  private readonly shipPool = new Map<ShipClass, Ship[]>();
  private forts: Fort[] = [];
  private balls: Ball[] = [];
  private shots: Shot[] = [];
  private loot: Loot[] = [];
  private readonly lootPool = new Map<LootKind, THREE.Object3D[]>();
  private texts: FloatText[] = [];
  private ghostBallMaterial: THREE.MeshStandardMaterial | null = null;
  private ballMaterial: THREE.Material | null = null;

  private readonly wind: Wind = { angle: -1.05, x: 0, z: 0, strength: 1 };
  private windTarget = -1.05;
  private windStrengthTarget = 1;
  private windTimer = 25;

  private wave = 0;
  private waveState: "intro" | "cleared" = "intro";
  private waveT = 0;
  private clearT = 0;
  private spawnQueue: ShipClass[] = [];
  private spawnT = 0;
  private spawnAngle = 0;
  private gold = 0;
  private totalGold = 0;
  private sunk = 0;
  private fortsDown = 0;
  private runTime = 0;
  private up: Upgrades = { ...NO_UPGRADES };
  private offerCards: Card[] = [];
  private banner: Banner | null = null;
  private bannerT = 0;
  private bannerId = 0;
  private haunt = 0;
  private hauntShown = -1;
  private deathT = 0;
  private warn: string | null = null;

  private readonly keys = { left: false, right: false };
  private stick = 0;
  private readonly fireHeld: Record<Side, boolean> = { 1: false, [-1]: false } as Record<Side, boolean>;

  private camYaw = 0;
  private readonly camPos = new THREE.Vector3(0, 10, -30);
  private readonly camLook = new THREE.Vector3();
  private camSnap = true;
  /** Combat framing: 0..1 zoom-out and a yaw bias towards the nearest enemy. */
  private frameK = 0;
  private frameBias = 0;
  private shake = 0;
  private zoom = 1;
  private elapsed = 0;
  private hudT = 0;
  private miniT = 0;
  private hud: Hud = { ...EMPTY_HUD };
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private combat = false;
  private readonly circleBuf: number[] = [0, 0, 0, 0, 0, 0];
  private readonly circleBuf2: number[] = [0, 0, 0, 0, 0, 0];
  private readonly slotCache = new Map<string, DeckSlot[]>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setupWorld(coarse);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup --------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.fog = this.fog;
    scene.background = this.fog.color;
    this.camera.add(this.sky.mesh);
    scene.add(this.camera);
    scene.add(this.ocean.mesh);
    this.ocean.setSun(SUN_DIR);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.4;

    scene.add(this.hemi);
    const { sun } = this;
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    Object.assign(sun.shadow.camera, { left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 260 });
    scene.add(sun, sun.target);

    scene.add(this.smoke.points, this.glow.points, this.rings.group);
    this.applyAtmosphere(true);
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const proto = (key: string, fit: Fit, opts?: { shadows?: boolean; receive?: boolean }) => {
        const m = models.get(key);
        if (m) this.protos.set(key, makeProto(m.scene, m.animations, fit, opts));
      };
      for (const key of Object.values(SHIPS)) proto(key, { scale: 1 });
      for (const key of Object.values(ISLAND)) proto(key, { scale: 1 }, { receive: true });
      for (const key of Object.values(PROPS)) proto(key, { scale: 1 }, { receive: true });
      proto(ARMS.cannon, { scale: 0.6 });
      proto(ARMS.fortCannon, { scale: 1.3 });
      proto(ARMS.ball, { height: 0.62 }, { shadows: false });
      proto(LOOT.barrel, { height: 1.9 }, { shadows: false });
      proto(LOOT.crate, { width: 2.1 }, { shadows: false });
      proto(LOOT.bottles, { width: 2.1 }, { shadows: false });
      proto(LOOT.chest, { width: 2.3 }, { shadows: false });

      const required = [SHIPS.playerSmall, SHIPS.sloop, ARMS.ball, ISLAND.sand];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      this.buildWorld();
      this.buildArms();
      this.player = new Ship("player", { ...PLAYER_STATS }, this.wakeMaterial);
      this.scene.add(this.player.root, this.player.wake.mesh);
      this.resetRun();
      music.play(SEA_SHANTY, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildWorld() {
    const world = new World(this.protos);
    this.world = world;
    this.scene.add(world.group);
    this.ocean.setShoals(world.shoals.filter((s) => !s.dock).map((s) => ({ x: s.x, z: s.z, r: s.r * 0.88 })));
    const towerSmall = this.protos.get(PROPS.towerSmall);
    const towerLarge = this.protos.get(PROPS.towerLarge) ?? towerSmall;
    const gun = this.protos.get(ARMS.fortCannon) ?? this.protos.get(ARMS.cannon);
    for (const site of world.forts) {
      const proto = site.large ? towerLarge : towerSmall;
      if (!proto || !gun) continue;
      const tower = proto.object.clone();
      const s = site.large ? 1.1 : 1.15;
      tower.scale.setScalar(s);
      tower.position.set(site.x, 0.85, site.z);
      tower.rotation.y = site.yaw + Math.PI;
      const g = gun.object.clone();
      const gx = site.x + Math.sin(site.yaw) * 4.2;
      const gz = site.z + Math.cos(site.yaw) * 4.2;
      g.position.set(gx, 0.9, gz);
      g.rotation.y = site.yaw;
      this.scene.add(tower, g);
      this.forts.push({ site, tower, gun: g, x: site.x, z: site.z, gx, gz, height: proto.size.y * s + 0.85, hp: 90, maxHp: 90, reload: 3, aimT: -1, gunYaw: site.yaw, down: false, downWave: 0, fallT: 0 });
    }
  }

  private buildArms() {
    const ball = this.protos.get(ARMS.ball)!;
    let mesh: THREE.Mesh | null = null;
    ball.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
    });
    const base = (mesh as THREE.Mesh | null)?.material as THREE.MeshStandardMaterial | undefined;
    if (base) {
      this.ballMaterial = base;
      this.ghostBallMaterial = base.clone();
      this.ghostBallMaterial.emissive.set("#3dffa8");
      this.ghostBallMaterial.emissiveIntensity = 1.6;
    }
    for (let i = 0; i < 90; i++) {
      const obj = ball.object.clone();
      obj.visible = false;
      let m: THREE.Mesh | null = null;
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !m) m = o as THREE.Mesh;
      });
      this.scene.add(obj);
      this.balls.push({ obj, mesh: m, active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), hostile: false, damage: 0, ghost: false, trailT: 0, age: 0 });
    }
  }

  // --- Public API ---------------------------------------------------------------------------------

  start() {
    audio.unlock();
    this.resetRun();
    this.player.sail = 2;
    this.player.sailVis = 2 / 3;
    this.player.speed = 4;
    this.camSnap = true;
    music.play(SEA_SHANTY, 1);
    music.duck(false);
    this.setPhase("playing");
    this.nextWave();
  }

  pause() {
    if (this.phase !== "playing") return;
    this.releaseInput();
    music.duck(true);
    this.sfx.ambience(0, 0, 0);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.resetRun();
    this.camSnap = true;
    music.play(SEA_SHANTY, 0);
    music.setIntensity(0);
    music.duck(false);
    this.events.offer(null);
    this.setPhase("menu");
  }

  get currentPhase() {
    return this.phase;
  }

  setOverlay(canvas: HTMLCanvasElement | null) {
    this.overlay = canvas?.getContext("2d") ?? null;
    this.resize();
  }

  /** Display font family for texts drawn over the 3D view. */
  setFont(family: string) {
    if (family.trim()) this.font = `${family.trim()}, ui-sans-serif, system-ui, sans-serif`;
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas;
    this.miniT = 0;
  }

  setSteerKey(dir: "left" | "right", down: boolean) {
    this.keys[dir] = down;
  }

  /** Touch stick: -1 (left) … 1 (right). */
  setStick(x: number) {
    this.stick = clamp(x, -1, 1);
  }

  sailStep(dir: 1 | -1) {
    if (this.phase !== "playing" || !this.player.alive) return;
    const next = clamp(this.player.sail + dir, 0, 3);
    if (next === this.player.sail) return;
    this.player.sail = next;
    this.sfx.sail(dir > 0);
    this.emitHud(true);
  }

  setFire(side: Side, down: boolean) {
    this.fireHeld[side] = down;
    if (down && this.phase === "playing") {
      if (this.player.reload[side] > 0) this.sfx.empty();
      else this.firePlayer(side);
    }
  }

  zoomStep() {
    this.zoom = this.zoom < 0.9 ? 1 : this.zoom < 1.2 ? 1.35 : 0.8;
  }

  zoomBy(delta: number) {
    this.zoom = clamp(this.zoom * (1 + delta), 0.7, 1.6);
  }

  releaseInput() {
    this.keys.left = this.keys.right = false;
    this.stick = 0;
    this.fireHeld[1] = this.fireHeld[-1] = false;
  }

  choose(index: number) {
    if (this.phase !== "upgrade") return;
    const card = this.offerCards[index];
    if (!card) return;
    this.applyUpgrade(card.id);
    this.sfx.pick();
    this.events.offer(null);
    this.setPhase("playing");
    this.nextWave();
  }

  repair() {
    if (this.phase !== "upgrade") return;
    const p = this.player;
    const cost = this.repairCost();
    if (this.gold < cost || p.hp >= p.maxHp) return;
    this.gold -= cost;
    p.hp = Math.min(p.maxHp, p.hp + this.repairAmount());
    this.sfx.repair();
    this.emitOffer();
    this.emitHud(true);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    this.world?.dispose();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.envTexture?.dispose();
    this.ocean.dispose();
    this.sky.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.rings.dispose();
    this.wakeMaterial.dispose();
    this.ghostBallMaterial?.dispose();
    this.player?.dispose();
    for (const s of this.enemies) s.dispose();
    for (const list of this.shipPool.values()) for (const s of list) s.dispose();
    this.renderer.dispose();
  }

  // --- State --------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    this.emitHud(true);
  }

  private resetRun() {
    for (const e of this.enemies) this.releaseShip(e);
    this.enemies = [];
    for (const b of this.balls) {
      b.active = false;
      b.obj.visible = false;
    }
    this.shots = [];
    for (const l of this.loot) this.releaseLoot(l);
    this.loot = [];
    this.texts = [];
    this.smoke.clear();
    this.glow.clear();
    this.rings.clear();
    this.up = { ...NO_UPGRADES };
    this.wave = 0;
    this.waveState = "intro";
    this.spawnQueue = [];
    this.gold = 0;
    this.totalGold = 0;
    this.sunk = 0;
    this.fortsDown = 0;
    this.runTime = 0;
    this.banner = null;
    this.haunt = 0;
    this.deathT = 0;
    this.warn = null;
    this.releaseInput();
    this.wind.angle = this.windTarget = -1.05 + rand(-0.2, 0.2);
    this.wind.strength = this.windStrengthTarget = 1;
    this.windTimer = 25;
    this.updateWindVector();

    const p = this.player;
    p.stats = { ...PLAYER_STATS };
    p.setModel(this.protos.get(SHIP_MODELS[0])!, 1);
    this.mountGuns();
    p.reset(0, 0, 0.35);
    p.maxHp = p.hp = this.maxHull();
    p.sail = 1;
    p.sailVis = 1 / 3;
    p.speed = 2;
    p.lastHit = -10;
    for (const f of this.forts) this.rebuildFort(f);
    this.applyAtmosphere(true);
    this.emitHud(true);
  }

  // --- Derived player stats -------------------------------------------------------------------

  private maxHull() {
    return 100 + this.up.hull * 25 + [0, 40, 90][this.up.ship];
  }

  private guns() {
    return 3 + this.up.guns + this.up.ship;
  }

  private reloadTime() {
    return 3.2 * Math.pow(0.82, this.up.reload);
  }

  private range() {
    return 46 * (1 + 0.18 * this.up.range);
  }

  private damage() {
    return 10 * (1 + 0.25 * this.up.shot);
  }

  private speedMul() {
    return (1 + 0.1 * this.up.sails) * (1 - 0.03 * this.up.ship);
  }

  private turnMul() {
    return (1 + 0.08 * this.up.sails) * (1 - 0.06 * this.up.ship);
  }

  private goldMul() {
    return 1 + 0.5 * this.up.plunder;
  }

  private repairCost() {
    return 30 + this.wave * 2;
  }

  private repairAmount() {
    return Math.round(this.player.maxHp * 0.3);
  }

  private applyUpgrade(id: UpgradeId) {
    this.up[id]++;
    const p = this.player;
    if (id === "hull") {
      p.maxHp = this.maxHull();
      p.hp = p.maxHp;
    } else if (id === "ship") {
      const proto = this.protos.get(SHIP_MODELS[this.up.ship]);
      if (proto) p.setModel(proto, 1);
      p.maxHp = this.maxHull();
      p.hp = p.maxHp;
    }
    p.maxHp = this.maxHull();
    this.mountGuns();
    this.emitHud(true);
  }

  /** Shows the player's cannons on deck — one per gun, so upgrades are visible. */
  private mountGuns() {
    this.player.setDeckGuns(this.protos.get(ARMS.cannon), this.deckSlots(SHIP_MODELS[this.up.ship]), this.guns());
  }

  /** Free spots along the main deck's rail of a ship model (found by casting rays down onto it). */
  private deckSlots(key: string): DeckSlot[] {
    const cached = this.slotCache.get(key);
    if (cached) return cached;
    const proto = this.protos.get(key);
    const slots: DeckSlot[] = [];
    if (proto) {
      const obj = proto.object;
      obj.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const solid = (hits: THREE.Intersection[]) => hits.find((h) => !/sail|flag/i.test(h.object.name + h.object.parent?.name));
      const free: DeckSlot[] = [];
      for (let z = -proto.size.z / 2; z <= proto.size.z / 2; z += 0.2) {
        ray.set(this.v1.set(1.45, 30, z), down);
        const deck = solid(ray.intersectObject(obj, true));
        ray.set(this.v1.set(1.9, 30, z), down);
        const rail = solid(ray.intersectObject(obj, true));
        if (deck && rail && deck.point.y > 1.9 && deck.point.y < 2.95 && rail.point.y > deck.point.y + 0.3) free.push({ z, y: deck.point.y });
      }
      // Most central spots first, at least a cannon's length apart.
      const mid = free.length ? (free[0].z + free[free.length - 1].z) / 2 : 0;
      free.sort((a, b) => Math.abs(a.z - mid) - Math.abs(b.z - mid));
      for (const s of free) if (slots.every((o) => Math.abs(o.z - s.z) >= 1.15)) slots.push(s);
    }
    this.slotCache.set(key, slots);
    return slots;
  }

  private offerUpgrades() {
    const available = (Object.keys(UPGRADES) as UpgradeId[]).filter((id) => {
      if (this.up[id] >= UPGRADES[id].max) return false;
      if (id === "ship") return this.wave >= (this.up.ship === 0 ? 2 : 5);
      if (id === "guns") return this.guns() < 8;
      return true;
    });
    const picks: UpgradeId[] = [];
    // A new ship is too good to hide: offer it whenever it unlocks.
    if (available.includes("ship") && Math.random() < 0.75) picks.push("ship");
    const rest = available.filter((id) => !picks.includes(id));
    while (picks.length < 3 && rest.length) picks.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    this.offerCards = picks.map((id) => ({
      id,
      title: id === "ship" ? `New Ship: ${SHIP_NAMES[this.up.ship + 1]}` : UPGRADES[id].title,
      text: UPGRADES[id].text(this.up[id]),
      level: this.up[id],
      max: UPGRADES[id].max,
      rare: !!UPGRADES[id].rare,
    }));
    this.emitOffer();
  }

  private emitOffer() {
    this.events.offer({
      wave: this.wave,
      cards: this.offerCards,
      gold: this.gold,
      repairCost: this.repairCost(),
      repairAmount: this.repairAmount(),
      hull: Math.ceil(this.player.hp),
      maxHull: this.player.maxHp,
    });
  }

  // --- Waves --------------------------------------------------------------------------------------

  private nextWave() {
    this.wave++;
    const list = roster(this.wave);
    this.spawnQueue = [...list];
    this.waveState = "intro";
    this.waveT = 0;
    this.spawnT = 1.8;
    this.spawnAngle = this.player.heading + rand(-1.2, 1.2);
    for (const f of this.forts) if (f.down && this.wave - f.downWave >= 3) this.rebuildFort(f);
    const boss = list.includes("ghost");
    this.showBanner(boss ? "The ghost ship rises!" : `Wave ${this.wave}`, describe(list), boss ? "boss" : "info", 4.2);
    if (boss) this.sfx.boss();
    else this.sfx.waveStart();
  }

  private updateWaves(dt: number) {
    this.waveT += dt;
    if (this.spawnQueue.length) {
      this.spawnT -= dt;
      const active = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
      if (this.spawnT <= 0 && active < MAX_ACTIVE) {
        this.spawnEnemy(this.spawnQueue.shift()!);
        this.spawnT = 1.4;
      }
    }
    if (this.waveState !== "cleared" && !this.spawnQueue.length && this.waveT > 3 && !this.enemies.some((e) => e.alive)) {
      this.waveState = "cleared";
      this.clearT = 5;
      this.showBanner(`Wave ${this.wave} cleared!`, "Sail through the loot — upgrades in a moment", "good", 4);
      this.sfx.waveClear();
    }
    if (this.waveState === "cleared") {
      this.clearT -= dt;
      const lootNear = this.loot.some((l) => l.taken < 0 && Math.hypot(l.x - this.player.x, l.z - this.player.z) < 30);
      if (this.clearT <= 0 || (this.clearT < 3.5 && !lootNear && this.loot.every((l) => l.taken >= 0))) {
        this.clearT = 0;
        this.releaseInput();
        this.setPhase("upgrade");
        this.offerUpgrades();
      }
    }
  }

  private scaledStats(kind: Exclude<ShipClass, "player">): ShipStats {
    const base = ENEMY_STATS[kind];
    const n = this.wave - 1;
    const hp = kind === "ghost" ? base.hp + 150 * (Math.floor(this.wave / 5) - 1) : base.hp * (1 + 0.07 * n);
    return {
      ...base,
      hp: Math.round(hp),
      damage: base.damage * (1 + 0.045 * n),
      reload: base.reload * Math.max(0.72, 1 - 0.022 * n),
      speed: base.speed * Math.min(1.15, 1 + 0.012 * n),
    };
  }

  private shipKey(kind: ShipClass) {
    const map: Record<ShipClass, string[]> = {
      player: [SHIPS.playerSmall],
      sloop: [SHIPS.sloop],
      brig: [SHIPS.brig, SHIPS.sloop],
      frigate: [SHIPS.frigate, SHIPS.brig, SHIPS.sloop],
      ghost: [SHIPS.ghost, SHIPS.frigate, SHIPS.sloop],
    };
    return map[kind].find((k) => this.protos.has(k))!;
  }

  private spawnEnemy(kind: ShipClass) {
    if (kind === "player") return;
    const stats = this.scaledStats(kind);
    const ship = this.shipPool.get(kind)?.pop() ?? this.createShip(kind, stats);
    ship.stats = stats;
    const p = this.player;
    const shoals = this.world?.shoals ?? [];
    let x = 0;
    let z = 0;
    let found = false;
    for (let attempt = 0; attempt < 60 && !found; attempt++) {
      const a = this.spawnAngle + rand(-0.7, 0.7) + (attempt > 30 ? rand(-2, 2) : 0);
      const d = kind === "ghost" ? rand(80, 95) : rand(95, 135);
      x = p.x + Math.sin(a) * d;
      z = p.z + Math.cos(a) * d;
      if (Math.hypot(x, z) > ARENA - 18) continue;
      if (shoals.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 12)) continue;
      if (this.enemies.some((e) => Math.hypot(x - e.x, z - e.z) < 22)) continue;
      found = true;
    }
    if (!found) {
      const a = Math.atan2(-p.x, -p.z) + rand(-0.8, 0.8);
      x = Math.sin(a) * (ARENA - 30);
      z = Math.cos(a) * (ARENA - 30);
    }
    ship.reset(x, z, Math.atan2(p.x - x, p.z - z) + rand(-0.4, 0.4));
    ship.maxHp = ship.hp = stats.hp;
    ship.sail = 3;
    ship.sailVis = 1;
    ship.speed = stats.speed * 0.6;
    ship.reload[1] = rand(1, 3);
    ship.reload[-1] = rand(1, 3);
    ship.side = Math.random() < 0.5 ? 1 : -1;
    ship.sideTimer = rand(8, 16);
    ship.barrageT = 6;
    ship.lastHit = -10;
    this.enemies.push(ship);
    this.scene.add(ship.root, ship.wake.mesh);
    ship.pose(0, this.elapsed, this.wind);
    if (kind === "ghost") {
      // It rises from the deep in a burst of green fire.
      this.glow.burst(this.v1.set(x, 1, z), 40, 6, 6, { color: "#58ffb8", size: 2.4, grow: 0.4, life: 1.4, gravity: -2, drag: 1.5, alpha: 0.9, spread: 6 });
      this.smoke.burst(this.v1.set(x, 1, z), 30, 4, 3, { color: "#4c6b62", size: 4, grow: 10, life: 3, gravity: -1.5, drag: 1.2, alpha: 0.6, spread: 8 });
    }
  }

  private createShip(kind: ShipClass, stats: ShipStats) {
    const ship = new Ship(kind, stats, this.wakeMaterial);
    ship.setModel(this.protos.get(this.shipKey(kind))!, stats.scale, kind === "ghost" ? GHOST_TINT : undefined);
    return ship;
  }

  private releaseShip(ship: Ship) {
    this.scene.remove(ship.root, ship.wake.mesh);
    ship.wake.reset();
    let list = this.shipPool.get(ship.kind);
    if (!list) this.shipPool.set(ship.kind, (list = []));
    list.push(ship);
  }

  // --- Frame --------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    if (this.phase === "loading" || this.phase === "error") return;

    const live = this.phase !== "paused";
    if (live) {
      this.elapsed += dt;
      sea.time += dt;
      if (this.phase === "playing") this.updatePlaying(dt);
      else if (this.phase === "menu") this.updateMenu(dt);
      else if (this.phase === "sinking" || this.phase === "over") this.updateSinking(dt);
      this.updateVisuals(dt);
    }
    this.updateCamera(live ? dt : 0);
    this.ocean.update(this.camLook);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 1 / 12;
      this.drawMinimap();
    }
    this.hudT -= dt;
    if (this.hudT <= 0) this.emitHud();
  };

  private updateMenu(dt: number) {
    // The ship idles along on a slow circle while the camera orbits.
    const p = this.player;
    this.updateWind(dt);
    p.sail = 1;
    p.steerIn = -0.35;
    p.physics(dt, this.wind, 0.7, 0.5, 0.5);
    if (Math.hypot(p.x, p.z) > 40) p.steerIn = -1;
  }

  private updatePlaying(dt: number) {
    this.runTime += dt;
    this.updateWind(dt);
    this.controlPlayer(dt);
    const p = this.player;
    p.physics(dt, this.wind, this.speedMul(), this.turnMul());
    for (const e of this.enemies) {
      this.updateEnemy(e, dt);
      e.physics(dt, this.wind, 1, 1, 0.45);
    }
    this.collide();
    this.updateForts(dt);
    this.updateShots(dt);
    this.updateBalls(dt);
    this.updateLoot(dt);
    this.updateWaves(dt);
    // Ship's carpenter.
    if (this.up.carpenter && p.alive && this.runTime - p.lastHit > 5 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1.6 * dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.banner = null;
        this.emitHud(true);
      }
    }
    const combat = this.enemies.some((e) => e.alive && (e.kind === "ghost" || Math.hypot(e.x - p.x, e.z - p.z) < COMBAT_RANGE));
    music.setIntensity(combat ? 2 : 1);
    this.combat = combat;
  }

  private updateSinking(dt: number) {
    this.deathT += dt;
    for (const e of this.enemies) {
      this.updateEnemy(e, dt);
      e.physics(dt, this.wind, 0.8, 1, 0.45);
    }
    this.player.physics(dt, this.wind);
    this.player.sinkT += dt;
    this.updateShots(dt);
    this.updateBalls(dt);
    this.updateLoot(dt);
    for (const e of this.enemies) if (e.sinkT >= 0) e.sinkT += dt;
    if (this.phase === "sinking" && this.deathT > 3.6) {
      this.setPhase("over");
      this.sfx.gameOver();
      music.setIntensity(0);
      this.events.over({ wave: this.wave, sunk: this.sunk, gold: Math.round(this.totalGold), forts: this.fortsDown, seconds: Math.round(this.runTime) });
    }
  }

  /** Waves, bobbing, particles, wakes and atmosphere: runs in every live phase. */
  private updateVisuals(dt: number) {
    const t = this.elapsed;
    const p = this.player;
    p.pose(dt, t, this.wind);
    this.shipFx(p, dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.sinkT >= 0 && this.phase !== "sinking" && this.phase !== "over") e.sinkT += dt;
      e.pose(dt, t, this.wind);
      this.shipFx(e, dt);
      if (e.sinkT > 9) {
        this.releaseShip(e);
        this.enemies.splice(i, 1);
      }
    }
    for (const f of this.forts) this.fortVisual(f, dt);
    this.updateTexts(dt);
    this.world?.update(t);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.rings.update(dt);
    (this.wakeMaterial.uniforms.uTime as { value: number }).value = t;
    this.applyAtmosphere(false, dt);
    if (this.phase === "upgrade") {
      // Loot keeps bobbing behind the upgrade cards.
      for (const l of this.loot) this.poseLoot(l, dt);
    }
    const speedK = clamp(p.speed / 12, 0, 1);
    const playing = this.phase === "playing" || this.phase === "upgrade" || this.phase === "menu";
    this.sfx.ambience(playing ? 0.8 + this.haunt * 0.5 : 0.5, playing ? this.wind.strength * (0.4 + p.sailVis * 0.6) : 0.2, playing ? speedK : 0);
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  // --- Wind ---------------------------------------------------------------------------------------

  private updateWind(dt: number) {
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = rand(20, 34);
      this.windTarget = this.wind.angle + rand(0.35, 1.1) * (Math.random() < 0.5 ? -1 : 1);
      this.windStrengthTarget = rand(0.8, 1.18);
    }
    this.wind.angle = dampAngle(this.wind.angle, this.windTarget, 0.1, dt);
    this.wind.strength = damp(this.wind.strength, this.windStrengthTarget, 0.12, dt);
    this.updateWindVector();
  }

  private updateWindVector() {
    this.wind.x = Math.sin(this.wind.angle);
    this.wind.z = Math.cos(this.wind.angle);
  }

  // --- Player -------------------------------------------------------------------------------------

  private controlPlayer(dt: number) {
    const p = this.player;
    if (!p.alive) return;
    const k = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    p.steerIn = clamp(k + this.stick, -1, 1);
    for (const side of [1, -1] as Side[]) {
      const before = p.reload[side];
      p.reload[side] = Math.max(0, before - dt);
      if (before > 0 && p.reload[side] === 0) this.sfx.reloaded();
      if (this.fireHeld[side] && p.reload[side] === 0) this.firePlayer(side);
    }
    const r = Math.hypot(p.x, p.z);
    this.warn = r > ARENA - 14 ? "Turn back — you're leaving the cove" : null;
  }

  private firePlayer(side: Side) {
    const p = this.player;
    if (p.reload[side] > 0 || !p.alive) return;
    p.reload[side] = this.reloadTime();
    this.broadside(p, side, this.pickTarget(side), false, this.guns(), this.range(), this.damage());
    this.shake = Math.max(this.shake, 0.18);
    this.emitHud(true);
  }

  /** The best target on a side: the nearest enemy (or fort) roughly abeam and in range. */
  private pickTarget(side: Side): Target | null {
    const p = this.player;
    const sx = p.sideX(side);
    const sz = p.sideZ(side);
    const range = this.range() * 1.15;
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (x: number, z: number, t: Target) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 1) return;
      const cos = (dx * sx + dz * sz) / d;
      if (cos < 0.72) return;
      const score = d * (1.8 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    };
    for (const e of this.enemies) {
      if (!e.alive) continue;
      consider(e.x, e.z, { x: e.x, y: 0, z: e.z, vx: e.fx * e.speed, vz: e.fz * e.speed, len: e.length, heading: e.heading });
    }
    for (const f of this.forts) {
      if (f.down) continue;
      consider(f.x, f.z, { x: f.x, y: f.height * 0.45, z: f.z, vx: 0, vz: 0, len: 1.5, heading: 0 });
    }
    return best;
  }

  private damagePlayer(amount: number, at: THREE.Vector3 | null) {
    const p = this.player;
    if (!p.alive || this.phase !== "playing") return;
    p.hp -= amount;
    p.hitFlash = 1;
    p.lastHit = this.runTime;
    this.shake = Math.max(this.shake, 0.45);
    this.sfx.hurt();
    if (at) this.splinters(at, 1.2);
    if (p.hp <= 0) {
      p.hp = 0;
      this.sinkShip(p);
      this.releaseInput();
      this.deathT = 0;
      this.showBanner("Your ship is going down!", `Wave ${this.wave} · ${this.sunk} ships sunk`, "bad", 5);
      this.setPhase("sinking");
    }
    this.emitHud(true);
  }

  // --- Enemy AI -----------------------------------------------------------------------------------

  private updateEnemy(e: Ship, dt: number) {
    e.reload[1] = Math.max(0, e.reload[1] - dt);
    e.reload[-1] = Math.max(0, e.reload[-1] - dt);
    if (!e.alive) {
      e.steerIn = 0;
      return;
    }
    const p = this.player;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const bearing = Math.atan2(dx, dz);
    const range = e.stats.range;
    const pref = range * 0.62;
    const hunting = p.alive && this.phase === "playing";

    e.sideTimer -= dt;
    if (e.sideTimer <= 0) {
      e.sideTimer = rand(12, 22);
      // Engage with whichever side currently faces the player.
      e.side = wrap(bearing - e.heading) > 0 ? 1 : -1;
    }
    let desired: number;
    if (!hunting) desired = e.heading + 0.4;
    else if (dist > pref * 1.75) desired = bearing - e.side * 0.3;
    else {
      const k = clamp((dist - pref * 0.5) / (pref * 0.75), 0, 1);
      desired = bearing - e.side * lerp(2.1, 1.0, k);
    }
    // Never point straight into the wind.
    const from = this.wind.angle + Math.PI;
    const rel = wrap(desired - from);
    if (Math.abs(rel) < 0.6) desired = from + (rel >= 0 ? 0.6 : -0.6);
    desired = this.avoid(e, desired);
    const diff = wrap(desired - e.heading);
    e.steerIn = clamp(-diff * 1.8, -1, 1);
    e.sail = !hunting ? 1 : dist > pref * 1.4 ? 3 : 2;

    if (!hunting) {
      e.aimT = -1;
      return;
    }
    if (e.aimT >= 0) {
      e.aimT -= dt;
      // Fuse sparks along the gun ports.
      if (Math.random() < dt * 30) {
        e.muzzle(e.aimSide, Math.floor(Math.random() * e.stats.guns), e.stats.guns, this.v1);
        this.glow.spawn(this.v1.x, this.v1.y + 0.3, this.v1.z, rand(-1, 1), rand(1, 3), rand(-1, 1), { color: "#ffb347", size: 0.7, grow: 0.2, life: 0.35, gravity: 6 });
      }
      if (e.aimT < 0) {
        const target: Target = { x: p.x, y: 0, z: p.z, vx: p.fx * p.speed, vz: p.fz * p.speed, len: p.length, heading: p.heading };
        e.reload[e.aimSide] = e.stats.reload;
        this.broadside(e, e.aimSide, target, true, e.stats.guns, e.stats.range, e.stats.damage);
      }
      return;
    }
    if (dist < range * 1.05) {
      for (const side of [1, -1] as Side[]) {
        if (e.reload[side] > 0) continue;
        const cos = (dx * e.sideX(side) + dz * e.sideZ(side)) / dist;
        if (cos > 0.84) {
          e.aimT = Math.max(0.6, 1.05 - this.wave * 0.025);
          e.aimSide = side;
          this.sfx.fuse(this.near(e.x, e.z));
          break;
        }
      }
    }
    if (e.kind === "ghost") {
      e.barrageT -= dt;
      if (e.barrageT <= 0 && dist < 90) {
        e.barrageT = rand(8.5, 11.5);
        this.barrage(e);
      }
    }
  }

  /** Steers around islands, reefs, other ships and the edge of the cove. */
  private avoid(e: Ship, desired: number) {
    let out = desired;
    const shoals = this.world?.shoals ?? [];
    for (const probe of [11, 22, 34]) {
      const px = e.x + Math.sin(out) * probe;
      const pz = e.z + Math.cos(out) * probe;
      for (const s of shoals) {
        if (Math.hypot(px - s.x, pz - s.z) < s.r + 7) {
          const toShoal = Math.atan2(s.x - e.x, s.z - e.z);
          const a = wrap(out - toShoal);
          out = toShoal + (a >= 0 ? 1 : -1) * (Math.PI / 2 + 0.3);
        }
      }
    }
    for (const o of this.enemies) {
      if (o === e || !o.alive) continue;
      const dx = o.x - e.x;
      const dz = o.z - e.z;
      const d = Math.hypot(dx, dz);
      if (d < 16) {
        const to = Math.atan2(dx, dz);
        const a = wrap(out - to);
        if (Math.abs(a) < 1.2) out = to + (a >= 0 ? 1.2 : -1.2);
      }
    }
    const r = Math.hypot(e.x, e.z);
    if (r > ARENA - 35) {
      const home = Math.atan2(-e.x, -e.z);
      out += wrap(home - out) * clamp((r - (ARENA - 35)) / 20, 0, 1);
    }
    return out;
  }

  /** The ghost ship lobs a ring of shots onto (and around) where you're heading. */
  private barrage(e: Ship) {
    const p = this.player;
    const T = 1.6;
    const cx = p.x + p.fx * p.speed * T * 0.9;
    const cz = p.z + p.fz * p.speed * T * 0.9;
    const points: [number, number][] = [[cx, cz]];
    const rot = rand(0, TAU);
    for (let i = 0; i < 6; i++) points.push([cx + Math.cos(rot + (i * TAU) / 6) * 8, cz + Math.sin(rot + (i * TAU) / 6) * 8]);
    points.forEach(([x, z], i) => {
      const delay = 0.12 + i * 0.04;
      this.rings.spawn(x, z, { r0: 5, r1: 2.2, life: T + 0.1, color: "#6dffc4", alpha: 0.95, pulse: true });
      this.shots.push({ t: delay, ship: e, fort: null, side: i % 2 ? 1 : -1, i: i % 5, n: 5, tx: x, ty: 0, tz: z, T: T - delay, hostile: true, damage: 9, ghost: true, quiet: i > 1 });
    });
    this.sfx.wail();
  }

  // --- Cannons ------------------------------------------------------------------------------------

  private broadside(s: Ship, side: Side, target: Target | null, hostile: boolean, n: number, range: number, damage: number) {
    const m = this.v1;
    const sx = s.sideX(side);
    const sz = s.sideZ(side);
    for (let i = 0; i < n; i++) {
      s.muzzle(side, i, n, m);
      let tx: number;
      let tz: number;
      if (target) {
        const d0 = Math.hypot(target.x - m.x, target.z - m.z);
        const T0 = 0.45 + Math.min(d0, range) / 60;
        const lead = hostile ? rand(0.55, 1.05) : 1;
        const along = (n <= 1 ? 0 : i / (n - 1) - 0.5) * target.len * 0.75;
        tx = target.x + target.vx * T0 * lead + Math.sin(target.heading) * along;
        tz = target.z + target.vz * T0 * lead + Math.cos(target.heading) * along;
        const err = hostile ? (1.6 + d0 * 0.05) * Math.max(0.7, 1 - this.wave * 0.02) : 0.7 + d0 * 0.022;
        tx += gauss() * err;
        tz += gauss() * err;
      } else {
        const R = range * rand(0.82, 0.94);
        tx = m.x + sx * R + s.fx * s.speed * 0.9 + gauss() * 1.2;
        tz = m.z + sz * R + s.fz * s.speed * 0.9 + gauss() * 1.2;
      }
      const dx = tx - m.x;
      const dz = tz - m.z;
      const dd = Math.hypot(dx, dz) || 1;
      if (dd > range) {
        tx = m.x + (dx / dd) * range;
        tz = m.z + (dz / dd) * range;
      }
      const T = 0.45 + Math.min(dd, range) / 60;
      const ty = target && dd <= range ? target.y : 0;
      this.shots.push({ t: i * 0.08 + rand(0, 0.03), ship: s, fort: null, side, i, n, tx, ty, tz, T, hostile, damage, ghost: s.kind === "ghost", quiet: false });
    }
  }

  private updateShots(dt: number) {
    if (!this.shots.length) return;
    const m = this.v2;
    this.shots = this.shots.filter((shot) => {
      shot.t -= dt;
      if (shot.t > 0) return true;
      let dirX = 0;
      let dirZ = 0;
      if (shot.ship) {
        if (!shot.ship.alive && shot.ship !== this.player) return false;
        shot.ship.muzzle(shot.side, shot.i, shot.n, m);
        dirX = shot.ship.sideX(shot.side);
        dirZ = shot.ship.sideZ(shot.side);
      } else if (shot.fort) {
        if (shot.fort.down) return false;
        const f = shot.fort;
        dirX = Math.sin(f.gunYaw);
        dirZ = Math.cos(f.gunYaw);
        m.set(f.gx + dirX * 1.4, 2.1, f.gz + dirZ * 1.4);
      }
      this.launch(m, shot.tx, shot.ty, shot.tz, Math.max(0.3, shot.T), shot.hostile, shot.damage, shot.ghost);
      this.muzzleFx(m, dirX, dirZ, shot.ghost);
      if (!shot.quiet) this.sfx.cannon(shot.hostile ? this.near(m.x, m.z) * 0.85 : 1);
      return false;
    });
  }

  private launch(from: THREE.Vector3, tx: number, ty: number, tz: number, T: number, hostile: boolean, damage: number, ghost: boolean) {
    const b = this.balls.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.hostile = hostile;
    b.damage = damage;
    b.ghost = ghost;
    b.age = 0;
    b.trailT = 0;
    b.p.copy(from);
    b.v.set((tx - from.x) / T, (ty - from.y) / T + 0.5 * G * T, (tz - from.z) / T);
    b.obj.position.copy(from);
    b.obj.visible = true;
    if (b.mesh) b.mesh.material = (ghost ? this.ghostBallMaterial : this.ballMaterial) ?? b.mesh.material;
  }

  private updateBalls(dt: number) {
    const steps = dt > 0.02 ? 2 : 1;
    const h = dt / steps;
    for (const b of this.balls) {
      if (!b.active) continue;
      b.age += dt;
      for (let s = 0; s < steps && b.active; s++) {
        b.v.y -= G * h;
        b.p.addScaledVector(b.v, h);
        this.ballCollide(b);
      }
      if (!b.active) continue;
      if (b.age > 6) {
        this.killBall(b);
        continue;
      }
      b.obj.position.copy(b.p);
      b.trailT -= dt;
      if (b.trailT <= 0) {
        b.trailT = 0.03;
        if (b.ghost) this.glow.spawn(b.p.x, b.p.y, b.p.z, 0, 0.4, 0, { color: "#4dffae", size: 1.1, grow: 0.3, life: 0.45, alpha: 0.8 });
        else this.smoke.spawn(b.p.x, b.p.y, b.p.z, 0, 0.3, 0, { color: "#e8e4dc", size: 0.45, grow: 1.3, life: 0.55, alpha: 0.3 });
      }
    }
  }

  private ballCollide(b: Ball) {
    const { p } = b;
    if (b.hostile) {
      const pl = this.player;
      if (pl.alive && pl.contains(p.x, p.y, p.z)) {
        this.killBall(b);
        this.damagePlayer(b.damage, p);
        return;
      }
    } else {
      for (const e of this.enemies) {
        if (!e.alive || !e.contains(p.x, p.y, p.z)) continue;
        this.killBall(b);
        this.damageShip(e, b.damage, p);
        return;
      }
      for (const f of this.forts) {
        if (f.down) continue;
        const towerHit = Math.hypot(p.x - f.x, p.z - f.z) < 2.6 && p.y < f.height + 0.5;
        const gunHit = Math.hypot(p.x - f.gx, p.z - f.gz) < 1.8 && p.y < 3;
        if (!towerHit && !gunHit) continue;
        this.killBall(b);
        this.damageFort(f, b.damage, p);
        return;
      }
    }
    for (const s of this.world?.shoals ?? []) {
      // Balls fly over beaches and palms, and stop on the sand (or a reef's rocks).
      if (p.y < (s.r > 6 ? 1.4 : s.top * 0.8) && Math.hypot(p.x - s.x, p.z - s.z) < s.r * 0.85) {
        this.killBall(b);
        this.smoke.burst(p, 10, 3, 4, { color: "#e9c99a", size: 0.9, grow: 2.4, life: 1.1, gravity: 4, drag: 1.5, alpha: 0.7 });
        this.sfx.hit(this.near(p.x, p.z) * 0.6);
        return;
      }
    }
    const water = waveHeight(p.x, p.z);
    if (p.y < water) {
      this.killBall(b);
      this.splash(p.x, water, p.z, b.ghost);
    }
  }

  private killBall(b: Ball) {
    b.active = false;
    b.obj.visible = false;
  }

  private damageShip(e: Ship, amount: number, at: THREE.Vector3) {
    e.hp -= amount;
    e.hitFlash = 1;
    e.lastHit = this.runTime;
    this.splinters(at, 1);
    this.sfx.hit(this.near(at.x, at.z), e.kind === "ghost");
    if (e.hp <= 0) {
      e.hp = 0;
      this.sinkShip(e);
    }
  }

  private sinkShip(s: Ship) {
    s.sinkT = 0;
    s.aimT = -1;
    s.listSide = Math.random() < 0.5 ? 1 : -1;
    s.sail = 0;
    const near = s === this.player ? 1 : this.near(s.x, s.z);
    this.sfx.explode(near);
    this.sfx.sink(near);
    const at = this.v1.set(s.x, s.y + 2.5 * s.scale, s.z);
    this.glow.burst(at, 26, 7, 6, { color: s.kind === "ghost" ? "#5dffb8" : "#ffa040", size: 2.2, grow: 0.5, life: 0.7, gravity: 3, drag: 2, alpha: 1, spread: 3 });
    this.smoke.burst(at, 22, 4, 5, { color: "#4a4440", size: 2.5, grow: 8, life: 3.2, gravity: -1.5, drag: 1.4, alpha: 0.65, spread: 3 });
    this.splinters(at, 2.2);
    if (s === this.player) return;
    this.sunk++;
    this.addGold(s.stats.bounty, s.x, s.y + 9 * s.scale, s.z);
    const boss = s.kind === "ghost";
    for (let i = 0; i < s.stats.loot; i++) {
      const r = Math.random();
      const kind: LootKind = boss ? (r < 0.6 ? "chest" : r < 0.8 ? "bottles" : "barrel") : r < 0.34 ? "barrel" : r < 0.62 ? "crate" : r < 0.8 ? "bottles" : "chest";
      const a = rand(0, TAU);
      this.spawnLoot(kind, s.x + Math.sin(a) * rand(1, 4), s.z + Math.cos(a) * rand(1, 4), Math.sin(a) * rand(2, 4.5), Math.cos(a) * rand(2, 4.5));
    }
    if (boss) this.showBanner("The Drowned Queen is sunk!", "Her treasure floats free — grab it", "good", 4);
  }

  // --- Forts --------------------------------------------------------------------------------------

  private updateForts(dt: number) {
    const p = this.player;
    for (const f of this.forts) {
      if (f.down || this.wave < 2 || !p.alive) {
        f.aimT = -1;
        continue;
      }
      const dx = p.x - f.gx;
      const dz = p.z - f.gz;
      const d = Math.hypot(dx, dz);
      f.reload -= dt;
      if (d > FORT_RANGE) {
        f.aimT = -1;
        continue;
      }
      f.gunYaw = dampAngle(f.gunYaw, Math.atan2(dx, dz), 2.5, dt);
      f.gun.rotation.y = f.gunYaw;
      if (f.aimT >= 0) {
        f.aimT -= dt;
        if (Math.random() < dt * 25) this.glow.spawn(f.gx, 2.2, f.gz, rand(-1, 1), rand(1, 3), rand(-1, 1), { color: "#ffb347", size: 0.8, grow: 0.2, life: 0.35, gravity: 6 });
        if (f.aimT < 0) this.fortFire(f);
      } else if (f.reload <= 0) {
        f.aimT = 1.1;
        this.sfx.fuse(this.near(f.x, f.z));
      }
    }
  }

  private fortFire(f: Fort) {
    const p = this.player;
    f.reload = 4.8 - Math.min(1.6, this.wave * 0.09);
    const count = this.wave >= 7 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(p.x - f.gx, p.z - f.gz);
      const T = 0.7 + d / 55;
      const lead = rand(0.6, 1.05);
      const tx = p.x + p.fx * p.speed * T * lead + gauss() * 2.6;
      const tz = p.z + p.fz * p.speed * T * lead + gauss() * 2.6;
      this.shots.push({ t: i * 0.35, ship: null, fort: f, side: 1, i: 0, n: 1, tx, ty: 0, tz, T, hostile: true, damage: 7 + this.wave * 0.3, ghost: false, quiet: false });
    }
  }

  private damageFort(f: Fort, amount: number, at: THREE.Vector3) {
    f.hp -= amount;
    this.smoke.burst(at, 10, 4, 4, { color: "#c9ccd6", size: 0.8, grow: 2.5, life: 1.2, gravity: 6, drag: 1, alpha: 0.8 });
    this.sfx.hit(this.near(at.x, at.z) * 0.8, true);
    if (f.hp > 0) return;
    f.down = true;
    f.downWave = this.wave;
    f.fallT = 0;
    f.aimT = -1;
    this.fortsDown++;
    this.sfx.explode(this.near(f.x, f.z));
    this.glow.burst(this.v1.set(f.x, f.height * 0.6, f.z), 30, 7, 7, { color: "#ffa040", size: 2.4, grow: 0.5, life: 0.8, gravity: 3, drag: 2, spread: 3 });
    this.smoke.burst(this.v1, 26, 4, 5, { color: "#7b7670", size: 3, grow: 9, life: 3.5, gravity: -1.4, drag: 1.3, alpha: 0.6, spread: 4 });
    this.addGold(50, f.x, f.height + 2, f.z);
    // Supplies spill into the sea on the side facing the cove.
    const shoal = this.world?.shoals.find((s) => Math.hypot(s.x - f.x, s.z - f.z) < s.r);
    if (shoal) {
      const a = Math.atan2(this.player.x - shoal.x, this.player.z - shoal.z);
      for (let i = 0; i < 3; i++) {
        const b = a + rand(-0.5, 0.5);
        const r = shoal.r + 3 + rand(0, 3);
        this.spawnLoot(i === 0 ? "chest" : Math.random() < 0.5 ? "barrel" : "crate", shoal.x + Math.sin(b) * r, shoal.z + Math.cos(b) * r, Math.sin(b), Math.cos(b));
      }
    }
    this.showBanner("Fort destroyed!", "+50 gold bounty", "good", 2.5);
  }

  private rebuildFort(f: Fort) {
    f.down = false;
    f.hp = f.maxHp = 90 + this.wave * 6;
    f.fallT = 0;
    f.reload = rand(2, 4);
    f.aimT = -1;
    f.tower.position.y = 0.85;
    f.tower.rotation.set(0, f.site.yaw + Math.PI, 0);
    f.gun.position.y = 0.9;
    f.gun.rotation.set(0, f.gunYaw, 0);
  }

  private fortVisual(f: Fort, dt: number) {
    if (!f.down) return;
    f.fallT += dt;
    const k = Math.min(1, f.fallT / 2.4);
    const e = k * k;
    f.tower.position.y = 0.85 - e * (f.height - 0.85) * 0.62;
    f.tower.rotation.set(e * 0.22, f.site.yaw + Math.PI, e * 0.3);
    f.gun.rotation.set(e * 0.9, f.gunYaw, e * 0.5);
    f.gun.position.y = 0.9 - e * 0.5;
    if (f.fallT < 12 && Math.random() < dt * (f.fallT < 3 ? 25 : 5)) {
      this.smoke.spawn(f.x + rand(-1.5, 1.5), 2 + f.height * 0.35 * (1 - e), f.z + rand(-1.5, 1.5), rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4), {
        color: "#5a5550",
        size: 2,
        grow: 6,
        life: 3,
        alpha: 0.5,
        gravity: -0.3,
      });
    }
  }

  // --- Loot ---------------------------------------------------------------------------------------

  private spawnLoot(kind: LootKind, x: number, z: number, vx: number, vz: number) {
    const proto = this.protos.get(LOOT_KEYS[kind]);
    if (!proto) return;
    const obj = this.lootPool.get(kind)?.pop() ?? proto.object.clone();
    obj.visible = true;
    obj.scale.setScalar(1);
    this.scene.add(obj);
    this.loot.push({ kind, obj, x, z, vx, vz, age: 0, phase: rand(0, TAU), yaw: rand(0, TAU), spin: rand(-0.6, 0.6), taken: -1, size: proto.size.y });
  }

  private releaseLoot(l: Loot) {
    this.scene.remove(l.obj);
    let list = this.lootPool.get(l.kind);
    if (!list) this.lootPool.set(l.kind, (list = []));
    list.push(l.obj);
  }

  private updateLoot(dt: number) {
    const p = this.player;
    this.loot = this.loot.filter((l) => {
      l.age += dt;
      if (l.taken >= 0) {
        l.taken += dt;
        const k = l.taken / 0.35;
        l.obj.scale.setScalar(Math.max(0.01, (1 - k) * (1 + k)));
        l.obj.position.y += dt * 5;
        if (k < 1) return true;
        this.releaseLoot(l);
        return false;
      }
      const drag = Math.exp(-0.7 * dt);
      l.vx *= drag;
      l.vz *= drag;
      if (p.alive) {
        const dx = p.x - l.x;
        const dz = p.z - l.z;
        const d = Math.hypot(dx, dz);
        if (d < 11) {
          const pull = (1 - d / 11) * 9 + 2;
          l.x += (dx / d) * pull * dt;
          l.z += (dz / d) * pull * dt;
        }
        if (d < p.beam * 0.5 + 2.6 || p.contains(l.x, p.y + 0.5, l.z, 1.4)) {
          this.collect(l);
          return true;
        }
      }
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      this.poseLoot(l, dt);
      // Sparkles so loot is easy to spot on the water.
      if (Math.random() < dt * 5) {
        const gold = l.kind === "crate" || l.kind === "chest";
        this.glow.spawn(l.x + rand(-0.8, 0.8), l.obj.position.y + l.size + rand(0, 0.8), l.z + rand(-0.8, 0.8), 0, rand(0.8, 1.6), 0, {
          color: gold ? "#ffd34d" : "#86efac",
          size: 0.9,
          grow: 0.1,
          life: 0.9,
          alpha: 0.9,
        });
      }
      if (l.age > 50) {
        this.releaseLoot(l);
        return false;
      }
      l.obj.visible = l.age < 42 || Math.floor(l.age * 6) % 2 === 0;
      return true;
    });
  }

  private poseLoot(l: Loot, dt: number) {
    if (l.taken >= 0) return;
    l.yaw += l.spin * dt;
    const t = this.elapsed;
    l.obj.position.set(l.x, waveHeight(l.x, l.z) - l.size * 0.38, l.z);
    l.obj.rotation.set(Math.sin(t * 1.7 + l.phase) * 0.18, l.yaw, Math.cos(t * 1.3 + l.phase) * 0.2);
  }

  private collect(l: Loot) {
    l.taken = 0;
    const p = this.player;
    const at = this.v1.set(l.x, waveHeight(l.x, l.z) + 1, l.z);
    if (l.kind === "barrel" || l.kind === "bottles") {
      const amount = l.kind === "barrel" ? 10 : 18;
      const healed = Math.min(amount, p.maxHp - p.hp);
      p.hp = Math.min(p.maxHp, p.hp + amount);
      this.text(healed > 0 ? `+${Math.round(healed)} hull` : "Hull full", "#86efac", at.x, at.y + 2, at.z);
      this.sfx.repair();
      this.glow.burst(at, 14, 3, 4, { color: "#7dffa0", size: 0.9, grow: 0.2, life: 0.7, gravity: -1, drag: 2 });
    } else {
      const amount = l.kind === "chest" ? 30 : 12;
      this.addGold(amount, at.x, at.y + 2, at.z);
      this.sfx.coin(l.kind === "chest");
      this.glow.burst(at, l.kind === "chest" ? 24 : 12, 3.5, 5, { color: "#ffd34d", size: 0.9, grow: 0.2, life: 0.8, gravity: 3, drag: 1.5 });
    }
    this.emitHud(true);
  }

  private addGold(amount: number, x: number, y: number, z: number) {
    const value = Math.round(amount * this.goldMul());
    this.gold += value;
    this.totalGold += value;
    this.text(`+${value} gold`, "#fcd34d", x, y, z, value >= 50);
  }

  // --- Collisions ---------------------------------------------------------------------------------

  private collide() {
    const ships = [this.player, ...this.enemies].filter((s) => s.alive);
    const shoals = this.world?.shoals ?? [];
    for (const s of ships) {
      const c = s.circles(this.circleBuf);
      const r = s.radius * 0.9;
      for (let k = 0; k < 3; k++) {
        for (const sh of shoals) {
          const dx = c[k * 2] - sh.x;
          const dz = c[k * 2 + 1] - sh.z;
          const d = Math.hypot(dx, dz) || 1;
          const min = sh.r + r;
          if (d >= min) continue;
          const push = min - d;
          const nx = dx / d;
          const nz = dz / d;
          s.x += nx * push;
          s.z += nz * push;
          c[k * 2] += nx * push;
          c[k * 2 + 1] += nz * push;
          const into = -(s.fx * nx + s.fz * nz);
          if (s.bumpCd <= 0 && s.speed > 1.5 && into > 0.15) {
            s.bumpCd = 0.9;
            const hitSpeed = s.speed * into;
            s.speed *= 0.35;
            const at = this.v1.set(c[k * 2] - nx * r, 0.6, c[k * 2 + 1] - nz * r);
            this.smoke.burst(at, 12, 3, 3, { color: "#e9d3a8", size: 1, grow: 3, life: 1.2, gravity: 3, drag: 1.5, alpha: 0.7 });
            if (s === this.player) {
              this.sfx.bump();
              this.damagePlayer(2 + hitSpeed * 0.6, null);
              this.shake = Math.max(this.shake, 0.5);
            }
          }
        }
      }
      const rr = Math.hypot(s.x, s.z);
      if (rr > ARENA + 10) {
        s.x *= (ARENA + 10) / rr;
        s.z *= (ARENA + 10) / rr;
        s.speed *= 0.97;
      }
    }
    // Ship against ship: push apart, ramming hurts both.
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i];
        const b = ships[j];
        if (Math.abs(a.x - b.x) > 20 || Math.abs(a.z - b.z) > 20) continue;
        const ca = a.circles(this.circleBuf);
        const cb = b.circles(this.circleBuf2);
        const min = a.radius + b.radius;
        let hit = false;
        for (let k = 0; k < 3 && !hit; k++) {
          for (let l = 0; l < 3 && !hit; l++) {
            const dx = ca[k * 2] - cb[l * 2];
            const dz = ca[k * 2 + 1] - cb[l * 2 + 1];
            const d = Math.hypot(dx, dz) || 1;
            if (d >= min) continue;
            hit = true;
            const push = (min - d) * 0.5;
            a.x += (dx / d) * push;
            a.z += (dz / d) * push;
            b.x -= (dx / d) * push;
            b.z -= (dz / d) * push;
            const rel = Math.hypot(a.fx * a.speed - b.fx * b.speed, a.fz * a.speed - b.fz * b.speed);
            if (rel > 3 && a.bumpCd <= 0 && b.bumpCd <= 0) {
              a.bumpCd = b.bumpCd = 1;
              const dmg = 2 + rel * 0.7;
              a.speed *= 0.5;
              b.speed *= 0.5;
              const at = this.v1.set((ca[k * 2] + cb[l * 2]) / 2, 1.5, (ca[k * 2 + 1] + cb[l * 2 + 1]) / 2);
              this.splinters(at, 1.2);
              for (const s of [a, b]) {
                if (s === this.player) {
                  this.sfx.bump();
                  this.damagePlayer(dmg, null);
                } else this.damageShip(s, dmg * 1.5, at);
              }
            }
          }
        }
      }
    }
  }

  // --- Effects ------------------------------------------------------------------------------------

  private near(x: number, z: number) {
    return clamp(1 - Math.hypot(x - this.player.x, z - this.player.z) / 170, 0, 1);
  }

  private muzzleFx(m: THREE.Vector3, dx: number, dz: number, ghost: boolean) {
    this.glow.burst(m, 4, 2, 0.5, { color: ghost ? "#5dffb8" : "#ffb04a", size: 2.4, grow: 0.8, life: 0.14, alpha: 1, spread: 0.4 }, this.v3.set(dx * 4, 0.2, dz * 4), 0.3);
    for (let i = 0; i < 8; i++) {
      const s = rand(2.5, 10);
      this.smoke.spawn(m.x + dx * 0.6, m.y, m.z + dz * 0.6, dx * s + rand(-0.8, 0.8), rand(0.2, 1.4), dz * s + rand(-0.8, 0.8), {
        color: ghost ? "#a9d8c4" : "#ece8e0",
        size: 1.4,
        grow: rand(5.5, 8),
        life: rand(1.8, 2.9),
        alpha: 0.62,
        drag: 2.2,
        gravity: -0.5,
      });
    }
  }

  private splash(x: number, y: number, z: number, ghost: boolean) {
    const at = this.v2.set(x, y, z);
    this.smoke.burst(at, 16, 2.2, 10, { color: ghost ? "#c4ffe6" : "#f0f8ff", size: 0.65, grow: 1.1, life: 0.95, gravity: 22, alpha: 0.95, spread: 0.6 });
    this.smoke.burst(at, 5, 1.2, 1.5, { color: "#e8f4fb", size: 1.6, grow: 3.8, life: 1.3, alpha: 0.45, drag: 1.5, spread: 0.8 });
    this.rings.spawn(x, z, { r0: 0.6, r1: 4.8, life: 1.3, alpha: 0.75 });
    this.sfx.splash(this.near(x, z));
  }

  private splinters(at: THREE.Vector3, power: number) {
    this.smoke.burst(at, Math.round(14 * power), 6 * power, 7, { color: "#8a5634", size: 0.42, grow: 0.3, life: 1, gravity: 20, alpha: 1, spread: 0.6 });
    this.smoke.burst(at, Math.round(6 * power), 4 * power, 6, { color: "#d9a066", size: 0.32, grow: 0.25, life: 0.9, gravity: 20, alpha: 1, spread: 0.6 });
    this.glow.burst(at, 3, 1, 1, { color: "#ffb04a", size: 2.2, grow: 0.8, life: 0.15, alpha: 0.9, spread: 0.4 });
    this.smoke.burst(at, 4, 1.5, 2, { color: "#5a524c", size: 1.2, grow: 4, life: 1.6, alpha: 0.5, drag: 1.5, gravity: -1 });
  }

  /** Per-ship ambient effects: bow spray, damage smoke, sinking bubbles, wake. */
  private shipFx(s: Ship, dt: number) {
    const sternX = s.x - s.fx * s.length * 0.46;
    const sternZ = s.z - s.fz * s.length * 0.46;
    const strength = s.sinkT >= 0 ? Math.max(0, 1 - s.sinkT / 2) : clamp((s.speed - 0.8) / 7, 0, 1);
    s.wake.update(dt, sternX, sternZ, strength, s.beam * 0.7);
    if (this.phase === "menu" && s !== this.player) return;
    if (s.alive && s.speed > 3.5) {
      s.sprayT -= dt * s.speed;
      while (s.sprayT <= 0) {
        s.sprayT += 3.2;
        const side = Math.random() < 0.5 ? 1 : -1;
        const bx = s.x + s.fx * s.length * 0.44 + s.sideX(side) * 0.6;
        const bz = s.z + s.fz * s.length * 0.44 + s.sideZ(side) * 0.6;
        const out = rand(1.5, 3.5);
        this.smoke.spawn(bx, waveHeight(bx, bz) + 0.2, bz, s.sideX(side) * out + s.fx * s.speed * 0.3, rand(1.5, 3), s.sideZ(side) * out + s.fz * s.speed * 0.3, {
          color: "#f4fbff",
          size: 0.6,
          grow: 1.6,
          life: 0.7,
          gravity: 9,
          alpha: 0.75,
        });
      }
    }
    const hurt = s.alive && s.hp < s.maxHp * 0.4;
    if (hurt || (s.sinkT >= 0 && s.sinkT < 4)) {
      s.smokeT -= dt;
      if (s.smokeT <= 0) {
        s.smokeT = hurt ? 0.11 : 0.05;
        const along = rand(-0.3, 0.3) * s.length;
        const x = s.x + s.fx * along;
        const z = s.z + s.fz * along;
        this.smoke.spawn(x, s.y + 2.5 * s.scale, z, rand(-0.3, 0.3) + this.wind.x * 1.5, rand(1.8, 3), rand(-0.3, 0.3) + this.wind.z * 1.5, {
          color: s.kind === "ghost" ? "#3f6d5c" : "#3b3633",
          size: 1.4,
          grow: 6,
          life: 2.6,
          alpha: 0.55,
          drag: 0.4,
        });
        if (Math.random() < 0.35) this.glow.spawn(x, s.y + 2.2 * s.scale, z, rand(-0.5, 0.5), rand(1, 2.5), rand(-0.5, 0.5), { color: "#ff8a3a", size: 1.1, grow: 0.3, life: 0.5, gravity: -1 });
      }
    }
    if (s.sinkT >= 0 && s.sinkT < 7) {
      for (let i = 0; i < 2; i++) {
        const along = rand(-0.45, 0.45) * s.length;
        const x = s.x + s.fx * along + rand(-1.5, 1.5);
        const z = s.z + s.fz * along + rand(-1.5, 1.5);
        this.smoke.spawn(x, waveHeight(x, z) + 0.1, z, rand(-0.3, 0.3), rand(0.8, 2.5), rand(-0.3, 0.3), { color: "#eaf6ff", size: 0.4, grow: 0.9, life: 0.7, alpha: 0.85, gravity: -1 });
      }
    }
  }

  private text(text: string, color: string, x: number, y: number, z: number, big = false) {
    this.texts.push({ text, color, x, y, z, age: 0, life: big ? 2 : 1.5, big });
    if (this.texts.length > 14) this.texts.shift();
  }

  private updateTexts(dt: number) {
    this.texts = this.texts.filter((t) => {
      t.age += dt;
      t.y += dt * 2.2;
      return t.age < t.life;
    });
  }

  private showBanner(title: string, sub: string, tone: Banner["tone"], seconds: number) {
    this.banner = { id: ++this.bannerId, title, sub, tone };
    this.bannerT = seconds;
    this.emitHud(true);
  }

  // --- Atmosphere & camera ------------------------------------------------------------------------

  private applyAtmosphere(force: boolean, dt = 0) {
    const boss = this.enemies.some((e) => e.kind === "ghost" && e.sinkT < 2.5);
    this.haunt = force ? (boss ? 1 : 0) : damp(this.haunt, boss ? 1 : 0, 0.7, dt);
    const h = this.haunt;
    sea.amp = lerp(this.phase === "menu" ? 0.85 : 1, 1.4, h);
    if (!force && Math.abs(h - this.hauntShown) < 0.002) return;
    this.hauntShown = h;
    this.ocean.setPalette(SUNNY, HAUNTED, h);
    const u = this.ocean.material.uniforms;
    const sunColor = TMP_COLOR.set("#fff2d6").lerp(TMP_COLOR2.set("#7fbfa8"), h * 0.85);
    this.ocean.setSun(SUN_DIR, sunColor);
    this.sky.set(u.uSkyTop.value, u.uSkyHorizon.value, SUN_DIR, sunColor);
    this.fog.color.copy(u.uSkyHorizon.value);
    this.fog.near = lerp(100, 40, h);
    this.fog.far = lerp(300, 190, h);
    this.sun.intensity = lerp(2.5, 0.8, h);
    this.sun.color.set("#fff1dc").lerp(TMP_COLOR.set("#9fffd6"), h);
    this.hemi.intensity = lerp(1.1, 0.75, h);
    this.renderer.toneMappingExposure = lerp(1.05, 0.95, h);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    if (!p) return;
    const look = this.v1;
    const pos = this.v2;
    const portrait = this.portrait;
    if (this.phase === "menu") {
      const a = this.elapsed * 0.06 + 2.4;
      const R = portrait ? 46 : 36;
      look.set(p.x + p.fx * 3, 3.2, p.z + p.fz * 3);
      pos.set(p.x + Math.sin(a) * R, portrait ? 15 : 9.5, p.z + Math.cos(a) * R);
      this.camYaw = Math.atan2(look.x - pos.x, look.z - pos.z);
    } else if (this.phase === "sinking" || this.phase === "over") {
      this.camYaw += dt * 0.12;
      const R = 30 + this.deathT * 1.5;
      look.set(p.x, 1, p.z);
      pos.set(p.x - Math.sin(this.camYaw) * R, 14 + this.deathT * 1.2, p.z - Math.cos(this.camYaw) * R);
    } else {
      // Combat framing: pull back and turn part-way towards the nearest enemy, so a ship you are
      // about to broadside (abeam, off to the side) stays in view.
      let nearest: { x: number; z: number } | null = null;
      let nd = Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < nd) {
          nd = d;
          nearest = e;
        }
      }
      if (this.wave >= 2) {
        // A fort in range counts too (with a little less priority than ships).
        for (const f of this.forts) {
          if (f.down) continue;
          const d = Math.hypot(f.x - p.x, f.z - p.z) + 12;
          if (d < nd && d < FORT_RANGE + 12) {
            nd = d;
            nearest = f;
          }
        }
      }
      const engage = nearest && this.phase === "playing" ? clamp(1 - (nd - 45) / 45, 0, 1) : 0;
      this.frameK = damp(this.frameK, engage, 1.1, dt);
      const rel = nearest ? wrap(Math.atan2(nearest.x - p.x, nearest.z - p.z) - p.heading) : 0;
      const bias = clamp(rel, -1.7, 1.7) * (portrait ? 0.62 : 0.5) * engage;
      this.frameBias = damp(this.frameBias, bias, 1.3, dt);
      const yaw = p.heading + this.frameBias;
      this.camYaw = this.camSnap ? yaw : dampAngle(this.camYaw, yaw, 1.8, dt);
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const z = this.zoom * (1 + 0.28 * this.frameK);
      const dist = (portrait ? 44 : 30) * z + p.speed * 0.3;
      const height = (portrait ? 34 : 18) * z;
      const ahead = (4 + p.speed * 0.4) * (1 - this.frameK * 0.5);
      // Centre the action: lean the view a little towards the target.
      const lean = nearest ? 0.2 * this.frameK : 0;
      const lx = nearest ? (nearest.x - p.x) * lean : 0;
      const lz = nearest ? (nearest.z - p.z) * lean : 0;
      look.set(p.x + p.fx * ahead + lx, 2, p.z + p.fz * ahead + lz);
      pos.set(p.x - fx * dist + lx, height, p.z - fz * dist + lz);
    }
    if (this.camSnap) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camSnap = false;
    } else {
      this.camPos.x = damp(this.camPos.x, pos.x, 5, dt);
      this.camPos.y = damp(this.camPos.y, pos.y, 5, dt);
      this.camPos.z = damp(this.camPos.z, pos.z, 5, dt);
      this.camLook.x = damp(this.camLook.x, look.x, 7, dt);
      this.camLook.y = damp(this.camLook.y, look.y, 7, dt);
      this.camLook.z = damp(this.camLook.z, look.z, 7, dt);
    }
    const s = this.shake * this.shake;
    const cam = this.camera;
    cam.position.set(this.camPos.x + rand(-1, 1) * s * 0.8, this.camPos.y + rand(-1, 1) * s * 0.6, this.camPos.z + rand(-1, 1) * s * 0.8);
    cam.position.y = Math.max(cam.position.y, waveHeight(cam.position.x, cam.position.z) + 1.5);
    cam.lookAt(this.camLook);

    // Shadows follow the action, snapped to texels so they don't shimmer.
    const texel = (SHADOW_EXTENT * 2) / this.sun.shadow.mapSize.x;
    const cx = Math.round((this.camLook.x - this.camYawX() * 10) / texel) * texel;
    const cz = Math.round((this.camLook.z - this.camYawZ() * 10) / texel) * texel;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + SUN_DIR.x * 120, SUN_DIR.y * 120, cz + SUN_DIR.z * 120);
  }

  private camYawX() {
    return Math.sin(this.camYaw);
  }

  private camYawZ() {
    return Math.cos(this.camYaw);
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.portrait = w / h < 0.85;
    this.camera.fov = this.portrait ? 62 : 50;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = this.renderer.getPixelRatio();
    this.smoke.setScale(h * dpr, this.camera.fov);
    this.glow.setScale(h * dpr, this.camera.fov);
    this.view = { w, h, dpr: Math.min(2, window.devicePixelRatio || 1) };
    const ctx = this.overlay;
    if (ctx) {
      ctx.canvas.width = Math.round(w * this.view.dpr);
      ctx.canvas.height = Math.round(h * this.view.dpr);
    }
  }

  // --- HUD, overlay & minimap ---------------------------------------------------------------------

  private emitHud(force = false) {
    if (!this.player) return;
    this.hudT = 1 / 15;
    const p = this.player;
    const boss = this.enemies.find((e) => e.kind === "ghost" && e.alive);
    const windRel = wrap(this.wind.angle - this.camYaw);
    const reloadTime = this.reloadTime();
    const next: Hud = {
      hull: Math.ceil(p.hp),
      maxHull: p.maxHp,
      gold: this.gold,
      wave: this.wave,
      enemies: this.enemies.filter((e) => e.alive).length + this.spawnQueue.length,
      sunk: this.sunk,
      sail: p.sail,
      speed: Math.round(p.speed * 1.6),
      wind: Math.round((-windRel * 180) / Math.PI),
      windStrength: this.wind.strength,
      trim: pointOfSail(p.alpha),
      trimEff: polar(p.alpha),
      reloadL: 1 - p.reload[1] / reloadTime,
      reloadR: 1 - p.reload[-1] / reloadTime,
      guns: this.guns(),
      ship: SHIP_NAMES[this.up.ship],
      boss: boss ? { name: boss.stats.name, hp: Math.ceil(boss.hp), max: boss.maxHp } : null,
      banner: this.banner,
      warn: this.warn,
      combat: this.combat,
    };
    if (!force && JSON.stringify(next) === JSON.stringify(this.hud)) return;
    this.hud = next;
    this.events.hud(next);
  }

  private project(x: number, y: number, z: number) {
    const v = this.v2.set(x, y, z).project(this.camera);
    const { w, h } = this.view;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, front: v.z < 1 };
  }

  private drawOverlay() {
    const ctx = this.overlay;
    if (!ctx) return;
    const { w, h, dpr } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ph = this.phase;
    if (ph !== "playing" && ph !== "paused" && ph !== "upgrade" && ph !== "sinking") return;
    const p = this.player;
    const t = this.elapsed;
    const margin = 34;
    // Ships: health bars, fire warnings, and arrows towards those off screen.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      const s = this.project(e.x, e.y + 10.6 * e.scale, e.z);
      const on = s.front && s.x > -20 && s.x < w + 20 && s.y > -20 && s.y < h + 20;
      const ghost = e.kind === "ghost";
      if (on) {
        if (!ghost && d < 160) this.bar(ctx, s.x, s.y, 56, e.hp / e.maxHp);
        if (e.aimT >= 0) this.alert(ctx, s.x, s.y - 20, t);
      } else if (ph === "playing") {
        this.edgeArrow(ctx, e.x, e.z, ghost ? "#5dffb8" : e.aimT >= 0 ? "#fbbf24" : "#f87171", margin, d);
      }
    }
    for (const f of this.forts) {
      if (f.down || this.wave < 2) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > 120) continue;
      const s = this.project(f.x, f.height + 1.5, f.z);
      if (!s.front || s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue;
      if (f.hp < f.maxHp || d < FORT_RANGE) this.bar(ctx, s.x, s.y, 44, f.hp / f.maxHp, d < FORT_RANGE ? "#f97316" : "#94a3b8");
      if (f.aimT >= 0) this.alert(ctx, s.x, s.y - 20, t);
    }
    // Floating gold / repair texts.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const ft of this.texts) {
      const s = this.project(ft.x, ft.y, ft.z);
      if (!s.front) continue;
      const a = Math.min(1, (ft.life - ft.age) / 0.5) * Math.min(1, ft.age * 8);
      ctx.globalAlpha = a;
      ctx.font = `${ft.big ? 30 : 23}px ${this.font}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(ft.text, s.x, s.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, frac: number, color?: string) {
    const f = clamp(frac, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    this.roundRect(ctx, x - width / 2 - 2, y - 5, width + 4, 10, 5);
    ctx.fill();
    ctx.fillStyle = color ?? (f > 0.6 ? "#4ade80" : f > 0.3 ? "#facc15" : "#f87171");
    this.roundRect(ctx, x - width / 2, y - 3, width * f, 6, 3);
    ctx.fill();
  }

  private alert(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const s = 1 + Math.sin(t * 18) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `900 17px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 1);
    ctx.restore();
  }

  private edgeArrow(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, margin: number, dist: number) {
    const p = this.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const fwd = dx * fx + dz * fz;
    const right = dx * -fz + dz * fx;
    const ang = Math.atan2(right, -fwd);
    const { w, h } = this.view;
    const cx = w / 2;
    const cy = h * 0.55;
    const ux = Math.sin(ang);
    const uy = Math.cos(ang);
    const kx = ux !== 0 ? (w / 2 - margin) / Math.abs(ux) : Infinity;
    const ky = uy !== 0 ? (uy > 0 ? h - cy - margin - 70 : cy - margin - 50) / Math.abs(uy) : Infinity;
    const k = Math.min(kx, ky);
    const ax = cx + ux * k;
    const ay = cy + uy * k;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.globalAlpha = clamp(1.4 - dist / 220, 0.45, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-5, -7);
    ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2));
  }

  private drawMinimap() {
    const canvas = this.minimap;
    if (!canvas || !this.player || !this.world) return;
    const size = Math.round(canvas.clientWidth * this.view.dpr);
    if (!size) return;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = this.player;
    const R = size / 2;
    const scale = R / 150;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const map = (x: number, z: number) => {
      const dx = x - p.x;
      const dz = z - p.z;
      return [R + (dx * -fz + dz * fx) * scale, R - (dx * fx + dz * fz) * scale] as const;
    };
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.clip();
    ctx.fillStyle = this.haunt > 0.5 ? "rgba(6,40,36,0.78)" : "rgba(8,47,73,0.72)";
    ctx.fillRect(0, 0, size, size);
    // Edge of the cove.
    const [ox, oy] = map(0, 0);
    ctx.beginPath();
    ctx.arc(ox, oy, ARENA * scale, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5 * this.view.dpr;
    ctx.setLineDash([4 * this.view.dpr, 4 * this.view.dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const s of this.world.shoals) {
      const [x, y] = map(s.x, s.z);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, s.r * scale), 0, TAU);
      ctx.fillStyle = s.dock ? "#8a5634" : s.r > 6 ? "#e9cf9b" : "#94a3b8";
      ctx.fill();
    }
    const dot = (x: number, y: number, r: number, color: string) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
    };
    const d = this.view.dpr;
    for (const f of this.forts) {
      if (f.down) continue;
      const [x, y] = map(f.x, f.z);
      ctx.fillStyle = this.wave >= 2 ? "#f97316" : "#cbd5e1";
      ctx.fillRect(x - 3 * d, y - 3 * d, 6 * d, 6 * d);
    }
    for (const l of this.loot) {
      if (l.taken >= 0) continue;
      const [x, y] = map(l.x, l.z);
      dot(x, y, 2.2 * d, "#fcd34d");
    }
    const ship = (s: Ship, color: string, size: number) => {
      const [x, y] = map(s.x, s.z);
      const rel = s.heading - this.camYaw;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-rel);
      ctx.beginPath();
      ctx.moveTo(0, -size * d);
      ctx.lineTo(size * 0.6 * d, size * 0.7 * d);
      ctx.lineTo(-size * 0.6 * d, size * 0.7 * d);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };
    for (const e of this.enemies) if (e.alive) ship(e, e.kind === "ghost" ? "#5dffb8" : "#f87171", e.kind === "ghost" ? 7 : 5);
    // Range ring.
    ctx.beginPath();
    ctx.arc(R, R, this.range() * scale, 0, TAU);
    ctx.strokeStyle = "rgba(56,189,248,0.35)";
    ctx.lineWidth = 1 * d;
    ctx.stroke();
    ship(p, "#ffffff", 6);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2 * d;
    ctx.stroke();
  }
}

const TMP_COLOR = new THREE.Color();
const TMP_COLOR2 = new THREE.Color();
