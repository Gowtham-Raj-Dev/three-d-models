import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, Pool, type Fit, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { CITY_RUSH } from "../shared/songs";
import { Sfx } from "./audio";
import { CARS, CHARACTERS, DOWNTOWN, M, MODELS, SKYSCRAPERS, SUBURB } from "./manifest";

// --- Tuning (metres, seconds) -------------------------------------------------------------------

const LANE_W = 2.6;
const ROAD_W = 9.4;
const ROAD_TILE = 18;
const WALK_W = 4.4;
const WALK_H = 0.3;
const BUILD_X = ROAD_W / 2 + WALK_W + 0.8;
/** The track is built this far ahead of the player (hidden by fog) and kept this far behind. */
const AHEAD = 165;
const BEHIND = 25;
/** City built behind the start line, seen by the menu camera. */
const PREBUILD = 150;
const FIRST_ROW = 70;
const BASE_SPEED = 15;
const MAX_SPEED = 34;
const GRAVITY = 36;
const JUMP_V = 12.4; // ≈ 2.1 m high, ≈ 0.69 s in the air
const SLAM_V = -26;
const DUCK_TIME = 0.8;
const STAND_H = 1.6;
const DUCK_H = 0.8;
const POWER_TIME = 10;
const COIN_POINTS = 10;
const ZONE_LEN = 480;

const SKY_TOP = new THREE.Color("#5fa8e8");
const FOG = new THREE.Color("#cde3f4");

const laneX = (lane: number) => (lane - 1) * LANE_W;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const ease = (t: number) => t * t * (3 - 2 * t);
const speedAt = (s: number) => BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-Math.max(0, s) / 2600));
const zoneAt = (s: number) => (Math.floor((s + PREBUILD + 60) / ZONE_LEN) % 2 === 0 ? "downtown" : "suburb");

// --- Public types -------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "crashed" | "over" | "error";

export interface Hud {
  score: number;
  coins: number;
  distance: number;
  shield: boolean;
  /** Seconds left on the magnet / x2 booster. */
  magnet: number;
  boost: number;
}

export interface RunResult {
  score: number;
  coins: number;
  distance: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  hud(hud: Hud): void;
  phase(phase: Phase): void;
  over(result: RunResult): void;
  error(message: string): void;
}

export type Move = "left" | "right" | "jump" | "duck";

// --- Internal types -----------------------------------------------------------------------------

interface Part {
  key: string;
  obj: THREE.Object3D;
}

interface Scenery {
  end: number;
  parts: Part[];
}

type Action = "jump" | "duck" | "block";
type ObKind = "barrier" | "fence" | "cones" | "gate" | "car";

interface Obstacle {
  holder: THREE.Group;
  parts: Part[];
  action: Action;
  lane: number;
  x: number;
  /** Track distance of the obstacle's centre. */
  s: number;
  halfLen: number;
  halfW: number;
  yMin: number;
  yMax: number;
  /** Own speed towards the player (oncoming traffic). */
  speed: number;
  fly: { t: number; vy: number; vx: number; spin: THREE.Vector3 } | null;
}

type PickupKind = "coin" | "shield" | "magnet" | "boost";

interface Pickup {
  part: Part;
  kind: PickupKind;
  s: number;
  x: number;
  y: number;
  attract: boolean;
  taken: number; // seconds since collected, -1 while on the track
}

interface Row {
  s: number;
  end: number;
  passable: boolean[];
}

interface Rider {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
}

// --- Game ---------------------------------------------------------------------------------------

export class SkateRushGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
  private readonly sun = new THREE.DirectionalLight("#fff3e0", 2.6);
  private readonly track = new THREE.Group();
  private readonly protos = new Map<string, Proto>();
  private readonly pool: Pool;
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;

  // Player rig: player (lane x, jump y) → body (facing, lean, spin) → board pivot (kickflip) + riders.
  private readonly player = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly boardPivot = new THREE.Group();
  private readonly riders: Rider[] = [];
  private readonly orbs = { shield: new THREE.Group(), magnet: new THREE.Group(), boost: new THREE.Group() };
  private riderIndex = 0;
  private boardHeight = 0.16;

  private phase: Phase = "loading";
  private distance = 0;
  private speed = 0;
  private runTime = 0;
  private lane = 1;
  private x = 0;
  private y = 0;
  private vy = 0;
  private grounded = true;
  private airTime = 0;
  private duckT = 0;
  private duckQueued = false;
  private trick: "flip" | "spin" = "flip";
  private wobble = 0;
  private points = 0;
  private coins = 0;
  private shield = false;
  private magnet = 0;
  private boost = 0;
  private invulnerable = 0;
  private crashT = 0;
  private boardFly = { vy: 0, vz: 0 };
  private shake = 0;
  private camBlend = 0;
  /** Seconds until the menu rider goes back to idle after a character-select emote. */
  private queueIdle = 0;
  /** Seconds since load, frozen while paused (drives spins, bobbing and the menu camera). */
  private elapsed = 0;
  private portrait = false;

  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private scenery: Scenery[] = [];
  private rows: Row[] = [];
  private cursor = { road: 0, left: 0, right: 0, props: 0, row: 0, power: 0 };
  private lastRowEnd = 0;

  // Model lists filtered to what actually loaded.
  private cars: string[] = [];
  private downtown: string[] = [];
  private skyscrapers: string[] = [];
  private suburb: string[] = [];

  private hud: Hud = { score: 0, coins: 0, distance: 0, shield: false, magnet: 0, boost: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.75 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.setupWorld(coarse);
    this.pool = new Pool(this.protos, this.track);
    this.scene.add(this.track, this.player);
    this.player.add(this.body);
    this.body.add(this.boardPivot);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.fog = new THREE.Fog(FOG, 55, AHEAD - 5);
    scene.background = FOG.clone();

    // Gradient sky dome whose horizon matches the fog, so distant buildings melt into the sky.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: SKY_TOP }, horizon: { value: FOG } },
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }",
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.camera.add(sky);
    scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.45;

    scene.add(new THREE.HemisphereLight("#dff0ff", "#7d8a66", 1.25));
    const { sun } = this;
    sun.position.set(14, 30, 8);
    sun.target.position.set(0, 0, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 1, far: 90 });
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: "#8fbf72", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const proto = (key: string, fit: Fit, opts?: { shadows?: boolean; receive?: boolean }, protoKey = key) => {
        const m = models.get(key);
        if (!m) return;
        this.protos.set(protoKey, makeProto(protoKey === key ? m.scene : m.scene.clone(), m.animations, fit, opts));
      };

      for (const c of CHARACTERS) proto(c.key, { height: 1.55 });
      proto(M.board, { length: 1.25 });
      // Kept thin: the asphalt sits a little below the kerbs, and a tall tile would sink it under the ground plane.
      proto(M.road, { box: { x: ROAD_W, y: 0.04, z: ROAD_TILE } }, { shadows: false, receive: true });
      proto(M.sidewalk, { box: { x: WALK_W, y: 0.6, z: ROAD_TILE } }, { shadows: false, receive: true });
      proto(M.barrier, { box: { x: 2.3, y: 0.9, z: 0.55 } });
      proto(M.barrier, { box: { x: 2.5, y: 0.5, z: 0.32 } }, undefined, "gate-bar");
      proto(M.fence, { box: { z: 2.3, y: 1.0, x: 0.35 } });
      proto(M.cone, { height: 0.85 });
      proto(M.gate, { box: { x: 2.6, y: 3.2, z: 0.4 } });
      proto(M.coin, { height: 0.75 }, { shadows: false });
      proto(M.heart, { height: 0.95 });
      proto(M.star, { height: 1.0 });
      proto(M.jewel, { height: 1.0 });
      proto(M.heart, { height: 0.4 }, { shadows: false }, "orb-heart");
      proto(M.star, { height: 0.42 }, { shadows: false }, "orb-star");
      proto(M.jewel, { height: 0.45 }, { shadows: false }, "orb-jewel");
      proto(M.streetLight, { height: 5.4 });
      proto(M.trafficLight, { height: 4.4 });
      proto(M.hydrant, { height: 0.75 });
      proto(M.bench, { width: 1.9 });
      proto(M.planter, { width: 1.7 });
      proto(M.treeLarge, { height: 6.4 });
      proto(M.treeSmall, { height: 4.6 });
      for (const key of CARS) proto(key, { scale: 1.5 });
      for (const key of DOWNTOWN) proto(key, { scale: 7.5 }, { receive: true });
      for (const key of SKYSCRAPERS) proto(key, { scale: 8.5 }, { receive: true });
      for (const key of SUBURB) proto(key, { scale: 6.5 }, { receive: true });

      const has = (k: string) => this.protos.has(k);
      this.cars = CARS.filter(has);
      this.downtown = DOWNTOWN.filter(has);
      this.skyscrapers = SKYSCRAPERS.filter(has);
      this.suburb = SUBURB.filter(has);
      const required = [M.board, M.road, M.sidewalk, M.barrier, M.coin, ...CHARACTERS.map((c) => c.key)];
      if (!required.every(has) || !this.cars.length || !this.downtown.length || !this.suburb.length) {
        throw new Error("Some game models could not be loaded. Check your connection and reload.");
      }

      this.buildPlayer();
      this.resetWorld();
      this.resetRun();
      music.play(CITY_RUSH, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildPlayer() {
    const board = this.protos.get(M.board)!;
    this.boardHeight = board.size.y;
    const boardObj = board.object.clone();
    boardObj.position.y = -board.size.y / 2;
    this.boardPivot.position.y = board.size.y / 2;
    this.boardPivot.add(boardObj);

    for (const c of CHARACTERS) {
      const p = this.protos.get(c.key)!;
      const root = p.object; // one rider per character, no cloning needed
      root.position.y = this.boardHeight * 0.55;
      root.visible = false;
      root.traverse((o) => {
        // Skinned bounds don't follow the animation.
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
      });
      const mixer = new THREE.AnimationMixer(root);
      const actions = new Map(p.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
      this.body.add(root);
      this.riders.push({ root, mixer, actions, current: null });
    }
    this.selectCharacter(this.riderIndex);

    const orb = (group: THREE.Group, key: string) => {
      if (this.protos.has(key)) group.add(this.protos.get(key)!.object.clone());
      group.visible = false;
      this.player.add(group);
    };
    orb(this.orbs.shield, "orb-heart");
    orb(this.orbs.magnet, "orb-star");
    orb(this.orbs.boost, "orb-jewel");
  }

  // --- Public API -------------------------------------------------------------------------------

  selectCharacter(index: number) {
    this.riderIndex = ((index % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length;
    this.riders.forEach((r, i) => (r.root.visible = i === this.riderIndex));
    if (this.phase === "menu" || this.phase === "loading") {
      this.play("emote-yes", { once: true, fade: 0.15 });
      this.queueIdle = 1.1;
    }
  }

  /** Starts a run (from the menu or after a game over). */
  start() {
    audio.unlock();
    if (this.phase === "over" || this.phase === "crashed" || this.phase === "paused") {
      this.resetWorld();
      this.camBlend = 1;
    }
    this.resetRun();
    this.play("skate", { fade: 0.3 });
    this.sfx.go();
    music.play(CITY_RUSH, 1);
    music.duck(false);
    this.setPhase("playing");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.sfx.rolling(0);
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.resetWorld();
    this.resetRun();
    this.camBlend = 0;
    this.sfx.rolling(0);
    music.play(CITY_RUSH, 0);
    music.duck(false);
    this.play("idle", { fade: 0.2 });
    this.setPhase("menu");
  }

  input(move: Move) {
    if (this.phase !== "playing") return;
    if (move === "left" || move === "right") this.changeLane(move === "left" ? -1 : 1);
    else if (move === "jump") this.jump();
    else this.duck();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.envTexture?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
  }

  // --- State ------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private resetRun() {
    this.distance = 0;
    this.speed = 0;
    this.runTime = 0;
    this.lane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.duckT = 0;
    this.duckQueued = false;
    this.points = 0;
    this.coins = 0;
    this.shield = false;
    this.magnet = 0;
    this.boost = 0;
    this.invulnerable = 0;
    this.crashT = 0;
    this.wobble = 0;
    this.track.position.z = 0;
    this.body.rotation.set(0, Math.PI, 0);
    this.boardPivot.position.set(0, this.boardHeight / 2, 0);
    this.boardPivot.rotation.set(0, 0, 0);
    this.player.position.set(0, 0, 0);
    this.setSquash(1);
    this.emitHud(true);
  }

  private resetWorld() {
    for (const s of this.scenery) s.parts.forEach((p) => this.pool.release(p.key, p.obj));
    for (const o of this.obstacles) this.releaseObstacle(o);
    for (const p of this.pickups) this.pool.release(p.part.key, p.part.obj);
    this.scenery = [];
    this.obstacles = [];
    this.pickups = [];
    this.rows = [];
    this.distance = 0;
    this.track.position.z = 0;
    this.cursor = { road: -PREBUILD, left: -PREBUILD, right: -PREBUILD, props: -PREBUILD, row: FIRST_ROW, power: 320 };
    this.lastRowEnd = FIRST_ROW - 30;
    this.spawnAhead();
  }

  // --- Animation --------------------------------------------------------------------------------

  private play(name: string, { once = false, fade = 0.2, timeScale = 1 } = {}) {
    for (const rider of this.riders) {
      const next = rider.actions.get(name);
      if (!next) continue;
      if (rider.current === next && !once) continue;
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.timeScale = timeScale;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (rider.current && rider.current !== next) next.crossFadeFrom(rider.current, fade, false);
      next.play();
      rider.current = next;
    }
  }

  // --- Controls ---------------------------------------------------------------------------------

  private blocked(lane: number) {
    const top = this.y + (this.duckT > 0 ? DUCK_H : STAND_H);
    return this.obstacles.some(
      (o) => !o.fly && o.lane === lane && Math.abs(this.distance - o.s) < o.halfLen + 0.5 && this.y + 0.08 < o.yMax && top > o.yMin,
    );
  }

  private changeLane(dir: -1 | 1) {
    const target = this.lane + dir;
    if (target < 0 || target > 2) {
      this.wobble = dir * 0.5;
      return;
    }
    if (this.blocked(target)) {
      // Side-swiping a car just bounces you back.
      this.wobble = dir * 0.9;
      this.shake = Math.max(this.shake, 0.25);
      this.sfx.bump();
      return;
    }
    this.lane = target;
    this.sfx.lane();
  }

  private jump() {
    if (!this.grounded) return;
    this.grounded = false;
    this.vy = JUMP_V;
    this.airTime = 0;
    this.duckT = 0;
    this.duckQueued = false;
    this.trick = Math.random() < 0.6 ? "flip" : "spin";
    this.play(this.trick === "flip" ? "skate-air" : "skate-grab", { once: true, fade: 0.08 });
    this.sfx.jump();
  }

  private duck() {
    if (!this.grounded) {
      this.vy = Math.min(this.vy, SLAM_V);
      this.duckQueued = true;
      return;
    }
    if (this.duckT <= 0) this.sfx.duck();
    this.duckT = DUCK_TIME;
    this.play("crouch", { fade: 0.08 });
  }

  // --- Frame ------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);

    if (this.phase === "playing") this.updateRun(dt);
    else if (this.phase === "crashed") this.updateCrash(dt);
    else if (this.phase === "menu") this.updateMenu(dt);

    if (this.phase !== "paused") {
      this.elapsed += dt;
      for (const r of this.riders) r.mixer.update(dt);
      this.animatePickups(dt);
      this.animateOrbs(dt);
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      this.updateCamera(this.phase === "paused" ? 0 : dt);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updateMenu(dt: number) {
    if (this.queueIdle > 0) {
      this.queueIdle -= dt;
      if (this.queueIdle <= 0) this.play("idle", { fade: 0.3 });
    } else if (!this.riders[this.riderIndex]?.current) {
      this.play("idle", { fade: 0 });
    }
  }

  private updateRun(dt: number) {
    this.runTime += dt;
    const target = speedAt(this.distance);
    this.speed = Math.min(target, this.speed + dt * 30);
    this.distance += this.speed * dt;
    this.track.position.z = this.distance;
    const multiplier = this.boost > 0 ? 2 : 1;
    this.points += this.speed * dt * 0.5 * multiplier;

    // Vertical motion.
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.sfx.land();
        this.shake = Math.max(this.shake, 0.08);
        if (this.duckQueued) {
          this.duckQueued = false;
          this.duck();
        } else this.play("skate", { fade: 0.12 });
      }
    }
    if (this.duckT > 0) {
      this.duckT -= dt;
      if (this.duckT <= 0 && this.grounded) this.play("skate", { fade: 0.15 });
    }

    // Lane position and body lean.
    const tx = laneX(this.lane);
    this.x = damp(this.x, tx, 15, dt);
    this.wobble = damp(this.wobble, 0, 8, dt);
    this.player.position.set(this.x + this.wobble * 0.35, this.y, 0);
    const lean = THREE.MathUtils.clamp((tx - this.x) * 0.16 + this.wobble * 0.25, -0.35, 0.35);
    this.body.rotation.z = damp(this.body.rotation.z, lean, 14, dt);

    // Tricks: kickflip (board rolls) or a 360 spin (whole body).
    const airProgress = this.grounded ? 1 : Math.min(1, this.airTime / ((2 * JUMP_V) / GRAVITY));
    const t = ease(airProgress);
    this.boardPivot.rotation.z = !this.grounded && this.trick === "flip" ? t * Math.PI * 2 : 0;
    this.body.rotation.y = Math.PI + (!this.grounded && this.trick === "spin" ? t * Math.PI * 2 : 0);

    // Ducking squashes the rider on top of the crouch animation, so it clearly fits under a gate bar.
    this.setSquash(damp(this.squash, this.duckT > 0 ? 0.62 : 1, 22, dt));

    // Power-up timers.
    this.magnet = Math.max(0, this.magnet - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.updateObstacles(dt);
    this.collectPickups(dt);
    this.spawnAhead();
    this.cleanup();
    this.sfx.rolling(this.grounded ? 0.35 + (0.65 * this.speed) / MAX_SPEED : 0);
    music.setIntensity(this.speed > 25 ? 2 : 1);
    this.emitHud();
  }

  private updateCrash(dt: number) {
    this.crashT += dt;
    this.speed = damp(this.speed, 0, 5, dt);
    this.distance += this.speed * dt;
    this.track.position.z = this.distance;
    if (!this.grounded || this.y > 0) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.grounded = true;
    }
    this.player.position.y = this.y;
    // The board shoots forward and tumbles.
    const b = this.boardPivot;
    this.boardFly.vy -= GRAVITY * dt;
    b.position.y += this.boardFly.vy * dt;
    b.position.z += this.boardFly.vz * dt;
    this.boardFly.vz = damp(this.boardFly.vz, 0, 2, dt);
    if (b.position.y < this.boardHeight / 2) {
      b.position.y = this.boardHeight / 2;
      this.boardFly.vy = Math.abs(this.boardFly.vy) * 0.35;
    } else {
      b.rotation.x += dt * 9;
      b.rotation.z += dt * 5;
    }
    this.updateObstacles(dt);
    if (this.crashT > 1.5 && this.phase === "crashed") {
      this.setPhase("over");
      this.events.over({ score: Math.floor(this.points), coins: this.coins, distance: Math.floor(this.distance) });
    }
  }

  private squash = 1;

  private setSquash(value: number) {
    this.squash = value;
    for (const r of this.riders) r.root.scale.set(1 + (1 - value) * 0.25, value, 1 + (1 - value) * 0.25);
  }

  private crash() {
    this.setPhase("crashed");
    this.crashT = 0;
    this.shake = 0.7;
    this.duckT = 0;
    this.sfx.crash();
    this.sfx.rolling(0);
    music.setIntensity(0);
    this.body.rotation.y = Math.PI;
    this.boardPivot.rotation.set(0, 0, 0);
    this.boardFly = { vy: 7, vz: 9 };
    this.setSquash(1);
    this.play("die", { once: true, fade: 0.08 });
    this.emitHud(true);
  }

  // --- Camera -----------------------------------------------------------------------------------

  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();

  private updateCamera(dt: number) {
    const inRun = this.phase !== "menu";
    this.camBlend = THREE.MathUtils.clamp(this.camBlend + (inRun ? dt : -dt) * 1.1, 0, 1);
    const k = ease(this.camBlend);
    const speedT = this.speed / MAX_SPEED;

    // Menu: a slow swing in front of the rider. Run: chase cam behind and above.
    const a = Math.sin(this.elapsed * 0.35) * 0.45 + 0.35;
    const menuPos = this.tmpPos.set(Math.sin(a) * 4.4, 1.3, -Math.cos(a) * 4.4);
    const menuLook = this.tmpLook.set(0, 0.7, 0);
    const back = this.portrait ? 8.6 : 6.6;
    const gamePos = new THREE.Vector3(this.x * 0.55, (this.portrait ? 4.2 : 3.5) + this.y * 0.35, back + speedT * 0.8);
    const gameLook = new THREE.Vector3(this.x * 0.7, 1.15 + this.y * 0.25, -8);
    menuPos.lerp(gamePos, k);
    menuLook.lerp(gameLook, k);
    // Swing out to the side on the way between the two, instead of passing through the rider.
    const arc = Math.sin(k * Math.PI);
    menuPos.x += arc * 4.5;
    menuPos.y += arc * 0.9;
    if (dt === 0 || this.camPos.lengthSq() === 0) {
      this.camPos.copy(menuPos);
      this.camLook.copy(menuLook);
    } else {
      this.camPos.lerp(menuPos, 1 - Math.exp(-12 * dt));
      this.camLook.lerp(menuLook, 1 - Math.exp(-12 * dt));
    }

    this.shake = damp(this.shake, 0, 6, dt);
    const s = this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z);
    this.camera.lookAt(this.camLook);
    const fov = (this.portrait ? 72 : 58) + k * speedT * 8;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
  }

  // --- Track generation -------------------------------------------------------------------------

  private size(key: string) {
    return this.protos.get(key)!.size;
  }

  private place(key: string, x: number, s: number, y = 0, rotY = 0): Part {
    const obj = this.pool.get(key);
    obj.position.set(x, y, -s);
    obj.rotation.y = rotY;
    return { key, obj };
  }

  private spawnAhead() {
    const limit = this.distance + AHEAD;
    while (this.cursor.road < limit) this.spawnRoad();
    while (this.cursor.left < limit) this.spawnBuilding(-1);
    while (this.cursor.right < limit) this.spawnBuilding(1);
    while (this.cursor.props < limit) this.spawnProps();
    while (this.cursor.row < limit) this.spawnRow();
  }

  private cleanup() {
    const behind = this.distance - BEHIND;
    this.scenery = this.scenery.filter((s) => {
      if (s.end >= behind) return true;
      s.parts.forEach((p) => this.pool.release(p.key, p.obj));
      return false;
    });
    this.obstacles = this.obstacles.filter((o) => {
      if (o.s + o.halfLen >= behind && (!o.fly || o.fly.t < 1.2)) return true;
      this.releaseObstacle(o);
      return false;
    });
    this.rows = this.rows.filter((r) => r.end > this.distance - 60);
  }

  private spawnRoad() {
    const s = this.cursor.road;
    const mid = s + ROAD_TILE / 2;
    const walkX = ROAD_W / 2 + WALK_W / 2;
    const walkY = WALK_H - this.size(M.sidewalk).y;
    this.scenery.push({
      end: s + ROAD_TILE,
      parts: [this.place(M.road, 0, mid, -this.size(M.road).y), this.place(M.sidewalk, -walkX, mid, walkY), this.place(M.sidewalk, walkX, mid, walkY)],
    });
    this.cursor.road += ROAD_TILE;
  }

  private spawnBuilding(side: -1 | 1) {
    const which = side < 0 ? "left" : "right";
    const s0 = this.cursor[which];
    const face = side < 0 ? Math.PI / 2 : -Math.PI / 2; // front (+z) turned towards the road
    const parts: Part[] = [];
    let len: number;
    let gap: number;
    if (zoneAt(s0) === "downtown") {
      const key = pick(this.downtown);
      const size = this.size(key);
      len = size.x;
      gap = rand(0.3, 1.4);
      parts.push(this.place(key, side * (BUILD_X + size.z / 2), s0 + len / 2, 0, face));
      if (this.skyscrapers.length && Math.random() < 0.6) {
        const tower = pick(this.skyscrapers);
        parts.push(this.place(tower, side * (BUILD_X + 20 + rand(0, 16)), s0 + rand(0, len), 0, face));
      }
    } else {
      const key = pick(this.suburb);
      const size = this.size(key);
      len = size.x;
      gap = rand(3, 7);
      parts.push(this.place(key, side * (BUILD_X + 1.5 + size.z / 2), s0 + len / 2, 0, face));
      const tree = Math.random() < 0.5 ? M.treeLarge : M.treeSmall;
      if (this.protos.has(tree)) parts.push(this.place(tree, side * (BUILD_X + rand(0.5, 6)), s0 + len + gap / 2, 0, rand(0, Math.PI * 2)));
    }
    this.scenery.push({ end: s0 + len + gap + 40, parts });
    this.cursor[which] = s0 + len + gap;
  }

  private spawnProps() {
    const s = this.cursor.props;
    const step = 26;
    const parts: Part[] = [];
    const edge = ROAD_W / 2 + 0.6;
    const inner = ROAD_W / 2 + WALK_W - 1.1;
    const downtown = zoneAt(s) === "downtown";
    for (const side of [-1, 1] as const) {
      const at = s + (side < 0 ? 0 : step / 2);
      if (this.protos.has(M.streetLight)) parts.push(this.place(M.streetLight, side * edge, at, WALK_H, side < 0 ? 0 : Math.PI));
      const extra = downtown ? pick([M.hydrant, M.bench, M.planter, M.planter]) : pick([M.treeSmall, M.treeLarge, M.hydrant]);
      if (Math.random() < 0.7 && this.protos.has(extra)) {
        const rot = extra === M.bench ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : rand(0, Math.PI * 2);
        parts.push(this.place(extra, side * (extra === M.bench ? inner + 0.4 : inner), at + rand(5, 9), WALK_H, rot));
      }
    }
    if (Math.floor(s / step) % 9 === 4 && this.protos.has(M.trafficLight)) {
      parts.push(this.place(M.trafficLight, -edge, s + 6, WALK_H, 0));
      parts.push(this.place(M.trafficLight, edge, s + 6, WALK_H, Math.PI));
    }
    this.scenery.push({ end: s + step, parts });
    this.cursor.props += step;
  }

  /** Builds one obstacle; `s` is its near edge. Returns it so the caller knows its length. */
  private addObstacle(kind: ObKind, lane: number, s: number, opts: { car?: string; speed?: number } = {}): Obstacle {
    const holder = new THREE.Group();
    this.track.add(holder);
    const parts: Part[] = [];
    const add = (key: string, x = 0, y = 0, z = 0, rotY = 0) => {
      const obj = this.pool.get(key, holder);
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      parts.push({ key, obj });
      return obj;
    };
    let halfLen = 0.3;
    let halfW = 1.1;
    let yMin = 0;
    let yMax = 0.9;
    let action: Action = "jump";
    if (kind === "barrier") {
      add(M.barrier);
      halfLen = this.size(M.barrier).z / 2;
      yMax = this.size(M.barrier).y;
    } else if (kind === "fence" && this.protos.has(M.fence)) {
      add(M.fence, 0, 0, 0, Math.PI / 2);
      yMax = this.size(M.fence).y;
    } else if (kind === "cones" && this.protos.has(M.cone)) {
      for (const dx of [-0.8, 0, 0.8]) add(M.cone, dx, 0, rand(-0.15, 0.15), rand(0, Math.PI));
      yMax = 0.8;
    } else if (kind === "gate" && this.protos.has(M.gate)) {
      add(M.gate);
      add("gate-bar", 0, 1.12, 0);
      action = "duck";
      halfW = 1.25;
      halfLen = 0.25;
      yMin = 1.08;
      yMax = 6;
    } else if (kind === "car") {
      const key = opts.car ?? pick(this.cars);
      const size = this.size(key);
      // Oncoming traffic faces the player; parked cars face either way.
      add(key, 0, 0, 0, opts.speed || Math.random() < 0.5 ? 0 : Math.PI);
      action = "block";
      halfLen = size.z / 2 - 0.15;
      halfW = size.x / 2 - 0.1;
      yMax = size.y;
    } else {
      // Optional model missing — fall back to the barrier.
      add(M.barrier);
      halfLen = this.size(M.barrier).z / 2;
      yMax = this.size(M.barrier).y;
    }
    const ob: Obstacle = { holder, parts, action, lane, x: laneX(lane), s: s + halfLen, halfLen, halfW, yMin, yMax, speed: opts.speed ?? 0, fly: null };
    holder.position.set(ob.x, 0, -ob.s);
    this.obstacles.push(ob);
    return ob;
  }

  private releaseObstacle(o: Obstacle) {
    o.parts.forEach((p) => this.pool.release(p.key, p.obj));
    o.holder.removeFromParent();
  }

  private addPickup(kind: PickupKind, x: number, s: number, y: number) {
    const key = kind === "coin" ? M.coin : kind === "shield" ? M.heart : kind === "magnet" ? M.star : M.jewel;
    if (!this.protos.has(key)) return;
    const part = this.place(key, x, s, y);
    part.obj.rotation.y = s * 0.35; // coins in a line spin in a wave
    this.pickups.push({ part, kind, s, x, y, attract: false, taken: -1 });
  }

  private coinLine(lane: number, from: number, to: number) {
    for (let s = from; s <= to; s += 2.6) this.addPickup("coin", laneX(lane), s, 0.5);
  }

  private canSendTraffic(lane: number, sCar: number, carSpeed: number) {
    if (this.obstacles.some((o) => o.lane === lane && o.s + o.halfLen > this.distance - 2 && o.s - o.halfLen < sCar + 8)) return false;
    // Where the car will meet the player: make sure nothing there forces the player into its lane.
    const v = speedAt(this.distance);
    const meet = this.distance + (v * (sCar - this.distance)) / (v + carSpeed);
    return !this.rows.some((r) => r.end > meet - 30 && r.s < meet + 30 && !r.passable.some((p, i) => p && i !== lane));
  }

  private spawnRow() {
    const s = this.cursor.row;
    const d = Math.min(1, s / 3200);
    const placed: (Obstacle[] | null)[] = [null, null, null];
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const passableKind = (): ObKind => pick(["barrier", "barrier", "fence", "cones", "gate", "gate"] as const);
    const anyKind = (): ObKind => (Math.random() < 0.45 + d * 0.15 ? "car" : passableKind());
    let breather = false;

    const weights: [string, number][] = [
      ["single", 1.1 - d * 0.6],
      ["double", 0.9 + d * 0.4],
      ["triple", 0.15 + d * 0.7],
      ["train", 0.35 + d * 0.35],
      ["traffic", s > 250 ? 0.3 + d * 0.4 : 0],
      ["breather", 0.3 - d * 0.15],
    ];
    let r = Math.random() * weights.reduce((n, [, w]) => n + w, 0);
    const pattern = weights.find(([, w]) => (r -= w) < 0)?.[0] ?? "single";

    if (pattern === "single") {
      placed[lanes[0]] = [this.addObstacle(anyKind(), lanes[0], s)];
    } else if (pattern === "double") {
      placed[lanes[0]] = [this.addObstacle(anyKind(), lanes[0], s)];
      placed[lanes[1]] = [this.addObstacle(anyKind(), lanes[1], s)];
    } else if (pattern === "triple") {
      placed[lanes[0]] = [this.addObstacle(passableKind(), lanes[0], s)];
      placed[lanes[1]] = [this.addObstacle(anyKind(), lanes[1], s)];
      placed[lanes[2]] = [this.addObstacle(Math.random() < 0.7 ? "car" : passableKind(), lanes[2], s)];
    } else if (pattern === "train") {
      const count = 2 + Math.floor(Math.random() * (1 + d * 2));
      const train: Obstacle[] = [];
      let at = s;
      for (let i = 0; i < count; i++) {
        const car = this.addObstacle("car", lanes[0], at);
        train.push(car);
        at += car.halfLen * 2 + 1.4;
      }
      placed[lanes[0]] = train;
      if (Math.random() < 0.3 + d * 0.5) placed[lanes[1]] = [this.addObstacle(passableKind(), lanes[1], s + rand(0, at - s))];
    } else if (pattern === "traffic") {
      const carSpeed = rand(7, 11 + d * 5);
      if (this.canSendTraffic(lanes[0], s, carSpeed)) {
        placed[lanes[0]] = [this.addObstacle("car", lanes[0], s, { speed: carSpeed })];
        if (Math.random() < 0.5) placed[lanes[1]] = [this.addObstacle(passableKind(), lanes[1], s)];
      } else placed[lanes[0]] = [this.addObstacle(passableKind(), lanes[0], s)];
    } else breather = true;

    const end = Math.max(s + 1, ...placed.flatMap((list) => (list ?? []).filter((o) => !o.speed).map((o) => o.s + o.halfLen)));
    const passable = placed.map((list) => !list || list.every((o) => o.action !== "block"));
    this.rows.push({ s, end, passable });

    // Coins: a trail leading into a safe lane, arcing over jump obstacles and sliding under gates.
    const from = Math.max(this.lastRowEnd + 4, s - 34);
    if (breather) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const lanePos = 1 + dir * Math.sin(t * Math.PI * 2) * 1;
        this.addPickup("coin", (lanePos - 1) * LANE_W, s + i * 2.4, 0.5);
      }
    } else {
      const options = [0, 1, 2].filter((l) => passable[l] && !placed[l]?.some((o) => o.speed));
      const coinLane = options.length ? pick(options) : 1;
      const obstacle = placed[coinLane]?.[0];
      const powerHere = s > this.cursor.power;
      const trailEnd = obstacle ? obstacle.s - 5 : end + 4;
      if (powerHere) {
        const mid = (from + trailEnd) / 2;
        this.coinLine(coinLane, from, mid - 4);
        this.addPickup(pick(["shield", "magnet", "boost"] as const), laneX(coinLane), mid, 0.45);
        this.coinLine(coinLane, mid + 4, trailEnd);
        this.cursor.power = s + rand(420, 720);
      } else if (trailEnd - from > 4) this.coinLine(coinLane, from, trailEnd);
      if (obstacle?.action === "jump") {
        for (let i = -2; i <= 2; i++) {
          const u = i / 2.5;
          this.addPickup("coin", laneX(coinLane), obstacle.s + i * 2.2, 0.5 + 1.7 * (1 - u * u));
        }
      } else if (obstacle?.action === "duck") {
        for (const ds of [-1.6, 0, 1.6]) this.addPickup("coin", laneX(coinLane), obstacle.s + ds, 0.12);
      }
    }

    const gap = Math.max(15, speedAt(s) * (1.45 - d * 0.6));
    this.lastRowEnd = breather ? s + 34 : end;
    this.cursor.row = this.lastRowEnd + gap;
  }

  // --- Per-frame entity updates -----------------------------------------------------------------

  private updateObstacles(dt: number) {
    const top = this.y + (this.duckT > 0 ? DUCK_H : STAND_H);
    for (const o of this.obstacles) {
      if (o.fly) {
        // Smashed by the shield: tumble away.
        o.fly.t += dt;
        o.fly.vy -= GRAVITY * 0.6 * dt;
        o.s += (this.speed + 6) * dt;
        o.holder.position.set(o.holder.position.x + o.fly.vx * dt, o.holder.position.y + o.fly.vy * dt, -o.s);
        o.holder.rotation.x += o.fly.spin.x * dt;
        o.holder.rotation.z += o.fly.spin.z * dt;
        continue;
      }
      if (o.speed) {
        o.s -= o.speed * dt;
        o.holder.position.z = -o.s;
        // Oncoming cars sweep up coins in their lane.
        for (const p of this.pickups) {
          if (p.taken < 0 && !p.attract && Math.abs(p.x - o.x) < 1 && Math.abs(p.s - o.s) < o.halfLen) {
            p.taken = 0.2;
            p.part.obj.visible = false;
          }
        }
      }
      if (this.phase !== "playing") continue;
      const dz = Math.abs(this.distance - o.s);
      if (dz > o.halfLen + 0.45 || Math.abs(o.x - this.x) > o.halfW + 0.38) continue;
      if (this.y + 0.08 > o.yMax || top < o.yMin) continue;
      if (this.invulnerable > 0) continue;
      if (this.shield) {
        this.shield = false;
        this.invulnerable = 1.2;
        this.shake = 0.4;
        this.sfx.shieldBreak();
        o.fly = { t: 0, vy: 9, vx: rand(-4, 4), spin: new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)) };
        continue;
      }
      this.crash();
      return;
    }
  }

  private collectPickups(dt: number) {
    const top = this.y + (this.duckT > 0 ? DUCK_H : STAND_H);
    for (const p of this.pickups) {
      if (p.taken >= 0) continue;
      const ahead = p.s - this.distance;
      if (this.magnet > 0 && p.kind === "coin" && ahead < 22 && ahead > -1) p.attract = true;
      if (p.attract) {
        p.s = damp(p.s, this.distance, 10, dt);
        p.x = damp(p.x, this.x, 10, dt);
        p.y = damp(p.y, this.y + 0.5, 10, dt);
        p.part.obj.position.set(p.x, p.y, -p.s);
      }
      if (Math.abs(ahead) > 1 || Math.abs(p.x - this.x) > 1.05 || p.y > top + 0.1 || p.y + 0.75 < this.y) continue;
      p.taken = 0;
      if (p.kind === "coin") {
        this.coins++;
        this.points += COIN_POINTS * (this.boost > 0 ? 2 : 1);
        this.sfx.coin();
      } else {
        this.sfx.power();
        if (p.kind === "shield") this.shield = true;
        else if (p.kind === "magnet") this.magnet = POWER_TIME;
        else this.boost = POWER_TIME;
      }
    }
  }

  private animatePickups(dt: number) {
    const behind = this.distance - 8;
    this.pickups = this.pickups.filter((p) => {
      const obj = p.part.obj;
      if (p.taken >= 0) {
        p.taken += dt;
        const k = Math.max(0, 1 - p.taken / 0.18);
        obj.scale.setScalar(k * (1 + p.taken * 4));
        obj.position.y += dt * 6;
        if (p.taken < 0.18) return true;
      } else if (p.s >= behind) {
        obj.rotation.y += dt * (p.kind === "coin" ? 4 : 2);
        if (p.kind !== "coin") obj.position.y = p.y + Math.sin(this.elapsed * 3 + p.s) * 0.15;
        return true;
      }
      this.pool.release(p.part.key, obj);
      return false;
    });
  }

  private animateOrbs(dt: number) {
    const t = this.elapsed;
    const { shield, magnet, boost } = this.orbs;
    const running = this.phase === "playing" || this.phase === "paused";
    shield.visible = running && this.shield && (this.invulnerable <= 0 || Math.floor(t * 12) % 2 === 0);
    magnet.visible = running && this.magnet > 0 && (this.magnet > 2 || Math.floor(t * 8) % 2 === 0);
    boost.visible = running && this.boost > 0 && (this.boost > 2 || Math.floor(t * 8) % 2 === 0);
    shield.position.set(Math.cos(t * 3) * 0.9, 1.0, Math.sin(t * 3) * 0.9);
    magnet.position.set(Math.cos(t * 3 + Math.PI) * 0.9, 1.3, Math.sin(t * 3 + Math.PI) * 0.9);
    boost.position.set(0, 2.05 + Math.sin(t * 4) * 0.08, 0);
    shield.rotation.y += dt * 3;
    magnet.rotation.y += dt * 3;
    boost.rotation.y += dt * 2;
  }

  private emitHud(force = false) {
    const next: Hud = {
      score: Math.floor(this.points),
      coins: this.coins,
      distance: Math.floor(this.distance),
      shield: this.shield,
      magnet: Math.ceil(this.magnet * 10) / 10,
      boost: Math.ceil(this.boost * 10) / 10,
    };
    const h = this.hud;
    if (
      !force &&
      h.score === next.score &&
      h.coins === next.coins &&
      h.distance === next.distance &&
      h.shield === next.shield &&
      h.magnet === next.magnet &&
      h.boost === next.boost
    )
      return;
    this.hud = next;
    this.events.hud(next);
  }
}
