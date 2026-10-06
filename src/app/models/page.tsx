import { Package } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { ModelGallery } from "@/components/model-gallery";
import { button, Eyebrow } from "@/components/ui";
import { CARD_PAGE } from "@/lib/card-pages";
import { allCollections, CATEGORIES, countBy, formatNumber, models, toCard, type Category } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: `Free 3D Models — ${formatNumber(models.length)} Characters, Vehicles, Buildings & More (GLB)`,
  description: `Browse ${formatNumber(models.length)} free 3D models: rigged characters, animals, cars, houses, furniture, food, nature, trees and space. Preview in 3D and download as GLB — free for personal and commercial use.`,
  path: "/models/",
});

export default function ModelsPage() {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, countBy(c)]));
  const collections = allCollections().map((c) => {
    const perCategory: Partial<Record<Category, number>> = {};
    for (const m of c.models) perCategory[m.category] = (perCategory[m.category] ?? 0) + 1;
    return { key: c.key, name: c.name, category: c.category, count: c.count, counts: perCategory };
  });
  const roles = [...new Set(models.filter((m) => m.role).map((m) => m.role as string))].sort();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Free 3D Models — ${SITE.name}`,
    url: absoluteUrl("/models/"),
    numberOfItems: models.length,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: models.length,
      itemListElement: models.slice(0, 100).map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/models/${m.slug}/`),
        name: m.title,
      })),
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <JsonLd data={jsonLd} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5 sm:mb-8">
        <div className="max-w-3xl space-y-3">
          <Eyebrow>Free catalog</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">All 3D models</h1>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            {formatNumber(models.length)} free 3D models in {collections.length} collections — God of War heroes, skeletons,
            bikes, gaming assets, rigged characters, animals, vehicles, and more. Preview in 3D and download instantly.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Bundle downloads are disabled"
          className={`${button.secondary} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Package className="size-4" /> Download packs
        </button>
      </header>
      <ModelGallery
        initial={models.slice(0, CARD_PAGE).map(toCard)}
        total={models.length}
        categories={CATEGORIES}
        counts={counts}
        collections={collections}
        roles={roles}
      />
    </div>
  );
}
