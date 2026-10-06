import * as THREE from "three";
import type { Proto } from "../shared/assets";
import { ISLAND, PROPS } from "./manifest";
import { waveHeight } from "./ocean";

/**
 * The archipelago: islands assembled from Pirate Kit pieces (sand and grass patches, palms, rocks,
 * huts, docks, flags), reefs, a wreck and a ring of buoys marking the edge of the cove. Everything
 * static is merged into one mesh per island (all Pirate Kit models share one colour atlas).
 */

export const ARENA = 205;

export interface Shoal {
  x: number;
  z: number;
  r: number;
  /** Height of the tallest thing on it (cannonballs fly over lower rocks). */
  top: number;
  /** Jetty posts: solid for ships, but no shallows or surf drawn around them. */
  dock?: boolean;
}

export interface FortSite {
  x: number;
  z: number;
  /** Direction (yaw) from the island centre towards the sea. */
  yaw: number;
  large: boolean;
}

export interface Floater {
  obj: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  phase: number;
}

interface IslandPlan {
  x: number;
  z: number;
  r: number;
  fort?: "small" | "large";
  dock?: boolean;
  hut?: boolean;
  treasure?: boolean;
  flag?: boolean;
}

const ISLANDS: IslandPlan[] = [
  { x: 40, z: 58, r: 16, dock: true, hut: true, flag: true },
  { x: -64, z: 22, r: 13, fort: "small" },
  { x: -28, z: -74, r: 18, fort: "large", flag: true },
  { x: 86, z: -34, r: 12, treasure: true },
  { x: 122, z: 72, r: 15, fort: "small", hut: true },
  { x: -124, z: -22, r: 14, dock: true },
  { x: -96, z: 108, r: 17, flag: true, hut: true },
  { x: 18, z: 146, r: 11 },
  { x: 62, z: -132, r: 14, fort: "large" },
  { x: -150, z: -116, r: 12, treasure: true },
  { x: 150, z: -92, r: 13, dock: true },
  { x: 170, z: 16, r: 9 },
];

const REEFS = [
  { x: -12, z: 80, r: 4.2 },
  { x: 100, z: 18, r: 5 },
  { x: -78, z: -46, r: 4.2 },
  { x: 38, z: -64, r: 4.6, wreck: true },
  { x: -152, z: 52, r: 4.4 },
  { x: 104, z: 142, r: 5 },
  { x: -44, z: 162, r: 4.4 },
  { x: -4, z: -156, r: 5 },
];

/** Deterministic random numbers, so the cove is the same every voyage. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Geometry of a proto, flattened into its own space (one entry per mesh). */
export function bake(proto: Proto) {
  const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  proto.object.updateMatrixWorld(true);
  proto.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    out.push({ geometry: mesh.geometry, material: Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, matrix: mesh.matrixWorld.clone() });
  });
  return out;
}

/** Merges many placed protos into one mesh (position, normal, uv), assuming one shared material. */
class Batch {
  private parts: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  material: THREE.Material | null = null;

  add(proto: Proto | undefined, matrix: THREE.Matrix4) {
    if (!proto) return;
    for (const part of bake(proto)) {
      this.material ??= part.material;
      this.parts.push({ geometry: part.geometry, matrix: new THREE.Matrix4().multiplyMatrices(matrix, part.matrix) });
    }
  }

  build(): THREE.Mesh | null {
    if (!this.parts.length || !this.material) return null;
    let vertices = 0;
    let indices = 0;
    for (const { geometry } of this.parts) {
      const n = geometry.attributes.position.count;
      vertices += n;
      indices += geometry.index ? geometry.index.count : n;
    }
    const pos = new Float32Array(vertices * 3);
    const nor = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    const v = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let vo = 0;
    let io = 0;
    for (const { geometry, matrix } of this.parts) {
      normalMatrix.getNormalMatrix(matrix);
      const p = geometry.attributes.position;
      const n = geometry.attributes.normal;
      const t = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        pos.set([v.x, v.y, v.z], (vo + i) * 3);
        if (n) {
          v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
          nor.set([v.x, v.y, v.z], (vo + i) * 3);
        }
        if (t) uv.set([t.getX(i), t.getY(i)], (vo + i) * 2);
      }
      if (geometry.index) for (let i = 0; i < geometry.index.count; i++) index[io++] = geometry.index.getX(i) + vo;
      else for (let i = 0; i < p.count; i++) index[io++] = vo + i;
      vo += p.count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const BUOY_SCALE = new THREE.Vector3(1.6, 1.6, 1.6);
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const place = (x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx, tiltX = 0, tiltZ = 0) =>
  m4.clone().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(tiltX, yaw, tiltZ, "YXZ")).clone(), new THREE.Vector3(sx, sy, sz));

export class World {
  readonly group = new THREE.Group();
  readonly shoals: Shoal[] = [];
  readonly forts: FortSite[] = [];
  readonly floaters: Floater[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private buoys: { meshes: THREE.InstancedMesh[]; places: { x: number; z: number; phase: number }[] }[] = [];

  constructor(private readonly protos: Map<string, Proto>) {
    ISLANDS.forEach((plan, i) => this.island(plan, i));
    REEFS.forEach((reef, i) => this.reef(reef, i));
    this.buildBuoys();
  }

  private proto(key: string) {
    return this.protos.get(key);
  }

  private island(plan: IslandPlan, seed: number) {
    const rand = rng(1000 + seed * 97);
    const r = plan.r;
    const batch = new Batch();
    const { x: cx, z: cz } = plan;
    const at = (radius: number, angle: number) => ({ x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius });

    // Sand: overlapping patches, thickened so their sides are hidden under the waves.
    const sand = this.proto(ISLAND.sand);
    const sandFoliage = this.proto(ISLAND.sandFoliage);
    const patches = 3 + Math.round(r / 5);
    for (let i = 0; i < patches; i++) {
      const a = (i / patches) * Math.PI * 2 + rand() * 0.6;
      const d = i === 0 ? 0 : r * (0.28 + rand() * 0.2);
      const p = at(d, a);
      const s = (r / 7.2) * (0.8 + rand() * 0.25);
      const proto = rand() < 0.45 ? sandFoliage : sand;
      if (!proto) continue;
      const top = i === 0 ? 0.95 : 0.62 + rand() * 0.18;
      const sy = 1.4 / proto.size.y;
      batch.add(proto, place(p.x, top - proto.size.y * sy, p.z, rand() * Math.PI * 2, s, sy, s));
    }
    // Grass on the higher middle.
    const grass = [this.proto(ISLAND.grass), this.proto(ISLAND.grassFoliage)];
    const grassCount = r > 12 ? 2 : 1;
    for (let i = 0; i < grassCount; i++) {
      const proto = grass[Math.floor(rand() * 2)];
      if (!proto) continue;
      const p = at(r * 0.18 * rand(), rand() * Math.PI * 2);
      const s = (r / 9) * (0.85 + rand() * 0.3);
      const sy = 0.9 / proto.size.y;
      batch.add(proto, place(p.x, 1.25 - proto.size.y * sy, p.z, rand() * Math.PI * 2, s, sy, s));
    }
    // Rocks at the edge.
    const rocks = [ISLAND.rocksSandA, ISLAND.rocksSandB, ISLAND.rocksSandC];
    const rockCount = 1 + Math.floor(rand() * 2);
    let top = 1.4;
    for (let i = 0; i < rockCount; i++) {
      const proto = this.proto(rocks[Math.floor(rand() * rocks.length)]);
      if (!proto) continue;
      const p = at(r * (0.62 + rand() * 0.15), rand() * Math.PI * 2);
      const s = 1.1 + rand() * 0.6;
      batch.add(proto, place(p.x, -0.4, p.z, rand() * Math.PI * 2, s));
      top = Math.max(top, proto.size.y * s - 0.4);
    }
    // Palms.
    const palms = [ISLAND.palmBend, ISLAND.palmStraight, ISLAND.palmDetailedBend, ISLAND.palmDetailedStraight];
    const palmCount = Math.round(r / 3.2);
    for (let i = 0; i < palmCount; i++) {
      const proto = this.proto(palms[Math.floor(rand() * palms.length)]);
      if (!proto) continue;
      const a = rand() * Math.PI * 2;
      const p = at(r * (0.15 + rand() * 0.42), a);
      const s = 1.25 + rand() * 0.55;
      batch.add(proto, place(p.x, 0.75, p.z, rand() * Math.PI * 2, s));
      top = Math.max(top, proto.size.y * s + 0.75);
    }
    // Small plants.
    const plants = [ISLAND.grassTuft, ISLAND.grassPatch, ISLAND.grassPlant];
    for (let i = 0; i < 4 + Math.floor(rand() * 4); i++) {
      const proto = this.proto(plants[Math.floor(rand() * plants.length)]);
      if (!proto) continue;
      const p = at(r * rand() * 0.55, rand() * Math.PI * 2);
      batch.add(proto, place(p.x, 0.8, p.z, rand() * Math.PI * 2, 1.2 + rand() * 0.8));
    }
    // Features.
    // Forts and jetties face the middle of the cove, where the fighting is.
    const inward = Math.atan2(-cz, -cx) + (rand() - 0.5) * 0.6;
    if (plan.hut) {
      const p = at(r * 0.25, inward + 2.3);
      batch.add(this.proto(PROPS.hut), place(p.x, 0.95, p.z, rand() * Math.PI * 2, 1.25));
      top = Math.max(top, 5);
    }
    if (plan.flag) {
      const p = at(r * 0.3, inward - 2.0);
      batch.add(this.proto(PROPS.flag), place(p.x, 0.95, p.z, rand() * Math.PI * 2, 1.3));
    }
    if (plan.treasure) {
      const p = at(r * 0.12, rand() * Math.PI * 2);
      batch.add(this.proto(PROPS.hole), place(p.x, 1.0, p.z, rand() * Math.PI, 1.1));
      batch.add(this.proto(PROPS.shovel), place(p.x + 2.2, 0.95, p.z + 0.8, 0.6, 1.1, 1.1, 1.1, 0.25, 0.3));
      batch.add(this.proto(PROPS.bottle), place(p.x - 2.1, 0.95, p.z - 1.2, 0, 1.2));
    }
    if (plan.dock) {
      // A jetty running from the beach out to sea, with crates and a rowboat.
      const dock = this.proto(PROPS.dock);
      if (dock) {
        const len = dock.size.z * 1.35;
        const dir = inward - 0.75;
        const endPiece = this.proto(PROPS.dockSmall) ?? dock;
        for (let i = 0; i < 4; i++) {
          const p = at(r * 0.72 + i * len, dir);
          const piece = i === 3 ? endPiece : dock;
          batch.add(piece, place(p.x, 1.1 - piece.size.y * 1.35, p.z, Math.PI / 2 - dir, 1.35));
        }
        const end = at(r * 0.72 + 3 * len, dir);
        const side = at(r * 0.72 + 2.2 * len, dir);
        const off = { x: Math.cos(dir + Math.PI / 2) * 3.4, z: Math.sin(dir + Math.PI / 2) * 3.4 };
        // Ships bump into the jetty (and the rowboat moored beside it).
        for (let d = r * 0.95; d <= r * 0.72 + 3.4 * len; d += 2.6) {
          const p = at(d, dir);
          this.shoals.push({ x: p.x, z: p.z, r: 2, top: 1.6, dock: true });
        }
        this.shoals.push({ x: side.x + off.x, z: side.z + off.z, r: 1.8, top: 1.2, dock: true });
        batch.add(this.proto(PROPS.flag), place(end.x, 1.1, end.z, 0, 0.9));
        const boat = this.proto(seed % 2 ? PROPS.rowboatLarge : PROPS.rowboat) ?? this.proto(PROPS.rowboat);
        if (boat) {
          const obj = boat.object.clone();
          obj.scale.setScalar(1.25);
          this.group.add(obj);
          this.floaters.push({ obj, x: side.x + off.x, z: side.z + off.z, yaw: Math.PI / 2 - dir, phase: rand() * 6 });
        }
      }
    }
    if (plan.fort) {
      const p = at(r * 0.32, inward + 0.5);
      this.forts.push({ x: p.x, z: p.z, yaw: Math.PI / 2 - (inward + 0.5), large: plan.fort === "large" });
      // The navy's pennant flies over every fort.
      const flag = at(r * 0.45, inward - 0.4);
      batch.add(this.proto(PROPS.pennant), place(flag.x, 0.95, flag.z, rand() * Math.PI * 2, 1.5));
      top = Math.max(top, plan.fort === "large" ? 11 : 8);
    }
    const mesh = batch.build();
    if (mesh) {
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.shoals.push({ x: cx, z: cz, r: r * 0.92, top });
  }

  private reef(reef: { x: number; z: number; r: number; wreck?: boolean }, seed: number) {
    const rand = rng(5000 + seed * 31);
    const batch = new Batch();
    const rocks = [ISLAND.rocksA, ISLAND.rocksB, ISLAND.rocksC];
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const proto = this.proto(rocks[Math.floor(rand() * rocks.length)]);
      if (!proto) continue;
      const a = rand() * Math.PI * 2;
      const d = i === 0 ? 0 : reef.r * 0.55;
      const s = i === 0 ? 1.15 + rand() * 0.3 : 0.7 + rand() * 0.3;
      batch.add(proto, place(reef.x + Math.cos(a) * d, -1.1, reef.z + Math.sin(a) * d, rand() * Math.PI * 2, s));
    }
    if (reef.wreck) {
      const wreck = this.proto(PROPS.wreck);
      if (wreck) batch.add(wreck, place(reef.x + 6, -2.2, reef.z + 4, 0.8, 1, 1, 1, 0.12, 0.32));
    }
    const mesh = batch.build();
    if (mesh) {
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.shoals.push({ x: reef.x, z: reef.z, r: reef.r, top: 2.6 });
  }

  /** Buoys (every other one with a flag) mark the edge of the cove — instanced, one draw call per part. */
  private buildBuoys() {
    const count = 40;
    const kinds = [this.protos.get(PROPS.buoyFlag), this.protos.get(PROPS.buoy)];
    kinds.forEach((proto, kind) => {
      if (!proto) return;
      const places: { x: number; z: number; phase: number }[] = [];
      for (let i = kind; i < count; i += 2) {
        const a = (i / count) * Math.PI * 2;
        places.push({ x: Math.cos(a) * (ARENA + 6), z: Math.sin(a) * (ARENA + 6), phase: i * 1.7 });
      }
      const meshes = bake(proto).map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry.clone().applyMatrix4(part.matrix), part.material, places.length);
        mesh.castShadow = false;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return mesh;
      });
      this.buoys.push({ meshes, places });
    });
    this.update(0);
  }

  /** Bobs the floating props on the waves. */
  update(time: number) {
    for (const f of this.floaters) {
      const h = waveHeight(f.x, f.z);
      f.obj.position.set(f.x, h - 0.25, f.z);
      f.obj.rotation.set(Math.sin(time * 1.3 + f.phase) * 0.06, f.yaw + Math.sin(time * 0.4 + f.phase) * 0.15, Math.sin(time * 1.1 + f.phase) * 0.08, "YXZ");
    }
    for (const { meshes, places } of this.buoys) {
      places.forEach((b, i) => {
        const h = waveHeight(b.x, b.z);
        m4.compose(
          v3.set(b.x, h - 0.55, b.z),
          q.setFromEuler(e.set(Math.sin(time * 1.6 + b.phase) * 0.12, b.phase, Math.cos(time * 1.4 + b.phase) * 0.12, "YXZ")),
          BUOY_SCALE,
        );
        for (const mesh of meshes) mesh.setMatrixAt(i, m4);
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    for (const { meshes } of this.buoys) {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
  }
}
