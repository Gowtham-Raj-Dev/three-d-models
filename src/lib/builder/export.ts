import { packAttributionFile } from "@/lib/attribution";
import type { SourceKey } from "@/lib/catalog";
import type { Part, PartsIndex, SceneDoc } from "@/lib/builder/types";
import { buildZip } from "@/lib/zip";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "scene"
  );
}

export interface SceneCredits {
  /** Each library model used, once. */
  parts: { id: string; title: string; source: SourceKey; credit?: string }[];
  sources: SourceKey[];
  /** One line per license: "License: <license>. <terms>." */
  notice: string[];
  /** Short line for the glTF asset.copyright field. */
  copyright: string;
}

export function sceneCredits(doc: SceneDoc, parts: Map<string, Part>, sources: PartsIndex["sources"]): SceneCredits {
  const used = new Map<string, Part>();
  for (const item of doc.items) {
    const part = item.part ? parts.get(item.part) : undefined;
    if (part) used.set(part.id, part);
  }
  const list = [...used.values()].map((p) => ({ id: p.id, title: p.title, source: p.source, ...(p.credit ? { credit: p.credit } : {}) }));
  const keys = [...new Set(list.map((p) => p.source))];
  const notice = keys.map((k) => `License: ${sources[k].licenseName}. ${sources[k].terms}.`);
  return {
    parts: list,
    sources: keys,
    notice,
    copyright: keys.length ? `Scene built from parts under: ${keys.map((k) => sources[k].copyright).join(" ")}` : "",
  };
}

/** The project file: the scene document plus the current camera, ready to reopen in the builder. */
export function projectJson(doc: SceneDoc): string {
  return JSON.stringify(doc, null, 2);
}

export async function buildScenePack({
  doc,
  glb,
  preview,
  credits,
  sources,
  site,
}: {
  doc: SceneDoc;
  glb: ArrayBuffer;
  preview: Blob | null;
  credits: SceneCredits;
  sources: PartsIndex["sources"];
  site: string;
}): Promise<Blob> {
  const slug = slugify(doc.name);
  const licenses = credits.sources.map((k) => ({
    url: sources[k].licenseFile,
    path: credits.sources.length === 1 ? "LICENSE.txt" : `LICENSE-${sources[k].licenseShort.replace(/\W+/g, "-")}.txt`,
  }));
  const readme = [
    `${doc.name} — scene pack`,
    "",
    `${slug}.glb`,
    "  The whole scene as one glTF 2.0 binary: every part with its position, rotation and scale,",
    "  point lights (KHR_lights_punctual) and one animation per animated character.",
    "  Opens in Blender, three.js, Babylon.js, Unity (glTFast), Godot, and online glTF viewers.",
    "",
    `${slug}.scene.json`,
    "  The editable project. Open it in the Scene Builder to keep working on the scene.",
    "",
    ...(preview ? ["preview.png", "  A render of the scene.", ""] : []),
    "Parts come from free, permissively licensed libraries — see ATTRIBUTION.txt and the license file(s).",
    "",
  ].join("\n");

  return buildZip(licenses, [
    { path: `${slug}.glb`, content: new Uint8Array(glb) },
    { path: `${slug}.scene.json`, content: projectJson(doc) },
    ...(preview ? [{ path: "preview.png", content: new Uint8Array(await preview.arrayBuffer()) }] : []),
    { path: "README.txt", content: readme },
    {
      path: "ATTRIBUTION.txt",
      content: packAttributionFile({ name: `${doc.name} — scene built with the Scene Builder`, items: credits.parts, notice: credits.notice, site }),
    },
  ]);
}
