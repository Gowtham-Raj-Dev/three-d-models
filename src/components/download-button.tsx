"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Check, Download, LoaderCircle, TriangleAlert } from "lucide-react";
import { asset } from "@/lib/asset";
import { packAttributionFile } from "@/lib/attribution";
import type { DownloadPack } from "@/lib/catalog";
import { buildZip, saveBlob } from "@/lib/zip";

/**
 * Bundle downloads are switched off: every pack button renders with the `disabled` attribute. It's a
 * soft lock — removing the attribute (e.g. in DevTools) makes the button work again. Set to false to
 * turn bundles back on.
 */
const PACKS_LOCKED = true;

const STYLES = {
  primary: "rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-white",
  secondary: "rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium hover:bg-white/[0.06]",
  compact: "rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-line-strong hover:text-fg",
};

/**
 * Zips a pack in the browser — its files plus license file(s), ATTRIBUTION.txt and an optional
 * README.txt — and saves it. Shows progress while files are fetched. Pass the pack inline, or a
 * `manifest` URL (/data/packs/<key>.json) to load its file list only when clicked.
 */
export function PackButton({
  pack: inlinePack,
  manifest,
  label,
  variant = "secondary",
  className = "",
}: {
  pack?: DownloadPack;
  manifest?: string;
  label: ReactNode;
  variant?: keyof typeof STYLES;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function run() {
    if (state === "working") return;
    setState("working");
    try {
      const pack: DownloadPack = inlinePack ?? (await fetch(asset(manifest!)).then((r) => r.json()));
      const blob = await buildZip(
        [...pack.files, ...pack.licenses],
        [
          {
            path: "ATTRIBUTION.txt",
            content: packAttributionFile({ name: pack.title, items: pack.credits, notice: pack.notice, site: window.location.origin }),
          },
          ...(pack.readme ? [{ path: "README.txt", content: pack.readme }] : []),
        ],
        (done, total) => setProgress({ done, total }),
      );
      saveBlob(blob, pack.filename);
      setState("done");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 2500);
  }

  // A native listener, not onClick: React drops clicks on a button whose `disabled` *prop* is set,
  // even after the attribute is removed from the DOM. The browser itself only checks the attribute.
  const ref = useRef<HTMLButtonElement>(null);
  const onClick = useEffectEvent(run);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onClick();
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, []);

  const icon = {
    idle: <Download className="size-4" />,
    working: <LoaderCircle className="size-4 animate-spin" />,
    done: <Check className="size-4 text-emerald-500" />,
    error: <TriangleAlert className="size-4 text-rose-400" />,
  }[state];
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <button
      ref={ref}
      type="button"
      disabled={PACKS_LOCKED || state === "working"}
      title={PACKS_LOCKED ? "Bundle downloads are disabled" : undefined}
      aria-live="polite"
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap transition ${PACKS_LOCKED ? "disabled:cursor-not-allowed disabled:opacity-40" : "disabled:opacity-90"} ${STYLES[variant]} ${className}`}
    >
      {state === "working" && (
        <span className="absolute inset-y-0 left-0 bg-accent/25 transition-[width] duration-300" style={{ width: `${pct}%` }} aria-hidden />
      )}
      <span className="relative inline-flex items-center gap-2">
        {icon}
        {state === "working" ? `Packing ${progress.done}/${progress.total}…` : state === "error" ? "Download failed" : state === "done" ? "Saved" : label}
      </span>
    </button>
  );
}
