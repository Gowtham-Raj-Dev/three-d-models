"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Palette, X } from "lucide-react";

const ModelEditor = dynamic(() => import("./model-editor").then((m) => m.ModelEditor), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
    </div>
  ),
});

/** Any link to this hash on a model page opens the color editor. */
const CUSTOMIZE_HASH = "#customize";

// True when #customize was added by an in-page link (so closing can go Back instead of leaving a stray entry).
let openedByLink = false;

function subscribe(onChange: () => void) {
  const handler = () => {
    openedByLink = window.location.hash === CUSTOMIZE_HASH;
    onChange();
  };
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}

const isOpen = () => window.location.hash === CUSTOMIZE_HASH;

/** Full-screen color editor for one library model, shown while the URL hash is #customize. */
export function CustomizeOverlay({ glb, title, filename, note }: { glb: string; title: string; filename: string; note?: ReactNode }) {
  const open = useSyncExternalStore(subscribe, isOpen, () => false);
  const dirty = useRef(false);
  const source = useMemo(() => ({ url: glb }), [glb]);

  const close = useCallback(() => {
    if (dirty.current && !window.confirm("Discard your color changes?")) return;
    dirty.current = false;
    if (openedByLink) {
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) close();
    };
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Customize colors — ${title}`} className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Palette className="size-4.5 shrink-0 text-accent" />
          <p className="truncate text-sm">
            <span className="text-muted">Customize colors · </span>
            <span className="font-medium">{title}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close the color editor"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:bg-white/[0.06] hover:text-fg"
        >
          <X className="size-4.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
        <ModelEditor source={source} title={title} filename={filename} note={note} onDirtyChange={onDirtyChange} className="lg:h-full" />
      </div>
    </div>
  );
}
