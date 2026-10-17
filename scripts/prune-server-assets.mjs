#!/usr/bin/env node
/**
 * Firebase App Hosting builds only (its adapter sets NEXT_PRIVATE_STANDALONE): removes public/ folders this server
 * never serves, so every rollout's container image (stored in Artifact Registry, billed per GB) is smaller.
 * - public/games: /games/* redirects to games.codelove.in (next.config.ts). The folder stays in the repo because the
 *   games site copies its assets from here (`npm run assets:sync` there).
 * The build runs in a throwaway checkout, so nothing in the repo changes. No-op for local builds.
 */
import fs from "node:fs";
import path from "node:path";

if (process.env.NEXT_PRIVATE_STANDALONE !== "true") process.exit(0);

for (const dir of ["games"]) {
  const full = path.resolve("public", dir);
  if (!fs.existsSync(full)) continue;
  fs.rmSync(full, { recursive: true, force: true });
  console.log(`prune-server-assets: removed public/${dir}`);
}
