#!/usr/bin/env node
/**
 * Copies the standalone Patti Veedu game (pattyveedu-game/PattiVeedu-Project/game) into
 * public/games/patti-veedu/app/, where /games/patti-veedu/play/ frames it. Only what the game loads is
 * copied: index.html, three.js, js/, fonts/ and the licence notices (not assets-src/ or tests/).
 * The copy is marked noindex: search engines should land on /games/patti-veedu/, not the bare game.
 *
 *   npm run patti:sync        (after changing the game)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "pattyveedu-game", "PattiVeedu-Project", "game");
const OUT = path.join(ROOT, "public", "games", "patti-veedu", "app");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of ["three.min.js", "THIRD_PARTY.txt"]) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
for (const dir of ["js", "fonts"]) fs.cpSync(path.join(SRC, dir), path.join(OUT, dir), { recursive: true });
const html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
fs.writeFileSync(path.join(OUT, "index.html"), html.replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\">\n<meta name=\"robots\" content=\"noindex\">"));

let bytes = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk(OUT);
console.log(`patti-veedu: copied to ${path.relative(ROOT, OUT)} (${(bytes / 1048576).toFixed(1)} MB)`);
