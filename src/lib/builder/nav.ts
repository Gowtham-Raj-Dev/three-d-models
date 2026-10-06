/**
 * Walkway graph for people who walk from place to place: path centre lines become edges, joined
 * where lines cross, where one ends on another (T-junctions) and across small gaps. Each place people
 * visit is linked to its nearest walkway, and routes follow the graph so nobody cuts across rides or
 * through buildings.
 */

export type XZ = [number, number];

export interface NavGraph {
  nodes: XZ[];
  edges: { to: number; w: number }[][];
  /** For each requested place: the walkway node next to it, or -1 when no walkway is near. */
  anchors: number[];
}

const dist = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Parameter (clamped to the segment) and distance of the point on segment a→b closest to p. */
function project(p: XZ, a: XZ, b: XZ): { t: number; d: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  return { t, d: Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]) };
}

/** Where segments a→b and c→d cross, as parameters along each, or null. */
function cross(a: XZ, b: XZ, c: XZ, d: XZ): [number, number] | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [t, u] : null;
}

export function buildNavGraph(segments: [XZ, XZ][], places: XZ[], o = { snap: 2.5, merge: 0.8, reach: 30 }): NavGraph {
  const segs = segments.filter(([a, b]) => dist(a, b) > 0.1);
  const splits = segs.map(() => [0, 1]);

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i];
      const [c, d] = segs[j];
      const x = cross(a, b, c, d);
      if (x) {
        splits[i].push(x[0]);
        splits[j].push(x[1]);
      }
      // One line ending on (or just short of) another: a T-junction.
      for (const p of [c, d]) {
        const hit = project(p, a, b);
        if (hit.d < o.snap) splits[i].push(hit.t);
      }
      for (const p of [a, b]) {
        const hit = project(p, c, d);
        if (hit.d < o.snap) splits[j].push(hit.t);
      }
    }
  }

  // Each place joins the walkway closest to it.
  const placeSpots: (XZ | null)[] = places.map((p) => {
    let best: { i: number; t: number; d: number } | null = null;
    segs.forEach(([a, b], i) => {
      const hit = project(p, a, b);
      if (hit.d < o.reach && (!best || hit.d < best.d)) best = { i, ...hit };
    });
    if (!best) return null;
    const { i, t } = best as { i: number; t: number };
    splits[i].push(t);
    const [a, b] = segs[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });

  // Nodes, merged when closer than `merge` (a spatial hash keeps this linear).
  const nodes: XZ[] = [];
  const grid = new Map<string, number[]>();
  const cell = (v: number) => Math.floor(v / o.merge);
  const nodeAt = (p: XZ): number => {
    const cx = cell(p[0]);
    const cz = cell(p[1]);
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let z = cz - 1; z <= cz + 1; z++) {
        for (const n of grid.get(`${x},${z}`) ?? []) if (dist(nodes[n], p) < o.merge) return n;
      }
    }
    nodes.push(p);
    const key = `${cx},${cz}`;
    grid.set(key, [...(grid.get(key) ?? []), nodes.length - 1]);
    return nodes.length - 1;
  };

  const edges: { to: number; w: number }[][] = [];
  const link = (u: number, v: number) => {
    if (u === v) return;
    while (edges.length < nodes.length) edges.push([]);
    if (edges[u].some((e) => e.to === v)) return;
    const w = dist(nodes[u], nodes[v]);
    edges[u].push({ to: v, w });
    edges[v].push({ to: u, w });
  };

  segs.forEach(([a, b], i) => {
    const ts = [...new Set(splits[i].map((t) => Math.round(t * 1e4) / 1e4))].sort((x, y) => x - y);
    let previous = -1;
    for (const t of ts) {
      const n = nodeAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      if (previous >= 0) link(previous, n);
      previous = n;
    }
  });
  while (edges.length < nodes.length) edges.push([]);

  // Bridge small gaps between lines that almost meet.
  for (let u = 0; u < nodes.length; u++) {
    for (let v = u + 1; v < nodes.length; v++) if (dist(nodes[u], nodes[v]) < o.snap) link(u, v);
  }

  return { nodes, edges, anchors: placeSpots.map((p) => (p ? nodeAt(p) : -1)) };
}

/** Dijkstra from one node: distances and the previous node on each shortest path. */
export function shortestPaths(g: NavGraph, source: number): { dist: Float64Array; prev: Int32Array } {
  const n = g.nodes.length;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  best[source] = 0;
  // Binary heap of [distance, node].
  const heap: [number, number][] = [[0, source]];
  const pushHeap = (item: [number, number]) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const popHeap = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = popHeap();
    if (d > best[u]) continue;
    for (const e of g.edges[u]) {
      const next = d + e.w;
      if (next < best[e.to]) {
        best[e.to] = next;
        prev[e.to] = u;
        pushHeap([next, e.to]);
      }
    }
  }
  return { dist: best, prev };
}

/** Node ids from the source of `prev` to `target` (empty when unreachable). */
export function walkBack(prev: Int32Array, source: number, target: number): number[] {
  const out: number[] = [];
  for (let n = target; n !== -1; n = prev[n]) {
    out.push(n);
    if (n === source) return out.reverse();
  }
  return [];
}

/** A closed loop shifted sideways by `d` metres (people keep to one side of the path). */
export function offsetLoop(points: XZ[], d: number): XZ[] {
  const n = points.length;
  if (n < 2 || !d) return points;
  return points.map((p, i) => {
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    // Right-hand normal of the direction of travel.
    return [p[0] - tz * d, p[1] + tx * d];
  });
}
