import { SceneBuilder } from "@/components/builder/scene-builder";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Free 3D Scene Builder — Export GLB",
  description:
    "Build your own 3D scenes in the browser from thousands of free parts: haunted backyards, graveyards, campsites and more. Place, move, rotate, scale, animate, then download one .glb with lights and animations.",
  path: "/builder/",
});

export default function BuilderPage() {
  return (
    <>
      <h1 className="sr-only">3D Scene Builder</h1>
      <SceneBuilder />
    </>
  );
}
