import type { SceneDoc, SceneItem } from "@/lib/builder/types";

export type SceneAction =
  | { type: "load"; doc: SceneDoc }
  /** Replaces the scene and clears undo history (first load). */
  | { type: "reset"; doc: SceneDoc }
  | { type: "add"; items: SceneItem[] }
  | { type: "update"; id: string; patch: Partial<SceneItem> }
  | { type: "updateMany"; patches: { id: string; patch: Partial<SceneItem> }[] }
  | { type: "remove"; ids: string[] }
  | { type: "scene"; patch: Partial<Omit<SceneDoc, "items" | "format" | "version">> }
  | { type: "undo" }
  | { type: "redo" };

export interface History {
  past: SceneDoc[];
  present: SceneDoc;
  future: SceneDoc[];
}

const LIMIT = 150;

function apply(doc: SceneDoc, action: SceneAction): SceneDoc {
  switch (action.type) {
    case "load":
      return action.doc;
    case "add":
      return { ...doc, items: [...doc.items, ...action.items] };
    case "update":
      return { ...doc, items: doc.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)) };
    case "updateMany": {
      const patches = new Map(action.patches.map((p) => [p.id, p.patch]));
      return { ...doc, items: doc.items.map((i) => (patches.has(i.id) ? { ...i, ...patches.get(i.id) } : i)) };
    }
    case "remove": {
      const ids = new Set(action.ids);
      return { ...doc, items: doc.items.filter((i) => !ids.has(i.id)) };
    }
    case "scene":
      return { ...doc, ...action.patch };
    default:
      return doc;
  }
}

export function historyReducer(state: History, action: SceneAction): History {
  if (action.type === "reset") return { past: [], present: action.doc, future: [] };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  const next = apply(state.present, action);
  if (next === state.present) return state;
  return { past: [...state.past, state.present].slice(-LIMIT), present: next, future: [] };
}
