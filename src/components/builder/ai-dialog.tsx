"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, KeyRound, LoaderCircle, Lock, Sparkles, TriangleAlert } from "lucide-react";
import { Modal, Segmented } from "@/components/builder/controls";
import {
  AI_EDIT_EXAMPLES,
  AI_EXAMPLES,
  AI_SIZES,
  AiError,
  BUILTIN_KEY,
  FALLBACK_MODELS,
  generateScene,
  listModels,
  maskKey,
  readStoredKey,
  writeStoredKey,
  type AiResult,
  type AiSize,
  type GeminiModel,
} from "@/lib/builder/ai";
import { ENVIRONMENTS, type EnvKey, type Part, type PartsIndex, type SceneDoc } from "@/lib/builder/types";

const PROMPT_STORAGE = "scene-builder:ai-prompt";
const SIZE_STORAGE = "scene-builder:ai-size";
const MODEL_CHOICE_STORAGE = "scene-builder:ai-model-choice";
const SIZE_KEYS = Object.keys(AI_SIZES) as AiSize[];
const ENV_KEYS = Object.keys(ENVIRONMENTS) as EnvKey[];
const STEP_LABEL = { kits: "Choosing kits from the library", layout: "Designing the layout" };
const KEY_PAGE = "https://aistudio.google.com/apikey";

/** Model lists per key, kept while the page is open. */
const modelCache = new Map<string, GeminiModel[]>();

type Step = { key: "kits" | "layout"; model: string; started: number; done?: number };
type ModelList = { key: string; models: GeminiModel[] } | { key: string; error: string };

function remember(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function AiDialog({
  index,
  parts,
  doc,
  onClose,
  onResult,
}: {
  index: PartsIndex;
  parts: Part[];
  /** The open scene, which "Add to this project" builds on. */
  doc: SceneDoc;
  onClose: () => void;
  /** Builds the plan — as a new project, or into the open one in add mode; the dialog closes afterwards. */
  onResult: (result: AiResult) => void;
}) {
  const [mode, setMode] = useState<"new" | "edit">("new");
  const [ideas, setIdeas] = useState(() => ({ new: remember(PROMPT_STORAGE, AI_EXAMPLES[0].prompt), edit: remember(`${PROMPT_STORAGE}:edit`, AI_EDIT_EXAMPLES[0].prompt) }));
  const idea = ideas[mode];
  const setIdea = (value: string) => setIdeas((prev) => ({ ...prev, [mode]: value }));
  const examples = mode === "edit" ? AI_EDIT_EXAMPLES : AI_EXAMPLES;
  const adding = mode === "edit";
  const [size, setSize] = useState<AiSize>(() => {
    const saved = remember(SIZE_STORAGE, "large");
    return saved in AI_SIZES ? (saved as AiSize) : "large";
  });
  const [environment, setEnvironment] = useState<EnvKey | "auto">("auto");
  const [model, setModel] = useState(() => remember(MODEL_CHOICE_STORAGE, "auto"));
  /** The visitor's own key, saved in this browser; empty = use the built-in key. */
  const [ownKey, setOwnKey] = useState(readStoredKey);
  const [settingUp, setSettingUp] = useState(() => !readStoredKey() && !BUILTIN_KEY);
  const [modelList, setModelList] = useState<ModelList | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);

  const key = ownKey || BUILTIN_KEY;
  const s = AI_SIZES[size];

  // The models the active key can use.
  useEffect(() => {
    if (!key) return;
    const cached = modelCache.get(key);
    const controller = new AbortController();
    const load = cached
      ? Promise.resolve(cached)
      : listModels(key, controller.signal).then((models) => {
          modelCache.set(key, models);
          return models;
        });
    load
      .then((models) => setModelList({ key, models }))
      .catch((err) => {
        if (!controller.signal.aborted) setModelList({ key, error: err instanceof AiError ? err.message : "Couldn't load the model list." });
      });
    return () => controller.abort();
  }, [key]);

  const listed = modelList?.key === key ? modelList : null;
  const models = listed && "models" in listed ? listed.models : null;
  const modelError = listed && "error" in listed ? listed.error : null;
  const options = models ?? FALLBACK_MODELS;
  // A model remembered from another key may not exist for this one.
  const effectiveModel = model === "auto" || options.some((m) => m.id === model) ? model : "auto";

  // Ticks the elapsed-time counters while Gemini is thinking.
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [busy]);

  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    if (!idea.trim()) return setError(adding ? "Describe what to change first." : "Describe the scene you want first.");
    if (!key) {
      setSettingUp(true);
      return setError("Set up a Gemini API key first — it takes a minute, the steps are on the right.");
    }
    if (modelError) return setError(modelError);
    store(adding ? `${PROMPT_STORAGE}:edit` : PROMPT_STORAGE, idea.trim());
    store(SIZE_STORAGE, size);
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setSteps([]);
    setNow(Date.now());
    try {
      const result = await generateScene({
        key,
        model: effectiveModel,
        available: (models ?? []).map((m) => m.id),
        idea: idea.trim(),
        size,
        environment,
        index,
        parts,
        base: adding ? doc : null,
        signal: controller.signal,
        onStep: (step, m) =>
          setSteps((prev) => {
            const t = Date.now();
            const done = prev.map((x) => (x.key !== step && !x.done ? { ...x, done: t } : x));
            return done.some((x) => x.key === step) ? done.map((x) => (x.key === step ? { ...x, model: m } : x)) : [...done, { key: step, model: m, started: t }];
          }),
      });
      if (controller.signal.aborted) return;
      abort.current = null;
      setBusy(false);
      onResult(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      abort.current = null;
      setBusy(false);
      setError(err instanceof AiError ? err.message : err instanceof Error ? `Something went wrong: ${err.message}` : "Something went wrong.");
    }
  };

  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setSteps([]);
  };

  const seconds = (from: number, to = now) => `${Math.max(0, Math.round((to - from) / 1000))} s`;
  const label = (id: string) => options.find((m) => m.id === id)?.label ?? id;

  return (
    <Modal title="Generate a scene with AI" onClose={onClose} busy={busy} width="max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void run();
        }}
      >
        <p className="-mt-1 mb-4 text-xs leading-relaxed text-muted">
          {adding
            ? `Describe what to change. Gemini sees everything in “${doc.name}” — every part, where it stands, the free ground — and can remove, replace, move, resize, turn or re-animate parts, change the lighting, and add new things: rides with running trains, stalls, paths, people walking from place to place.`
            : `Describe a place. Gemini picks kits from the ${parts.length.toLocaleString("en-US")} GLB parts here and lays them out — roller coasters with running trains, buildings, paths, people walking from place to place — in a new project you can edit like any other scene.`}
        </p>

        <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
          {/* Left: what to make */}
          <div className="flex min-w-0 flex-col gap-3">
            <Segmented<"new" | "edit">
              label="What to do"
              value={mode}
              onChange={(v) => !busy && setMode(v)}
              options={[
                { value: "new", label: "New project" },
                { value: "edit", label: `Edit “${doc.name}”` },
              ]}
            />
            <label className="flex flex-1 flex-col">
              <span className="mb-1.5 block text-xs text-muted">{adding ? `What to change in “${doc.name}” (${doc.items.length} objects)` : "Scene idea"}</span>
              <textarea
                autoFocus
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) {
                    e.preventDefault();
                    void run();
                  }
                }}
                rows={7}
                disabled={busy}
                placeholder={adding ? "Replace the benches with lamps, remove the trees on the left, add a roller coaster there…" : "A theme park with roller coasters, food stalls and crowds…"}
                className="min-h-36 w-full flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none disabled:opacity-60"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  disabled={busy}
                  onClick={() => setIdea(ex.prompt)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    idea === ex.prompt ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: size, lighting, Gemini */}
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <p className="mb-1.5 text-xs text-muted">{adding ? "How much to add (if adding)" : "Size"}</p>
              <Segmented<AiSize> label="Size" value={size} onChange={(v) => !busy && setSize(v)} options={SIZE_KEYS.map((k) => ({ value: k, label: AI_SIZES[k].label }))} />
              <p className="mt-1.5 text-[11px] text-subtle">
                {adding
                  ? `Up to about ${s.objects[1].toLocaleString("en-US")} new objects`
                  : `${s.area} × ${s.area} m ground · about ${s.objects[0].toLocaleString("en-US")}–${s.objects[1].toLocaleString("en-US")} objects`}
                {size === "huge" ? " · needs a fast computer" : ""}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-muted">Lighting</p>
              <Segmented<EnvKey | "auto">
                label="Lighting"
                value={environment}
                onChange={(v) => !busy && setEnvironment(v)}
                options={[{ value: "auto", label: adding ? "Keep" : "Auto" }, ...ENV_KEYS.map((k) => ({ value: k, label: ENVIRONMENTS[k].label }))]}
              />
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                <KeyRound className="size-3.5 text-muted" /> Gemini API key
              </p>
              {settingUp ? (
                <OwnKeySetup
                  cancelLabel={ownKey ? "Cancel" : "Use the default key"}
                  disabled={busy}
                  onSave={(newKey, list) => {
                    modelCache.set(newKey, list);
                    writeStoredKey(newKey);
                    setOwnKey(newKey);
                    setSettingUp(false);
                    setError(null);
                  }}
                  onCancel={key ? () => setSettingUp(false) : undefined}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-elevated/60 px-2.5 text-xs text-muted" aria-label="Active API key">
                      <Lock className="size-3.5 shrink-0 text-subtle" />
                      <span className="truncate">{ownKey ? "Your key" : "Default key"}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-subtle">{maskKey(key)}</span>
                    </div>
                    {ownKey && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          writeStoredKey("");
                          setOwnKey("");
                          if (!BUILTIN_KEY) setSettingUp(true);
                        }}
                        className="h-9 shrink-0 rounded-lg border border-line px-2.5 text-[11px] text-muted hover:border-line-strong hover:text-fg disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSettingUp(true)}
                    className="w-full rounded-lg border border-dashed border-line-strong py-2 text-[11px] font-medium text-muted hover:border-accent/60 hover:text-fg disabled:opacity-50"
                  >
                    {ownKey ? "Change your key" : "Use your own key"}
                  </button>
                </>
              )}

              {!settingUp && (
                <label className="block">
                  <span className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                    Model
                    <span className={`truncate ${modelError ? "text-rose-300" : "text-subtle"}`}>
                      {modelError ? modelError : models ? `${models.length} available for this key` : "checking the key…"}
                    </span>
                  </span>
                  <select
                    value={effectiveModel}
                    disabled={busy || !!modelError}
                    onChange={(e) => {
                      setModel(e.target.value);
                      store(MODEL_CHOICE_STORAGE, e.target.value);
                    }}
                    className="h-9 w-full rounded-lg border border-line bg-elevated px-2 text-xs text-fg focus:border-accent/60 focus:outline-none disabled:opacity-60"
                  >
                    <option value="auto">Auto — best available, switches if one is busy</option>
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.label.toLowerCase().replace(/\s+/g, "-") === m.id ? "" : ` (${m.id})`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>

        {steps.length > 0 && (
          <ol className="mt-4 space-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5" aria-live="polite">
            {steps.map((st) => (
              <li key={st.key} className="flex items-center gap-2 text-xs">
                {st.done ? (
                  <Check className="size-3.5 shrink-0 text-ok" />
                ) : error ? (
                  <TriangleAlert className="size-3.5 shrink-0 text-rose-300" />
                ) : (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent" />
                )}
                <span className={st.done ? "text-muted" : "text-fg"}>{STEP_LABEL[st.key]}</span>
                <span className="ml-auto shrink-0 text-[11px] text-subtle tabular-nums">
                  {label(st.model)} · {seconds(st.started, st.done)}
                </span>
              </li>
            ))}
            {busy && steps.at(-1)?.key === "layout" && <li className="pl-5.5 text-[11px] text-subtle">Big scenes take Gemini a minute or two to plan.</li>}
          </ol>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-950/40 px-3 py-2.5 text-xs leading-snug text-rose-100">
            <TriangleAlert className="mt-px size-3.5 shrink-0" /> {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <p className="mr-auto text-[11px] leading-snug text-subtle">
            {adding ? "Changes this project — one Ctrl+Z undoes it" : "Creates a new project — your current one stays saved under Projects"} · Ctrl+Enter
          </p>
          <button type="button" onClick={busy ? cancel : onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-muted hover:border-line-strong hover:text-fg">
            {busy ? "Stop" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={busy || settingUp || !key}
            className="inline-flex items-center gap-1.5 rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg hover:bg-white disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Generating…" : adding ? "Apply changes" : "Generate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Steps to create a Gemini key, a field to paste it, and a check against Google before it is saved. */
function OwnKeySetup({
  cancelLabel,
  disabled,
  onSave,
  onCancel,
}: {
  cancelLabel: string;
  disabled: boolean;
  onSave: (key: string, models: GeminiModel[]) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const value = draft.trim();
    if (!value) return setProblem("Paste the key first.");
    setChecking(true);
    setProblem(null);
    try {
      const models = await listModels(value);
      if (!models.length) throw new AiError("This key works, but has no Gemini text models.");
      onSave(value, models);
    } catch (err) {
      setProblem(err instanceof AiError ? err.message : "Couldn't reach Google — check your connection.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-1.5 text-[11px] leading-snug text-muted">
        <li className="flex gap-2">
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">1</span>
          <span>
            Open{" "}
            <a href={KEY_PAGE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Google AI Studio <ExternalLink className="size-3" />
            </a>{" "}
            and sign in with your Google account.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">2</span>
          <span>
            Click <b className="font-medium text-fg">Create API key</b> and pick (or create) a project. The free tier is enough.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">3</span>
          <span>Copy the key and paste it below.</span>
        </li>
      </ol>
      {/* Not a nested <form> (the dialog is one): Enter is handled on the field. */}
      <div className="flex gap-2">
        {/* A plain text field, so browsers don't offer saved passwords for it. */}
        <input
          type="text"
          name="gemini-api-key"
          value={draft}
          disabled={disabled || checking}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          placeholder="Paste your Gemini API key"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-elevated px-2.5 font-mono text-xs text-fg placeholder:font-sans placeholder:text-subtle focus:border-accent/60 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={disabled || checking || !draft.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent/90 px-3 text-xs font-semibold text-bg hover:bg-accent disabled:opacity-50"
        >
          {checking && <LoaderCircle className="size-3.5 animate-spin" />}
          {checking ? "Checking" : "Save key"}
        </button>
      </div>
      {problem && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-rose-300">
          <TriangleAlert className="mt-px size-3 shrink-0" /> {problem}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-subtle">
        <span>Saved only in this browser; sent only to Google.</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="shrink-0 text-muted hover:text-fg hover:underline">
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
