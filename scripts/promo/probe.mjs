#!/usr/bin/env node
/**
 * Planning aid: screenshots live pages at a few scroll positions (real time, no virtual clock).
 *   node scripts/promo/probe.mjs /models/ 0,700,1400
 */
import fs from "node:fs";
import path from "node:path";
import { WORK, SITE, openBrowser, sleep, settleImages } from "./lib.mjs";

const out = path.join(WORK, "probe");
fs.mkdirSync(out, { recursive: true });
const [route = "/", ys = "0", wait = "4000"] = process.argv.slice(2);
const { page, close } = await openBrowser({ dpr: 1, virtual: false, pointer: false });
try {
  await page.goto(SITE + route, { waitUntil: "networkidle2", timeout: 90_000 });
  await sleep(Number(wait));
  const name = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  for (const y of ys.split(",").map(Number)) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await settleImages(page, 4000);
    await sleep(400);
    const file = path.join(out, `${name}-${y}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 70 });
    console.log(file);
  }
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log("page height", h);
} finally {
  await close();
}
