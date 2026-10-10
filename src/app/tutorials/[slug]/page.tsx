import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, ChevronRight, Clock, ListOrdered, Play } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SeekButton, TutorialPlayer } from "@/components/tutorial-player";
import { button, Eyebrow } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";
import { formatClock } from "@/lib/site-tour";
import { getTutorial, isoDuration, tutorials } from "@/lib/tutorials";

export const dynamicParams = false;

export function generateStaticParams() {
  return tutorials.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tutorials/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tutorial = getTutorial(slug);
  if (!tutorial) return {};
  return {
    ...pageMetadata({
      title: `${tutorial.title} — Scene Builder Tutorial`,
      description: tutorial.description,
      path: `/tutorials/${tutorial.slug}/`,
      image: { url: tutorial.og, alt: tutorial.title },
      keywords: ["scene builder tutorial", "3D scene builder", "how to build a 3D scene", "free GLB scene", ...tutorial.kits.map((k) => k.name), ...tutorial.steps.map((s) => s.title.toLowerCase())],
    }),
    authors: [{ name: SITE.author }],
    creator: SITE.author,
    publisher: SITE.brand,
  };
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md border border-line-strong border-b-2 bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-fg">{children}</kbd>;
}

export default async function TutorialPage({ params }: PageProps<"/tutorials/[slug]">) {
  const { slug } = await params;
  const tutorial = getTutorial(slug);
  if (!tutorial) notFound();
  const url = absoluteUrl(`/tutorials/${tutorial.slug}/`);
  // The first chapter is the intro; step n is chapter n.
  const stepAt = (i: number) => tutorial.chapters[i + 1]?.at ?? 0;
  const others = tutorials.filter((t) => t.slug !== tutorial.slug).slice(0, 3);
  const made = new Date(`${tutorial.recorded}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "@id": absoluteUrl(tutorial.hd),
      name: tutorial.title,
      description: tutorial.description,
      thumbnailUrl: absoluteUrl(tutorial.poster),
      contentUrl: absoluteUrl(tutorial.hd),
      uploadDate: `${tutorial.recorded}T12:00:00+05:30`,
      duration: isoDuration(tutorial.seconds),
      inLanguage: "en",
      transcript: tutorial.transcript.map((l) => l.text).join(" "),
      hasPart: tutorial.chapters.map((c, i) => ({
        "@type": "Clip",
        name: c.label,
        startOffset: Math.floor(c.at),
        endOffset: Math.floor(tutorial.chapters[i + 1]?.at ?? tutorial.seconds),
        url,
      })),
      author: { "@type": "Person", name: SITE.author },
      publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: tutorial.title,
      description: tutorial.summary,
      image: absoluteUrl(tutorial.og),
      totalTime: isoDuration(tutorial.seconds),
      tool: [{ "@type": "HowToTool", name: "Scene Builder", url: absoluteUrl("/builder/") }],
      step: tutorial.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.text, url })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Tutorials", item: absoluteUrl("/tutorials/") },
        { "@type": "ListItem", position: 2, name: tutorial.title, item: url },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-subtle">
        <Link href="/tutorials/" className="transition-colors hover:text-fg">
          Tutorials
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate text-muted">{tutorial.title}</span>
      </nav>

      <header className="mt-5 max-w-4xl space-y-4">
        <Eyebrow>Scene Builder tutorial</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{tutorial.title}</h1>
        <p className="text-lg leading-relaxed text-pretty text-muted">{tutorial.summary}</p>
        <ul className="flex flex-wrap gap-2 text-xs text-muted">
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
            <Clock className="size-3.5 text-violet-300" /> {formatClock(tutorial.seconds)}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
            <ListOrdered className="size-3.5 text-violet-300" /> {tutorial.steps.length} steps
          </li>
          <li className="rounded-full border border-line px-2.5 py-1">{tutorial.level}</li>
          {tutorial.kits.map((k) => (
            <li key={k.key}>
              <Link href={`/models/collection/${k.key}/`} className="block rounded-full border border-line px-2.5 py-1 transition-colors hover:border-line-strong hover:text-fg">
                {k.name}
              </Link>
            </li>
          ))}
        </ul>
      </header>

      <div className="mt-8">
        <TutorialPlayer tutorial={{ title: tutorial.title, hd: tutorial.hd, sd: tutorial.sd, poster: tutorial.poster, captions: tutorial.captions, seconds: tutorial.seconds, chapters: tutorial.chapters }} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
        <p className="text-sm leading-relaxed text-muted">
          <span className="font-medium text-fg">You&apos;ll build:</span> {tutorial.built}. Everything used is free for personal and commercial projects.
        </p>
        <Link href="/builder/" className={button.primary}>
          <Boxes className="size-4" /> Open the Scene Builder
        </Link>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <section aria-labelledby="steps">
          <Eyebrow>Step by step</Eyebrow>
          <h2 id="steps" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            The same steps, in writing
          </h2>
          <ol className="mt-8 space-y-8">
            {tutorial.steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent tabular-nums">{i + 1}</span>
                <div className="min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                    <SeekButton
                      at={stepAt(i)}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted tabular-nums transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Play className="size-2.5 fill-current" /> {formatClock(stepAt(i))}
                    </SeekButton>
                  </div>
                  <p className="leading-relaxed text-pretty text-muted">{s.text}</p>
                  {s.keys && (
                    <p className="flex flex-wrap gap-1.5">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-8">
          <details className="group rounded-2xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold marker:hidden">
              Transcript
              <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <ol className="max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain border-t border-line px-5 py-4">
              {tutorial.transcript.map((l) => (
                <li key={l.at} className="flex gap-3 text-sm leading-relaxed text-muted">
                  <SeekButton at={l.at} className="mt-0.5 shrink-0 text-xs text-subtle tabular-nums transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                    {formatClock(l.at)}
                  </SeekButton>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          </details>

          <div className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm leading-relaxed text-muted">
            <h2 className="font-semibold text-fg">About this video</h2>
            <p className="mt-2">
              Recorded in the live Scene Builder on <time dateTime={tutorial.recorded}>{made}</time> by {SITE.author}. Captions are in the player; turn them on with the CC button.
            </p>
            <p className="mt-2 text-xs text-subtle">
              Narration: Chatterbox Turbo by Resemble AI (MIT), in the voice of “A Moment By” by Alba MacKenna from{" "}
              <a href="https://huggingface.co/kyutai/tts-voices" rel="noopener" className="underline underline-offset-2 hover:text-fg">
                Kyutai TTS voices
              </a>{" "}
              (
              <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener license" className="underline underline-offset-2 hover:text-fg">
                CC BY 4.0
              </a>
              ). Music and sound effects: the site&apos;s own synthesizer.
            </p>
          </div>
        </aside>
      </div>

      {others.length > 0 && (
        <section aria-labelledby="more" className="mt-16">
          <h2 id="more" className="text-2xl font-semibold tracking-tight">
            More tutorials
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((t) => (
              <li key={t.slug}>
                <Link href={`/tutorials/${t.slug}/`} className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-line-strong">
                  <p className="font-semibold">{t.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.summary}</p>
                  <p className="mt-3 text-xs text-subtle tabular-nums">
                    {formatClock(t.seconds)} · {t.steps.length} steps
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
