/**
 * Closed roller-coaster circuits from the Coaster Kit, in kit units around the ride's centre (the
 * caller scales, turns and moves the result).
 *
 * Track pieces chain from their pivot, with the rails 1 unit below it:
 * - `straight` runs from (0,0) to (0,4);
 * - `straight-hill-complete` is a ramp: it climbs 1 unit over its 4, so a hill is a ramp up, raised
 *   track, then the same ramp turned around to come back down;
 * - `corner-large` turns left over a radius of 4 and ends at (-4,4) heading -X;
 * - `looping` has no length: it enters at its pivot and leaves 1 unit to the left at the same spot, so
 *   loopings go in pairs on opposite sides to keep the circuit closed.
 */

export type CoasterStyle = "steel" | "wood" | "mouse" | "flume" | "monorail";
export const COASTER_STYLES: CoasterStyle[] = ["steel", "wood", "mouse", "flume", "monorail"];

export interface CoasterPiece {
  /** Part name inside the Coaster Kit. */
  name: string;
  x: number;
  y: number;
  z: number;
  /** Yaw in radians. */
  yaw: number;
  /** Train cars: position in the train, 0 = front. */
  car?: number;
}

/** Radius of the running surface inside a looping, in units. */
const LOOP_RADIUS = 1.7;

const TRAIN: Record<CoasterStyle, { cars: string[]; y: number }> = {
  steel: { cars: ["coaster-train-front", "coaster-train", "coaster-train", "coaster-train"], y: 0.7 },
  wood: { cars: ["coaster-train-front", "coaster-train-wooden", "coaster-train-wooden", "coaster-train-wooden"], y: 0.7 },
  mouse: { cars: ["coaster-train-front", "coaster-train"], y: 0.9 },
  flume: { cars: ["train-log-flume", "train-log-flume"], y: 1 },
  monorail: { cars: ["train-monorail", "train-monorail", "train-monorail"], y: 0.8 },
};

type Kind = "straight" | "up" | "down" | "corner" | "looping";

const SHAPE: Record<Kind, { suffix: string; end: [number, number]; turn: number; rise: number }> = {
  straight: { suffix: "straight", end: [0, 4], turn: 0, rise: 0 },
  up: { suffix: "straight-hill-complete", end: [0, 4], turn: 0, rise: 1 },
  down: { suffix: "straight-hill-complete", end: [0, 4], turn: 0, rise: -1 },
  corner: { suffix: "corner-large", end: [-4, 4], turn: -Math.PI / 2, rise: 0 },
  looping: { suffix: "looping", end: [-1, 0], turn: 0, rise: 0 },
};

/** Rotates a local (x, z) offset by a yaw, the way three.js turns an object around Y. */
export function turn(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/** A run of `n` straight slots, with one hill (ramp up, raised track, ramp down) when it fits. */
function run(n: number, hill: boolean): Kind[] {
  if (!hill || n < 3) return Array<Kind>(n).fill("straight");
  return ["up", ...Array<Kind>(n - 2).fill("straight"), "down"];
}

/**
 * @param straights 4-unit slots along each long side (≥ 2; the first two hold the station)
 * @param across 4-unit slots along each short side, between the corners (≥ 0)
 * @param elevation track height in units (0 = on the ground)
 */
export function coasterCircuit(o: { style: CoasterStyle; straights: number; across: number; elevation: number; loops: boolean; hills: boolean }) {
  const N = Math.max(2, Math.round(o.straights));
  const M = Math.max(0, Math.round(o.across));
  const e = Math.max(0, Math.round(o.elevation));
  const W = 4 * M + 8;
  const L = 4 * N + 8;
  const trackY = 1 + e;
  const loops = o.loops && o.style !== "flume" && o.style !== "monorail";
  const pieces: CoasterPiece[] = [];
  /** Centre-line points, for the caller's footprint. */
  const path: [number, number][] = [];
  /** Where a car's pivot rides (on the rails), with the car's up direction: the train's route. */
  const route: [number, number, number][] = [];
  const ups: [number, number, number][] = [];
  const train = TRAIN[o.style];

  // Side A starts with the station (two flat slots); a looping follows it and another sits on side C.
  const sideA: Kind[] = ["straight", "straight", ...(loops ? (["looping"] as Kind[]) : []), ...run(N - 2, o.hills)];
  const sideC: Kind[] = [...(loops ? (["looping"] as Kind[]) : []), ...run(N, o.hills)];
  const circuit: Kind[] = [...sideA, "corner", ...run(M, o.hills && M >= 4), "corner", ...sideC, "corner", ...run(M, false), "corner"];

  let x = W / 2;
  let z = -L / 2 + 4;
  let yaw = 0;
  let level = 0;
  for (const kind of circuit) {
    const shape = SHAPE[kind];
    const [ex, ez] = turn(shape.end[0], shape.end[1], yaw);
    const name = `coaster-${o.style}-${shape.suffix}`;

    // The train's route through this piece (its end is the next piece's start).
    const rail = trackY + level - train.y;
    const ride = (lx: number, ly: number, lz: number, up: [number, number, number] = [0, 1, 0]) => {
      const [wx, wz] = turn(lx, lz, yaw);
      const [ux, uz] = turn(up[0], up[2], yaw);
      route.push([x + wx, ly, z + wz]);
      ups.push([ux, up[1], uz]);
    };
    if (kind === "corner") {
      for (let k = 0; k < 6; k++) {
        const phi = (k / 6) * (Math.PI / 2);
        ride(-4 + 4 * Math.cos(phi), rail, 4 * Math.sin(phi));
      }
    } else if (kind === "looping") {
      // Round the loop, drifting one lane to the left; the cars' up points at the loop's centre.
      for (let k = 0; k < 24; k++) {
        const theta = (k / 24) * Math.PI * 2;
        ride(-theta / (Math.PI * 2), rail + LOOP_RADIUS * (1 - Math.cos(theta)), LOOP_RADIUS * Math.sin(theta), [0, Math.cos(theta), -Math.sin(theta)]);
      }
    } else if (kind === "up" || kind === "down") {
      const sign = kind === "up" ? 1 : -1;
      for (let k = 0; k < 5; k++) ride(0, rail + (sign * (1 - Math.cos((k / 5) * Math.PI))) / 2, (k / 5) * 4);
    } else {
      ride(0, rail, 0);
    }
    if (kind === "down") {
      // The ramp turned around: its low end (pivot) at the end of the slot, one level down.
      pieces.push({ name, x: x + ex, y: trackY + level - 1, z: z + ez, yaw: yaw + Math.PI });
    } else {
      pieces.push({ name, x, y: trackY + level, z, yaw });
    }

    // Centre line (corners follow their arc; a looping's circle stands over its own lane change).
    const samples: [number, number][] =
      kind === "corner"
        ? [0.2, 0.5, 0.8].map((t) => [-4 + 4 * Math.cos((t * Math.PI) / 2), 4 * Math.sin((t * Math.PI) / 2)])
        : kind === "looping"
          ? [
              [-0.5, -1.5],
              [-0.5, 0],
              [-0.5, 1.5],
            ]
          : [0.125, 0.375, 0.625, 0.875].map((t) => [0, 4 * t]);
    for (const [lx, lz] of samples) {
      const [wx, wz] = turn(lx, lz, yaw);
      path.push([x + wx, z + wz]);
    }

    // Supports under raised track, reaching up to the lower end of ramps.
    const height = e + level + Math.min(0, shape.rise);
    if (height > 0 && kind !== "looping") {
      const [lx, lz] = kind === "corner" ? [-4 + 4 * Math.SQRT1_2, 4 * Math.SQRT1_2] : [0, 2];
      const [sx, sz] = turn(lx, lz, yaw);
      for (let h = 0; h < height; h++) pieces.push({ name: h === 0 ? "support-large-bottom" : "support-large", x: x + sx, y: h, z: z + sz, yaw });
    }

    x += ex;
    z += ez;
    yaw += shape.turn;
    level += shape.rise;
  }

  // Station floor under the first two slots, with the train waiting in it.
  const startX = W / 2;
  const startZ = -L / 2 + 4;
  for (let i = 0; i < 8; i++) pieces.push({ name: "station", x: startX, y: e, z: startZ + i + 0.5, yaw: 0 });
  train.cars.forEach((name, i) => pieces.push({ name, x: startX, y: trackY - train.y, z: startZ + TRAIN_HEAD - i * CAR_GAP, yaw: 0, car: i }));

  // Entrance and exit on the outside of the station, with a short queue leading to the entrance.
  pieces.push({ name: "ride-entrance", x: startX + 1.5, y: 0, z: startZ + 2, yaw: Math.PI / 2 });
  pieces.push({ name: "ride-exit", x: startX + 1.5, y: 0, z: startZ + 6, yaw: Math.PI / 2 });
  for (let i = 0; i < 4; i++) pieces.push({ name: "queue-straight", x: startX + 2.5 + i, y: 0, z: startZ + 2, yaw: Math.PI / 2 });

  // The route starts where side A does, so the train's head waits in the station at TRAIN_HEAD.
  return { pieces, path, route, ups: loops ? ups : null, station: TRAIN_HEAD, carGap: CAR_GAP };
}

/** Distance of the front car from the start of side A (inside the station), and between cars — in units. */
const TRAIN_HEAD = 6.6;
const CAR_GAP = 1.4;
