import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { asset } from "@/lib/asset";
import type { CardModel, Category } from "@/lib/catalog";

const GLOW: Record<Category, string> = {
  "God of War": "from-red-600/30",
  Hair: "from-amber-400/25",
  Skeletons: "from-cyan-400/20",
  Bikes: "from-emerald-400/20",
  Gaming: "from-purple-500/25",
  Characters: "from-violet-500/20",
  Animals: "from-emerald-400/15",
  Vehicles: "from-sky-400/15",
  Buildings: "from-amber-300/15",
  Furniture: "from-orange-300/15",
  Food: "from-rose-400/15",
  Nature: "from-lime-400/15",
  Trees: "from-green-400/15",
  Space: "from-indigo-400/20",
  Weapons: "from-red-400/15",
  Props: "from-fuchsia-400/15",
};

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ModelCard({ model, priority = false }: { model: CardModel; priority?: boolean }) {
  return (
    <Link
      href={`/models/${model.slug}/`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_24px_60px_-24px_rgb(139_92_246/0.5)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#1a1726_0%,#0d0d13_70%)]">
        <div className={`absolute inset-0 bg-gradient-to-b ${GLOW[model.category]} via-transparent to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100`} />
        <div className="absolute inset-x-8 bottom-4 h-5 rounded-[100%] bg-black/70 blur-md" />
        {model.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset(model.thumb.src)}
            alt={model.title}
            width={model.thumb.width}
            height={model.thumb.height}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 m-auto h-[86%] w-[86%] object-contain object-bottom transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute top-3 right-3 grid size-8 translate-y-1 place-items-center rounded-full bg-fg text-bg opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 border-t border-line px-4 py-3.5">
        <h3 className="truncate text-sm font-medium text-fg">{model.title}</h3>
        <p className="truncate text-xs text-muted">{model.subtitle}</p>
        <div className="mt-2 flex items-center justify-between text-[11px] text-subtle">
          <span>{new Intl.NumberFormat("en-US").format(model.triangles)} tris</span>
          <span className="rounded-full border border-line px-2 py-0.5">GLB · {fileSize(model.glbBytes)}</span>
        </div>
      </div>
    </Link>
  );
}
