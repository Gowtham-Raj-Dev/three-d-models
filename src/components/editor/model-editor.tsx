"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type * as THREE from "three";
import { Box, Check, Download, Expand, ImageIcon, LoaderCircle, Pause, Play, RotateCcw, Rotate3d, TriangleAlert, Undo2 } from "lucide-react";
import { AnimationChip, ToolButton } from "@/components/viewer/model-viewer";
import { asset } from "@/lib/asset";
import { formatBytes, formatNumber } from "@/lib/format";
import { isGlb, readGlb } from "@/lib/glb";
import { disposeModel, inspectModel, parseGltf, prepareModel, type ModelInfo, type PreparedModel } from "@/lib/gltf-load";
import { ColorEditor, type ColorPart } from "@/lib/recolor";
import { saveBlob } from "@/lib/zip";

const EditorScene = dynamic(() => import("./editor-scene"), { ssr: false });

export type EditorSource = { url: string } | { file: File };

export interface ModelEditorProps {
  /** A public .glb path, or a file the visitor picked. Remount (key) the editor to change it. */
  source: EditorSource;
  title: string;
  /** Download file name, without the extension. */
  filename: string;
  /** Play the file's first embedded animation once loaded. */
  autoplay?: boolean;
  /** Extra line under the download button (e.g. the license). */
  note?: ReactNode;
  /** Called whenever the edit state flips between "no changes" and "has changes". */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}

interface Loaded {
  model: PreparedModel;
  editor: ColorEditor;
  info: ModelInfo;
}

const PRESETS = [
  "#f5f5f4", "#a8a29e", "#44403c", "#1c1917", "#ef4444", "#f97316", "#f59e0b", "#facc15", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#92400e", "#d6b98c",
];

async function readSource(source: EditorSource, signal: AbortSignal, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  if ("file" in source) return source.file.arrayBuffer();
  const res = await fetch(asset(source.url), { signal });
  if (!res.ok) throw new Error(`Couldn't download the model (HTTP ${res.status}).`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(1, loaded / total));
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/^THREE\.GLTFLoader:\s*/, "") || "Something went wrong while opening the model.";
}

/**
 * Model studio: preview a GLB, recolor its parts (click the model or pick from the list) and download
 * the recolored file. Used for library models (overlay on model pages) and uploaded files (/viewer/).
 */
export function ModelEditor({ source, title, filename, autoplay = false, note, onDirtyChange, className = "" }: ModelEditorProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [clip, setClip] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [saving, setSaving] = useState<"idle" | "working" | "done" | "error">("idle");

  useEffect(() => {
    const controller = new AbortController();
    readSource(source, controller.signal, setProgress).then(
      (data) => {
        if (!isGlb(data)) throw new Error("This isn't a .glb file. Export your model as binary glTF (.glb) and try again.");
        setBytes(data);
      },
    ).catch((err) => {
      if (!controller.signal.aborted) setError(message(err));
    });
    return () => controller.abort();
  }, [source]);

  useEffect(() => {
    if (!bytes || !renderer) return;
    let cancelled = false;
    let made: Loaded | null = null;
    (async () => {
      const gltf = await parseGltf(bytes, renderer);
      const model = prepareModel(gltf);
      const json = readGlb(bytes).json;
      made = { model, editor: new ColorEditor(gltf, bytes, json), info: inspectModel(model, json, bytes.byteLength) };
      if (cancelled) return release(made);
      setLoaded(made);
      if (autoplay && gltf.animations.length) setClip(0);
    })().catch((err) => {
      if (!cancelled) setError(message(err));
    });
    return () => {
      cancelled = true;
      if (made) release(made);
    };
  }, [bytes, renderer, autoplay]);

  const dirty = Object.keys(colors).length > 0;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const select = useCallback(
    (key: string) => {
      setSelected(key);
      loaded?.editor.highlight(key);
      // Scroll the list (never the page) so the row is visible.
      const list = listRef.current;
      const row = rows.current.get(key);
      if (!list || !row) return;
      const l = list.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (r.top < l.top) list.scrollBy({ top: r.top - l.top - 6, behavior: "smooth" });
      else if (r.bottom > l.bottom) list.scrollBy({ top: r.bottom - l.bottom + 6, behavior: "smooth" });
    },
    [loaded],
  );

  const change = useCallback(
    (part: ColorPart, hex: string | null) => {
      if (!loaded) return;
      const value = hex && hex.toLowerCase() !== part.original ? hex.toLowerCase() : null;
      loaded.editor.set(part.key, value);
      setColors((current) => {
        const next = { ...current };
        if (value) next[part.key] = value;
        else delete next[part.key];
        return next;
      });
    },
    [loaded],
  );

  const onPick = useCallback(
    (object: THREE.Object3D, faceIndex: number) => {
      const key = loaded?.editor.partAt(object, faceIndex);
      if (key) select(key);
    },
    [loaded, select],
  );
  const onMiss = useCallback(() => setSelected(null), []);

  function resetAll() {
    if (!loaded) return;
    for (const key of Object.keys(colors)) loaded.editor.set(key, null);
    setColors({});
  }

  async function download() {
    if (!loaded || !bytes || saving === "working") return;
    setSaving("working");
    try {
      const data = dirty ? await loaded.editor.export() : new Uint8Array(bytes);
      saveBlob(new Blob([data], { type: "model/gltf-binary" }), `${filename}${dirty ? "-custom" : ""}.glb`);
      setSaving("done");
    } catch (err) {
      console.error(err);
      setSaving("error");
    }
    window.setTimeout(() => setSaving("idle"), 2500);
  }

  const parts = loaded?.editor.parts ?? [];
  const selectedPart = parts.find((p) => p.key === selected) ?? null;
  const animations = loaded?.info.animations ?? [];
  const changes = Object.keys(colors).length;

  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] ${className}`}>
      <div
        ref={viewerRef}
        className="relative h-[55vh] min-h-[340px] overflow-hidden rounded-3xl border border-line bg-[radial-gradient(ellipse_at_50%_35%,#1d1830_0%,#0c0b12_65%)] lg:h-full lg:min-h-0"
      >
        <div className="absolute inset-0">
          <EditorScene
            model={loaded?.model ?? null}
            clip={clip}
            playing={playing}
            autoRotate={autoRotate}
            wireframe={wireframe}
            resetKey={resetKey}
            onRenderer={setRenderer}
            onPick={onPick}
            onMiss={onMiss}
          />
        </div>

        {!loaded && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {error ? (
              <p className="glass flex max-w-md items-start gap-2.5 rounded-xl px-4 py-3 text-left text-sm text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" /> {error}
              </p>
            ) : (
              <div className="glass flex items-center gap-3 rounded-full px-4 py-2 text-xs text-muted">
                <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
                {bytes ? "Preparing colors…" : `Loading ${title}…${progress !== null ? ` ${Math.round(progress * 100)}%` : ""}`}
              </div>
            )}
          </div>
        )}

        {selectedPart && (
          <div className="glass absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-xl py-1.5 pr-2 pl-1.5 sm:top-4 sm:left-4">
            <Swatch part={selectedPart} value={colors[selectedPart.key]} onChange={change} onFocus={select} size="size-8" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{selectedPart.label}</p>
              <p className="font-mono text-[10px] text-subtle uppercase">{colors[selectedPart.key] ?? selectedPart.original}</p>
            </div>
            {colors[selectedPart.key] && (
              <ToolButton label="Reset color" onClick={() => change(selectedPart, null)}>
                <Undo2 className="size-4" />
              </ToolButton>
            )}
          </div>
        )}

        {loaded && (
          <p className="pointer-events-none absolute top-3 right-4 hidden text-[11px] text-subtle sm:block">
            Click a part to recolor it · Drag to orbit · Scroll to zoom
          </p>
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2 sm:inset-x-4 sm:bottom-4">
          {animations.length > 0 && (
            <div className="pointer-events-auto no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              <AnimationChip active={clip === null} onClick={() => setClip(null)}>
                Rest pose
              </AnimationChip>
              {animations.map((a, i) => (
                <AnimationChip key={i} active={clip === i} onClick={() => setClip(i)}>
                  {a.name}
                </AnimationChip>
              ))}
            </div>
          )}
          <div className="glass pointer-events-auto flex w-fit items-center gap-0.5 rounded-xl p-1">
            {animations.length > 0 && (
              <ToolButton label={playing ? "Pause animation" : "Play animation"} onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </ToolButton>
            )}
            <ToolButton label="Auto-rotate" active={autoRotate} onClick={() => setAutoRotate((v) => !v)}>
              <Rotate3d className="size-4" />
            </ToolButton>
            <ToolButton label="Wireframe" active={wireframe} onClick={() => setWireframe((v) => !v)}>
              <Box className="size-4" />
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-line" />
            <ToolButton label="Reset view" onClick={() => setResetKey((k) => k + 1)}>
              <RotateCcw className="size-4" />
            </ToolButton>
            <ToolButton
              label="Fullscreen"
              onClick={() => {
                const el = viewerRef.current;
                if (!el) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void el.requestFullscreen?.();
              }}
            >
              <Expand className="size-4" />
            </ToolButton>
          </div>
        </div>
      </div>

      <aside className="flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">Colors</h2>
            {changes > 0 && (
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                <Undo2 className="size-3.5" /> Reset all
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {loaded
              ? parts.length
                ? "Click a part on the model, or a swatch below, to change its color."
                : "This model has no editable colors."
              : "Loading the model's parts…"}
          </p>

          {parts.length > 0 && (
            <ul ref={listRef} className="no-scrollbar -mx-1 mt-3 max-h-[300px] space-y-1 overflow-y-auto px-1">
              {parts.map((part) => {
                const value = colors[part.key];
                const active = part.key === selected;
                return (
                  <li
                    key={part.key}
                    ref={(el) => {
                      if (el) rows.current.set(part.key, el);
                      else rows.current.delete(part.key);
                    }}
                    className={`flex items-center gap-3 rounded-xl border px-2 py-1.5 transition-colors ${
                      active ? "border-accent/50 bg-accent/10" : "border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <Swatch part={part} value={value} onChange={change} onFocus={select} />
                    <button type="button" onClick={() => select(part.key)} className="min-w-0 flex-1 py-0.5 text-left">
                      <span className="block truncate text-sm font-medium">{part.label}</span>
                      <span className="block truncate text-[11px] text-subtle">
                        {value ? (
                          <>
                            <span className="font-mono uppercase">{part.original}</span> → <span className="font-mono text-muted uppercase">{value}</span>
                          </>
                        ) : (
                          part.detail
                        )}
                      </span>
                    </button>
                    {value && (
                      <button
                        type="button"
                        onClick={() => change(part, null)}
                        title="Reset color"
                        aria-label={`Reset ${part.label}`}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-white/[0.06] hover:text-fg"
                      >
                        <Undo2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {parts.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-xs text-muted">
                {selectedPart ? (
                  <>
                    Quick colors for <span className="font-medium text-fg">{selectedPart.label}</span>
                  </>
                ) : (
                  "Quick colors — select a part first"
                )}
              </p>
              <div className="grid grid-cols-9 gap-1.5">
                {PRESETS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    disabled={!selectedPart}
                    onClick={() => selectedPart && change(selectedPart, hex)}
                    title={hex}
                    aria-label={`Use ${hex}`}
                    className="aspect-square rounded-md border border-white/10 transition hover:scale-110 disabled:opacity-35 disabled:hover:scale-100"
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <button
            type="button"
            onClick={download}
            disabled={!loaded || saving === "working"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg transition hover:bg-white disabled:opacity-60"
          >
            {saving === "working" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : saving === "done" ? (
              <Check className="size-4 text-emerald-600" />
            ) : saving === "error" ? (
              <TriangleAlert className="size-4 text-rose-500" />
            ) : (
              <Download className="size-4" />
            )}
            {saving === "working"
              ? "Saving…"
              : saving === "done"
                ? "Saved"
                : saving === "error"
                  ? "Couldn't save — try again"
                  : dirty
                    ? `Download custom .glb (${changes} change${changes === 1 ? "" : "s"})`
                    : "Download .glb"}
          </button>
          <p className="mt-2.5 text-xs leading-relaxed text-subtle">
            Colors are written into the .glb itself, so it opens exactly like this in Blender, Unity, Godot, three.js or any glTF viewer.
            {note ? <> {note}</> : null}
          </p>
        </section>

        {loaded && <Details info={loaded.info} />}
      </aside>
    </div>
  );
}

function release({ model, editor }: Loaded) {
  editor.dispose();
  disposeModel(model.root);
}

function Swatch({
  part,
  value,
  onChange,
  onFocus,
  size = "size-9",
}: {
  part: ColorPart;
  value: string | undefined;
  onChange: (part: ColorPart, hex: string) => void;
  onFocus: (key: string) => void;
  size?: string;
}) {
  const color = value ?? part.original;
  return (
    <label
      className={`relative ${size} shrink-0 overflow-hidden rounded-lg border border-white/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]`}
      style={{ background: color }}
      title={`Change ${part.label} color`}
    >
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(part, e.target.value)}
        onClick={() => onFocus(part.key)}
        aria-label={`${part.label} color`}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      {part.detail === "Tints the texture" && (
        <ImageIcon className="pointer-events-none absolute right-0.5 bottom-0.5 size-3 text-white drop-shadow-[0_0_2px_rgb(0_0_0/0.9)]" aria-hidden />
      )}
    </label>
  );
}

function Details({ info }: { info: ModelInfo }) {
  const [w, h, d] = info.size;
  const rows: [string, string][] = [
    ["File size", formatBytes(info.bytes)],
    ["Triangles", formatNumber(info.triangles)],
    ["Vertices", formatNumber(info.vertices)],
    ["Meshes", formatNumber(info.meshes)],
    ["Materials", String(info.materials)],
    ["Textures", String(info.textures)],
    ...(info.bones ? ([["Bones", String(info.bones)]] as [string, string][]) : []),
    ["Animations", info.animations.length ? info.animations.map((a) => `${a.name} (${a.duration.toFixed(1)} s)`).join(", ") : "None"],
    ["Size (w × h × d)", `${fmt(w)} × ${fmt(h)} × ${fmt(d)}`],
    ...(info.generator ? ([["Made with", info.generator]] as [string, string][]) : []),
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface/60 px-4 py-2">
      <h2 className="pt-2 pb-1 text-sm font-medium">Model details</h2>
      <dl className="divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2 text-sm">
            <dt className="shrink-0 text-muted">{label}</dt>
            <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {info.extensions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line py-3">
          {info.extensions.map((e) => (
            <span key={e} className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-subtle">
              {e}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function fmt(n: number) {
  return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
}
