import Link from "next/link";
import { ArrowRight, Bone, Boxes, Check, Gauge, Plus, ShieldCheck } from "lucide-react";
import { HeroShowcase, type HeroItem } from "@/components/hero-showcase";
import { JsonLd } from "@/components/json-ld";
import { ModelCard } from "@/components/model-card";
import { PackDownloads } from "@/components/pack-downloads";
import { button, Eyebrow, SectionHeader } from "@/components/ui";
import { asset } from "@/lib/asset";
import {
  allCollections,
  animationsFor,
  catalog,
  CATEGORIES,
  CATEGORY_INFO,
  categoryShowcase,
  categorySlug,
  clipGroups,
  countBy,
  featuredPacks,
  formatBytes,
  formatNumber,
  getModelById,
  models,
  riggedCount,
  toCard,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: `${SITE.name} — ${formatNumber(models.length)} Free 3D Models: Characters, Cars, Buildings & More (GLB)`,
  description: SITE.description,
  path: "/",
  absoluteTitle: true,
});

/** Models in the hero picker, with the clip each character plays. */
const HERO = [
  { id: "god-of-war-spartan-warrior", clip: "atk01" },
  { id: "god-of-war-kratos-gow4", clip: null },
  { id: "character-pack-skeletons-Skeleton_Warrior", clip: null },
  { id: "bikes-cyberpunk-motorbike", clip: null },
  { id: "gaming-combat-soldier", clip: null },
  { id: "Business_Female_01", clip: "gestic_talk_neutral_01" },
  { id: "car-kit-police", clip: null },
];
const FEATURED_IDS = [
  "god-of-war-kratos-gow4",
  "god-of-war-spartan-warrior",
  "god-of-war-blade-of-olympus",
  "god-of-war-ragnarok-mjolnir",
  "god-of-war-blades-of-chaos-detailed",
  "character-pack-skeletons-Skeleton_Warrior",
  "bikes-cyberpunk-motorbike",
  "gaming-combat-soldier",
  "bikes-chopper-motorcycle",
  "Business_Female_01",
];

const FEATURES = [
  {
    icon: Boxes,
    title: "One big library",
    text: "Rigged people, animals, vehicles, buildings, furniture, food, nature, trees and space — all in one searchable catalog.",
  },
  {
    icon: Bone,
    title: "Rigged & animated",
    text: "Every human character has a full Biped skeleton and plays ten motion clips right in the browser.",
  },
  {
    icon: Gauge,
    title: "Real-time optimized",
    text: "Single-file GLB with WebP textures and meshopt compression — small downloads, ready for games and the web.",
  },
  {
    icon: ShieldCheck,
    title: "Free for commercial use",
    text: "Every model is MIT, CC0, public domain or CC BY (credit the author). The license travels inside each file and every zip.",
  },
];

const FAQ = [
  {
    q: "Are the models really free?",
    a: "Yes. Every model, pack and animation clip can be downloaded for free, with no sign-up, and used in personal and commercial projects.",
  },
  {
    q: "What do I get when I download a model?",
    a: "Either the single .glb file (glTF 2.0 binary with geometry, skeleton and textures embedded and the license in its metadata), or a .zip pack with the models, a license file and ATTRIBUTION.txt.",
  },
  {
    q: "What licenses do the models use?",
    a: "The rigged characters and animation clips are MIT licensed (keep the copyright notice that comes with them). Most other models are CC0 (public domain, no credit required), and the spacecraft, rover and planet models are public domain. Every model page shows its license.",
  },
  {
    q: "Can I use them in games, apps, films or client work?",
    a: "Yes — commercial use, modification and redistribution are allowed under all of these licenses.",
  },
  {
    q: "Which tools can open the files?",
    a: "Any glTF 2.0 tool or engine that supports the EXT_meshopt_compression and EXT_texture_webp extensions — for example three.js and Babylon.js. The files are optimized for real-time and web use.",
  },
  {
    q: "How do the animation clips work?",
    a: "Each clip is a skeleton-only .glb for the Biped rig used by the human characters. Adults share the same bone names (Bip01 …), so any clip plays on any adult; the child characters name their root Bip02.",
  },
];

export default function Home() {
  const heroItems: HeroItem[] = HERO.flatMap(({ id, clip }) => {
    const m = getModelById(id);
    if (!m) return [];
    const clips = animationsFor(m);
    const playing = clip ? (clips.find((a) => a.id.endsWith(clip)) ?? null) : null;
    return [
      {
        slug: m.slug,
        title: m.title,
        glb: m.glb,
        thumb: m.thumb?.src ?? null,
        animations: clips,
        clip: playing?.id ?? null,
        clipLabel: playing?.label ?? null,
        azimuth: m.kind === "human" ? -0.35 : 0.85,
        facts: [
          `${formatNumber(m.stats.triangles)} triangles`,
          ...(m.stats.bones ? [`${m.stats.bones} bones`] : []),
          `GLB · ${formatBytes(m.glbBytes)}`,
          m.kind === "human" && clips.length ? `${clips.length} animations` : m.category,
        ],
      },
    ];
  });
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const featured = FEATURED_IDS.map(getModelById).filter((m) => m !== undefined);
  const categoryTiles = CATEGORIES.map((c) => ({ category: c, count: countBy(c), model: categoryShowcase(c, 1)[0] })).filter((t) => t.count > 0);
  const clips = clipGroups();
  const collectionCount = allCollections().length;

  const stats = [
    { value: formatNumber(models.length), label: "Free 3D models" },
    { value: formatNumber(collectionCount), label: "Collections" },
    { value: formatNumber(riggedCount), label: "Rigged characters & animals" },
    { value: formatNumber(catalog.animations.length), label: "Animation clips" },
    { value: formatNumber(categoryTiles.length), label: "Categories" },
  ];

  return (
    <>
      <JsonLd data={faqJsonLd} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-fade pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 pt-6 sm:px-6 sm:pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-10">
          <div className="relative z-10 space-y-6 sm:space-y-7">
            <Link href="/models/" className="glass inline-flex max-w-full items-center gap-2 rounded-full py-1 pr-3 pl-1 text-xs text-muted transition-colors hover:text-fg">
              <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-300">100% free</span>
              <span className="truncate">
                {formatNumber(models.length)} models · {formatNumber(collectionCount)} collections · {catalog.animations.length} animations
              </span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
            <h1 className="text-[2.6rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]">
              Free 3D models, <span className="text-gradient">ready for production.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-pretty text-muted sm:text-lg">
              God of War heroes, skeletons, bikes, gaming assets, rigged characters, vehicles, buildings and more — {formatNumber(models.length)}{" "}
              free models you can preview in real-time 3D and download as GLB in one click. Free for personal and commercial use.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/builder/" className={button.primary}>
                <Boxes className="size-4" /> Open the Scene Builder
              </Link>
              <Link href="/models/" className={button.secondary}>
                Browse {formatNumber(models.length)} free models <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm text-muted sm:flex sm:flex-wrap">
              {["GLB / glTF 2.0", "Rigged characters", "Commercial use", "No sign-up"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 shrink-0 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <HeroShowcase items={heroItems} />
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5">
            {stats.map((s, i) => (
              <div key={s.label} className={`bg-bg/90 px-5 py-4 sm:py-5 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
                <dt className="text-xs text-subtle">{s.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <SectionHeader
          eyebrow="Why these models"
          title="Built for games, XR, film previs and the web."
          description="A wide range of people, places and things — all in one format that drops straight into real-time pipelines."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface/60 p-6">
              <span className="grid size-10 place-items-center rounded-xl border border-line bg-white/[0.04] text-violet-200">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <SectionHeader
          eyebrow="Categories"
          title="Find exactly what you need."
          action={
            <Link href="/models/" className={button.ghost}>
              All models <ArrowRight className="size-4" />
            </Link>
          }
        />
        {/* The double-width first tile lets the 11 categories fill whole rows at 2 and 4 columns. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {categoryTiles.map((c, i) => (
            <Link
              key={c.category}
              href={`/models/category/${categorySlug(c.category)}/`}
              className={`group relative overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-line-strong ${i === 0 ? "col-span-2" : ""}`}
            >
              <div className="relative h-36 overflow-hidden sm:h-52 bg-[radial-gradient(ellipse_at_50%_100%,#221d33_0%,#0d0d13_70%)]">
                {c.model?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset(c.model.thumb.src)}
                    alt=""
                    loading="lazy"
                    className="absolute bottom-0 left-1/2 h-[88%] w-auto max-w-[90%] -translate-x-1/2 object-contain transition duration-500 group-hover:scale-[1.04]"
                  />
                ) : null}
                <div className="absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-surface to-transparent" />
              </div>
              <div className="flex items-end justify-between gap-3 px-3.5 pt-1 pb-4 sm:px-5 sm:pb-5">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium sm:text-base">{c.category}</h3>
                  <p className="mt-0.5 hidden text-xs text-muted sm:block">{CATEGORY_INFO[c.category].blurb}</p>
                </div>
                <span className="shrink-0 text-xs text-subtle transition-colors group-hover:text-fg">{formatNumber(c.count)} →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <SectionHeader
          eyebrow="Popular"
          title="Popular picks"
          action={
            <Link href="/models/" className={button.ghost}>
              View all {models.length} models <ArrowRight className="size-4" />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {featured.map((m) => (
            <ModelCard key={m.id} model={toCard(m)} />
          ))}
        </div>
      </section>

      {/* Packs */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <SectionHeader
          eyebrow="Bulk download"
          title="Grab a whole pack."
          description="Whole collections and every animation clip — one .zip each, with the license included."
          action={
            <Link href="/packs/" className={button.ghost}>
              All {formatNumber(collectionCount + 1)} packs <ArrowRight className="size-4" />
            </Link>
          }
        />
        <PackDownloads packs={featuredPacks()} />
      </section>

      {/* Animations */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_at_0%_0%,rgb(139_92_246/0.18),transparent_55%),radial-gradient(ellipse_at_100%_100%,rgb(34_211_238/0.12),transparent_55%)] p-8 sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div className="space-y-5">
              <Eyebrow>Animations</Eyebrow>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bring them to life.</h2>
              <p className="max-w-lg leading-relaxed text-muted">
                {clips.length} motion clips — from idle and conversation to dancing, walking and running — each in a
                female and male version. Preview them on any character and download them as skeleton-only GLB.
              </p>
              <Link href="/animations/" className={button.primary}>
                Explore animations <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {clips.map((c) => (
                <li key={c.key}>
                  <Link
                    href={`/animations/?clip=${c.key}`}
                    className="flex items-center justify-between rounded-xl border border-line bg-black/20 px-4 py-3 text-sm transition hover:border-line-strong hover:bg-white/[0.04]"
                  >
                    {c.label}
                    <span className="text-xs text-subtle tabular-nums">{c.female?.duration.toFixed(1)}s</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-4xl scroll-mt-24 px-4 pt-20 sm:px-6 sm:pt-28">
        <SectionHeader eyebrow="FAQ" title="Frequently asked questions" />
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface/50">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {item.q}
                <Plus className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-8 py-14 text-center sm:px-12">
          <div className="grid-fade pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-2xl space-y-5">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Build your own scene from {formatNumber(models.length)} free parts.</h2>
            <p className="text-muted">Place trees, buildings, characters and props in 3D, animate them, and download the whole scene as one GLB.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/builder/" className={button.primary}>
                <Boxes className="size-4" /> Open the Scene Builder
              </Link>
              <Link href="/models/" className={button.secondary}>
                Browse models <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
