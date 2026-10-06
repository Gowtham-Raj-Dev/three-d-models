"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ModelViewer, type ViewerAnimation } from "@/components/viewer/model-viewer";
import { asset } from "@/lib/asset";

export interface HeroItem {
  slug: string;
  title: string;
  glb: string;
  thumb: string | null;
  animations: ViewerAnimation[];
  clip: string | null;
  clipLabel: string | null;
  azimuth: number;
  facts: string[];
}

/** Hero 3D stage with a picker to swap between a few featured characters. */
export function HeroShowcase({ items }: { items: HeroItem[] }) {
  const [index, setIndex] = useState(0);
  const item = items[index];

  return (
    <div className="relative">
      <div className="absolute inset-x-[10%] top-[14%] bottom-[10%] -z-10 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute inset-x-[16%] bottom-[13%] -z-10 h-20 rounded-[100%] border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent sm:h-24" />

      <ModelViewer
        key={item.slug}
        variant="hero"
        azimuth={item.azimuth}
        glb={item.glb}
        title={item.title}
        poster={item.thumb}
        animations={item.animations}
        defaultAnimation={item.clip}
        className="h-[360px] sm:h-[480px] lg:h-[540px]"
      />

      {/* Floating facts (desktop) */}
      <ul className="pointer-events-none absolute top-6 right-0 hidden flex-col items-end gap-2 xl:flex">
        {item.facts.map((fact) => (
          <li key={fact} className="glass rounded-full px-3 py-1.5 text-xs text-muted">
            {fact}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-col items-center gap-3">
        <div className="glass flex items-center gap-1 rounded-2xl p-1.5" role="group" aria-label="Featured characters">
          {items.map((it, i) => (
            <button
              key={it.slug}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              aria-label={`Show ${it.title}`}
              title={it.title}
              className={`relative h-14 w-11 overflow-hidden rounded-xl transition sm:h-16 sm:w-12 ${
                i === index ? "bg-white/15 ring-1 ring-accent/70" : "opacity-60 hover:bg-white/[0.07] hover:opacity-100"
              }`}
            >
              {it.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset(it.thumb)} alt="" className="absolute inset-0 h-full w-full object-contain p-1" />
              )}
            </button>
          ))}
        </div>
        <Link
          href={`/models/${item.slug}/`}
          className="group inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <span className="text-fg">{item.title}</span>
          {item.clipLabel && <span className="text-subtle">· {item.clipLabel}</span>}
          <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>
    </div>
  );
}
