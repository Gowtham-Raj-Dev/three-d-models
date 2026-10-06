"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { FileBox, TriangleAlert, Upload, X } from "lucide-react";
import { asset } from "@/lib/asset";
import type { EditorSource } from "./model-editor";

const ModelEditor = dynamic(() => import("./model-editor").then((m) => m.ModelEditor), {
  ssr: false,
  loading: () => (
    <div className="grid h-[55vh] place-items-center rounded-3xl border border-line lg:h-full">
      <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
    </div>
  ),
});

export interface SampleModel {
  glb: string;
  title: string;
  filename: string;
  thumb: string | null;
}

interface Opened {
  id: number;
  source: EditorSource;
  title: string;
  filename: string;
}

const looksLikeGlb = (file: File) => /\.glb$/i.test(file.name) || file.type === "model/gltf-binary";

/** Drop or pick a .glb (or open a sample) and inspect, recolor and re-download it — all in the browser. */
export function GlbUpload({ samples }: { samples: SampleModel[] }) {
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function show(next: Omit<Opened, "id"> | null) {
    if (dirty.current && !window.confirm("Discard your color changes?")) return;
    dirty.current = false;
    setError(null);
    setOpened(next && { ...next, id: Date.now() });
  }

  function openFile(file: File | undefined) {
    if (!file) return;
    if (!looksLikeGlb(file)) {
      setError(
        /\.gltf$/i.test(file.name)
          ? `“${file.name}” is a .gltf file. Export or convert it to a single binary .glb and drop that instead.`
          : `“${file.name}” isn't a .glb file.`,
      );
      return;
    }
    show({ source: { file }, title: file.name, filename: file.name.replace(/\.glb$/i, "") });
  }

  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      openFile(e.dataTransfer.files[0]);
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept=".glb,model/gltf-binary"
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        openFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (opened) {
    return (
      <div {...dropProps} className="relative">
        {picker}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <FileBox className="size-4 shrink-0 text-accent" />
            <span className="truncate font-medium">{opened.title}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium hover:bg-white/[0.06]"
            >
              <Upload className="size-3.5" /> Open another file
            </button>
            <button
              type="button"
              onClick={() => show(null)}
              aria-label="Close this file"
              className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:bg-white/[0.06] hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {error && <ErrorNote message={error} />}
        <ModelEditor
          key={opened.id}
          source={opened.source}
          title={opened.title}
          filename={opened.filename}
          autoplay
          onDirtyChange={onDirtyChange}
          className="lg:h-[calc(100vh-14rem)] lg:min-h-[560px]"
        />
        {dragging && <DropHint />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {picker}
      <div
        {...dropProps}
        className={`relative grid min-h-[360px] place-items-center rounded-3xl border-2 border-dashed p-8 text-center transition-colors sm:min-h-[420px] ${
          dragging ? "border-accent bg-accent/[0.07]" : "border-line-strong bg-surface/40"
        }`}
      >
        <div className="max-w-md space-y-4">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-white/[0.04]">
            <Upload className="size-6 text-accent" />
          </span>
          <div className="space-y-1.5">
            <p className="text-lg font-medium">Drop a .glb file here</p>
            <p className="text-sm text-muted">Preview it in 3D, play its animations, recolor its parts and download the result.</p>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg transition hover:bg-white"
          >
            <FileBox className="size-4" /> Choose a file
          </button>
          <p className="text-xs text-subtle">Your file stays on this device — nothing is uploaded to a server.</p>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      {samples.length > 0 && (
        <div>
          <p className="mb-3 text-sm text-muted">No file at hand? Try one of ours:</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {samples.map((s) => (
              <button
                key={s.glb}
                type="button"
                onClick={() => show({ source: { url: s.glb }, title: s.title, filename: s.filename })}
                className="group flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3 text-left transition hover:border-line-strong"
              >
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_35%,#1d1830_0%,#0c0b12_75%)]">
                  {s.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset(s.thumb)} alt="" className="max-h-12 w-auto object-contain transition group-hover:scale-105" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-subtle">Open sample</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="mb-3 flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-sm text-muted">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" /> {message}
    </p>
  );
}

function DropHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-bg/70 backdrop-blur-sm">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Upload className="size-4 text-accent" /> Drop to open this file
      </p>
    </div>
  );
}
