import { TextLink, TextList, TextPage, TextSection } from "@/components/text-page";
import { allCollections, CATEGORIES, clipGroups, countBy, formatNumber, models, SOURCES, type SourceKey } from "@/lib/catalog";
import { games } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";
import { CODELOVE, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "About This Free 3D Model Library",
  description: `What ${SITE.name} is and who makes it: ${formatNumber(models.length)} free, openly licensed 3D models converted to ready-to-use GLB files, with a 3D viewer, a scene builder and browser games.`,
  path: "/about/",
});

/** What each license group holds, in the words of /license/ — that page has the terms themselves. */
const HOLDS: Record<SourceKey, string> = {
  mit: "the rigged human characters and animals, and every animation clip",
  cc0: "vehicles, buildings, furniture, food, nature, props and stylized characters",
  "public-domain": "spacecraft, rovers, satellites, planets and astronaut gear",
  "cc-by": "hairstyles by Sketchfab artists, who ask to be credited",
  "cc-by-nd": "hairstyles by Sketchfab artists, who ask to be credited and to have their work shared unmodified",
};

export default function AboutPage() {
  const collections = allCollections().length;
  const categories = CATEGORIES.filter((c) => countBy(c) > 0).length;
  const playable = games.filter((g) => !g.comingSoon).length;
  const licenses = (Object.keys(SOURCES) as SourceKey[])
    .map((key) => ({ key, name: SOURCES[key].licenseName, count: models.filter((m) => m.source === key).length }))
    .filter((l) => l.count > 0);

  return (
    <TextPage
      eyebrow="About"
      title="A free 3D model library, made to be used."
      intro={
        <>
          {SITE.name} is a free library of {formatNumber(models.length)} 3D models. Preview any of them in real-time 3D in your
          browser and download it as a GLB file — no account, no payment, and free to use in personal and commercial projects.
        </>
      }
    >
      <TextSection title="What you can do here">
        <TextList>
          <li>
            <TextLink href="/models/">Browse the library</TextLink> — {formatNumber(models.length)} models in {collections} collections
            and {categories} categories, from rigged characters and animals to vehicles, buildings, furniture, food, nature and
            space. Every model has its own page with a live 3D preview, its triangle count and size, and its license.
          </li>
          <li>
            <TextLink href="/packs/">Download whole packs</TextLink> — each collection as one .zip with the license and an
            attribution file, put together in your browser.
          </li>
          <li>
            <TextLink href="/animations/">Animate the characters</TextLink> — {clipGroups().length} motion clips, each in a female
            and a male version, that play on the rigged human characters.
          </li>
          <li>
            <TextLink href="/viewer/">Open your own GLB</TextLink> — inspect a file, recolor its parts and download it again,
            without uploading it anywhere.
          </li>
          <li>
            <TextLink href="/builder/">Build a scene</TextLink> — place models from the library in 3D, animate them and export the
            whole scene as one GLB.
          </li>
          <li>
            <TextLink href="/games/">Play the games</TextLink> — {playable} free 3D games made with models from the library.
          </li>
          <li>
            <TextLink href="/developers/">Use it from code</TextLink> — every model has a direct .glb URL that loads from any
            website, and the whole catalog is available as llms.txt and JSON for scripts and AI agents.
          </li>
        </TextList>
      </TextSection>

      <TextSection title="Where the models come from">
        <p>
          We did not make these models. They are the work of their original authors, published under open licenses that let
          anyone use and share them — commercially too. We bring those collections together in one place and keep each
          model&apos;s license with it:
        </p>
        <TextList>
          {licenses.map((l) => (
            <li key={l.key}>
              <span className="text-fg">{l.name}</span> — {formatNumber(l.count)} {l.count === 1 ? "model" : "models"}: {HOLDS[l.key]}.
            </li>
          ))}
        </TextList>
        <p>
          Each model page shows its exact license, and every download carries it — inside the .glb file and as a text file in
          each .zip. The terms themselves, and how to credit an author, are on the{" "}
          <TextLink href="/license/">Licensing</TextLink> page.
        </p>
        <p>
          The site is independent: it is not affiliated with or endorsed by any model creator. If you made one of these models
          and its credit or license is wrong, or you want it taken down, <TextLink href="/contact/">tell us</TextLink>.
        </p>
      </TextSection>

      <TextSection title="What we add">
        <p>A model here is more than a copy of its original download. Each one is:</p>
        <TextList>
          <li>converted to a single glTF 2.0 binary file (.glb) with its textures inside, so there are no loose texture folders;</li>
          <li>optimized for real-time use — WebP textures and meshopt geometry compression keep the downloads small;</li>
          <li>stamped with its license, and with its author&apos;s credit where the license asks for one, in the file&apos;s own metadata;</li>
          <li>rendered to a preview image and measured, so its page lists triangles, materials, textures and size.</li>
        </TextList>
      </TextSection>

      <TextSection title="Who makes it">
        <p>
          The site and its games are designed and built by {SITE.author}. The 3D viewer, the scene builder and the games run on
          three.js, in your browser.
        </p>
        <p>
          {SITE.name} is part of <TextLink href={CODELOVE.url}>{CODELOVE.name}</TextLink>, together with{" "}
          {CODELOVE.tools.map((tool, i) => (
            <span key={tool.url}>
              {i > 0 && (i === CODELOVE.tools.length - 1 ? " and " : ", ")}
              <TextLink href={tool.url}>{tool.name}</TextLink>
            </span>
          ))}
          .
        </p>
      </TextSection>

      <TextSection title="Questions and policies">
        <p>
          For questions, corrections and removal requests, see <TextLink href="/contact/">Contact</TextLink> or write to{" "}
          <TextLink href={`mailto:${SITE.email}`}>{SITE.email}</TextLink>. How the site handles data is explained in the{" "}
          <TextLink href="/privacy/">Privacy Policy</TextLink>, and the rules for using it are in the{" "}
          <TextLink href="/terms/">Terms of Use</TextLink>.
        </p>
      </TextSection>
    </TextPage>
  );
}
