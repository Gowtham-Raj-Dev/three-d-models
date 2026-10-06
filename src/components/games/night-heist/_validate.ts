import { LEVELS, parseLevel } from "./levels";
let bad = 0;
LEVELS.forEach((def, i) => {
  const widths = new Set(def.map.map((r) => r.length));
  const p = parseLevel(def, i);
  const g = p.grid;
  const errs: string[] = [];
  if (widths.size > 1) errs.push("row widths " + def.map.map((r, z) => z + ":" + r.length).join(" "));
  if (p.keys.length) for (const d of p.doors) { g.solid[g.idx(d.x, d.z)] = 0; }
  const reach = (tx: number, tz: number, thief = true) => g.path(p.start.x, p.start.z, tx, tz, { thief }) !== null;
  // Target pedestal: need an adjacent walkable cell
  const near = (x: number, z: number) => [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].some(([dx,dz]) => g.walkable(x+dx, z+dz, true) && Math.hypot(dx,dz) <= 1.5 && reach(x+dx, z+dz));
  if (!near(p.target.x, p.target.z)) errs.push("target unreachable");
  if (!reach(p.exit.inside.x, p.exit.inside.z)) errs.push("exit unreachable " + JSON.stringify(p.exit));
  for (const l of p.loot) if (l.plinth ? !near(l.x, l.z) : !reach(l.x, l.z)) errs.push("loot unreachable " + JSON.stringify(l));
  for (const k of p.keys) if (!reach(k.x, k.z)) errs.push("key unreachable " + JSON.stringify(k));
  def.guards.forEach((gd, gi) => gd.route.forEach((w) => { if (!g.walkable(w[0], w[1])) errs.push(`guard ${gi} point ${w} not walkable (${def.map[w[1]]?.[w[0]]})`); }));
  for (const c of def.cameras ?? []) if (def.map[c.z]?.[c.x] !== "#") errs.push(`camera ${c.x},${c.z} not on wall`);
  for (const t of p.torches) {}
  const torchCells = def.map.flatMap((r, z) => [...r].map((c, x) => (c === "i" ? `${x},${z}` : ""))).filter(Boolean);
  if (torchCells.length !== p.torches.length) errs.push("torch without wall: " + torchCells.filter((c) => !p.torches.some((t) => `${t.x},${t.z}` === c)).join(" "));
  console.log(`L${i + 1} ${def.name}: ${g.w}x${g.h} loot ${p.lootTotal} value ${p.valueTotal} torches ${p.torches.length} plates ${p.plates.length} doors ${p.doors.length} ${errs.length ? "\n  ERR " + errs.join("\n  ERR ") : "ok"}`);
  bad += errs.length;
});
process.exit(bad ? 1 : 0);
