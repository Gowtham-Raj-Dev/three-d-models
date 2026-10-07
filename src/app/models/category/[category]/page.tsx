import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { ModelCard } from "@/components/model-card";
import { button, Eyebrow } from "@/components/ui";
import {
  allCollections,
  CATEGORIES,
  CATEGORY_INFO,
  categoryFromSlug,
  categorySlug,
  formatNumber,
  models,
  SOURCES,
  toCard,
  type Category,
  type ModelEntry,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

/**
 * Landing page per category (/models/category/<slug>/): a crawlable, server-rendered page for searches
 * like "free car 3D models", linking every collection in the category and a spread of its models.
 */

export const dynamicParams = false;

/** Cards shown on the page; the rest are a click away in the collections or the gallery. */
const SHOWN = 60;

const inCategory = (category: Category) => models.filter((m) => m.category === category);

export function generateStaticParams() {
  return CATEGORIES.filter((c) => inCategory(c).length > 0).map((c) => ({ category: categorySlug(c) }));
}

/** The category inside a sentence: lower case, except the God of War name. */
const noun = (category: Category) => (category === "God of War" ? category : category.toLowerCase());

export async function generateMetadata({ params }: PageProps<"/models/category/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return {};
  const count = inCategory(category).length;
  const info = CATEGORY_INFO[category];
  return pageMetadata({
    title: `Free ${category} 3D Models — ${formatNumber(count)} GLB Downloads`,
    description: `Download ${formatNumber(count)} free ${noun(category)} 3D models: ${info.blurb}. Preview in 3D, download GLB in one click — free for personal and commercial use.`,
    path: `/models/category/${slug}/`,
    image: { url: `/og/category-${slug}.jpg`, alt: `Free ${category} 3D models` },
    keywords: [...info.keywords, `free ${noun(category)} 3D models`, `${info.singular} 3D model`, `${info.singular} GLB`, "free 3D models", "glTF"],
  });
}

/** A spread of models: round-robin across the category's collections so one big kit doesn't fill the page. */
function spread(list: ModelEntry[], count: number): ModelEntry[] {
  const byCollection = new Map<string, ModelEntry[]>();
  for (const m of list) byCollection.set(m.collectionKey, [...(byCollection.get(m.collectionKey) ?? []), m]);
  const queues = [...byCollection.values()];
  const picks: ModelEntry[] = [];
  for (let i = 0; picks.length < count && picks.length < list.length; i++) {
    for (const q of queues) if (q[i] && picks.length < count) picks.push(q[i]);
  }
  return picks;
}

export default async function CategoryPage({ params }: PageProps<"/models/category/[category]">) {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const list = inCategory(category);
  const info = CATEGORY_INFO[category];
  const collections = allCollections()
    .map((c) => ({ ...c, here: c.models.filter((m) => m.category === category).length }))
    .filter((c) => c.here > 0)
    .sort((a, b) => b.here - a.here);
  const shown = spread(list, SHOWN);
  const licenses = [...new Set(list.map((m) => m.source))].map((s) => SOURCES[s].licenseShort);
  const rigged = list.filter((m) => m.rigged).length;
  const url = absoluteUrl(`/models/category/${slug}/`);
  const others = CATEGORIES.filter((c) => c !== category && inCategory(c).length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `Free ${category} 3D Models`,
            description: info.blurb,
            url,
            numberOfItems: list.length,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: list.length,
              itemListElement: shown.map((m, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/models/${m.slug}/`), name: m.title })),
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
              { "@type": "ListItem", position: 2, name: "Models", item: absoluteUrl("/models/") },
              { "@type": "ListItem", position: 3, name: category, item: url },
            ],
          },
        ]}
      />

      <nav className="mb-5 flex items-center gap-2 text-sm text-subtle" aria-label="Breadcrumb">
        <Link href="/models/" className="hover:text-fg">
          Models
        </Link>
        <span>/</span>
        <span className="text-muted">{category}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl space-y-3">
          <Eyebrow>Category</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Free {category} 3D models</h1>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            {formatNumber(list.length)} free {noun(category)} models in {collections.length}{" "}
            {collections.length === 1 ? "collection" : "collections"}: {info.blurb}.
            {rigged > 0 && ` ${formatNumber(rigged)} of them are rigged.`} Preview each one in real-time 3D and download it as a single GLB file
            ({licenses.join(", ")}).
          </p>
        </div>
        <Link href={`/models/?category=${encodeURIComponent(category)}`} className={button.secondary}>
          <SlidersHorizontal className="size-4" /> Search &amp; filter
        </Link>
      </header>

      <section aria-labelledby="collections" className="mb-10">
        <h2 id="collections" className="mb-3 text-sm font-medium text-muted">
          Collections
        </h2>
        <ul className="flex flex-wrap gap-2">
          {collections.map((c) => (
            <li key={c.key}>
              <Link
                href={`/models/collection/${c.key}/`}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-fg"
              >
                {c.name} <span className="text-xs text-subtle tabular-nums">{formatNumber(c.here)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {shown.map((m, i) => (
          <ModelCard key={m.slug} model={toCard(m)} priority={i < 5} />
        ))}
      </div>
      {list.length > shown.length && (
        <div className="mt-8 flex justify-center">
          <Link href={`/models/?category=${encodeURIComponent(category)}`} className={button.primary}>
            See all {formatNumber(list.length)} {noun(category)} models <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      <section className="mt-16 rounded-2xl border border-line bg-surface/60 p-5 sm:p-6">
        <h2 className="font-medium">About these {noun(category)} models</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every {info.singular} model here is a glTF 2.0 binary (.glb) with its textures inside, ready for three.js, Babylon.js, Unity, Unreal,
          Godot, Blender and AR/VR. They are free for personal and commercial projects — the license travels inside each file, and models that
          ask for credit name their author on the model page.{" "}
          <Link href="/license/" className="text-fg underline underline-offset-2">
            Licensing details
          </Link>
        </p>
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-sm font-medium text-muted">More categories</h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((c) => (
            <li key={c}>
              <Link
                href={`/models/category/${categorySlug(c)}/`}
                className="inline-block rounded-full border border-line px-3.5 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-fg"
              >
                {c} 3D models
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
