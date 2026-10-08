#!/usr/bin/env node
/**
 * Contact sheet of a frames folder (for checking captures): node scripts/promo/contact.mjs <dir> [count] [cols] [width]
 * Labels each still with its time (frame index / 60 − 0.5 s lead, i.e. scene time).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [dir, count = "12", cols = "4", width = "480", lead = "0.5"] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => /^\d+\.jpg$/.test(f)).sort();
const n = Math.min(Number(count), files.length);
const pick = Array.from({ length: n }, (_, i) => files[Math.round((i * (files.length - 1)) / Math.max(1, n - 1))]);
const w = Number(width);
const meta = await sharp(path.join(dir, pick[0])).metadata();
const h = Math.round((w * meta.height) / meta.width);
const c = Number(cols), rows = Math.ceil(n / c);
const tiles = await Promise.all(
  pick.map(async (f, i) => {
    const t = (parseInt(f, 10) / 60 - Number(lead)).toFixed(2);
    const label = Buffer.from(`<svg width="${w}" height="${h}"><rect x="0" y="0" width="76" height="24" fill="#000a"/><text x="6" y="17" font-size="15" font-family="Arial" fill="#fff">${t}s</text></svg>`);
    const img = await sharp(path.join(dir, f)).resize(w, h).composite([{ input: label, top: 0, left: 0 }]).toBuffer();
    return { input: img, top: Math.floor(i / c) * h, left: (i % c) * w };
  }),
);
const out = path.join(dir, "..", `${path.basename(dir)}-sheet.jpg`);
await sharp({ create: { width: w * c, height: h * rows, channels: 3, background: "#222" } }).composite(tiles).jpeg({ quality: 80 }).toFile(out);
console.log(out);
