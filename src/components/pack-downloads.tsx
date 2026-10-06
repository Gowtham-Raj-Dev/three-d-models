import { Package } from "lucide-react";
import { PackButton } from "@/components/download-button";
import { formatBytes, type PackSummary } from "@/lib/catalog";

/** Bulk download cards; each zip is assembled in the browser from the pack's manifest. */
export function PackDownloads({ packs }: { packs: PackSummary[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {packs.map((p) => (
        <div key={p.key} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface/60 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-muted">
              <Package className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm leading-snug font-medium">{p.title}</p>
              <p className="truncate text-xs text-muted">{p.description}</p>
              <p className="text-[11px] text-subtle">.zip · {formatBytes(p.bytes)}</p>
            </div>
          </div>
          <PackButton manifest={p.manifest} label="Download" className="shrink-0" />
        </div>
      ))}
    </div>
  );
}
