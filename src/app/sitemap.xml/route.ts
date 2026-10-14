import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

/** Every indexable page with its preview image, written to src/data/sitemap.xml by scripts/build-sitemap.mjs. */
export function GET() {
  const xml = fs.readFileSync(path.join(process.cwd(), "src/data/sitemap.xml"), "utf8");
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
