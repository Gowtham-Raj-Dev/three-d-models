"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Lightbulb, Search, X } from "lucide-react";
import { Dropdown, type DropdownOption } from "@/components/dropdown";
import { asset } from "@/lib/asset";
import type { Category } from "@/lib/catalog";
import type { Part, PartsIndex } from "@/lib/builder/types";

// Same order as CATEGORIES in lib/catalog (not imported: that module pulls the whole library into the client bundle).
const CATEGORY_ORDER: Category[] = ["Characters", "Animals", "Vehicles", "Buildings", "Furniture", "Food", "Nature", "Trees", "Space", "Weapons", "Skeletons", "Bikes", "Gaming", "Hair", "God of War", "Props"];

/** Kits that work well for outdoor scenes, one click away. */
const QUICK_KITS: { key: string; label: string }[] = [
  { key: "halloween-bits", label: "Halloween" },
  { key: "character-pack-skeletons", label: "Skeletons" },
  { key: "graveyard-kit", label: "Graveyard" },
  { key: "nature-kit", label: "Nature" },
  { key: "furniture-kit", label: "Furniture" },
  { key: "fantasy-town-kit", label: "Town" },
];

const PAGE = 90;

export const PART_MIME = "application/x-builder-part";

export function PartsPanel({
  parts,
  collections,
  placingId,
  onPick,
  onPickLight,
}: {
  parts: Part[] | null;
  collections: PartsIndex["collections"] | null;
  placingId: string | null;
  onPick: (part: Part) => void;
  onPickLight: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [kit, setKit] = useState("halloween-bits");
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);

  const kitOptions = useMemo<DropdownOption[]>(() => {
    if (!collections) return [];
    const entries = Object.entries(collections)
      .filter(([, c]) => category === "all" || c.category === category)
      .sort((a, b) => CATEGORY_ORDER.indexOf(a[1].category) - CATEGORY_ORDER.indexOf(b[1].category) || a[1].name.localeCompare(b[1].name));
    return [{ value: "all", label: "All kits" }, ...entries.map(([key, c]) => ({ value: key, label: c.name, hint: String(c.count), group: c.category }))];
  }, [collections, category]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const p of parts ?? []) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return counts;
  }, [parts]);

  const results = useMemo(() => {
    if (!parts) return [];
    const words = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return parts.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (kit === "all" || p.collectionKey === kit) &&
        words.every((w) => p.search.includes(w)),
    );
  }, [parts, deferredQuery, category, kit]);

  const reset = () => setLimit(PAGE);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder={parts ? `Search ${parts.length.toLocaleString("en-US")} parts…` : "Loading parts…"}
            aria-label="Search parts"
            className="h-9 w-full rounded-full border border-line bg-surface pr-8 pl-8 text-xs text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
          {QUICK_KITS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => {
                setCategory("all");
                setKit(k.key);
                reset();
              }}
              aria-pressed={kit === k.key}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                kit === k.key ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Dropdown
            label="Category"
            value={category}
            onChange={(v) => {
              setCategory(v as Category | "all");
              setKit("all");
              reset();
            }}
            options={[
              { value: "all", label: "All categories", hint: parts ? String(parts.length) : undefined },
              ...CATEGORY_ORDER.filter((c) => categoryCounts.has(c)).map((c) => ({ value: c, label: c, hint: String(categoryCounts.get(c)) })),
            ]}
          />
          <Dropdown
            label="Kit"
            value={kit}
            onChange={(v) => {
              setKit(v);
              reset();
            }}
            options={kitOptions}
            searchable
            align="right"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <button
          type="button"
          onClick={onPickLight}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(PART_MIME, "light");
            e.dataTransfer.effectAllowed = "copy";
          }}
          aria-pressed={placingId === "light"}
          className={`mb-3 flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
            placingId === "light" ? "border-accent/60 bg-accent/10" : "border-line bg-surface hover:border-line-strong"
          }`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
            <Lightbulb className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-fg">Point light</span>
            <span className="block text-[11px] text-subtle">Lanterns, candles, campfires — exported with the scene</span>
          </span>
        </button>

        {!parts && (
          <div className="grid grid-cols-3 gap-2" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        )}

        {parts && (
          <>
            <p className="mb-2 text-[11px] text-subtle" aria-live="polite">
              {results.length.toLocaleString("en-US")} part{results.length === 1 ? "" : "s"} · click, then click in the scene — or drag it in
            </p>
            <ul className="grid grid-cols-3 gap-2">
              {results.slice(0, limit).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PART_MIME, p.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    title={`${p.title} — ${p.collection} · ${p.size.join(" × ")} m${p.animated ? " · animated" : ""}`}
                    aria-pressed={placingId === p.id}
                    className={`group relative flex aspect-square w-full flex-col overflow-hidden rounded-xl border text-left transition-colors ${
                      placingId === p.id ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-line-strong hover:bg-white/[0.04]"
                    }`}
                  >
                    {p.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset(p.thumb)} alt="" loading="lazy" decoding="async" className="min-h-0 flex-1 object-contain p-1.5 transition-transform group-hover:scale-105" />
                    ) : (
                      <span className="flex-1" />
                    )}
                    <span className="truncate px-1.5 pb-1 text-[10px] leading-tight text-muted group-hover:text-fg">{p.title}</span>
                    {p.animated && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent-2" title="Animated" />}
                  </button>
                </li>
              ))}
            </ul>
            {results.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE * 2)}
                className="mt-3 w-full rounded-xl border border-line py-2 text-xs font-medium text-muted hover:border-line-strong hover:text-fg"
              >
                Show more ({(results.length - limit).toLocaleString("en-US")} left)
              </button>
            )}
            {results.length === 0 && <p className="py-10 text-center text-xs text-subtle">No parts match — try another kit or category.</p>}
          </>
        )}
      </div>
    </div>
  );
}
