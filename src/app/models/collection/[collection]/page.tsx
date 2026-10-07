import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { ModelCard } from "@/components/model-card";
import { button, Eyebrow } from "@/components/ui";
import { allCollections, CATEGORY_INFO, categorySlug, formatBytes, formatNumber, getCollection, SOURCES, toCard } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

/**
 * Landing page per collection (/models/collection/<key>/): links every model in it, so each model page
 * is two clicks from the home page, and ranks for the kit's own name.
 */

export const dynamicParams = false;

/** Models shown as cards; the rest of a big kit are listed as plain links. */
const CARDS = 120;

export function generateStaticParams() {
  return allCollections().map((c) => ({ collection: c.key }));
}

export async function generateMetadata({ params }: PageProps<"/models/collection/[collection]">): Promise<Metadata> {
  const { collection: key } = await params;
  const c = getCollection(key);
  if (!c) return {};
  const info = CATEGORY_INFO[c.category];
  const licenses = c.sources.map((s) => SOURCES[s].licenseShort).join(" / ");
  // Name its most detailed models: a kit's first entries are often small parts like "Box" or "Cone".
  const names = [...c.models].sort((a, b) => b.stats.triangles - a.stats.triangles).slice(0, 4).map((m) => m.title).join(", ");
  return pageMetadata({
    title: `${c.name} — ${formatNumber(c.count)} Free 3D ${c.count === 1 ? "Model" : "Models"} (GLB)`,
    description: `${c.name}: ${formatNumber(c.count)} free ${info.singular} 3D ${c.count === 1 ? "model" : "models"} (${licenses}) including ${names}. Preview in 3D and download GLB — free for commercial use.`,
    path: `/models/collection/${c.key}/`,
    image: { url: `/og/category-${categorySlug(c.category)}.jpg`, alt: `${c.name} — free 3D models` },
    keywords: [`${c.name} 3D models`, `${c.name} GLB`, `${c.name} free download`, `free ${info.singular} 3D models`, ...info.keywords.slice(0, 3), "free 3D models", "glTF"],
  });
}

export default async function CollectionPage({ params }: PageProps<"/models/collection/[collection]">) {
  const { collection: key } = await params;
  const c = getCollection(key);
  if (!c) notFound();
  const info = CATEGORY_INFO[c.category];
  const cards = c.models.slice(0, CARDS);
  const rest = c.models.slice(CARDS);
  const url = absoluteUrl(`/models/collection/${c.key}/`);
  const authors = [...new Map(c.models.filter((m) => m.credit).map((m) => [m.credit!.author, m.credit!])).values()];
  const related = allCollections().filter((o) => o.category === c.category && o.key !== c.key);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${c.name} — free 3D models`,
            url,
            numberOfItems: c.count,
            isPartOf: { "@type": "CollectionPage", name: c.category, url: absoluteUrl(`/models/category/${categorySlug(c.category)}/`) },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: c.count,
              itemListElement: c.models.slice(0, 100).map((m, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/models/${m.slug}/`), name: m.title })),
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
              { "@type": "ListItem", position: 2, name: "Models", item: absoluteUrl("/models/") },
              { "@type": "ListItem", position: 3, name: c.category, item: absoluteUrl(`/models/category/${categorySlug(c.category)}/`) },
              { "@type": "ListItem", position: 4, name: c.name, item: url },
            ],
          },
        ]}
      />

      <nav className="mb-5 flex items-center gap-2 text-sm text-subtle" aria-label="Breadcrumb">
        <Link href="/models/" className="hover:text-fg">
          Models
        </Link>
        <span>/</span>
        <Link href={`/models/category/${categorySlug(c.category)}/`} className="hover:text-fg">
          {c.category}
        </Link>
        <span>/</span>
        <span className="truncate text-muted">{c.name}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl space-y-3">
          <Eyebrow>Collection</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{c.name}</h1>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            {formatNumber(c.count)} free {info.singular} 3D {c.count === 1 ? "model" : "models"} · {formatBytes(c.bytes)} in total ·{" "}
            {c.sources.map((s) => SOURCES[s].licenseName).join(" / ")}. Open any model to preview it in 3D, recolor it and download the GLB.
          </p>
          {authors.length > 0 && (
            <p className="text-sm text-muted">
              Original {authors.length === 1 ? "author" : "authors"}:{" "}
              {authors.map((a, i) => (
                <span key={a.author}>
                  {i > 0 && ", "}
                  <a href={a.authorUrl} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-2">
                    {a.author}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
        <Link href={`/models/?collection=${encodeURIComponent(c.name)}`} className={button.secondary}>
          <SlidersHorizontal className="size-4" /> Search &amp; filter
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {cards.map((m, i) => (
          <ModelCard key={m.slug} model={toCard(m)} priority={i < 5} />
        ))}
      </div>

      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted">
            {formatNumber(rest.length)} more in {c.name}
          </h2>
          <ul className="columns-2 gap-6 text-sm sm:columns-3 lg:columns-4">
            {rest.map((m) => (
              <li key={m.slug} className="break-inside-avoid py-1">
                <Link href={`/models/${m.slug}/`} className="text-muted hover:text-fg">
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-3 text-sm font-medium text-muted">More {c.category} collections</h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((o) => (
              <li key={o.key}>
                <Link
                  href={`/models/collection/${o.key}/`}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-fg"
                >
                  {o.name} <span className="text-xs text-subtle tabular-nums">{formatNumber(o.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
