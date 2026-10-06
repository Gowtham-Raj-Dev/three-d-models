"use client";

import { useSyncExternalStore } from "react";

/**
 * Which side panels are open on desktop and how wide they are — kept in localStorage so the builder
 * opens the way it was left. An external store: the server render (and hydration) uses the defaults,
 * then the saved layout takes over without a hydration mismatch.
 */
export interface PanelLayout {
  left: boolean;
  right: boolean;
  leftWidth: number;
  rightWidth: number;
}

export const PANEL_WIDTH = { min: 240, max: 560, default: 304 };

const KEY = "scene-builder:layout";
const DEFAULT: PanelLayout = { left: true, right: true, leftWidth: PANEL_WIDTH.default, rightWidth: PANEL_WIDTH.default };
const listeners = new Set<() => void>();
let current: PanelLayout | null = null;

const clampWidth = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Math.round(n))) : PANEL_WIDTH.default);

function read(): PanelLayout {
  if (current) return current;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<PanelLayout> | null;
    current = saved
      ? { left: saved.left !== false, right: saved.right !== false, leftWidth: clampWidth(saved.leftWidth), rightWidth: clampWidth(saved.rightWidth) }
      : DEFAULT;
  } catch {
    current = DEFAULT;
  }
  return current;
}

export function updatePanelLayout(patch: Partial<PanelLayout>) {
  const next = { ...read(), ...patch };
  current = { ...next, leftWidth: clampWidth(next.leftWidth), rightWidth: clampWidth(next.rightWidth) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode: the layout lasts for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePanelLayout(): PanelLayout {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}

/** Matches the `lg` breakpoint, where the panels sit beside the viewport instead of over it. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(min-width: 1024px)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}
