import * as THREE from "three";
import type { Motion, MotionStop, Vec3 } from "@/lib/builder/types";

/**
 * Plays a `Motion`: where an item is at a given time, which way it faces and whether it is waiting at
 * a stop. The editor samples it every frame; the exporter samples it into keyframes, so a .glb plays
 * exactly what the editor shows.
 */
export class MotionSampler {
  /** Loop length in metres. */
  readonly length: number;
  /** Seconds for one loop, waits included. */
  readonly duration: number;
  readonly stops: MotionStop[];
  private readonly points: THREE.Vector3[];
  private readonly ups: THREE.Vector3[] | null;
  /** Distance along the loop at each point; the last entry closes the loop back to point 0. */
  private readonly cumulative: number[];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();

  constructor(
    readonly motion: Motion,
    anchor: Vec3,
  ) {
    this.points = motion.path.map((p) => new THREE.Vector3(p[0] + anchor[0], p[1] + anchor[1], p[2] + anchor[2]));
    this.ups = motion.ups?.length === motion.path.length ? motion.ups.map((u) => new THREE.Vector3(...u).normalize()) : null;
    this.cumulative = [0];
    for (let i = 0; i < this.points.length; i++) {
      const next = this.points[(i + 1) % this.points.length];
      this.cumulative.push(this.cumulative[i] + this.points[i].distanceTo(next));
    }
    this.length = Math.max(this.cumulative[this.cumulative.length - 1], 1e-3);
    this.stops = (motion.stops ?? []).filter((s) => s.at >= 0 && s.at < this.length).sort((x, y) => x.at - y.at);
    const waits = this.stops.reduce((n, s) => n + s.wait, 0);
    this.duration = this.length / Math.max(motion.speed, 1e-3) + waits;
  }

  /** Distance along the loop of the lead point at time t, and the stop being waited at (-1 = moving). */
  progress(t: number): { s: number; stop: number } {
    const speed = Math.max(this.motion.speed, 1e-3);
    const tau = (((t + (this.motion.phase ?? 0)) % this.duration) + this.duration) % this.duration;
    let s = 0;
    let time = 0;
    for (let i = 0; i < this.stops.length; i++) {
      const stop = this.stops[i];
      const travel = (stop.at - s) / speed;
      if (tau < time + travel) return { s: s + (tau - time) * speed, stop: -1 };
      time += travel;
      s = stop.at;
      if (tau < time + stop.wait) return { s, stop: i };
      time += stop.wait;
    }
    return { s: Math.min(s + (tau - time) * speed, this.length), stop: -1 };
  }

  private segment(s: number): [number, number] {
    const d = ((s % this.length) + this.length) % this.length;
    let lo = 0;
    let hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const span = this.cumulative[lo + 1] - this.cumulative[lo];
    return [lo, span > 1e-6 ? (d - this.cumulative[lo]) / span : 0];
  }

  point(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const [i, t] = this.segment(s);
    return out.lerpVectors(this.points[i], this.points[(i + 1) % this.points.length], t);
  }

  private up(s: number, out: THREE.Vector3): THREE.Vector3 {
    if (!this.ups) return out.set(0, 1, 0);
    const [i, t] = this.segment(s);
    return out.lerpVectors(this.ups[i], this.ups[(i + 1) % this.ups.length], t).normalize();
  }

  /**
   * The pose at time t, written into `position` / `quaternion`. `offset` is the item's own rotation,
   * applied on top of the direction of travel. Returns whether the item is waiting at a stop.
   */
  pose(t: number, position: THREE.Vector3, quaternion: THREE.Quaternion, offset: THREE.Quaternion): boolean {
    const { s: lead, stop } = this.progress(t);
    const s = lead - (this.motion.lag ?? 0);
    this.point(s, position);
    const look = stop >= 0 ? this.stops[stop].look : undefined;

    if (this.motion.orient === "full") {
      // Coaster cars: forward along the track, up as the track says (upside down at the top of a loop).
      const forward = this.point(s + 0.5, this.a).sub(this.point(s - 0.5, this.b)).normalize();
      const up = this.up(s, this.b);
      const side = new THREE.Vector3().crossVectors(up, forward);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      side.normalize();
      up.crossVectors(forward, side);
      this.m.makeBasis(side, up, forward);
      quaternion.setFromRotationMatrix(this.m);
    } else {
      // People and vehicles: upright, looking slightly ahead so corners turn smoothly; at a stop they
      // face whatever they came to see.
      let dx: number;
      let dz: number;
      if (look) {
        dx = look[0] - position.x;
        dz = look[1] - position.z;
      } else {
        const ahead = this.point(s + 0.9, this.a);
        const behind = this.point(s - 0.3, this.b);
        dx = ahead.x - behind.x;
        dz = ahead.z - behind.z;
      }
      quaternion.setFromAxisAngle(Y_AXIS, Math.atan2(dx, dz));
    }
    quaternion.multiply(offset);
    return stop >= 0;
  }

  /** Waiting / moving spans over one loop, as [start, end, waiting] in seconds. */
  spans(step = 0.05): [number, number, boolean][] {
    const out: [number, number, boolean][] = [];
    if (!this.stops.length) return [[0, this.duration, false]];
    let start = 0;
    let waiting = this.progress(0).stop >= 0;
    for (let t = step; t < this.duration; t += step) {
      const now = this.progress(t).stop >= 0;
      if (now !== waiting) {
        out.push([start, t, waiting]);
        start = t;
        waiting = now;
      }
    }
    out.push([start, this.duration, waiting]);
    return out;
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Position + rotation keyframes for one loop of a motion, bound to the node with this uuid. */
export function motionClip(sampler: MotionSampler, uuid: string, offset: THREE.Quaternion, name: string): THREE.AnimationClip {
  const fps = sampler.motion.orient === "full" ? 20 : 8;
  const count = Math.max(2, Math.ceil(sampler.duration * fps));
  const times: number[] = [];
  const positions: number[] = [];
  const rotations: number[] = [];
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const previous = new THREE.Quaternion();
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * sampler.duration;
    sampler.pose(t, p, q, offset);
    // Keep neighbouring keys in the same hemisphere so interpolation never spins the long way round.
    if (i > 0 && previous.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    previous.copy(q);
    times.push(t);
    positions.push(p.x, p.y, p.z);
    rotations.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.AnimationClip(name, sampler.duration, [
    new THREE.VectorKeyframeTrack(`${uuid}.position`, times, positions),
    new THREE.QuaternionKeyframeTrack(`${uuid}.quaternion`, times, rotations),
  ]);
}

/**
 * One clip for a character that walks and stops: the walk clip while it moves, the stop clip (idle,
 * cheer…) while it waits, looped inside each span — glTF has no way to switch clips at run time.
 * `rest` gives a bone's rest value for tracks one of the clips doesn't animate.
 */
export function spliceClips(
  move: THREE.AnimationClip,
  stop: THREE.AnimationClip,
  spans: [number, number, boolean][],
  duration: number,
  rest: (trackName: string) => number[] | null,
  name: string,
): THREE.AnimationClip {
  const names = new Set([...move.tracks, ...stop.tracks].map((t) => t.name));
  const tracks: THREE.KeyframeTrack[] = [];
  for (const trackName of names) {
    const template = move.tracks.find((t) => t.name === trackName) ?? stop.tracks.find((t) => t.name === trackName)!;
    const times: number[] = [];
    const values: number[] = [];
    const push = (t: number, v: ArrayLike<number>) => {
      if (times.length && t <= times[times.length - 1] + 1e-4) return;
      times.push(t);
      for (let k = 0; k < v.length; k++) values.push(v[k]);
    };
    for (const [start, end, waiting] of spans) {
      const clip = waiting ? stop : move;
      const track = clip.tracks.find((t) => t.name === trackName);
      const length = end - start;
      if (!track) {
        const value = rest(trackName);
        if (value) {
          push(start, value);
          push(end - 1e-3, value);
        }
        continue;
      }
      const interpolant = (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
      const d = Math.max(clip.duration, 1e-3);
      const at = (local: number) => interpolant.evaluate(local % d);
      push(start, at(0));
      for (let loop = 0; loop * d < length; loop++) {
        for (const key of track.times) {
          const local = key + loop * d;
          if (local > 0 && local < length - 2e-3) push(start + local, at(key));
        }
      }
      push(end - 1e-3, at(Math.max(0, length - 1e-3)));
    }
    if (!times.length) continue;
    const Track = template.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    tracks.push(new Track(trackName, times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}
