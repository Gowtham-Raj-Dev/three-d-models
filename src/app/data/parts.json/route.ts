import fs from "node:fs";
import path from "node:path";
import libraryData from "@/data/library.json";
import { allCollections, catalog, creditLine, models, SOURCES } from "@/lib/catalog";
import type { PartsIndex } from "@/lib/builder/types";

export const dynamic = "force-static";

/** Animation names from a .glb in /public (read from its JSON chunk only). */
function clipNames(glb: string): string[] {
  try {
    const file = fs.readFileSync(path.join(process.cwd(), "public", glb));
    const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString("utf8")) as { animations?: { name?: string }[] };
    return (json.animations ?? []).map((a) => a.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/** Every model as a scene-builder part, plus the collection, license and animation data the builder needs. */
export function GET() {
  // Library parts that carry their own clips (low-poly characters, animated doors, chests…).
  const animated = new Set(
    (libraryData as unknown as { models: { id: string; stats: { animations?: number } }[] }).models.filter((m) => (m.stats.animations ?? 0) > 0).map((m) => m.id),
  );
  const collectionSource = new Map(allCollections().map((c) => [c.key, c.source]));
  const index: PartsIndex = {
    collections: Object.fromEntries(
      allCollections().map((c) => [c.key, { name: c.name, category: c.category, source: c.source, count: c.count }]),
    ),
    sources: Object.fromEntries(
      Object.values(SOURCES).map((s) => [
        s.key,
        { licenseName: s.licenseName, licenseShort: s.licenseShort, terms: s.terms, copyright: s.copyright, licenseFile: s.licenseFile },
      ]),
    ) as PartsIndex["sources"],
    clips: catalog.animations.map((a) => ({ id: a.id, label: a.label, set: a.set, file: a.file })),
    parts: models.map((m) => {
      const thumb = m.thumb?.src;
      const clips = animated.has(m.id) ? clipNames(m.glb) : [];
      return {
        id: m.id,
        slug: m.slug,
        title: m.title,
        c: m.collectionKey,
        glb: m.glb,
        // Most thumbnails sit next to the model; only send the path when it differs.
        ...(thumb && thumb !== m.glb.replace(/\.glb$/, ".webp") ? { thumb } : {}),
        ...(thumb ? {} : { noThumb: true }),
        size: m.stats.size.map((n) => Math.round(n * 100) / 100) as [number, number, number],
        tri: m.stats.triangles,
        ...(m.animationSet || animated.has(m.id) ? { anim: true as const } : {}),
        // The AI scene generator maps actions ("walk", "dance"…) onto these names.
        ...(clips.length ? { clips } : {}),
        ...(m.animationSet ? { set: m.animationSet } : {}),
        ...(m.source !== collectionSource.get(m.collectionKey) ? { src: m.source } : {}),
        ...(m.credit ? { credit: creditLine(m.credit) } : {}),
      };
    }),
  };
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } });
}
