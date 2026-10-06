"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { ModelCard } from "@/components/model-card";
import { Dropdown } from "@/components/dropdown";
import { asset } from "@/lib/asset";
import { CARD_PAGE, cardPageUrl, cardScope, cardScopeUrl, collectionCardsUrl } from "@/lib/card-pages";
import type { CardModel, Category } from "@/lib/catalog";

type CategoryFilter = "All" | Category;
type GenderFilter = "all" | "female" | "male";
type SortKey = "featured" | "name" | "polys-desc" | "polys-asc" | "size-asc";

/** Card files requested this visit, by URL — each is downloaded once; a failed one is dropped so it can be retried. */
const requests = new Map<string, Promise<CardModel[]>>();

function fetchCards(url: string): Promise<CardModel[]> {
  let request = requests.get(url);
  if (!request) {
    request = fetch(asset(url)).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json() as Promise<CardModel[]>;
    });
    request.catch(() => requests.delete(url));
    requests.set(url, request);
  }
  return request;
}

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "name", label: "Name (A–Z)" },
  { value: "polys-desc", label: "Most polygons" },
  { value: "polys-asc", label: "Fewest polygons" },
  { value: "size-asc", label: "Smallest file" },
];

export interface GalleryCollection {
  key: string;
  name: string;
  /** The category most of the collection's models belong to. */
  category: Category;
  count: number;
  /** Models per category — kits mix categories (e.g. a city kit's trees are listed under Trees). */
  counts: Partial<Record<Category, number>>;
}

/** Keeps filters in sync with ?category=…&collection=…&role=…&q=… without blocking static rendering. */
function UrlSync({ onChange }: { onChange: (params: URLSearchParams) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    onChange(new URLSearchParams(params.toString()));
  }, [params, onChange]);
  return null;
}

function Pill({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        active ? "bg-fg text-bg" : "text-muted hover:bg-white/[0.06] hover:text-fg"
      }`}
    >
      {children}
      {count !== undefined && <span className={`text-xs ${active ? "text-bg/60" : "text-subtle"}`}>{count.toLocaleString("en-US")}</span>}
    </button>
  );
}

export function ModelGallery({
  initial,
  total,
  categories,
  counts,
  collections,
  roles,
}: {
  /** First page of cards (server-rendered). */
  initial: CardModel[];
  total: number;
  categories: Category[];
  counts: Record<string, number>;
  collections: GalleryCollection[];
  roles: string[];
}) {
  /** Downloaded card files, by URL. Page 1 of "all" arrives server-rendered. */
  const [files, setFiles] = useState<Record<string, CardModel[]>>(() => ({ [cardPageUrl("all", 1)]: initial }));
  const [failed, setFailed] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [collection, setCollection] = useState("all");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState<SortKey>("featured");
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState(1);
  const deferredQuery = useDeferredValue(query);

  const syncFromUrl = useMemo(
    () => (params: URLSearchParams) => {
      const c = params.get("category");
      setCategory(c && (categories as string[]).includes(c) ? (c as Category) : "All");
      setCollection(params.get("collection") ?? "all");
      setRole(params.get("role") ?? "all");
      if (params.get("q") !== null) setQuery(params.get("q") ?? "");
      setPages(1);
    },
    [categories],
  );

  const updateUrl = (changes: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "all" || v === "All") url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    window.history.replaceState(null, "", url);
  };

  const selectCategory = (c: CategoryFilter) => {
    setCategory(c);
    setCollection("all");
    setRole("all");
    setPages(1);
    updateUrl({ category: c, collection: null, role: null });
  };

  const selectCollection = (name: string) => {
    setCollection(name);
    setPages(1);
    updateUrl({ collection: name });
  };

  const collectionOptions = useMemo(() => {
    const countIn = (c: GalleryCollection) => (category === "All" ? c.count : (c.counts[category] ?? 0));
    const visible = collections.filter((c) => countIn(c) > 0);
    return [
      { value: "all", label: "All collections", hint: String(visible.length) },
      ...visible.map((c) => ({ value: c.name, label: c.name, hint: countIn(c).toLocaleString("en-US"), group: category === "All" ? c.category : undefined })),
    ];
  }, [collections, category]);

  const q = deferredQuery.trim().toLowerCase();
  const scope = cardScope(category);
  const collectionKey = collection === "all" ? undefined : collections.find((c) => c.name === collection)?.key;
  // Browsing in featured order needs only the pages on screen. Searching, sorting or narrowing further needs the
  // whole category (or just the picked collection) — downloaded only once one of those is actually used.
  const needsWholeSet = collection !== "all" || sort !== "featured" || q !== "" || (category === "Characters" && (gender !== "all" || role !== "all"));
  const setUrl = collectionKey ? collectionCardsUrl(collectionKey) : cardScopeUrl(scope);

  const view = useMemo((): { cards: CardModel[]; count: number; missing: string | null } => {
    // Any set already downloaded that covers the current filters (the filter below narrows it down).
    const set = files[setUrl] ?? files[cardScopeUrl(scope)] ?? files[cardScopeUrl("all")];
    if (!set && !needsWholeSet) {
      const count = category === "All" ? total : (counts[category] ?? 0);
      const cards: CardModel[] = [];
      for (let p = 1; p <= Math.min(pages, Math.ceil(count / CARD_PAGE)); p++) {
        const page = files[cardPageUrl(scope, p)];
        if (!page) return { cards, count, missing: cardPageUrl(scope, p) };
        cards.push(...page);
      }
      return { cards, count, missing: null };
    }
    if (!set) return { cards: [], count: 0, missing: setUrl };

    const words = q ? q.split(/\s+/) : [];
    const list = set.filter((m) => {
      if (category !== "All" && m.category !== category) return false;
      if (collection !== "all" && m.collection !== collection) return false;
      if (category === "Characters" && gender !== "all" && m.gender !== gender) return false;
      if (category === "Characters" && role !== "all" && m.role !== role) return false;
      if (words.length) {
        const hay = `${m.title} ${m.subtitle} ${m.collection} ${m.category} ${m.role ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (sort === "name") list.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
    else if (sort === "polys-desc") list.sort((a, b) => b.triangles - a.triangles);
    else if (sort === "polys-asc") list.sort((a, b) => a.triangles - b.triangles);
    else if (sort === "size-asc") list.sort((a, b) => a.glbBytes - b.glbBytes);
    return { cards: list.slice(0, pages * CARD_PAGE), count: list.length, missing: null };
  }, [files, setUrl, scope, needsWholeSet, category, collection, gender, role, sort, q, pages, total, counts]);

  const shown = view.cards;
  const error = view.missing !== null && failed === view.missing;
  const loading = view.missing !== null && !error;

  useEffect(() => {
    const url = view.missing;
    if (!url) return;
    fetchCards(url).then(
      (cards) => setFiles((f) => ({ ...f, [url]: cards })),
      () => setFailed(url),
    );
  }, [view.missing, retries]);

  const retry = () => {
    setFailed(null);
    setRetries((n) => n + 1);
  };

  const resetFilters = () => {
    selectCategory("All");
    setGender("all");
    setQuery("");
  };

  return (
    <div>
      <Suspense fallback={null}>
        <UrlSync onChange={syncFromUrl} />
      </Suspense>

      <div className="-mx-4 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 relative z-30 md:sticky md:top-16">
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          <Pill active={category === "All"} onClick={() => selectCategory("All")} count={total}>
            All
          </Pill>
          {categories.map((c) => (
            <Pill key={c} active={category === c} onClick={() => selectCategory(c)} count={counts[c] ?? 0}>
              {c}
            </Pill>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="relative w-full sm:w-auto sm:min-w-[220px] sm:flex-1 lg:max-w-xs">
            <span className="sr-only">Search models</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPages(1);
              }}
              placeholder="Search Kratos, skeletons, bikes, arcade, weapons, cars…"
              className="h-9 w-full rounded-full border border-line bg-white/[0.03] pr-8 pl-9 text-sm text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setPages(1);
                }}
                aria-label="Clear search" className="absolute top-1/2 right-2.5 -translate-y-1/2 text-subtle hover:text-fg">
                <X className="size-4" />
              </button>
            )}
          </label>
          <Dropdown
            label="Collections"
            value={collection}
            onChange={selectCollection}
            searchable
            options={collectionOptions}
            className="min-w-0 flex-1 sm:max-w-sm"
          />
          {category === "Characters" && (
            <div className="flex rounded-full border border-line p-0.5 text-xs">
              {(["all", "female", "male"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGender(g);
                    setPages(1);
                  }}
                  aria-pressed={gender === g}
                  className={`rounded-full px-3 py-1.5 capitalize transition-colors ${gender === g ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
                >
                  {g === "all" ? "Any" : g}
                </button>
              ))}
            </div>
          )}
          <Dropdown
            label="Sort"
            prefix="Sort"
            value={sort}
            onChange={(v) => {
              setSort(v as SortKey);
              setPages(1);
            }}
            options={SORT_OPTIONS}
            align="right"
            className="w-48 shrink-0 sm:ml-auto"
          />
        </div>
        {category === "Characters" && roles.length > 0 && (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
            {["all", ...roles].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setPages(1);
                  updateUrl({ role: r });
                }}
                aria-pressed={role === r}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                  role === r ? "border-accent-2/50 bg-accent-2/10 text-fg" : "border-line text-muted hover:text-fg"
                }`}
              >
                {r === "all" ? "All roles" : r}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 mb-4 flex items-center gap-2 text-sm text-subtle" aria-live="polite">
        {loading && shown.length === 0 ? (
          <>
            <LoaderCircle className="size-4 animate-spin" /> Loading models…
          </>
        ) : error && shown.length === 0 ? (
          "Couldn’t load models."
        ) : (
          <>
            Showing <span className="text-fg">{shown.length.toLocaleString("en-US")}</span> of {view.count.toLocaleString("en-US")} models
          </>
        )}
      </p>

      {shown.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((m, i) => (
              <ModelCard key={m.slug} model={m} priority={i < 10} />
            ))}
          </div>
          {shown.length < view.count && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={error ? retry : () => setPages((p) => p + 1)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full border border-line-strong px-6 py-2.5 text-sm font-medium transition hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" /> Loading…
                  </>
                ) : error ? (
                  "Couldn’t load — try again"
                ) : (
                  <>Load more · {(view.count - shown.length).toLocaleString("en-US")} left</>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="glass grid place-items-center gap-3 rounded-2xl px-6 py-16 text-center">
          <p className="text-muted">
            {loading ? "Loading…" : error ? "Couldn’t load models. Check your connection." : "No models match these filters."}
          </p>
          {!loading && (
            <button type="button" onClick={error ? retry : resetFilters} className="rounded-full bg-fg px-4 py-1.5 text-sm text-bg">
              {error ? "Try again" : "Reset filters"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
