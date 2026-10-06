"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  /** Small text on the right, e.g. a count. */
  hint?: string;
  /** Options with the same group are listed under a heading. */
  group?: string;
}

/**
 * Styled listbox dropdown (replaces the native <select>, whose popup can't be themed).
 * Keyboard: ↑/↓ to move, Enter to pick, Esc to close, Home/End, type in the search box when `searchable`.
 */
export function Dropdown({
  label,
  value,
  options,
  onChange,
  prefix,
  searchable = false,
  align = "left",
  className = "",
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown before the selected label in the trigger, e.g. "Sort". */
  prefix?: string;
  searchable?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value) ?? options[0];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const openMenu = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const closeMenu = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };
  const pick = (option: DropdownOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    closeMenu();
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Focus the search box (or list) when opening; keep the active option visible.
  useEffect(() => {
    if (!open) return;
    (searchable ? searchRef.current : listRef.current)?.focus();
  }, [open, searchable]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  };

  const listboxId = `${id}-listbox`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={`flex h-9 w-full items-center gap-2 rounded-full border px-3.5 text-left text-xs font-medium transition-colors ${
          open ? "border-accent/60 bg-white/[0.06] text-fg" : "border-line bg-surface text-fg hover:border-line-strong"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">
          {prefix && <span className="text-subtle">{prefix}: </span>}
          {selected?.label}
        </span>
        {selected?.hint && <span className="shrink-0 text-subtle tabular-nums">{selected.hint}</span>}
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180 text-fg" : ""}`} aria-hidden />
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-2 w-max min-w-full max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-strong bg-elevated/95 shadow-2xl shadow-black/60 backdrop-blur-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {searchable && (
            <div className="relative border-b border-line p-1.5">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onListKey}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label.toLowerCase()}`}
                aria-controls={listboxId}
                className="h-8 w-full rounded-xl bg-white/[0.04] pr-3 pl-8 text-xs text-fg placeholder:text-subtle focus:outline-none"
              />
            </div>
          )}
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onListKey}
            className="max-h-80 overflow-y-auto overscroll-contain p-1.5 focus:outline-none"
          >
            {filtered.length === 0 && <p className="px-3 py-6 text-center text-xs text-subtle">No matches</p>}
            {filtered.map((option, i) => {
              const isSelected = option.value === value;
              const showGroup = option.group && option.group !== filtered[i - 1]?.group;
              return (
                <Fragment key={option.value}>
                  {showGroup && (
                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-subtle uppercase first:pt-1.5">{option.group}</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={i}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(option)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      i === active ? "bg-white/[0.08] text-fg" : "text-muted"
                    }`}
                  >
                    <Check className={`size-4 shrink-0 ${isSelected ? "text-accent" : "invisible"}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint && <span className="shrink-0 text-xs text-subtle tabular-nums">{option.hint}</span>}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
