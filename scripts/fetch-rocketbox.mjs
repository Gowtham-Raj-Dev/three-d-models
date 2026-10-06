#!/usr/bin/env node
/**
 * Pulls the Microsoft Rocketbox repository into vendor/Microsoft-Rocketbox using a shallow,
 * blob-less, sparse clone. The full repo is ~24 GB on disk (mostly 2K TGA textures and 3ds Max
 * sources); this only downloads what the website build needs (~8 GB):
 *   - every avatar / animal FBX (not the *_facial variants), its preview PNG and its
 *     colour / normal / opacity textures
 *   - the curated animation clips listed in build-models.mjs
 *   - LICENSE.md and README.md
 *
 * Re-running the script pulls the latest upstream commit.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "vendor", "Microsoft-Rocketbox");
const REPO = "https://github.com/microsoft/Microsoft-Rocketbox.git";

const ANIMATIONS = [
  "all_animations_max_motextr_static/?_idle_neutral_01.max.fbx",
  "all_animations_max_motextr_static/?_idle_look_around_01.max.fbx",
  "all_animations_max_motextr_static/?_gestic_talk_neutral_01.max.fbx",
  "all_animations_max_motextr_static/?_gestic_thoughtful_01.max.fbx",
  "all_animations_max_motextr_static/?_wave_01.max.fbx",
  "all_animations_max_motextr_static/?_cheer_01.max.fbx",
  "all_animations_max_motextr_static/?_claphands_01.max.fbx",
  "all_animations_max_motextr_static/?_dancing_neutral.max.fbx",
  "all_animations_max_motextr_xy/?_walk_neutral_01.max.fbx",
  "all_animations_max_motextr_xy/?_run_neutral_01.max.fbx",
];

const SPARSE = [
  "/LICENSE.md",
  "/README.md",
  "/Docs/AvatarsSample.jpg",
  "/Assets/Avatars/*/*/*.png",
  "/Assets/Avatars/*/*/Export/*.fbx",
  "!/Assets/Avatars/*/*/Export/*_facial.fbx",
  "/Assets/Avatars/*/*/Textures/*.tga",
  "!/Assets/Avatars/*/*/Textures/*specular*",
  "!/Assets/Avatars/*/*/Textures/*wrinkle*",
  "/Assets/Animals/*/*.png",
  "/Assets/Animals/*/Export/*.fbx",
  "/Assets/Animals/*/Textures/*.tga",
  "!/Assets/Animals/*/Textures/*specular*",
  ...ANIMATIONS.map((a) => `/Assets/Animations/${a}`),
];

function git(args, cwd = DEST) {
  console.log(`$ git ${args.join(" ")}`);
  const res = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

if (!fs.existsSync(path.join(DEST, ".git"))) {
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  git(["clone", "--filter=blob:none", "--no-checkout", "--depth", "1", "--branch", "master", REPO, DEST], ROOT);
  git(["sparse-checkout", "init", "--no-cone"]);
} else {
  git(["fetch", "--depth", "1", "origin", "master"]);
}

fs.writeFileSync(path.join(DEST, ".git", "info", "sparse-checkout"), SPARSE.join("\n") + "\n");
console.log("Downloading model files — this can take a while (several GB)…");
git(["checkout", "-B", "master", "origin/master"]);
console.log(`Done. Rocketbox source is in ${path.relative(ROOT, DEST)}. Next: npm run models:build`);
