"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Eye, EyeOff, Lightbulb, Lock, LockOpen, Search } from "lucide-react";
import type { SceneItem } from "@/lib/builder/types";

export function Outliner({
  items,
  selectedIds,
  onSelect,
  onUpdate,
}: {
  items: SceneItem[];
  selectedIds: string[];
  /** The new selection. */
  onSelect: (ids: string[]) => void;
  onUpdate: (id: string, patch: Partial<SceneItem>) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const anchor = useRef<string | null>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Newest first: what you just placed is at the top.
    const all = [...items].reverse();
    return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
  }, [items, query]);

  const last = selectedIds[selectedIds.length - 1];
  useEffect(() => {
    if (last) list.current?.querySelector(`[data-id="${last}"]`)?.scrollIntoView({ block: "nearest" });
  }, [last]);

  const click = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const from = shown.findIndex((i) => i.id === anchor.current);
      const to = shown.findIndex((i) => i.id === id);
      if (from >= 0 && to >= 0) {
        const range = shown.slice(Math.min(from, to), Math.max(from, to) + 1).map((i) => i.id);
        onSelect(e.ctrlKey || e.metaKey ? [...new Set([...selectedIds, ...range])] : range);
        return;
      }
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) onSelect(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    else onSelect([id]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${items.length} objects…`}
            aria-label="Filter scene objects"
            className="h-9 w-full rounded-full border border-line bg-surface pr-3 pl-8 text-xs text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none"
          />
        </div>
        <p className="mt-2 text-[11px] text-subtle">Ctrl+click to add · Shift+click for a range{selectedIds.length > 1 ? ` · ${selectedIds.length} selected` : ""}</p>
      </div>
      <ul ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" aria-label="Scene objects">
        {shown.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <li key={item.id} data-id={item.id}>
              <div
                className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
                  isSelected ? "bg-accent/15 ring-1 ring-accent/40" : "hover:bg-white/[0.05]"
                } ${item.hidden ? "opacity-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={(e) => click(item.id, e)}
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left select-none"
                >
                  {item.kind === "light" ? <Lightbulb className="size-3.5 shrink-0 text-amber-300" /> : <Box className="size-3.5 shrink-0 text-subtle" />}
                  <span className={`truncate text-xs ${isSelected ? "text-fg" : "text-muted"}`}>{item.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(item.id, { hidden: !item.hidden })}
                  aria-label={item.hidden ? `Show ${item.name}` : `Hide ${item.name}`}
                  className={`grid size-6 shrink-0 place-items-center rounded text-subtle hover:text-fg ${item.hidden ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                >
                  {item.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(item.id, { locked: !item.locked })}
                  aria-label={item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
                  className={`grid size-6 shrink-0 place-items-center rounded text-subtle hover:text-fg ${item.locked ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                >
                  {item.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                </button>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-xs text-subtle">{items.length ? "No matches" : "The scene is empty — add parts from the Parts tab."}</li>}
      </ul>
    </div>
  );
}
