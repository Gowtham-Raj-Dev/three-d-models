#!/usr/bin/env node
/**
 * Splits the static export (`out/`) into three folders, one per GitHub Pages repo, because one Pages site
 * may be at most 1 GB and `out/` is ~2.9 GB:
 *
 *   repo-main/     → <org>.github.io repo, custom domain models.codelove.in   (everything else)
 *   repo-library/  → "library" repo  → served at models.codelove.in/library/
 *   repo-models/   → "models" repo   → served at models.codelove.in/models/
 *
 * Every repo in a GitHub organization whose <org>.github.io site has a custom domain is served under that
 * domain at /<repo-name>/, so the URLs stay exactly as they are today. Only repo-main gets the CNAME.
 *
 * All three must be pushed from the same build: the model pages load their JS from /_next/ in repo-main,
 * and those file names change on every build.
 *
 * Run after `npm run build`:  npm run pages:split
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("out");
const LIMIT = 1024 ** 3;

// Folders that leave repo-main: library/ and models/ get their own repos; games/ moved to games.codelove.in.
const REPOS = { library: "repo-library", models: "repo-models" };
const DROPPED = new Set(["games"]);
// Category and collection pages stay ordinary router pages; only the ~6,800 model pages lose their payloads.
const MODEL_SUBPAGES = new Set(["category", "collection"]);

// GitHub Pages can't redirect, so the old /games/… URLs are sent to games.codelove.in by the 404 page.
const GAMES_REDIRECT = `<script>(function(){var p=location.pathname;if(!/^\\/games(\\/|$)/.test(p))return;var r=p.replace(/^\\/games\\/?/,"");location.replace("https://games.codelove.in/"+(/\\.[a-z0-9]+$/i.test(r)?"games/"+r:r?r.replace(/\\/?$/,"/"):""));})();</script>`;

if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.error("split-pages: out/ has no build — run `npm run build` first.");
  process.exit(1);
}

/** Empties a repo folder but keeps its .git, so it stays the same local clone between builds. */
function reset(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (name !== ".git") fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function size(dir) {
  let bytes = 0;
  let files = 0;
  for (const e of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || e.parentPath.split(path.sep).includes(".git")) continue;
    bytes += fs.statSync(path.join(e.parentPath, e.name)).size;
    files++;
  }
  return { bytes, files };
}

const main = path.resolve("repo-main");
reset(main);
for (const name of fs.readdirSync(OUT)) {
  if (name in REPOS || DROPPED.has(name)) continue;
  fs.cpSync(path.join(OUT, name), path.join(main, name), { recursive: true });
}
const notFound = fs.readFileSync(path.join(OUT, "404.html"), "utf8");
fs.writeFileSync(path.join(main, "404.html"), notFound.replace("<head>", `<head>${GAMES_REDIRECT}`));

for (const [folder, repo] of Object.entries(REPOS)) {
  const dir = path.resolve(repo);
  reset(dir);
  fs.cpSync(path.join(OUT, folder), dir, { recursive: true });
  // Without .nojekyll GitHub drops files starting with "_" (the router's __next.*.txt files).
  fs.writeFileSync(path.join(dir, ".nojekyll"), "");
  // A project repo serves its own 404 for missing paths under /<repo>/.
  fs.writeFileSync(path.join(dir, "404.html"), notFound);
}

let removed = 0;
const modelsDir = path.resolve(REPOS.models);
for (const e of fs.readdirSync(modelsDir, { withFileTypes: true })) {
  if (!e.isDirectory() || MODEL_SUBPAGES.has(e.name)) continue;
  for (const file of fs.readdirSync(path.join(modelsDir, e.name))) {
    if (file.endsWith(".txt")) {
      fs.rmSync(path.join(modelsDir, e.name, file));
      removed++;
    }
  }
}
console.log(`split-pages: removed ${removed} router payload file(s) from the model pages`);

let tooBig = false;
for (const repo of ["repo-main", ...Object.values(REPOS)]) {
  const { bytes, files } = size(path.resolve(repo));
  const over = bytes > LIMIT;
  tooBig ||= over;
  console.log(`  ${repo.padEnd(13)} ${(bytes / 1024 ** 2).toFixed(0).padStart(5)} MB  ${String(files).padStart(6)} files${over ? "  ← over GitHub Pages' 1 GB limit" : ""}`);
}
if (tooBig) process.exit(1);
