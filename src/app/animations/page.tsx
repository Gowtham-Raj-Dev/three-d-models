import Link from "next/link";
import { AnimationStudio } from "@/components/animation-studio";
import { JsonLd } from "@/components/json-ld";
import { Eyebrow } from "@/components/ui";
import { animationsPack, clipGroups, getModelById, models } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Free 3D Character Animations (GLB) — Idle, Walk, Run, Dance",
  description:
    "Free motion clips for rigged 3D characters: idle, look around, talk, thoughtful, wave, cheer, clap, dance, walk and run — each in a female and male version. Preview live in 3D and download as GLB.",
  path: "/animations/",
});

const USAGE = `import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const character = await loader.loadAsync("Female_Adult_01.glb");
const { animations } = await loader.loadAsync("f_wave_01.glb");

const mixer = new THREE.AnimationMixer(character.scene);
mixer.clipAction(animations[0]).play();
// in your render loop: mixer.update(deltaSeconds);`;

export default function AnimationsPage() {
  const groups = clipGroups();
  const female = getModelById("Female_Adult_01") ?? models.find((m) => m.gender === "female")!;
  const male = getModelById("Male_Adult_01") ?? models.find((m) => m.gender === "male")!;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Free 3D character animations",
    url: absoluteUrl("/animations/"),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: groups.length,
      itemListElement: groups.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: `${g.label} animation` })),
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <JsonLd data={jsonLd} />
      <header className="mb-8 max-w-3xl space-y-3 sm:mb-10">
        <Eyebrow>Animation library</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Free animations</h1>
        <p className="text-base leading-relaxed text-muted sm:text-lg">
          {groups.length} motion clips, each in a female and male version. Pick a clip to preview it live, then download it.
          Clips also play on every character page in the{" "}
          <Link href="/models/" className="text-fg underline underline-offset-4">
            catalog
          </Link>
          .
        </p>
      </header>

      <AnimationStudio
        groups={groups}
        pack={animationsPack()}
        avatars={{
          f: { glb: female.glb, title: female.title, thumb: female.thumb?.src ?? null },
          m: { glb: male.glb, title: male.title, thumb: male.thumb?.src ?? null },
        }}
      />

      <section className="mt-20 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          <Eyebrow>How to use</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight">Play a clip on any character</h2>
          <p className="leading-relaxed text-muted">
            Clips are skeleton-only glTF files for the 3ds Max Biped rig. Because the adult characters share the same bone
            names, you can load a character and a clip separately and play one on the other. Child characters name their
            root bone <span className="font-mono text-fg">Bip02</span> instead of{" "}
            <span className="font-mono text-fg">Bip01</span>, so rename the track targets when using them.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-surface p-5 font-mono text-xs leading-relaxed text-muted">{USAGE}</pre>
      </section>
    </div>
  );
}
