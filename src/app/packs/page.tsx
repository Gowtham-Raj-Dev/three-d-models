import { JsonLd } from "@/components/json-ld";
import { PackDownloads } from "@/components/pack-downloads";
import { Eyebrow } from "@/components/ui";
import { CATEGORY_INFO, formatBytes, formatNumber, packsByCategory } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, CODELOVE, SITE } from "@/lib/site";

const groups = packsByCategory();
const packCount = groups.reduce((n, g) => n + g.packs.length, 0);

export const metadata = pageMetadata({
  title: `Free 3D Model Packs — ${packCount} Downloadable GLB Collections (ZIP)`,
  description:
    "Download whole collections of free GLB 3D models at once: rigged characters, animations, cars, city kits, furniture, food, nature, trees and space packs — each a ZIP with GLB files and the license.",
  path: "/packs/",
  keywords: ["free glb models", "free 3d models glb", "free gltf models", "3D model packs ZIP", "rock model b bulk", "low poly 3D packs", "free game asset packs"],
});

export default function PacksPage() {
  const totalBytes = groups.reduce((n, g) => n + g.packs.reduce((m, p) => m + p.bytes, 0), 0);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Free 3D Model Packs — ${packCount} Collections`,
      url: absoluteUrl("/packs/"),
      description: metadata.description,
      creator: { "@id": `${SITE.authorUrl}/#person` },
      publisher: { "@id": `${CODELOVE.url}/#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Model packs", item: absoluteUrl("/packs/") },
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <JsonLd data={jsonLd} />
      <header className="mb-10 max-w-3xl space-y-3 sm:mb-12">
        <Eyebrow>Bulk download</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Model packs</h1>
        <p className="text-base leading-relaxed text-muted sm:text-lg">
          {formatNumber(packCount)} free packs ({formatBytes(totalBytes)} in total). Each one is a ZIP with every model in the
          collection as GLB, plus the license and an attribution file — built in your browser, so it starts instantly.
        </p>
      </header>

      <div className="space-y-14">
        {groups.map(({ category, packs }) => (
          <section key={category} id={category.toLowerCase()} className="scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{category}</h2>
              <p className="text-sm text-subtle">{CATEGORY_INFO[category].blurb}</p>
            </div>
            <PackDownloads packs={packs} />
          </section>
        ))}
      </div>
    </div>
  );
}
