#!/usr/bin/env node
/**
 * Pushes the folders made by `npm run pages:split` to their GitHub Pages repos. A single push of several hundred MB
 * gets cut off ("curl 55 Send failure"), so changes go up in commits of ~20 MB, one push each, retried on failure.
 * Safe to re-run after a failure: it carries on from the last pushed commit.
 *
 *   npm run pages:push                          → all three repos
 *   npm run pages:push -- repo-models           → just that one
 *   npm run pages:push -- --fresh               → drop the old history first (keeps the repos small)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ORG = "codelove-models";
const REPOS = { "repo-main": `${ORG}.github.io`, "repo-library": "library", "repo-models": "models" };
const BATCH = 20 * 1024 ** 2;
const TRIES = 5;

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const only = args.filter((a) => !a.startsWith("--"));
const folders = only.length ? only : Object.keys(REPOS);

function git(cwd, gitArgs, input) {
  return execFileSync("git", gitArgs, { cwd, input, stdio: ["pipe", "pipe", "inherit"], encoding: "utf8", maxBuffer: 1024 ** 3 });
}

function push(dir) {
  for (let i = 1; ; i++) {
    try {
      git(dir, ["-c", "http.version=HTTP/1.1", "push", "-q", "--force", "origin", "main"]);
      return;
    } catch (err) {
      if (i === TRIES) throw err;
      console.log(`  push failed, retrying (${i}/${TRIES - 1})…`);
      execFileSync(process.execPath, ["-e", `setTimeout(()=>{}, ${i * 5000})`]);
    }
  }
}

for (const folder of folders) {
  const dir = path.resolve(folder);
  if (!(folder in REPOS) || !fs.existsSync(dir)) throw new Error(`push-pages: unknown or missing folder ${folder}`);

  if (fresh || !fs.existsSync(path.join(dir, ".git"))) {
    fs.rmSync(path.join(dir, ".git"), { recursive: true, force: true });
    git(dir, ["init", "-q", "-b", "main"]);
  }
  git(dir, ["config", "core.autocrlf", "false"]);
  const url = `https://github.com/${ORG}/${REPOS[folder]}.git`;
  if (git(dir, ["remote"]).includes("origin")) git(dir, ["remote", "set-url", "origin", url]);
  else git(dir, ["remote", "add", "origin", url]);

  // Commits left unpushed by an earlier, interrupted run go up first.
  const hasCommits = git(dir, ["rev-list", "--count", "--all"]).trim() !== "0";
  if (hasCommits) push(dir);

  // Everything added, changed or deleted since the last commit, in path order.
  const changed = git(dir, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"])
    .split("\0")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .sort();

  const batches = [[]];
  let used = 0;
  for (const rel of changed) {
    const full = path.join(dir, rel);
    const size = fs.existsSync(full) ? fs.statSync(full).size : 0;
    if (used + size > BATCH && batches.at(-1).length) {
      batches.push([]);
      used = 0;
    }
    batches.at(-1).push(rel);
    used += size;
  }
  if (!changed.length) batches.length = 0;

  console.log(`${folder} → ${REPOS[folder]}: ${changed.length} changed file(s) in ${batches.length} push(es)`);
  batches.forEach((batch, i) => {
    git(dir, ["add", "-A", "--pathspec-from-file=-"], batch.join("\n"));
    git(dir, ["commit", "-q", "-m", `Site build (${i + 1}/${batches.length})`]);
    push(dir);
    console.log(`  pushed ${i + 1}/${batches.length}`);
  });
}
