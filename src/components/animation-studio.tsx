"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Pause, Play } from "lucide-react";
import { PackButton } from "@/components/download-button";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { asset } from "@/lib/asset";
import type { AnimationEntry, ClipGroup, DownloadPack } from "@/lib/catalog";

type Variant = "f" | "m";

interface Avatar {
  glb: string;
  title: string;
  thumb: string | null;
}

/** Direct single-file download of a clip (the license is embedded in the .glb). */
function ClipLink({ clip, label }: { clip: AnimationEntry; label: string }) {
  return (
    <a
      href={asset(clip.file)}
      download={`${clip.id}.glb`}
      title={`Download ${clip.id}.glb`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      <Download className="size-3.5" />
      {label}
    </a>
  );
}

/** Applies ?clip=… from the URL (links from the home page). */
function ClipFromUrl({ onClip }: { onClip: (key: string) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    const clip = params.get("clip");
    if (clip) onClip(clip);
  }, [params, onClip]);
  return null;
}

export function AnimationStudio({
  groups,
  avatars,
  pack,
}: {
  groups: ClipGroup[];
  avatars: Record<Variant, Avatar>;
  pack: DownloadPack;
}) {
  const [set, setSet] = useState<Variant>("f");
  const [clip, setClip] = useState<string | null>(groups[0]?.key ?? null);
  const avatar = avatars[set];

  const clips = useMemo(
    () => groups.map((g) => (set === "f" ? g.female : g.male)).filter((a): a is AnimationEntry => a !== null),
    [groups, set],
  );
  const known = useMemo(() => new Set(groups.map((g) => g.key)), [groups]);
  const onClip = useMemo(() => (key: string) => known.has(key) && setClip(key), [known]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
      <Suspense fallback={null}>
        <ClipFromUrl onClip={onClip} />
      </Suspense>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_at_50%_35%,#1d1830_0%,#0c0b12_65%)]">
          <ModelViewer
            key={set}
            glb={avatar.glb}
            title={avatar.title}
            poster={avatar.thumb}
            animations={clips}
            animation={clip ? `${set}_${clip}` : null}
            onAnimationChange={(id) => setClip(id ? id.slice(2) : null)}
            showAnimationPicker={false}
            className="h-[58vh] min-h-[420px] lg:h-[calc(100vh-9rem)] lg:max-h-[760px]"
          />
          <div className="glass absolute top-4 left-4 flex rounded-full p-1 text-xs">
            {(["f", "m"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSet(s)}
                aria-pressed={set === s}
                className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${set === s ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
              >
                {s === "f" ? "Female" : "Male"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Previewing on {avatar.title}. Every clip plays on any human character with the matching skeleton.
        </p>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">All {pack.files.length} clips</p>
            <p className="text-xs text-muted">Female + male · .zip with license</p>
          </div>
          <PackButton pack={pack} label="Download all" variant="primary" className="shrink-0" />
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface/60">
          {groups.map((g) => {
            const active = clip === g.key;
            const entry = set === "f" ? g.female : g.male;
            return (
              <li key={g.key} className={`flex items-center gap-3 px-4 py-3 transition-colors ${active ? "bg-accent/10" : ""}`}>
                <button
                  type="button"
                  onClick={() => setClip(active ? null : g.key)}
                  aria-pressed={active}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full border transition-colors ${
                      active ? "border-accent/60 bg-accent/25 text-fg" : "border-line text-muted"
                    }`}
                  >
                    {active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{g.label}</span>
                    <span className="block text-xs text-subtle tabular-nums">
                      {entry ? `${entry.duration.toFixed(1)} s · loop` : "—"}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 gap-1.5">
                  {g.female && <ClipLink clip={g.female} label="F" />}
                  {g.male && <ClipLink clip={g.male} label="M" />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-subtle">
          F / M download the female or male version as a single skeleton-only .glb (license embedded in the file).
        </p>
      </div>
    </div>
  );
}
