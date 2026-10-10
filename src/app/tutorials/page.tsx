import Link from "next/link";
import { ArrowRight, Boxes, Captions, Clock, ListChecks, ListOrdered, Play } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { button, Eyebrow } from "@/components/ui";
import { asset } from "@/lib/asset";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";
import { formatClock } from "@/lib/site-tour";
import { isoDuration, tutorials, type Tutorial } from "@/lib/tutorials";

const DESCRIPTION =
  "Step-by-step video tutorials for the free 3D Scene Builder: watch a scene being built from an empty plot — floors, fences, animated characters, lights — with chapters, written steps and captions, then build it yourself.";

export const metadata = pageMetadata({
  title: "Scene Builder Tutorials — Build 3D Scenes Step by Step",
  description: DESCRIPTION,
  path: "/tutorials/",
  image: tutorials[0] && { url: tutorials[0].og, alt: tutorials[0].title },
  keywords: ["scene builder tutorial", "3D scene builder tutorial", "how to build a 3D scene", "free 3D scene builder", "GLB scene tutorial", "three.js scene tutorial", "low poly scene tutorial"],
});

const INCLUDED = [
  { icon: ListOrdered, title: "Chapters", text: "Every step is a chapter. Jump straight to the part you need." },
  { icon: ListChecks, title: "Written steps", text: "The same steps in writing under the video, with the keys to press." },
  { icon: Captions, title: "Captions & transcript", text: "Follow along with the sound off, or read the whole narration." },
];

function Facts({ tutorial }: { tutorial: Tutorial }) {
  return (
    <ul className="flex flex-wrap gap-2 text-xs text-muted">
      <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
        <Clock className="size-3.5 text-violet-300" /> {formatClock(tutorial.seconds)}
      </li>
      <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
        <ListOrdered className="size-3.5 text-violet-300" /> {tutorial.steps.length} steps
      </li>
      <li className="rounded-full border border-line px-2.5 py-1">{tutorial.level}</li>
      {tutorial.kits.map((k) => (
        <li key={k.key} className="rounded-full border border-line px-2.5 py-1">
          {k.name}
        </li>
      ))}
    </ul>
  );
}

function Poster({ tutorial }: { tutorial: Tutorial }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset(tutorial.poster)} alt="" width={1280} height={720} decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden />
      <span className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-2xl shadow-black/60 transition group-hover:scale-110">
        <Play className="size-5 translate-x-0.5 fill-current" />
      </span>
      <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">{formatClock(tutorial.seconds)}</span>
    </div>
  );
}

export default function TutorialsPage() {
  const [latest, ...older] = tutorials;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Scene Builder tutorials",
    itemListElement: tutorials.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/tutorials/${t.slug}/`),
      item: {
        "@type": "VideoObject",
        name: t.title,
        description: t.description,
        thumbnailUrl: absoluteUrl(t.poster),
        contentUrl: absoluteUrl(t.hd),
        uploadDate: `${t.recorded}T12:00:00+05:30`,
        duration: isoDuration(t.seconds),
      },
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <JsonLd data={jsonLd} />
      <header className="max-w-3xl space-y-4">
        <Eyebrow>Scene Builder tutorials</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Learn the Scene Builder, one scene at a time.</h1>
        <p className="text-lg leading-relaxed text-pretty text-muted">
          Narrated videos that build a whole scene from an empty plot, step by step — every click and key shown on screen. Watch one, then open the builder and make it
          yours. It&apos;s free, and it runs in your browser.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href={`/tutorials/${latest.slug}/`} className={button.primary}>
            <Play className="size-4 fill-current" /> Watch the latest
          </Link>
          <Link href="/builder/" className={button.secondary}>
            <Boxes className="size-4" /> Open the Scene Builder
          </Link>
        </div>
      </header>

      <section aria-label="Tutorials" className="mt-12 sm:mt-16">
        <Link
          href={`/tutorials/${latest.slug}/`}
          className="group grid items-center gap-6 rounded-3xl border border-line bg-surface p-4 transition hover:border-line-strong sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10 lg:p-6"
        >
          <Poster tutorial={latest} />
          <div className="space-y-4 lg:pr-4">
            <Eyebrow>Latest tutorial</Eyebrow>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{latest.title}</h2>
            <p className="leading-relaxed text-pretty text-muted">{latest.summary}</p>
            <Facts tutorial={latest} />
            <ol className="grid gap-x-6 gap-y-1.5 pt-1 text-sm text-muted sm:grid-cols-2">
              {latest.steps.map((s, i) => (
                <li key={s.title} className="flex gap-2">
                  <span className="w-4 shrink-0 text-subtle tabular-nums">{i + 1}</span>
                  {s.title}
                </li>
              ))}
            </ol>
            <p className={`${button.ghost} pt-1 text-fg`}>
              Watch the tutorial <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </p>
          </div>
        </Link>

        {older.length > 0 && (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {older.map((t) => (
              <li key={t.slug}>
                <Link href={`/tutorials/${t.slug}/`} className="group block space-y-3 rounded-2xl border border-line bg-surface p-3 transition hover:border-line-strong">
                  <Poster tutorial={t} />
                  <div className="space-y-2 px-1 pb-1">
                    <h2 className="text-lg font-semibold tracking-tight text-balance">{t.title}</h2>
                    <p className="text-sm leading-relaxed text-muted">{t.summary}</p>
                    <Facts tutorial={t} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="What every tutorial has" className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-3">
        {INCLUDED.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <span className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent">
              <Icon className="size-4.5" />
            </span>
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </section>

      <p className="mt-10 text-sm text-subtle">
        New tutorials are added here as new scenes are built. Made by {SITE.author} with the{" "}
        <Link href="/builder/" className="text-muted underline underline-offset-2 hover:text-fg">
          Scene Builder
        </Link>{" "}
        itself.
      </p>
    </div>
  );
}
