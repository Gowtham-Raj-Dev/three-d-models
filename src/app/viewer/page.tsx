import Link from "next/link";
import { GlbUpload, type SampleModel } from "@/components/editor/glb-upload";
import { Eyebrow } from "@/components/ui";
import { getModelById, type ModelEntry } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Free GLB Viewer — Preview, Recolor & Download glTF Models",
  description:
    "Open any .glb file in your browser: preview it in real-time 3D, play its animations, check triangles, materials and textures, recolor its parts and download the edited GLB. Nothing is uploaded.",
  path: "/viewer/",
});

const SAMPLES = ["nature-kit-tree_default", "car-kit-police", "character-pack-adventures-Knight"];

export default function ViewerPage() {
  const samples: SampleModel[] = SAMPLES.map(getModelById)
    .filter((m): m is ModelEntry => !!m)
    .map((m) => ({ glb: m.glb, title: m.title, filename: m.id, thumb: m.thumb?.src ?? null }));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-8 max-w-3xl space-y-3">
        <Eyebrow>GLB viewer</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Open your own GLB</h1>
        <p className="text-base leading-relaxed text-muted sm:text-lg">
          Drop a .glb to see it in 3D, play its animations and inspect its stats. Click any part to recolor it, then download
          the edited file. Draco, meshopt and KTX2-compressed files are supported. Want a model to start from? Browse the{" "}
          <Link href="/models/" className="text-fg underline underline-offset-4">
            free library
          </Link>
          .
        </p>
      </header>
      <GlbUpload samples={samples} />
    </div>
  );
}
