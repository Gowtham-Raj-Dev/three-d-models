import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Download, Palette, ShieldCheck } from "lucide-react";
import { PackButton } from "@/components/download-button";
import { CustomizeOverlay } from "@/components/editor/customize-overlay";
import { JsonLd } from "@/components/json-ld";
import { ModelCard } from "@/components/model-card";
import { button } from "@/components/ui";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { asset } from "@/lib/asset";
import {
  animationsFor,
  catalog,
  CATEGORY_INFO,
  categorySlug,
  completePack,
  describeModel,
  formatBytes,
  formatNumber,
  getCollection,
  getModel,
  models,
  sourceOf,
  toCard,
  type ModelEntry,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return models.map((m) => ({ slug: m.slug }));
}

function seoTitle(m: ModelEntry) {
  return `${m.title} 3D Model — Free ${m.rigged ? "Rigged " : ""}GLB Download`;
}

function seoKeywords(m: ModelEntry): string[] {
  const name = m.title.toLowerCase();
  const singular = CATEGORY_INFO[m.category].singular;
  return [
    `${name} 3D model`,
    `${name} 3D model free`,
    `${name} GLB`,
    `${name} glTF`,
    m.rigged ? `rigged ${name}` : "",
    m.credit ? `${name} by ${m.credit.author}` : "",
    `free ${singular} 3D model`,
    `${m.collection} 3D models`,
    m.role ?? m.species ?? "",
    ...CATEGORY_INFO[m.category].keywords.slice(0, 2),
    "free 3D model download",
  ];
}

export async function generateMetadata({ params }: PageProps<"/models/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const model = getModel(slug);
  if (!model) return {};
  return {
    ...pageMetadata({
      title: seoTitle(model),
      description: `${describeModel(model)} Free download for personal and commercial use.`,
      path: `/models/${model.slug}/`,
      image: { url: model.og, alt: `${model.title} — free 3D model` },
      keywords: seoKeywords(model),
    }),
  };
}

function structuredData(model: ModelEntry) {
  const url = absoluteUrl(`/models/${model.slug}/`);
  const src = sourceOf(model);
  return [
    {
      "@context": "https://schema.org",
      "@type": "3DModel",
      name: model.title,
      description: describeModel(model),
      url,
      image: [...(model.thumb ? [absoluteUrl(model.thumb.src)] : []), absoluteUrl(model.og)],
      encoding: {
        "@type": "MediaObject",
        contentUrl: absoluteUrl(model.glb),
        encodingFormat: "model/gltf-binary",
        contentSize: formatBytes(model.glbBytes),
      },
      isAccessibleForFree: true,
      license: src.licenseUrl,
      ...(model.credit ? { creator: { "@type": "Person", name: model.credit.author, url: model.credit.authorUrl }, isBasedOn: model.credit.url } : {}),
      isPartOf: { "@type": "CollectionPage", name: model.collection, url: absoluteUrl(`/models/collection/${model.collectionKey}/`) },
      publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
      keywords: [model.category, model.collection, model.rigged ? "rigged" : "", "GLB", "glTF"].filter(Boolean).join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Models", item: absoluteUrl("/models/") },
        { "@type": "ListItem", position: 3, name: model.category, item: absoluteUrl(`/models/category/${categorySlug(model.category)}/`) },
        { "@type": "ListItem", position: 4, name: model.collection, item: absoluteUrl(`/models/collection/${model.collectionKey}/`) },
        { "@type": "ListItem", position: 5, name: model.title, item: url },
      ],
    },
  ];
}

function DownloadOption({
  title,
  detail,
  note,
  highlight = false,
  children,
}: {
  title: string;
  detail: string;
  note: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        highlight ? "border-accent/40 bg-accent/[0.07]" : "border-line bg-white/[0.02]"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{detail}</p>
        <p className="mt-0.5 text-[11px] text-subtle">{note}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export default async function ModelPage({ params }: PageProps<"/models/[slug]">) {
  const { slug } = await params;
  const model = getModel(slug);
  if (!model) notFound();

  const collection = getCollection(model.collectionKey)!;
  const siblings = collection.models;
  const index = siblings.indexOf(model);
  const prev = siblings[(index - 1 + siblings.length) % siblings.length];
  const next = siblings[(index + 1) % siblings.length];
  const animations = animationsFor(model);
  const idle = animations.find((a) => a.id.endsWith("idle_neutral_01")) ?? null;
  const related = [
    ...siblings.filter((m) => m !== model),
    ...models.filter((m) => m.category === model.category && m.collectionKey !== model.collectionKey),
  ].slice(0, 5);
  const [w, h, d] = model.stats.size;
  const biped = model.source === "mit" && model.kind === "human";
  const src = sourceOf(model);
  const textureSize = model.source === "mit" ? catalog.textureSize : null;

  const included = [
    `glTF 2.0 binary (.glb) — ${model.rigged ? "mesh, skeleton" : "mesh"}${model.stats.textures ? " and textures" : ""} in one file`,
    ...(model.stats.textures ? [`${model.stats.textures} texture${model.stats.textures === 1 ? "" : "s"} (WebP${textureSize ? `, ${textureSize} px` : ""})`] : []),
    ...(model.stats.bones ? [biped ? `${model.stats.bones}-bone Biped skeleton` : `${model.stats.bones}-bone skeleton`] : model.rigged ? ["Rigged skeleton"] : []),
    ...(biped ? [`Compatible with all ${animations.length} animation clips`] : []),
    `${src.licenseName} — embedded in the .glb, plus the license file in every .zip`,
  ];
  const complete = completePack(model);
  const sizeLabel = model.kind === "human" ? "Height" : "Size (w × h × d)";
  const sizeValue = model.kind === "human" ? `${h.toFixed(2)} m` : `${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6">
      <JsonLd data={structuredData(model)} />
      <nav className="mb-4 flex items-center gap-2 text-sm text-subtle sm:mb-5" aria-label="Breadcrumb">
        <Link href="/models/" className="hover:text-fg">
          Models
        </Link>
        <span>/</span>
        <Link href={`/models/category/${categorySlug(model.category)}/`} className="hover:text-fg">
          {model.category}
        </Link>
        <span className="hidden sm:inline">/</span>
        <Link href={`/models/collection/${model.collectionKey}/`} className="hidden truncate hover:text-fg sm:inline">
          {model.collection}
        </Link>
        <span>/</span>
        <span className="truncate text-muted">{model.title}</span>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_at_50%_35%,#1d1830_0%,#0c0b12_65%)]">
            <ModelViewer
              key={model.slug}
              glb={model.glb}
              title={model.title}
              poster={model.thumb?.src}
              animations={animations}
              defaultAnimation={idle?.id ?? null}
              azimuth={model.kind === "human" ? 0.25 : 0.75}
              customizeHref="#customize"
              className="h-[62vh] min-h-[420px] lg:h-[calc(100vh-7rem)] lg:max-h-[820px]"
            />
          </div>
          {siblings.length > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <Link href={`/models/${prev.slug}/`} className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-white/[0.05] hover:text-fg">
                <ChevronLeft className="size-4 shrink-0" /> <span className="truncate">{prev.title}</span>
              </Link>
              <span className="hidden text-xs text-subtle sm:block">
                {index + 1} / {siblings.length} in {collection.name}
              </span>
              <Link href={`/models/${next.slug}/`} className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-white/[0.05] hover:text-fg">
                <span className="truncate">{next.title}</span> <ChevronRight className="size-4 shrink-0" />
              </Link>
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">{model.category}</span>
              {model.rigged && <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">{biped ? "Rigged · Biped" : "Rigged"}</span>}
              {biped && <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">Animation-ready</span>}
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 font-medium text-emerald-300">{src.licenseShort}</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{model.title}</h1>
            <p className="text-muted">{model.subtitle}</p>
            <p className="leading-relaxed text-muted">{describeModel(model)}</p>
          </header>

          <section id="download" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">Free download</h2>
              <span className="text-xs text-subtle">No sign-up · commercial use allowed</span>
            </div>
            <ul className="mt-4 space-y-2.5">
              <DownloadOption title="Model only" detail={`Single .glb file · ${formatBytes(model.glbBytes)}`} note="License embedded in the file" highlight>
                <a href={asset(model.glb)} download={`${model.id}.glb`} className={`${button.primary} rounded-xl px-4 py-2`}>
                  <Download className="size-4" /> .glb
                </a>
              </DownloadOption>
              <DownloadOption title="Custom colors" detail="Recolor any part, then download your .glb" note="Opens with your colors in any 3D app">
                <a href="#customize" className={`${button.secondary} rounded-xl px-4 py-2`}>
                  <Palette className="size-4" /> Customize
                </a>
              </DownloadOption>
              <DownloadOption title={animations.length ? "Complete pack" : "Model + license"} detail={`.zip · ${formatBytes(complete.bytes)}`} note={complete.description}>
                <PackButton pack={complete} label=".zip" />
              </DownloadOption>
              {collection.count > 1 && (
                <DownloadOption
                  title={`${collection.name} pack`}
                  detail={`.zip · ${collection.count} models · ${formatBytes(collection.bytes)}`}
                  note="The whole collection in one archive"
                >
                  <PackButton manifest={`/data/packs/${collection.key}.json`} label=".zip" />
                </DownloadOption>
              )}
            </ul>
            <p className="mt-3 text-xs text-subtle">
              Need more?{" "}
              <Link href="/packs/" className="text-muted underline underline-offset-2 hover:text-fg">
                Browse all packs
              </Link>
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm text-muted">
              {included.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-surface/60 px-5 py-3">
            <h2 className="pt-2 pb-1 text-sm font-medium">Specifications</h2>
            <dl className="divide-y divide-line">
              <SpecRow label="Format" value="glTF 2.0 (.glb)" />
              <SpecRow label="Triangles" value={formatNumber(model.stats.triangles)} />
              <SpecRow label="Vertices" value={formatNumber(model.stats.vertices)} />
              {model.stats.bones ? <SpecRow label="Bones" value={String(model.stats.bones)} /> : null}
              <SpecRow label="Materials" value={String(model.stats.materials)} />
              <SpecRow label="Textures" value={textureSize ? `${model.stats.textures} × ${textureSize} px` : String(model.stats.textures)} />
              <SpecRow label={sizeLabel} value={sizeValue} />
              <SpecRow label="Collection" value={collection.name} />
              <SpecRow label="File size" value={formatBytes(model.glbBytes)} />
            </dl>
          </section>

          {biped && (
            <Link
              href="/animations/"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface/60 p-5 transition hover:border-line-strong"
            >
              <div>
                <h2 className="text-sm font-medium">{animations.length} animation clips included</h2>
                <p className="mt-1 text-xs text-muted">Idle, talk, wave, cheer, dance, walk, run and more — preview them above.</p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
            </Link>
          )}

          <section className="rounded-2xl border border-line bg-surface/60 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
              <div className="min-w-0 space-y-1">
                <h2 className="text-sm font-medium">{src.licenseName} · commercial use allowed</h2>
                <p className="text-xs leading-relaxed text-muted">
                  {src.terms}.{" "}
                  <Link href="/license/" className="text-fg underline underline-offset-2">
                    Licensing details
                  </Link>
                </p>
                {model.credit && (
                  <p className="text-xs leading-relaxed text-muted">
                    Original:{" "}
                    <a href={model.credit.url} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-2">
                      “{model.credit.title}”
                    </a>{" "}
                    by{" "}
                    <a href={model.credit.authorUrl} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-2">
                      {model.credit.author}
                    </a>
                    , <a href={src.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{src.licenseName}</a>
                  </p>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Mobile: keep the download one tap away while scrolling. */}
      <div data-mobile-dock className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{model.title}</p>
            <p className="text-xs text-subtle">Free · GLB · {formatBytes(model.glbBytes)}</p>
          </div>
          <a
            href="#customize"
            aria-label="Customize colors"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong text-muted transition hover:bg-white/[0.06] hover:text-fg"
          >
            <Palette className="size-4.5" />
          </a>
          <a href="#download" className={`${button.primary} rounded-xl`}>
            <Download className="size-4" /> Download
          </a>
        </div>
      </div>

      <CustomizeOverlay glb={model.glb} title={model.title} filename={model.id} note="The original license notice stays embedded in the file." />

      {related.length > 0 && (
        <section className="mt-20 sm:mt-24">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">More like this</h2>
            <Link href={`/models/collection/${collection.key}/`} className={button.ghost}>
              View collection <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {related.map((m) => (
              <ModelCard key={m.slug} model={toCard(m)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
