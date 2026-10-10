"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, Copy, Crosshair, Dices, ExternalLink, Eye, EyeOff, Grid3x3, Lock, LockOpen, Sparkles, Trash2 } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { NumberField, PanelSection, Segmented, Toggle } from "@/components/builder/controls";
import { defaultClip, ENVIRONMENTS, GROUNDS, type EnvKey, type GroundKind, type Part, type PartsIndex, type SceneDoc, type SceneItem, type Vec3 } from "@/lib/builder/types";

const RAD = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Length of a closed path, in metres. */
function loopLength(path: Vec3[]): number {
  return path.reduce((sum, p, i) => {
    const q = path[(i + 1) % path.length];
    return sum + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  }, 0);
}

export interface ArrayOptions {
  count: number;
  dx: number;
  dz: number;
  /** Degrees added per copy. */
  rot: number;
}

export interface ScatterOptions {
  count: number;
  radius: number;
  /** ± fraction of the source scale, e.g. 0.2. */
  jitter: number;
}

function ActionButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border border-line px-1 py-2 text-[10px] font-medium transition-colors ${
        danger ? "text-rose-300 hover:border-rose-400/40 hover:bg-rose-500/10" : "text-muted hover:border-line-strong hover:text-fg"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function VecFields({ label, value, onCommit, step, suffix, toDisplay = (n) => n, fromDisplay = (n) => n }: {
  label: string;
  value: Vec3;
  onCommit: (v: Vec3) => void;
  step: number;
  suffix?: string;
  toDisplay?: (n: number) => number;
  fromDisplay?: (n: number) => number;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            value={r3(toDisplay(value[i]))}
            step={step}
            suffix={suffix}
            onCommit={(n) => {
              const next = [...value] as Vec3;
              next[i] = r3(fromDisplay(n));
              onCommit(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Inspector({
  item,
  part,
  clipNames,
  bipedClips,
  onUpdate,
  onDuplicate,
  onDelete,
  onDrop,
  onFocus,
  onArray,
  onScatter,
}: {
  item: SceneItem;
  part: Part | undefined;
  clipNames: string[] | undefined;
  bipedClips: PartsIndex["clips"];
  onUpdate: (patch: Partial<SceneItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDrop: () => void;
  onFocus: () => void;
  onArray: (o: ArrayOptions) => void;
  onScatter: (o: ScatterOptions) => void;
}) {
  const [array, setArray] = useState<ArrayOptions>({ count: 5, dx: 4, dz: 0, rot: 0 });
  const [scatter, setScatter] = useState<ScatterOptions>({ count: 8, radius: 8, jitter: 0.2 });
  const [perAxis, setPerAxis] = useState(false);
  const uniform = !perAxis && item.scale[0] === item.scale[1] && item.scale[1] === item.scale[2];

  const animationOptions = (() => {
    if (item.kind !== "model") return null;
    if (part?.set) {
      const clips = bipedClips.filter((c) => c.set === part.set);
      return { value: item.animation === undefined ? `${part.set}_idle_neutral_01` : (item.animation ?? "none"), options: clips.map((c) => ({ value: c.id, label: c.label })) };
    }
    if (!clipNames?.length) return null;
    const value = item.animation === undefined ? (defaultClip(clipNames) ?? "none") : (item.animation ?? "none");
    return { value, options: clipNames.map((n) => ({ value: n, label: n.replace(/_/g, " ") })) };
  })();

  return (
    <>
      <PanelSection title={item.kind === "light" ? "Light" : "Part"}>
        <input
          key={item.id}
          defaultValue={item.name}
          aria-label="Name"
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== item.name) onUpdate({ name });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg focus:border-accent/60 focus:outline-none"
        />
        {part && (
          <p className="mt-2 flex items-center justify-between gap-2 text-[11px] text-subtle">
            <span className="truncate">
              {part.collection} · {part.tri.toLocaleString("en-US")} tris
            </span>
            <Link href={`/models/${part.slug}/`} target="_blank" className="inline-flex shrink-0 items-center gap-1 text-muted hover:text-fg">
              Model page <ExternalLink className="size-3" />
            </Link>
          </p>
        )}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          <ActionButton label="Focus" onClick={onFocus}>
            <Crosshair className="size-4" />
          </ActionButton>
          <ActionButton label="Copy" onClick={onDuplicate}>
            <Copy className="size-4" />
          </ActionButton>
          <ActionButton label={item.hidden ? "Show" : "Hide"} onClick={() => onUpdate({ hidden: !item.hidden })}>
            {item.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </ActionButton>
          <ActionButton label={item.locked ? "Unlock" : "Lock"} onClick={() => onUpdate({ locked: !item.locked })}>
            {item.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          </ActionButton>
          <ActionButton label="Delete" onClick={onDelete} danger>
            <Trash2 className="size-4" />
          </ActionButton>
        </div>
      </PanelSection>

      <PanelSection
        title="Transform"
        action={
          item.kind === "model" && (
            <span className="flex gap-1">
              <button type="button" onClick={onDrop} title="Rest on the surface below" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-white/[0.06] hover:text-fg">
                <ArrowDownToLine className="size-3" /> Drop
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ rotation: [item.rotation[0], r3(Math.random() * Math.PI * 2), item.rotation[2]] })}
                title="Random rotation"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-white/[0.06] hover:text-fg"
              >
                <Dices className="size-3" /> Spin
              </button>
            </span>
          )
        }
      >
        <div className="space-y-3">
          <VecFields label="Position (m)" value={item.position} step={0.25} onCommit={(position) => onUpdate({ position })} />
          {item.kind === "model" && (
            <>
              <VecFields
                label="Rotation"
                value={item.rotation}
                step={15}
                suffix="°"
                toDisplay={(n) => n / RAD}
                fromDisplay={(n) => n * RAD}
                onCommit={(rotation) => onUpdate({ rotation })}
              />
              {uniform ? (
                <div className="space-y-1.5">
                  <p className="flex items-center justify-between text-[11px] text-muted">
                    Scale
                    <button type="button" onClick={() => setPerAxis(true)} className="text-subtle hover:text-fg">
                      Per axis
                    </button>
                  </p>
                  <NumberField label="×" value={item.scale[0]} step={0.1} min={0.01} onCommit={(s) => onUpdate({ scale: [s, s, s] })} />
                </div>
              ) : (
                <VecFields label="Scale" value={item.scale} step={0.1} onCommit={(scale) => onUpdate({ scale })} />
              )}
            </>
          )}
        </div>
      </PanelSection>

      {animationOptions && (
        <PanelSection title={item.motion ? "Animation while moving" : "Animation"}>
          <Dropdown
            label="Animation"
            value={animationOptions.value}
            onChange={(v) => onUpdate({ animation: v === "none" ? null : v })}
            options={[{ value: "none", label: "None (rest pose)" }, ...animationOptions.options]}
            searchable={animationOptions.options.length > 8}
          />
          <p className="mt-2 text-[11px] leading-snug text-subtle">Plays in the editor and is included in the .glb export as its own animation.</p>
        </PanelSection>
      )}

      {item.motion && (
        <PanelSection title="Moves along a path">
          <p className="mb-2.5 text-[11px] leading-snug text-muted">
            {item.motion.orient === "full" ? "Coaster car — rides round its track" : "Walks a"} {Math.round(loopLength(item.motion.path))} m loop
            {item.motion.stops?.length ? `, waiting at ${item.motion.stops.length} stop${item.motion.stops.length === 1 ? "" : "s"}` : ""}. The dashed line shows the route; while
            selected the part rests here, and moving it moves its route too.
          </p>
          <div className="space-y-2">
            <NumberField
              label="Speed"
              value={item.motion.speed}
              step={0.1}
              min={0.1}
              suffix="m/s"
              onCommit={(speed) => onUpdate({ motion: { ...item.motion!, speed } })}
            />
            {!!item.motion.stops?.length && animationOptions && (
              <Dropdown
                label="While waiting"
                value={item.motion.stopAnimation ?? "none"}
                onChange={(v) => onUpdate({ motion: { ...item.motion!, stopAnimation: v === "none" ? null : v } })}
                options={[{ value: "none", label: "None (rest pose)" }, ...animationOptions.options]}
                searchable={animationOptions.options.length > 8}
              />
            )}
            <button
              type="button"
              onClick={() => onUpdate({ motion: undefined, ...(item.motion!.stopAnimation !== undefined ? { animation: item.motion!.stopAnimation } : {}) })}
              className="w-full rounded-lg border border-line py-1.5 text-[11px] font-medium text-muted hover:border-line-strong hover:text-fg"
            >
              Stop moving — stay here
            </button>
          </div>
        </PanelSection>
      )}

      {item.kind === "light" && item.light && (
        <PanelSection title="Light settings">
          <div className="space-y-2">
            <label className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2 text-[10px] font-semibold text-subtle uppercase">
              Color
              <input
                type="color"
                value={item.light.color}
                onChange={(e) => onUpdate({ light: { ...item.light!, color: e.target.value } })}
                className="h-5 flex-1 cursor-pointer rounded border-0 bg-transparent"
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="Power" value={item.light.intensity} step={1} min={0} onCommit={(intensity) => onUpdate({ light: { ...item.light!, intensity } })} />
              <NumberField label="Range" value={item.light.distance} step={1} min={0} suffix="m" onCommit={(distance) => onUpdate({ light: { ...item.light!, distance } })} />
            </div>
            <Toggle label="Flame flicker" hint="Editor only — glTF lights are static" checked={!!item.light.flicker} onChange={(flicker) => onUpdate({ light: { ...item.light!, flicker } })} />
          </div>
        </PanelSection>
      )}

      <PanelSection title="Array — fences, rows, paths">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField label="Copies" value={array.count} step={1} min={2} max={60} onCommit={(count) => setArray((a) => ({ ...a, count: Math.round(count) }))} />
          <NumberField label="Turn" value={array.rot} step={15} suffix="°" onCommit={(rot) => setArray((a) => ({ ...a, rot }))} />
          <NumberField label="Step X" value={array.dx} step={0.5} suffix="m" onCommit={(dx) => setArray((a) => ({ ...a, dx }))} />
          <NumberField label="Step Z" value={array.dz} step={0.5} suffix="m" onCommit={(dz) => setArray((a) => ({ ...a, dz }))} />
        </div>
        <button
          type="button"
          onClick={() => onArray(array)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-medium text-muted hover:border-line-strong hover:text-fg"
        >
          <Grid3x3 className="size-3.5" /> Make {array.count} in a row
        </button>
      </PanelSection>

      <PanelSection title="Scatter — forests, rocks, bones">
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField label="N" value={scatter.count} step={1} min={1} max={80} onCommit={(count) => setScatter((s) => ({ ...s, count: Math.round(count) }))} />
          <NumberField label="R" value={scatter.radius} step={1} min={1} suffix="m" onCommit={(radius) => setScatter((s) => ({ ...s, radius }))} />
          <NumberField label="±" value={Math.round(scatter.jitter * 100)} step={5} min={0} max={90} suffix="%" onCommit={(j) => setScatter((s) => ({ ...s, jitter: j / 100 }))} />
        </div>
        <button
          type="button"
          onClick={() => onScatter(scatter)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-medium text-muted hover:border-line-strong hover:text-fg"
        >
          <Sparkles className="size-3.5" /> Scatter {scatter.count} around it
        </button>
        <p className="mt-2 text-[11px] leading-snug text-subtle">Random spots, turns and sizes within the radius — no overlaps.</p>
      </PanelSection>
    </>
  );
}

/** Shown when several parts are selected: bulk actions; the gizmo moves them as one group. */
export function MultiInspector({
  items,
  onSelectOnly,
  onFocus,
  onDuplicate,
  onDelete,
  onDrop,
  onSpin,
  onUpdateAll,
}: {
  items: SceneItem[];
  onSelectOnly: (id: string) => void;
  onFocus: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDrop: () => void;
  onSpin: () => void;
  onUpdateAll: (patch: Partial<SceneItem>) => void;
}) {
  const allHidden = items.every((i) => i.hidden);
  const allLocked = items.every((i) => i.locked);
  return (
    <>
      <PanelSection title={`${items.length} parts selected`}>
        <div className="grid grid-cols-5 gap-1.5">
          <ActionButton label="Focus" onClick={onFocus}>
            <Crosshair className="size-4" />
          </ActionButton>
          <ActionButton label="Copy" onClick={onDuplicate}>
            <Copy className="size-4" />
          </ActionButton>
          <ActionButton label={allHidden ? "Show" : "Hide"} onClick={() => onUpdateAll({ hidden: !allHidden })}>
            {allHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </ActionButton>
          <ActionButton label={allLocked ? "Unlock" : "Lock"} onClick={() => onUpdateAll({ locked: !allLocked })}>
            {allLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          </ActionButton>
          <ActionButton label="Delete" onClick={onDelete} danger>
            <Trash2 className="size-4" />
          </ActionButton>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onDrop} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-medium text-muted hover:border-line-strong hover:text-fg">
            <ArrowDownToLine className="size-3.5" /> Drop all
          </button>
          <button type="button" onClick={onSpin} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-medium text-muted hover:border-line-strong hover:text-fg">
            <Dices className="size-3.5" /> Random turns
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-subtle">
          Drag the gizmo to move, rotate or scale them together. Ctrl+C then Ctrl+V copies the whole group to where your mouse is.
        </p>
      </PanelSection>
      <PanelSection title="In the selection">
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => onSelectOnly(i.id)} className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-muted hover:bg-white/[0.05] hover:text-fg">
                {i.name}
              </button>
            </li>
          ))}
        </ul>
      </PanelSection>
    </>
  );
}

export function SceneSettings({
  doc,
  stats,
  onScene,
}: {
  doc: SceneDoc;
  stats: { items: number; triangles: number; lights: number; animated: number };
  onScene: (patch: Partial<Pick<SceneDoc, "name" | "environment" | "ground">>) => void;
}) {
  return (
    <>
      <PanelSection title="Scene">
        <input
          key={doc.name}
          defaultValue={doc.name}
          aria-label="Scene name"
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== doc.name) onScene({ name });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg focus:border-accent/60 focus:outline-none"
        />
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {[
            ["Parts", stats.items],
            ["Triangles", stats.triangles],
            ["Lights", stats.lights],
            ["Animated", stats.animated],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <dt className="text-[10px] text-subtle uppercase">{k}</dt>
              <dd className="font-medium text-fg tabular-nums">{Number(v).toLocaleString("en-US")}</dd>
            </div>
          ))}
        </dl>
      </PanelSection>

      <PanelSection title="Lighting">
        <Segmented<EnvKey>
          label="Lighting"
          value={doc.environment}
          onChange={(environment) => onScene({ environment })}
          options={(Object.keys(ENVIRONMENTS) as EnvKey[]).map((k) => ({ value: k, label: ENVIRONMENTS[k].label }))}
        />
      </PanelSection>

      <PanelSection title="Ground">
        <Dropdown
          label="Ground"
          value={doc.ground.kind}
          onChange={(kind) => onScene({ ground: { ...doc.ground, kind: kind as GroundKind } })}
          options={(Object.keys(GROUNDS) as GroundKind[]).map((k) => ({ value: k, label: GROUNDS[k].label }))}
        />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <NumberField label="Size" value={doc.ground.size} step={10} min={4} max={1000} suffix="m" onCommit={(size) => onScene({ ground: { ...doc.ground, size } })} />
          <NumberField label="Level" value={doc.ground.y} step={0.05} suffix="m" onCommit={(y) => onScene({ ground: { ...doc.ground, y } })} />
        </div>
      </PanelSection>

      <PanelSection title="How it works">
        <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-muted">
          <li>Pick a part on the left, then click in the scene to drop it. Hold Shift to keep stamping.</li>
          <li>Click a part in the scene to move (W), rotate (E) or scale (R) it with the gizmo. Shift+click adds more parts.</li>
          <li>Ctrl+C / Ctrl+V copies parts to where your mouse is. Use Array for fences and rows, Scatter for forests and clutter.</li>
          <li>Export as one .glb (every animation plays together) — or a zip with the project file, preview and licenses.</li>
          <li>Press ? for all keyboard shortcuts.</li>
        </ol>
        <Link href="/tutorials/" target="_blank" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-fg">
          Watch a step-by-step tutorial <ExternalLink className="size-3" />
        </Link>
      </PanelSection>
    </>
  );
}
