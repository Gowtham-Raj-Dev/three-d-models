"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
  shortcut,
  className = "",
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  shortcut?: string;
  className?: string;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={active}
      className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-35 ${
        active ? "bg-accent/20 text-fg ring-1 ring-accent/50" : "text-muted hover:bg-white/[0.08] hover:text-fg"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

export function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] text-subtle uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Number input that commits on Enter / blur (one undo step per edit, not per keystroke). */
export function NumberField({
  label,
  value,
  onCommit,
  step = 0.1,
  min,
  max,
  suffix,
  className = "",
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 1000) / 1000);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <label className={`flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 focus-within:border-accent/60 ${className}`}>
      <span className="shrink-0 text-[10px] font-semibold text-subtle uppercase">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={shown}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = Math.round((value + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)) * 1000) / 1000;
            onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
          }
        }}
        className="w-full min-w-0 bg-transparent text-xs text-fg tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && <span className="shrink-0 text-[10px] text-subtle">{suffix}</span>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5 select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-4.5 w-8 shrink-0 rounded-full bg-white/10 transition-colors peer-checked:bg-accent/70 peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-3.5"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-fg">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-subtle">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`truncate rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
            value === o.value ? "bg-white/[0.1] text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Button + floating panel that closes on outside click / Escape. The panel is portalled to <body>
 * and placed under its trigger, so scrolling toolbars and panels can't clip it.
 */
export function Popover({
  trigger,
  children,
  align = "left",
  label,
  width = "w-80",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  label: string;
  width?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = !!anchor;

  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const style: CSSProperties | undefined = anchor
    ? {
        top: anchor.bottom + 8,
        maxHeight: `calc(100dvh - ${anchor.bottom + 20}px)`,
        ...(align === "right" ? { right: Math.max(12, window.innerWidth - anchor.right) } : { left: Math.min(Math.max(12, anchor.left), window.innerWidth - 12 - 240) }),
      }
    : undefined;

  return (
    <div ref={root} className="relative shrink-0">
      {trigger({ open, toggle: () => setAnchor((a) => (a ? null : (root.current?.getBoundingClientRect() ?? null))) })}
      {anchor &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            style={style}
            className={`fixed z-50 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-elevated/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl ${width}`}
          >
            {children(() => setAnchor(null))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Centered dialog over a dimmed backdrop; Escape and backdrop clicks close it unless `busy`. */
export function Modal({
  title,
  onClose,
  children,
  wide,
  busy,
  width,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
  /** Max-width class, overriding `wide`. */
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-2xl border border-line-strong bg-elevated shadow-2xl shadow-black/60 ${width ?? (wide ? "max-w-3xl" : "max-w-md")}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.08] hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
