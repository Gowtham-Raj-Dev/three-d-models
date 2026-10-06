"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Download,
  Expand,
  FilePlus2,
  FolderOpen,
  Globe,
  Grid2x2,
  Keyboard,
  Layers,
  LoaderCircle,
  Magnet,
  Move3d,
  Package,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Redo2,
  Rotate3d,
  Save,
  Scaling,
  Shrink,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { AiDialog } from "@/components/builder/ai-dialog";
import { IconButton, Modal, Popover, Segmented, Toggle, ToolbarDivider } from "@/components/builder/controls";
import { Inspector, MultiInspector, SceneSettings, type ArrayOptions, type ScatterOptions } from "@/components/builder/inspector";
import { Outliner } from "@/components/builder/outliner";
import { PANEL_WIDTH, updatePanelLayout, useIsDesktop, usePanelLayout } from "@/components/builder/panel-layout";
import { PART_MIME, PartsPanel } from "@/components/builder/parts-panel";
import type { AnimationExport, BuilderApi, CameraView, Placing, TransformMode } from "@/components/builder/builder-canvas";
import { LogoMark } from "@/components/site-header";
import { asset } from "@/lib/asset";
import type { AiResult } from "@/lib/builder/ai";
import { buildAiScene } from "@/lib/builder/ai-build";
import { buildScenePack, projectJson, sceneCredits, slugify } from "@/lib/builder/export";
import { historyReducer } from "@/lib/builder/history";
import {
  deleteProject,
  getCurrentProjectId,
  listProjects,
  loadProject,
  migrateLegacyAutosave,
  newProjectId,
  saveProject,
  setCurrentProjectId,
  type ProjectMeta,
} from "@/lib/builder/projects";
import { buildTemplate, TEMPLATES } from "@/lib/builder/templates";
import { emptyScene, ENVIRONMENTS, newId, parseSceneFile, resolveParts, type EnvKey, type Part, type PartsIndex, type SceneDoc, type SceneItem, type Vec3 } from "@/lib/builder/types";
import { saveBlob } from "@/lib/zip";

const BuilderCanvas = dynamic(() => import("@/components/builder/builder-canvas"), {
  ssr: false,
  loading: () => <CenterNote spinner>Starting the 3D editor…</CenterNote>,
});

const DEFAULT_SEED = 20261005;
const CLIPBOARD_KEY = "scene-builder:clipboard";
const RAD = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const EMPTY_CAMERA: CameraView = { position: [0, 14, 26], target: [0, 0, 0] };
const ENV_KEYS = Object.keys(ENVIRONMENTS) as EnvKey[];

const SNAP_OPTIONS = [0.25, 0.5, 1, 2, 4];

const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: "Edit",
    keys: [
      ["Ctrl+C / Ctrl+X", "Copy / cut selection"],
      ["Ctrl+V", "Paste at the mouse pointer (works across tabs)"],
      ["Ctrl+D", "Duplicate selection"],
      ["Ctrl+A", "Select all"],
      ["Shift+click / Ctrl+click", "Add to / remove from selection"],
      ["Delete / Backspace", "Delete selection"],
      ["Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y", "Undo / redo"],
      ["Esc", "Stop placing / clear selection"],
    ],
  },
  {
    group: "Transform",
    keys: [
      ["W / E / R", "Move / rotate / scale gizmo"],
      ["Q", "Gizmo in world / local axes"],
      ["[ / ]", "Turn 15° (Shift: 90°) — also the part being placed"],
      ["+ / -", "Scale up / down 10%"],
      ["Arrow keys", "Nudge on the ground (Shift: ×10)"],
      ["PgUp / PgDn", "Nudge up / down"],
      ["End", "Drop onto the surface below"],
      ["G", "Snap to grid on / off"],
    ],
  },
  {
    group: "View",
    keys: [
      ["F / double-click", "Focus selection"],
      ["Shift+F / Home", "Frame the whole scene"],
      ["H / Alt+H", "Hide selection / show everything"],
      ["L", "Lock / unlock selection"],
      ["Space", "Pause / play animations"],
      ["1 – 4", "Day / sunset / night / studio lighting"],
      ["Shift+G", "Grid on / off"],
      ["Alt+[ / Alt+]", "Hide / show the left / right panel"],
      ["/", "Search parts"],
    ],
  },
  {
    group: "Project",
    keys: [
      ["Alt+N", "New project"],
      ["Alt+I", "Generate a scene with AI"],
      ["Ctrl+O", "Open project file"],
      ["Ctrl+S", "Save project file"],
      ["Ctrl+E", "Export (.glb / .zip / .png)"],
      ["P", "Download a screenshot"],
      ["?", "This list"],
    ],
  },
];

function CenterNote({ children, spinner }: { children: ReactNode; spinner?: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <p className="glass flex items-center gap-2.5 rounded-full px-4 py-2 text-xs text-muted">
        {spinner && <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />}
        {children}
      </p>
    </div>
  );
}

function footprint(item: SceneItem, part: Part | undefined): number {
  if (!part) return 0.5;
  return (Math.max(part.size[0], part.size[2]) * Math.max(Math.abs(item.scale[0]), Math.abs(item.scale[2]))) / 2;
}

function timeAgo(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

/** Copied parts go to localStorage, so Ctrl+V also works in another builder tab. */
function writeClipboard(items: SceneItem[]): SceneItem[] {
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ format: "3d-models-scene", version: 1, items }));
  } catch {
    // Falls back to the in-memory copy.
  }
  return items;
}

function readClipboard(): SceneItem[] | null {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    return raw ? parseSceneFile(JSON.parse(raw)).items : null;
  } catch {
    return null;
  }
}

export function SceneBuilder() {
  const [index, setIndex] = useState<PartsIndex | null>(null);
  const [loadError, setLoadError] = useState(false);
  const parts = useMemo(() => (index ? resolveParts(index) : null), [index]);
  const partsMap = useMemo(() => new Map((parts ?? []).map((p) => [p.id, p])), [parts]);

  const [history, dispatch] = useReducer(historyReducer, null, () => ({ past: [], present: emptyScene(), future: [] }));
  const doc = history.present;
  const [ready, setReady] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<TransformMode>("translate");
  const [space, setSpace] = useState<"world" | "local">("world");
  const [snap, setSnap] = useState(0.5);
  const [snapOn, setSnapOn] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [paused, setPaused] = useState(false);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [clipNames, setClipNames] = useState<Record<string, string[]>>({});
  const [leftTab, setLeftTab] = useState<"parts" | "scene">("parts");
  const [mobilePanel, setMobilePanel] = useState<"left" | "right" | null>(null);
  /** Desktop: side panels can be hidden (leaving a slim rail) and resized; phones show them as overlays. */
  const layout = usePanelLayout();
  const isDesktop = useIsDesktop();
  const toggleLeft = useCallback(() => {
    if (isDesktop) updatePanelLayout({ left: !layout.left });
    else setMobilePanel((p) => (p === "left" ? null : "left"));
  }, [isDesktop, layout.left]);
  const toggleRight = useCallback(() => {
    if (isDesktop) updatePanelLayout({ right: !layout.right });
    else setMobilePanel((p) => (p === "right" ? null : "right"));
  }, [isDesktop, layout.right]);
  const [toast, setToast] = useState<{ text: string; tone?: "error" } | null>(null);
  const [dialog, setDialog] = useState<"export" | "new" | "shortcuts" | "ai" | null>(null);
  /**
   * The last AI plan, so Remix can lay it out again without asking Gemini — with the scene it was
   * added to (add mode), which Remix starts again from.
   */
  const [lastAi, setLastAi] = useState<{ result: AiResult; projectId: string; base: SceneDoc | null } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const apiRef = useRef<BuilderApi | null>(null);
  const pendingCamera = useRef<CameraView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const memoryClipboard = useRef<SceneItem[] | null>(null);
  const pasteCount = useRef(0);
  const storageWarned = useRef(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => doc.items.filter((i) => selectedSet.has(i.id)), [doc.items, selectedSet]);
  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  const singlePart = single?.part ? partsMap.get(single.part) : undefined;
  const effectiveSnap = snapOn ? snap : 0;

  const notify = useCallback((text: string, tone?: "error") => setToast({ text, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // The builder is a full-screen app: the page itself never scrolls, only its panels do.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      html.style.overflow = previous;
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  const applyCamera = useCallback((view: CameraView | undefined) => {
    if (!view) return;
    if (apiRef.current) apiRef.current.setCamera(view);
    else pendingCamera.current = view;
  }, []);

  const onCanvasReady = useCallback(() => {
    if (pendingCamera.current && apiRef.current) {
      apiRef.current.setCamera(pendingCamera.current);
      pendingCamera.current = null;
    }
  }, []);

  const loadDoc = useCallback(
    (next: SceneDoc, undoable = true) => {
      dispatch(undoable ? { type: "load", doc: next } : { type: "reset", doc: next });
      setSelectedIds([]);
      setPlacing(null);
      applyCamera(next.camera);
    },
    [applyCamera],
  );

  // Load the parts index, then the last project (or the haunted backyard on a first visit).
  useEffect(() => {
    let cancelled = false;
    fetch(asset("/data/parts.json"))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PartsIndex>;
      })
      .then((data) => {
        if (cancelled) return;
        setIndex(data);
        migrateLegacyAutosave();
        let id = getCurrentProjectId();
        let initial = id ? loadProject(id) : null;
        if (!id || !initial) {
          id = newProjectId();
          const map = new Map(resolveParts(data).map((p) => [p.id, p]));
          initial = buildTemplate(TEMPLATES[0], map, DEFAULT_SEED);
          setCurrentProjectId(id);
        }
        setProjectId(id);
        loadDoc(initial, false);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadDoc]);

  // Autosave the current project in this browser.
  const snapshot = useCallback(() => ({ ...doc, camera: apiRef.current?.getCamera() ?? doc.camera }), [doc]);
  useEffect(() => {
    if (!ready || !projectId) return;
    const save = () => {
      if (!saveProject(projectId, snapshot()) && !storageWarned.current) {
        storageWarned.current = true;
        notify("Browser storage is full — use Save (Ctrl+S) to keep a project file.", "error");
      }
    };
    const t = window.setTimeout(save, 700);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pagehide", save);
    };
  }, [snapshot, ready, projectId, notify]);

  // --- Projects -----------------------------------------------------------------------------------

  const switchProject = useCallback(
    (id: string, next: SceneDoc) => {
      if (projectId) saveProject(projectId, snapshot());
      saveProject(id, next);
      setCurrentProjectId(id);
      setProjectId(id);
      loadDoc(next, false);
    },
    [projectId, snapshot, loadDoc],
  );

  const createProject = useCallback(
    (name: string, start: string, environment: EnvKey) => {
      const template = TEMPLATES.find((t) => t.key === start);
      const next: SceneDoc = template
        ? { ...buildTemplate(template, partsMap, Math.floor(Math.random() * 1e9)), name }
        : { ...emptyScene(name), environment, camera: EMPTY_CAMERA };
      switchProject(newProjectId(), next);
      setDialog(null);
      notify(`Created “${name}” — your previous project is under Projects`);
    },
    [partsMap, switchProject, notify],
  );

  const openStoredProject = useCallback(
    (meta: ProjectMeta) => {
      const next = loadProject(meta.id);
      if (!next) return notify("That project couldn't be read.", "error");
      switchProject(meta.id, next);
      notify(`Opened “${next.name}”`);
    },
    [switchProject, notify],
  );

  const saveFile = useCallback(() => {
    saveBlob(new Blob([projectJson(snapshot())], { type: "application/json" }), `${slugify(doc.name)}.scene.json`);
    notify("Project file saved — open it here any time to keep editing");
  }, [snapshot, doc.name, notify]);

  const openFile = useCallback(
    async (file: File) => {
      try {
        const next = parseSceneFile(JSON.parse(await file.text()));
        switchProject(newProjectId(), next);
        notify(`Opened ${next.name} (${next.items.length} objects) as a new project`);
      } catch (err) {
        notify(err instanceof Error && err.message.startsWith("Not a scene") ? err.message : "Couldn't read that file.", "error");
      }
    },
    [switchProject, notify],
  );

  const aiRemixable = !!lastAi && lastAi.projectId === projectId && !doc.template;

  const remix = useCallback(() => {
    const t = TEMPLATES.find((x) => x.key === doc.template?.key);
    const seed = Math.floor(Math.random() * 1e9);
    const ai = aiRemixable ? lastAi : null;
    if (t) loadDoc({ ...buildTemplate(t, partsMap, seed), name: doc.name });
    else if (ai?.base && index) {
      // Re-lay the addition on the scene as it was before it — the camera stays where it is.
      dispatch({ type: "load", doc: { ...buildAiScene(ai.result, partsMap, index.clips, seed, ai.base).doc, name: doc.name } });
      setSelectedIds([]);
    } else if (ai && index) loadDoc({ ...buildAiScene(ai.result, partsMap, index.clips, seed, null).doc, name: doc.name });
    else return;
    notify("New layout — Ctrl+Z brings the previous one back");
  }, [doc.template, doc.name, partsMap, loadDoc, notify, aiRemixable, lastAi, index]);

  const applyAiResult = useCallback(
    (result: AiResult) => {
      if (!index) return;
      const seed = Math.floor(Math.random() * 1e9);
      const base = result.mode === "edit" ? { ...doc, camera: apiRef.current?.getCamera() ?? doc.camera } : null;
      const { doc: next, report } = buildAiScene(result, partsMap, index.clips, seed, base);
      const skipped = [
        report.unknown.length ? ` · skipped ${report.unknown.length} unknown part name${report.unknown.length === 1 ? "" : "s"}` : "",
        report.skippedRides ? ` · ${report.skippedRides} ride${report.skippedRides === 1 ? "" : "s"} didn't fit` : "",
      ].join("");
      const moving = [report.trains ? `${report.trains} train${report.trains === 1 ? "" : "s"}` : "", report.walkers ? `${report.walkers} walking` : ""].filter(Boolean).join(", ");
      const summary = `${report.objects} objects${moving ? ` (${moving})` : ""}, ${report.lights} lights from ${report.kits.length} kits${skipped}`;
      setDialog(null);
      if (base) {
        // One undo step brings the scene back to how it was.
        dispatch({ type: "load", doc: next });
        setSelectedIds([]);
        setPlacing(null);
        setLastAi({ result, projectId: projectId ?? "", base });
        const edits = [report.removed ? `removed ${report.removed}` : "", report.changed ? `changed ${report.changed}` : "", report.objects + report.lights ? `added ${summary}` : ""].filter(Boolean);
        notify(`${edits.length ? `Updated “${next.name}”: ${edits.join(" · ")}` : `Nothing to change in “${next.name}” for that request`} — Ctrl+Z undoes it`);
      } else {
        const id = newProjectId();
        switchProject(id, next);
        setLastAi({ result, projectId: id, base: null });
        notify(`New project “${next.name}”: ${summary}`);
      }
    },
    [index, partsMap, switchProject, notify, doc, projectId],
  );

  // --- Item operations ----------------------------------------------------------------------------

  const uniqueName = useCallback(
    (base: string, taken = new Set(doc.items.map((i) => i.name))) => {
      if (!taken.has(base)) return base;
      for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
    },
    [doc.items],
  );

  /** Fresh copies of `items` (new ids and names, unlocked) moved by `offset`. */
  const cloneItems = useCallback(
    (items: SceneItem[], offset: Vec3) => {
      const taken = new Set(doc.items.map((i) => i.name));
      return items.map((item) => {
        const name = uniqueName(item.name.replace(/ \d+$/, ""), taken);
        taken.add(name);
        return {
          ...item,
          id: newId(),
          name,
          locked: false,
          hidden: false,
          position: [r3(item.position[0] + offset[0]), r3(item.position[1] + offset[1]), r3(item.position[2] + offset[2])] as Vec3,
        };
      });
    },
    [doc.items, uniqueName],
  );

  const addAndSelect = useCallback((items: SceneItem[]) => {
    if (!items.length) return;
    dispatch({ type: "add", items });
    setSelectedIds(items.map((i) => i.id));
  }, []);

  const makeItem = useCallback(
    (what: Placing, position: Vec3): SceneItem =>
      what.kind === "light"
        ? {
            id: newId(),
            kind: "light",
            name: uniqueName("Point light"),
            position: [position[0], r3(position[1] + 1.2), position[2]],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            light: { color: "#ffa040", intensity: 14, distance: 14, flicker: true },
          }
        : {
            id: newId(),
            kind: "model",
            part: what.part.id,
            glb: what.part.glb,
            name: uniqueName(what.part.title),
            position,
            rotation: [0, r3(what.rotation), 0],
            scale: [1, 1, 1],
          },
    [uniqueName],
  );

  const onPlace = useCallback(
    (position: Vec3, keep: boolean) => {
      if (!placing) return;
      const item = makeItem(placing, position);
      dispatch({ type: "add", items: [item] });
      if (!keep) {
        setPlacing(null);
        setSelectedIds([item.id]);
      }
    },
    [placing, makeItem],
  );

  const update = useCallback((id: string, patch: Partial<SceneItem>) => dispatch({ type: "update", id, patch }), []);
  const updateSelected = useCallback(
    (patch: (item: SceneItem) => Partial<SceneItem>) => {
      const editable = selectedItems.filter((i) => !i.locked || "locked" in patch(i));
      if (editable.length) dispatch({ type: "updateMany", patches: editable.map((i) => ({ id: i.id, patch: patch(i) })) });
    },
    [selectedItems],
  );

  const duplicate = useCallback(() => {
    const step = Math.max(effectiveSnap, 1);
    addAndSelect(cloneItems(selectedItems, [step, 0, 0]));
  }, [selectedItems, effectiveSnap, cloneItems, addAndSelect]);

  const remove = useCallback(() => {
    if (!selectedItems.length) return;
    dispatch({ type: "remove", ids: selectedItems.map((i) => i.id) });
    setSelectedIds([]);
  }, [selectedItems]);

  const copy = useCallback(
    (cut = false) => {
      if (!selectedItems.length) return;
      memoryClipboard.current = writeClipboard(selectedItems);
      pasteCount.current = 0;
      if (cut) remove();
      notify(`${cut ? "Cut" : "Copied"} ${selectedItems.length === 1 ? selectedItems[0].name : `${selectedItems.length} parts`} — Ctrl+V pastes at the mouse pointer`);
    },
    [selectedItems, remove, notify],
  );

  const paste = useCallback(() => {
    const items = readClipboard() ?? memoryClipboard.current;
    if (!items?.length) return notify("Nothing to paste — select parts and press Ctrl+C first.", "error");
    const cx = items.reduce((n, i) => n + i.position[0], 0) / items.length;
    const cz = items.reduce((n, i) => n + i.position[2], 0) / items.length;
    const minY = Math.min(...items.map((i) => i.position[1]));
    const target = pointer.current ? apiRef.current?.pointAt(pointer.current.x, pointer.current.y) : null;
    let offset: Vec3;
    if (target) {
      offset = [target[0] - cx, target[1] - minY, target[2] - cz];
    } else {
      pasteCount.current++;
      const step = Math.max(effectiveSnap, 1) * pasteCount.current;
      offset = [step, 0, step];
    }
    const pasted = cloneItems(items, offset);
    addAndSelect(pasted);
    setPlacing(null);
    notify(`Pasted ${pasted.length === 1 ? pasted[0].name : `${pasted.length} parts`}`);
  }, [effectiveSnap, cloneItems, addAndSelect, notify]);

  const selectAll = useCallback(() => {
    setPlacing(null);
    setSelectedIds(doc.items.filter((i) => !i.locked && !i.hidden).map((i) => i.id));
  }, [doc.items]);

  const makeArray = useCallback(
    ({ count, dx, dz, rot }: ArrayOptions) => {
      if (!single) return;
      const taken = new Set(doc.items.map((i) => i.name));
      const base = single.name.replace(/ \d+$/, "");
      const copies: SceneItem[] = [];
      for (let i = 1; i < count; i++) {
        const name = uniqueName(base, taken);
        taken.add(name);
        copies.push({
          ...single,
          id: newId(),
          name,
          locked: false,
          position: [r3(single.position[0] + dx * i), single.position[1], r3(single.position[2] + dz * i)],
          rotation: [single.rotation[0], r3(single.rotation[1] + rot * RAD * i), single.rotation[2]],
        });
      }
      dispatch({ type: "add", items: copies });
      notify(`Added ${copies.length} copies of ${base}`);
    },
    [single, doc.items, uniqueName, notify],
  );

  const scatter = useCallback(
    ({ count, radius, jitter }: ScatterOptions) => {
      if (!single) return;
      const part = single.part ? partsMap.get(single.part) : undefined;
      const occupied = doc.items.map((i) => ({ x: i.position[0], z: i.position[2], r: footprint(i, i.part ? partsMap.get(i.part) : undefined) * 0.8 }));
      const taken = new Set(doc.items.map((i) => i.name));
      const base = single.name.replace(/ \d+$/, "");
      const copies: SceneItem[] = [];
      for (let tries = 0; copies.length < count && tries < count * 50; tries++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * radius;
        const x = single.position[0] + Math.cos(angle) * dist;
        const z = single.position[2] + Math.sin(angle) * dist;
        const s = single.scale[0] * (1 + (Math.random() * 2 - 1) * jitter);
        const r = part ? (Math.max(part.size[0], part.size[2]) * s) / 2 : 0.5;
        if (!occupied.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r * 0.9)) continue;
        occupied.push({ x, z, r });
        const name = uniqueName(base, taken);
        taken.add(name);
        copies.push({
          ...single,
          id: newId(),
          name,
          locked: false,
          position: [r3(x), single.position[1], r3(z)],
          rotation: [single.rotation[0], r3(Math.random() * Math.PI * 2), single.rotation[2]],
          scale: [r3(s), r3(s * (single.scale[1] / single.scale[0] || 1)), r3(s)],
        });
      }
      if (!copies.length) return notify("No free space in that radius — try a bigger one.", "error");
      dispatch({ type: "add", items: copies });
      notify(copies.length < count ? `Scattered ${copies.length} of ${count} — the area is getting full` : `Scattered ${copies.length} × ${base}`);
    },
    [single, partsMap, doc.items, uniqueName, notify],
  );

  const drop = useCallback(() => {
    const patches = selectedItems
      .filter((i) => !i.locked)
      .map((i) => ({ id: i.id, y: apiRef.current?.dropY(i.id) }))
      .filter((p): p is { id: string; y: number } => p.y != null)
      .map(({ id, y }) => {
        const item = selectedItems.find((i) => i.id === id)!;
        return { id, patch: { position: [item.position[0], y, item.position[2]] as Vec3 } };
      });
    if (patches.length) dispatch({ type: "updateMany", patches });
  }, [selectedItems]);

  const onClips = useCallback((glb: string, names: string[]) => {
    setClipNames((prev) => (prev[glb] && prev[glb].length === names.length ? prev : { ...prev, [glb]: names }));
  }, []);

  const pickPart = useCallback((part: Part) => {
    setPlacing((p) => (p?.kind === "model" && p.part.id === part.id ? null : { kind: "model", part, rotation: 0 }));
    setSelectedIds([]);
    setMobilePanel(null);
  }, []);

  const pickLight = useCallback(() => {
    setPlacing((p) => (p?.kind === "light" ? null : { kind: "light", rotation: 0 }));
    setSelectedIds([]);
    setMobilePanel(null);
  }, []);

  const screenshot = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    saveBlob(await api.screenshot(), `${slugify(doc.name)}.png`);
    notify("Screenshot saved");
  }, [doc.name, notify]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  // --- Keyboard shortcuts -------------------------------------------------------------------------

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=listbox]")) return;
      // Enter presses a focused button; Space always plays / pauses (keyboard users press buttons with Enter).
      if (e.key === "Enter" && target?.closest("button, a, [role=tab], [role=radio]")) return;
      if (dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (mod) {
        const action: Record<string, () => void> = {
          z: () => dispatch({ type: e.shiftKey ? "redo" : "undo" }),
          y: () => dispatch({ type: "redo" }),
          c: () => copy(),
          x: () => copy(true),
          v: paste,
          d: duplicate,
          a: selectAll,
          s: saveFile,
          o: () => fileInput.current?.click(),
          e: () => setDialog("export"),
        };
        if (action[key] && !e.altKey) run(action[key]);
        return;
      }
      if (e.altKey) {
        if (key === "n") run(() => setDialog("new"));
        if (key === "i") run(() => setDialog("ai"));
        if (key === "[" || e.code === "BracketLeft") run(toggleLeft);
        if (key === "]" || e.code === "BracketRight") run(toggleRight);
        if (key === "h") run(() => dispatch({ type: "updateMany", patches: doc.items.filter((i) => i.hidden).map((i) => ({ id: i.id, patch: { hidden: false } })) }));
        return;
      }

      if (e.key === "?") return run(() => setDialog("shortcuts"));
      if (key === "escape") return placing ? setPlacing(null) : setSelectedIds([]);
      if (key === "/") return run(() => {
        setLeftTab("parts");
        setMobilePanel("left");
        window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Search parts"]')?.focus(), 30);
      });
      if (key === " ") return run(() => setPaused((p) => !p));
      if (key === "g") return e.shiftKey ? setShowGrid((v) => !v) : setSnapOn((v) => !v);
      if (key === "q") return setSpace((s) => (s === "world" ? "local" : "world"));
      if (key === "p") return void screenshot();
      if (key === "home" || (key === "f" && e.shiftKey)) return run(() => apiRef.current?.focus(null));
      if (key === "f") return apiRef.current?.focus(selectedIds.length ? selectedIds : null);
      if (/^[1-4]$/.test(key)) return dispatch({ type: "scene", patch: { environment: ENV_KEYS[Number(key) - 1] } });
      if (key === "[" || key === "]" || key === "{" || key === "}") {
        const delta = (key === "[" || key === "{" ? -1 : 1) * (e.shiftKey ? 90 : 15) * RAD;
        if (placing) return setPlacing({ ...placing, rotation: placing.rotation + delta });
        return updateSelected((i) => ({ rotation: [i.rotation[0], r3(i.rotation[1] + delta), i.rotation[2]] }));
      }
      if (placing && key === "r") return setPlacing({ ...placing, rotation: placing.rotation + Math.PI / 4 });
      if (key === "w") return setMode("translate");
      if (key === "e") return setMode("rotate");
      if (key === "r") return setMode("scale");
      if (!selectedItems.length) return;
      if (key === "delete" || key === "backspace") return run(remove);
      if (key === "end") return run(drop);
      if (key === "h") return updateSelected((i) => ({ hidden: !i.hidden }));
      if (key === "l") {
        const lock = !selectedItems.every((i) => i.locked);
        return updateSelected(() => ({ locked: lock }));
      }
      if (key === "+" || key === "=" || key === "-" || key === "_") {
        const f = key === "-" || key === "_" ? 1 / 1.1 : 1.1;
        return run(() => updateSelected((i) => ({ scale: i.scale.map((n) => r3(n * f)) as Vec3 })));
      }
      const step = (effectiveSnap || 0.25) * (e.shiftKey ? 10 : 1);
      const move: Record<string, Vec3> = {
        arrowleft: [-step, 0, 0],
        arrowright: [step, 0, 0],
        arrowup: [0, 0, -step],
        arrowdown: [0, 0, step],
        pageup: [0, step, 0],
        pagedown: [0, -step, 0],
      };
      if (move[key]) {
        const [dx, dy, dz] = move[key];
        run(() => updateSelected((i) => ({ position: [r3(i.position[0] + dx), r3(i.position[1] + dy), r3(i.position[2] + dz)] })));
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Derived ------------------------------------------------------------------------------------

  const stats = useMemo(() => {
    let triangles = 0;
    let lights = 0;
    let animated = 0;
    for (const i of doc.items) {
      if (i.kind === "light") lights++;
      const part = i.part ? partsMap.get(i.part) : undefined;
      if (part) {
        triangles += part.tri;
        if ((part.animated && i.animation !== null) || i.motion) animated++;
      }
    }
    return { items: doc.items.length, triangles, lights, animated };
  }, [doc.items, partsMap]);

  const hint = placing
    ? `Placing ${placing.kind === "light" ? "a point light" : placing.part.title} — click to drop · Shift+click to keep placing · [ ] or R to turn · Esc to stop`
    : selectedItems.length > 1
      ? `${selectedItems.length} parts selected — drag the gizmo to move them together · Ctrl+C copy · Ctrl+D duplicate · Del delete`
      : single
        ? single.locked
          ? `${single.name} is locked — press L to unlock it`
          : `${single.name} — drag the gizmo · W move · E rotate · R scale · Shift+click adds parts · Ctrl+C / Ctrl+V copy`
        : "Click a part to select · Shift+click adds · drag to orbit · right-drag to pan · scroll to zoom · ? for shortcuts";

  const activeTemplate = doc.template ? TEMPLATES.find((t) => t.key === doc.template!.key) : undefined;

  // --- Layout -------------------------------------------------------------------------------------

  const leftPanel = (
    <>
      <div className="flex shrink-0 items-center gap-1 border-b border-line p-2">
        <div role="tablist" aria-label="Left panel" className="grid min-w-0 flex-1 grid-cols-2 gap-1">
          {(
            [
              ["parts", "Parts", <Package key="i" className="size-3.5" />],
              ["scene", `Scene (${doc.items.length})`, <Layers key="i" className="size-3.5" />],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={leftTab === key}
              onClick={() => setLeftTab(key)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                leftTab === key ? "bg-white/[0.08] text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <IconButton label="Hide panel" shortcut="Alt+[" onClick={toggleLeft}>
          <PanelLeftClose className="size-4" />
        </IconButton>
      </div>
      {leftTab === "parts" ? (
        <PartsPanel
          parts={parts}
          collections={index?.collections ?? null}
          placingId={placing ? (placing.kind === "light" ? "light" : placing.part.id) : null}
          onPick={pickPart}
          onPickLight={pickLight}
        />
      ) : (
        <Outliner
          items={doc.items}
          selectedIds={selectedIds}
          onSelect={(ids) => {
            setSelectedIds(ids);
            setPlacing(null);
          }}
          onUpdate={update}
        />
      )}
    </>
  );

  const rightPanel =
    selectedItems.length > 1 ? (
      <MultiInspector
        items={selectedItems}
        onSelectOnly={(id) => setSelectedIds([id])}
        onFocus={() => apiRef.current?.focus(selectedIds)}
        onDuplicate={duplicate}
        onDelete={remove}
        onDrop={drop}
        onSpin={() => updateSelected((i) => ({ rotation: [i.rotation[0], r3(Math.random() * Math.PI * 2), i.rotation[2]] }))}
        onUpdateAll={(patch) => updateSelected(() => patch)}
      />
    ) : single ? (
      <Inspector
        key={single.id}
        item={single}
        part={singlePart}
        clipNames={single.glb ? clipNames[single.glb] : undefined}
        bipedClips={index?.clips ?? []}
        onUpdate={(patch) => update(single.id, patch)}
        onDuplicate={duplicate}
        onDelete={remove}
        onDrop={drop}
        onFocus={() => apiRef.current?.focus([single.id])}
        onArray={makeArray}
        onScatter={scatter}
      />
    ) : (
      <SceneSettings doc={doc} stats={stats} onScene={(patch) => dispatch({ type: "scene", patch })} />
    );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* Toolbar */}
      <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 sm:px-3">
        <Link href="/" title="Back to the 3D Models site" aria-label="3D Models — home" className="mr-1 shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-accent">
          <LogoMark className="size-7" />
        </Link>
        {/* Phones only: on desktop each side panel has its own hide button and rail. */}
        <IconButton label="Parts & scene list" onClick={toggleLeft} active={mobilePanel === "left"} className="lg:hidden">
          <PanelLeft className="size-4" />
        </IconButton>

        <Popover
          label="Projects"
          width="w-80"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              disabled={!ready}
              title="Your projects"
              className={`inline-flex h-8 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                open ? "bg-white/[0.1] text-fg" : "text-fg hover:bg-white/[0.08]"
              }`}
            >
              <span className="truncate">{doc.name}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted" />
            </button>
          )}
        >
          {(close) => (
            <ProjectsMenu
              currentId={projectId}
              onNew={() => {
                close();
                setDialog("new");
              }}
              onOpenFile={() => {
                close();
                fileInput.current?.click();
              }}
              onSaveFile={() => {
                close();
                saveFile();
              }}
              onOpen={(meta) => {
                close();
                openStoredProject(meta);
              }}
            />
          )}
        </Popover>
        <IconButton label="New project" shortcut="Alt+N" onClick={() => setDialog("new")} disabled={!ready}>
          <FilePlus2 className="size-4" />
        </IconButton>
        <IconButton label="Open project file" shortcut="Ctrl+O" onClick={() => fileInput.current?.click()} disabled={!ready}>
          <FolderOpen className="size-4" />
        </IconButton>
        <IconButton label="Save project file" shortcut="Ctrl+S" onClick={saveFile} disabled={!ready}>
          <Save className="size-4" />
        </IconButton>
        {(activeTemplate || aiRemixable) && (
          <IconButton label={activeTemplate ? `Remix the ${activeTemplate.name.toLowerCase()} (new random layout)` : "Remix the AI layout (same plan, new random placement)"} onClick={remix}>
            <Shuffle className="size-4" />
          </IconButton>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = "";
          }}
        />

        <ToolbarDivider />
        <IconButton label="Undo" shortcut="Ctrl+Z" onClick={() => dispatch({ type: "undo" })} disabled={!history.past.length}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo" shortcut="Ctrl+Shift+Z" onClick={() => dispatch({ type: "redo" })} disabled={!history.future.length}>
          <Redo2 className="size-4" />
        </IconButton>

        <ToolbarDivider />
        <IconButton label="Move" shortcut="W" active={mode === "translate"} onClick={() => setMode("translate")}>
          <Move3d className="size-4" />
        </IconButton>
        <IconButton label="Rotate" shortcut="E" active={mode === "rotate"} onClick={() => setMode("rotate")}>
          <Rotate3d className="size-4" />
        </IconButton>
        <IconButton label="Scale" shortcut="R" active={mode === "scale"} onClick={() => setMode("scale")}>
          <Scaling className="size-4" />
        </IconButton>
        <IconButton label={space === "world" ? "Gizmo: world axes" : "Gizmo: local axes"} shortcut="Q" active={space === "local"} onClick={() => setSpace((s) => (s === "world" ? "local" : "world"))}>
          <Globe className="size-4" />
        </IconButton>

        <ToolbarDivider />
        <IconButton label="Snap to grid" shortcut="G" active={snapOn} onClick={() => setSnapOn((v) => !v)}>
          <Magnet className="size-4" />
        </IconButton>
        <Popover
          label="Grid step"
          width="w-36"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              title="Grid step"
              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium tabular-nums transition-colors ${
                open ? "bg-white/[0.1] text-fg" : "text-muted hover:bg-white/[0.08] hover:text-fg"
              }`}
            >
              {snap} m <ChevronDown className="size-3.5" />
            </button>
          )}
        >
          {(close) => (
            <div role="listbox" aria-label="Grid step" className="space-y-0.5">
              {SNAP_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="option"
                  aria-selected={snap === v}
                  onClick={() => {
                    setSnap(v);
                    setSnapOn(true);
                    close();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.06] hover:text-fg"
                >
                  {v} m {snap === v && <Check className="size-3.5 text-accent" />}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <IconButton label="Show grid" shortcut="Shift+G" active={showGrid} onClick={() => setShowGrid((v) => !v)}>
          <Grid2x2 className="size-4" />
        </IconButton>
        <IconButton label={paused ? "Play animations" : "Pause animations"} shortcut="Space" active={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </IconButton>

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <button
            type="button"
            onClick={() => setDialog("ai")}
            disabled={!ready}
            title="Generate a scene with AI (Alt+I)"
            className="mr-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 text-xs font-semibold text-fg transition-colors hover:bg-accent/20 disabled:opacity-40"
          >
            <Sparkles className="size-3.5 text-accent" /> AI scene
          </button>
          <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => setDialog("shortcuts")}>
            <Keyboard className="size-4" />
          </IconButton>
          <IconButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
            {fullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
          </IconButton>
          <button
            type="button"
            onClick={() => setDialog("export")}
            disabled={!ready || !doc.items.length}
            title="Export (Ctrl+E)"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-fg px-3 text-xs font-semibold text-bg transition hover:bg-white disabled:opacity-40"
          >
            <Download className="size-3.5" /> Export
          </button>
          <IconButton label="Inspector" onClick={toggleRight} active={mobilePanel === "right"} className="lg:hidden">
            <PanelRight className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Left: parts library / scene list — or, hidden on desktop, a slim rail to bring it back */}
        <aside
          style={{ "--panel-w": `${layout.leftWidth}px` } as CSSProperties}
          className={`${
            mobilePanel === "left" ? "absolute inset-y-0 left-0 z-30 flex w-[min(20rem,88vw)] shadow-2xl shadow-black/60" : "hidden"
          } min-h-0 shrink-0 flex-col border-r border-line bg-surface lg:relative lg:w-[var(--panel-w)] lg:shadow-none ${layout.left ? "lg:flex" : "lg:hidden"}`}
        >
          {leftPanel}
          <ResizeHandle side="left" label="Resize the parts panel" width={layout.leftWidth} onResize={(leftWidth) => updatePanelLayout({ leftWidth })} />
        </aside>
        {!layout.left && (
          <PanelRail side="left">
            <IconButton label="Show panel" shortcut="Alt+[" onClick={toggleLeft}>
              <PanelLeftOpen className="size-4" />
            </IconButton>
            <span className="my-1 h-px w-5 bg-line" />
            {(
              [
                ["parts", "Parts", <Package key="i" className="size-4" />],
                ["scene", `Scene (${doc.items.length})`, <Layers key="i" className="size-4" />],
              ] as const
            ).map(([key, label, icon]) => (
              <IconButton
                key={key}
                label={label}
                onClick={() => {
                  setLeftTab(key);
                  updatePanelLayout({ left: true });
                }}
              >
                {icon}
              </IconButton>
            ))}
          </PanelRail>
        )}

        {/* Viewport */}
        <div
          className="relative min-w-0 flex-1 bg-[#0b0a12]"
          onPointerMove={(e) => {
            pointer.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerLeave={() => {
            pointer.current = null;
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(PART_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(PART_MIME);
            if (!id) return;
            e.preventDefault();
            const position = apiRef.current?.pointAt(e.clientX, e.clientY);
            const part = partsMap.get(id);
            if (!position || (id !== "light" && !part)) return;
            const item = makeItem(id === "light" ? { kind: "light", rotation: 0 } : { kind: "model", part: part!, rotation: 0 }, position);
            dispatch({ type: "add", items: [item] });
            setSelectedIds([item.id]);
            setPlacing(null);
          }}
        >
          {ready && index && (
            <BuilderCanvas
              doc={doc}
              parts={partsMap}
              clips={index.clips}
              selectedIds={selectedIds}
              mode={mode}
              space={space}
              paused={paused}
              snap={effectiveSnap}
              showGrid={showGrid}
              placing={placing}
              apiRef={apiRef}
              onSelect={(id, additive) => {
                if (!id) return setSelectedIds([]);
                setSelectedIds((prev) => (additive ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
                setMobilePanel(null);
              }}
              onTransform={(updates) => dispatch({ type: "updateMany", patches: updates.map(({ id, ...patch }) => ({ id, patch })) })}
              onPlace={onPlace}
              onClips={onClips}
              onReady={onCanvasReady}
            />
          )}
          {!ready && !loadError && <CenterNote spinner>Loading parts library…</CenterNote>}
          {loadError && <CenterNote>Couldn&apos;t load the parts library. Check your connection and reload the page.</CenterNote>}

          {/* Status bar */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2 sm:inset-x-3 sm:bottom-3">
            <p className="glass max-w-full rounded-lg px-3 py-1.5 text-[11px] text-muted sm:max-w-[72%]">{hint}</p>
            <p className="glass hidden rounded-lg px-3 py-1.5 text-[11px] text-subtle tabular-nums sm:block">
              {stats.items} objects · {stats.triangles.toLocaleString("en-US")} tris · {stats.lights} lights{paused ? " · paused" : ""}
            </p>
          </div>

          {toast && (
            <div
              role="status"
              className={`absolute top-3 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-xs shadow-xl backdrop-blur-xl ${
                toast.tone === "error" ? "border-rose-400/30 bg-rose-950/80 text-rose-100" : "border-line-strong bg-elevated/90 text-fg"
              }`}
            >
              {toast.tone === "error" ? <TriangleAlert className="size-3.5 shrink-0" /> : <Check className="size-3.5 shrink-0 text-ok" />}
              {toast.text}
            </div>
          )}
        </div>

        {/* Right: inspector — or, hidden on desktop, a slim rail to bring it back */}
        {!layout.right && (
          <PanelRail side="right">
            <IconButton label="Show inspector" shortcut="Alt+]" onClick={toggleRight}>
              <PanelRightOpen className="size-4" />
            </IconButton>
            <span className="my-1 h-px w-5 bg-line" />
            <IconButton label={selectedItems.length ? `Inspector (${selectedItems.length} selected)` : "Scene settings"} onClick={toggleRight} active={selectedItems.length > 0}>
              <SlidersHorizontal className="size-4" />
            </IconButton>
          </PanelRail>
        )}
        <aside
          style={{ "--panel-w": `${layout.rightWidth}px` } as CSSProperties}
          className={`${
            mobilePanel === "right" ? "absolute inset-y-0 right-0 z-30 flex w-[min(20rem,88vw)] shadow-2xl shadow-black/60" : "hidden"
          } min-h-0 shrink-0 flex-col border-l border-line bg-surface lg:relative lg:w-[var(--panel-w)] lg:shadow-none ${layout.right ? "lg:flex" : "lg:hidden"}`}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line py-2 pr-2 pl-4">
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[0.12em] text-subtle uppercase">
              {selectedItems.length > 1 ? `Inspector · ${selectedItems.length} selected` : "Inspector"}
            </span>
            <IconButton label="Hide inspector" shortcut="Alt+]" onClick={toggleRight}>
              <PanelRightClose className="size-4" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{rightPanel}</div>
          <ResizeHandle side="right" label="Resize the inspector" width={layout.rightWidth} onResize={(rightWidth) => updatePanelLayout({ rightWidth })} />
        </aside>
      </div>

      {dialog === "new" && (
        <NewProjectDialog onClose={() => setDialog(null)} onCreate={createProject} onAi={() => setDialog("ai")} defaultName={`Untitled project ${listProjects().length + 1}`} />
      )}
      {dialog === "ai" && index && parts && <AiDialog index={index} parts={parts} doc={doc} onClose={() => setDialog(null)} onResult={applyAiResult} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === "export" && index && (
        <ExportDialog
          doc={doc}
          stats={stats}
          onClose={() => setDialog(null)}
          run={async (kind, options) => {
            const api = apiRef.current;
            if (!api) throw new Error("Editor not ready");
            setPlacing(null);
            const credits = sceneCredits(doc, partsMap, index.sources);
            const slug = slugify(doc.name);
            const camera = api.getCamera();
            if (kind === "png") {
              saveBlob(await api.screenshot(), `${slug}.png`);
              return;
            }
            const glb = await api.exportGLB({
              ...options,
              asset: {
                copyright: credits.copyright,
                extras: { title: doc.name, builtWith: `${window.location.origin}${asset("/builder/")}`, sources: credits.notice, parts: credits.parts.map((p) => `${p.title} (${p.id})${p.credit ? ` — ${p.credit}` : ""}`) },
              },
            });
            if (kind === "glb") {
              saveBlob(new Blob([glb], { type: "model/gltf-binary" }), `${slug}.glb`);
              return;
            }
            const preview = await api.screenshot().catch(() => null);
            const zip = await buildScenePack({ doc: { ...doc, camera }, glb, preview, credits, sources: index.sources, site: window.location.origin });
            saveBlob(zip, `${slug}-scene-pack.zip`);
          }}
        />
      )}
    </div>
  );
}

// --- Side panels --------------------------------------------------------------------------------

/** What a hidden side panel leaves behind on desktop: a slim column of buttons that bring it back. */
function PanelRail({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  return (
    <div className={`hidden w-11 shrink-0 flex-col items-center gap-1 bg-surface py-2 lg:flex ${side === "left" ? "border-r" : "border-l"} border-line`}>{children}</div>
  );
}

/**
 * Drag handle on a side panel's inner edge (desktop). Drag to resize, double-click to reset, or
 * focus it and use the arrow keys.
 */
function ResizeHandle({ side, label, width, onResize }: { side: "left" | "right"; label: string; width: number; onResize: (width: number) => void }) {
  const sign = side === "left" ? 1 : -1;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      tabIndex={0}
      title={`${label} — drag, or double-click to reset`}
      onPointerDown={(e) => {
        e.preventDefault();
        const handle = e.currentTarget;
        const startX = e.clientX;
        handle.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => onResize(width + (ev.clientX - startX) * sign);
        const end = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          document.body.style.cursor = "";
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
        document.body.style.cursor = "col-resize";
      }}
      onDoubleClick={() => onResize(PANEL_WIDTH.default)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          onResize(width + (e.key === "ArrowRight" ? 16 : -16) * sign);
        }
      }}
      className={`group absolute inset-y-0 z-20 hidden w-2 cursor-col-resize touch-none focus-visible:outline-none lg:block ${side === "left" ? "-right-1" : "-left-1"}`}
    >
      <span className="mx-auto block h-full w-px transition-colors group-hover:bg-accent/70 group-focus-visible:bg-accent" />
    </div>
  );
}

// --- Projects menu ------------------------------------------------------------------------------

function ProjectsMenu({
  currentId,
  onNew,
  onOpenFile,
  onSaveFile,
  onOpen,
}: {
  currentId: string | null;
  onNew: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onOpen: (meta: ProjectMeta) => void;
}) {
  const [projects, setProjects] = useState(listProjects);
  return (
    <div>
      <div className="grid grid-cols-3 gap-1 border-b border-line pb-2">
        {(
          [
            ["New", <FilePlus2 key="i" className="size-4" />, onNew],
            ["Open file", <FolderOpen key="i" className="size-4" />, onOpenFile],
            ["Save file", <Save key="i" className="size-4" />, onSaveFile],
          ] as const
        ).map(([label, icon, action]) => (
          <button key={label} type="button" onClick={action} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-muted hover:bg-white/[0.06] hover:text-fg">
            {icon}
            {label}
          </button>
        ))}
      </div>
      <p className="px-2 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.12em] text-subtle uppercase">Saved in this browser</p>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {projects.map((p) => (
          <li key={p.id} className="group flex items-center gap-1 rounded-xl hover:bg-white/[0.05]">
            <button type="button" onClick={() => p.id !== currentId && onOpen(p)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
              <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
                <span className="truncate">{p.name}</span>
                {p.id === currentId && <span className="shrink-0 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">open</span>}
              </span>
              <span className="block text-[11px] text-subtle">
                {p.items} objects · {timeAgo(p.updatedAt)}
              </span>
            </button>
            {p.id !== currentId && (
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                onClick={() => {
                  if (!window.confirm(`Delete “${p.name}” from this browser? This can't be undone.`)) return;
                  deleteProject(p.id);
                  setProjects(listProjects());
                }}
                className="mr-1 grid size-7 place-items-center rounded-lg text-subtle opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-300 focus:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {!projects.length && <li className="px-2.5 py-3 text-xs text-subtle">No saved projects yet.</li>}
      </ul>
    </div>
  );
}

// --- Dialogs ------------------------------------------------------------------------------------

function NewProjectDialog({
  onClose,
  onCreate,
  onAi,
  defaultName,
}: {
  onClose: () => void;
  onCreate: (name: string, start: string, environment: EnvKey) => void;
  onAi: () => void;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [start, setStart] = useState("empty");
  const [environment, setEnvironment] = useState<EnvKey>("day");
  const choices = [{ key: "empty", name: "Empty plot", description: "A blank grass plot — build everything yourself." }, ...TEMPLATES];
  const create = () => onCreate(name.trim() || defaultName, start, environment);

  return (
    <Modal title="New project" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted">Project name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-accent/60 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onAi}
          className="flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-left transition-colors hover:bg-accent/15"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/20 text-accent">
            <Sparkles className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">Generate with AI</span>
            <span className="block text-[11px] leading-snug text-muted">Describe a place — a theme park, a town, a moon base — and Gemini builds it from the library.</span>
          </span>
        </button>
        <fieldset>
          <legend className="mb-1.5 text-xs text-muted">Start with</legend>
          <div className="space-y-1.5">
            {choices.map((c) => (
              <label
                key={c.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  start === c.key ? "border-accent/60 bg-accent/10" : "border-line hover:border-line-strong"
                }`}
              >
                <input type="radio" name="start" value={c.key} checked={start === c.key} onChange={() => setStart(c.key)} className="mt-0.5 accent-[var(--color-accent)]" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{c.name}</span>
                  <span className="block text-[11px] leading-snug text-muted">{c.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {start === "empty" && (
          <div>
            <p className="mb-1.5 text-xs text-muted">Lighting</p>
            <Segmented<EnvKey> label="Lighting" value={environment} onChange={setEnvironment} options={ENV_KEYS.map((k) => ({ value: k, label: ENVIRONMENTS[k].label }))} />
          </div>
        )}
        <p className="text-[11px] leading-snug text-subtle">Your current project stays saved in this browser — switch back any time from the project menu.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-muted hover:border-line-strong hover:text-fg">
            Cancel
          </button>
          <button type="submit" className="rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg hover:bg-white">
            Create project
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {SHORTCUTS.map((g) => (
          <section key={g.group}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">{g.group}</h3>
            <dl className="space-y-1.5">
              {g.keys.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 text-xs">
                  <dt className="shrink-0">
                    <kbd className="rounded-md border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg">{k}</kbd>
                  </dt>
                  <dd className="text-right text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-5 text-[11px] text-subtle">On a Mac, use ⌘ instead of Ctrl.</p>
    </Modal>
  );
}

type ExportKind = "glb" | "zip" | "png";

function ExportDialog({
  doc,
  stats,
  onClose,
  run,
}: {
  doc: SceneDoc;
  stats: { items: number; triangles: number; lights: number; animated: number };
  onClose: () => void;
  run: (kind: ExportKind, options: { ground: boolean; lights: boolean; animations: AnimationExport }) => Promise<void>;
}) {
  const [ground, setGround] = useState(doc.ground.kind !== "none");
  const [lights, setLights] = useState(true);
  const [animations, setAnimations] = useState<AnimationExport>("together");
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [done, setDone] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (kind: ExportKind) => {
    setBusy(kind);
    setError(null);
    setDone(null);
    try {
      await run(kind, { ground, lights, animations });
      setDone(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const option = (kind: ExportKind, title: string, detail: string, icon: ReactNode, primary = false) => (
    <button
      type="button"
      onClick={() => go(kind)}
      disabled={!!busy}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
        primary ? "border-accent/50 bg-accent/10 hover:bg-accent/15" : "border-line hover:border-line-strong hover:bg-white/[0.04]"
      }`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-fg">
        {busy === kind ? <LoaderCircle className="size-4 animate-spin" /> : done === kind ? <Check className="size-4 text-ok" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="block text-[11px] leading-snug text-muted">{detail}</span>
      </span>
    </button>
  );

  return (
    <Modal title={`Export “${doc.name}”`} onClose={onClose} busy={!!busy}>
      <p className="-mt-1 mb-4 text-xs text-muted">
        {stats.items} objects · {stats.triangles.toLocaleString("en-US")} triangles · {stats.lights} lights · {stats.animated} animated
      </p>

      <div className="mb-4 rounded-xl border border-line bg-surface px-3 py-1.5">
        <Toggle label="Include ground plane" checked={ground} onChange={setGround} />
        <Toggle label="Include lights" hint="Point lights as KHR_lights_punctual" checked={lights} onChange={setLights} />
        <div className="py-2">
          <p className="mb-1.5 text-xs font-medium text-fg">Animations</p>
          <Segmented<AnimationExport>
            label="Animations"
            value={animations}
            onChange={setAnimations}
            options={[
              { value: "together", label: "All together" },
              { value: "separate", label: "One per character" },
              { value: "none", label: "None" },
            ]}
          />
          <p className="mt-1.5 text-[11px] leading-snug text-subtle">
            {animations === "together"
              ? "One looping clip: every character moves at once, like in the editor — in any viewer."
              : animations === "separate"
                ? "A separate clip per character, for game engines. Most viewers play one clip at a time."
                : "A still scene, posed as it is now."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {option("glb", "3D scene (.glb)", "One file with every part, light and animation — for Blender, Unity, Godot, three.js", <Download className="size-4" />, true)}
        {option("zip", "Scene pack (.zip)", ".glb + editable project file + preview image + licenses and credits", <Package className="size-4" />)}
        {option("png", "Screenshot (.png)", "The current view, without editor helpers", <Camera className="size-4" />)}
      </div>

      {busy && busy !== "png" && <p className="mt-3 text-xs text-muted">Building the file — big scenes can take a few seconds…</p>}
      {error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
          <TriangleAlert className="size-3.5" /> {error}
        </p>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-subtle">
        All parts are free for personal and commercial use (CC0, MIT, public domain, or CC BY for a few hairstyles). Credits are written into the file and the pack&apos;s ATTRIBUTION.txt.
      </p>
    </Modal>
  );
}
