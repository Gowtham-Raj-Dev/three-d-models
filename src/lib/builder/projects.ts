import { newId, parseSceneFile, type SceneDoc } from "@/lib/builder/types";

/**
 * Projects saved in this browser (localStorage). Every read and write is guarded: storage can be
 * full, blocked or cleared, and the builder must keep working without it.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  items: number;
}

const INDEX_KEY = "scene-builder:projects";
const CURRENT_KEY = "scene-builder:current";
const LEGACY_KEY = "scene-builder:autosave";
const docKey = (id: string) => `scene-builder:project:${id}`;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listProjects(): ProjectMeta[] {
  const list = read<ProjectMeta[]>(INDEX_KEY);
  return Array.isArray(list) ? [...list].sort((a, b) => b.updatedAt - a.updatedAt) : [];
}

export function loadProject(id: string): SceneDoc | null {
  const data = read<unknown>(docKey(id));
  if (!data) return null;
  try {
    return parseSceneFile(data);
  } catch {
    return null;
  }
}

/** Saves the project and updates the index; false when the browser refused (e.g. storage full). */
export function saveProject(id: string, doc: SceneDoc): boolean {
  if (!write(docKey(id), doc)) return false;
  const meta: ProjectMeta = { id, name: doc.name, updatedAt: Date.now(), items: doc.items.length };
  return write(INDEX_KEY, [meta, ...listProjects().filter((p) => p.id !== id)]);
}

export function deleteProject(id: string) {
  try {
    window.localStorage.removeItem(docKey(id));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
  write(
    INDEX_KEY,
    listProjects().filter((p) => p.id !== id),
  );
}

export function getCurrentProjectId(): string | null {
  return read<string>(CURRENT_KEY);
}

export function setCurrentProjectId(id: string) {
  write(CURRENT_KEY, id);
}

export function newProjectId(): string {
  return `p${newId()}`;
}

/** Moves the single autosave slot of the first builder version into a project. */
export function migrateLegacyAutosave() {
  const legacy = read<unknown>(LEGACY_KEY);
  if (!legacy) return;
  try {
    const doc = parseSceneFile(legacy);
    if (doc.items.length) {
      const id = newProjectId();
      if (saveProject(id, doc) && !getCurrentProjectId()) setCurrentProjectId(id);
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Unreadable old autosave: leave it alone.
  }
}
