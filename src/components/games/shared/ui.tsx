"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CircleHelp, Expand, Info, Music, Music2, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { asset } from "@/lib/asset";
import { GAME_BUTTONS, GAME_SHORTCUTS, howToFor, type GameEntry } from "@/lib/games";
import { SITE } from "@/lib/site";
import { themeVars } from "../themes";
import type { LoadProgress } from "./assets";
import { audio } from "./audio";
import { loadingLook } from "./loaders";
import { useNativeApp } from "./native-app";

/**
 * Building blocks every game's UI is made of: the full-screen frame, loading screen, how-to-play
 * sheet, audio toggles, buttons, modals, plus the shared keyboard shortcuts and small stores.
 *
 * Every game looks different: GameRoot sets the game's theme variables (src/components/games/
 * themes.ts) and the play route sets its fonts (src/lib/game-fonts.ts). Style your own HUD with the
 * same classes so it matches: `g-panel` (menus/cards), `g-hud` (chips over the 3D view),
 * `g-btn` / `g-soft` (buttons — wrap content in `g-unskew`), `g-title` / `g-display` (display
 * font), `g-muted`, `g-tint`, `g-kbd`. `--accent` is the game's accent colour.
 */

// --- Stores -----------------------------------------------------------------------------------------

/** A tiny external store for per-frame game state (HUD) — read with useStore(). */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type Store<T> = ReturnType<typeof createStore<T>>;

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Records kept in this browser (best score, unlocks, settings) — every access guarded. */
export function createRecords<T extends object>(key: string, defaults: T) {
  const listeners = new Set<() => void>();
  let cache: T | null = null;
  const read = (): T => {
    try {
      return { ...defaults, ...JSON.parse(window.localStorage.getItem(key) ?? "{}") };
    } catch {
      return defaults;
    }
  };
  const records = {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    get: (): T => (cache ??= read()),
    server: (): T => defaults,
    set(patch: Partial<T>) {
      cache = { ...records.get(), ...patch };
      try {
        window.localStorage.setItem(key, JSON.stringify(cache));
      } catch {
        // Storage blocked: keep for this session.
      }
      listeners.forEach((fn) => fn());
    },
  };
  return records;
}

export function useRecords<T extends object>(records: ReturnType<typeof createRecords<T>>) {
  return useSyncExternalStore(records.subscribe, records.get, records.server);
}

/** Phones held sideways — same query as the `land:` variant in globals.css. */
export const PHONE_LANDSCAPE = "(orientation: landscape) and (max-height: 540px)";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on a phone in landscape (and always in the Android app): HUDs switch to their landscape layout. */
export const usePhoneLandscape = () => useMediaQuery(PHONE_LANDSCAPE);

/** Set by GameRoot once a finger touches the game (touch-screen laptops report a mouse pointer). */
const touchUsed = createStore(false);

/** True on touch screens — phones, tablets, the Android app, or after a touch — which get touch instructions. */
export function useTouchScreen() {
  const coarse = useMediaQuery("(pointer: coarse)");
  const app = useNativeApp();
  return useStore(touchUsed) || coarse || app;
}

export function useAudioSettings() {
  return useSyncExternalStore(audio.subscribe, audio.getSettings, audio.serverSettings);
}

// --- Shortcuts --------------------------------------------------------------------------------------

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

/**
 * Shortcuts shared by every game: M music, N sound effects, H / ? help, F fullscreen and — when
 * `onPause` is given — Esc / P pause. Game controls are handled by each game.
 */
export function useShortcuts({ onPause, onHelp }: { onPause?: () => void; onHelp?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "m") audio.toggleMusic();
      else if (k === "n") audio.toggleSfx();
      else if (k === "f") toggleFullscreen();
      else if ((k === "h" || k === "?") && onHelp) onHelp();
      else if ((k === "escape" || k === "p") && onPause) onPause();
      else return;
      audio.unlock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPause, onHelp]);
}

// --- Frame ------------------------------------------------------------------------------------------

/**
 * Full-screen game container (theme + fonts); pass pointer handlers for swipe / drag controls.
 * They also fire for taps on HUD buttons — check e.target === your canvas when that matters.
 */
export function GameRoot({
  game,
  children,
  className = "",
  ...handlers
}: {
  game: GameEntry;
  children: ReactNode;
  className?: string;
} & Pick<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onPointerLeave" | "onWheel" | "onClick">) {
  // Browsers only start audio after a gesture: the first tap or key press anywhere unlocks it.
  useEffect(() => {
    const unlock = () => audio.unlock();
    const touched = (e: PointerEvent) => {
      if (e.pointerType === "touch" && !touchUsed.get()) touchUsed.set(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("pointerdown", touched);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", touched);
    };
  }, []);
  return (
    <div
      className={`g-root fixed inset-0 z-40 touch-none overflow-hidden bg-[#0b1220] select-none [&_canvas]:cursor-default ${className}`}
      style={themeVars(game.slug, game.accent)}
      onContextMenu={(e) => e.preventDefault()}
      {...handlers}
    >
      {children}
    </div>
  );
}

/** The game's logo-style title in its display face; the last word takes the accent colour. */
export function GameTitle({ game, size = "lg" }: { game: GameEntry; size?: "sm" | "lg" }) {
  const words = game.title.split(" ");
  const last = words.length > 1 ? words.pop() : null;
  return (
    <h2 className={`g-title ${size === "sm" ? "text-4xl sm:text-5xl" : "text-5xl sm:text-7xl lg:text-8xl"}`}>
      {words.join(" ")}
      {last && (
        <>
          {" "}
          <span className="g-title-accent">{last}</span>
        </>
      )}
    </h2>
  );
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Loading screen in the game's own world: its cover art slowly drifting behind the title, and a
 * progress bar and status lines from the game itself (shared/loaders.tsx) — real byte progress.
 */
export function LoadingScreen({ game, progress, error }: { game: GameEntry; progress: LoadProgress | null; error: string | null }) {
  const look = loadingLook(game.slug);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, []);
  const pct = Math.round((progress?.ratio ?? 0) * 100);
  const { shade, Bar, Fx } = look;
  return (
    <div className="g-loading absolute inset-0 overflow-hidden" style={look.ink ? { color: look.ink } : undefined}>
      {!game.comingSoon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset(game.cover)}
          alt=""
          decoding="async"
          className="absolute inset-0 size-full object-cover motion-safe:animate-[g-kenburns_30s_ease-in-out_infinite_alternate]"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${shade}e6 0%, ${shade}59 30%, ${shade}14 50%, ${shade}bf 74%, ${shade}fa 100%), radial-gradient(ellipse at 50% 45%, transparent 55%, ${shade}b3 100%)`,
        }}
      />
      {Fx && <Fx />}
      <div className="relative flex h-full flex-col items-center justify-between px-6 pt-[13vh] pb-[8vh] text-center land:pt-6 land:pb-5">
        <div className="motion-safe:animate-[g-rise_0.8s_ease-out_both]">
          <GameTitle game={game} />
          <p className="g-display mt-4 text-sm opacity-90 [text-shadow:0_1px_3px_#000c] sm:text-base land:mt-2">{game.tagline}</p>
        </div>
        <div className="w-full max-w-xl">
          {error ? (
            <div className="space-y-4">
              <p className="text-sm opacity-90 [text-shadow:0_1px_3px_#000c]">{error}</p>
              <div className="flex justify-center gap-3">
                <SoftButton onClick={() => window.location.reload()} icon={<RotateCcw className="size-4" />}>
                  Reload
                </SoftButton>
                <BackLink game={game} />
              </div>
            </div>
          ) : (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Loading ${game.title}`}>
              <Bar pct={pct} />
              <div className="g-display mt-4 flex items-baseline justify-between gap-4 text-xs [text-shadow:0_1px_3px_#000c] sm:text-sm land:mt-3">
                <span key={line} className="min-w-0 truncate animate-[game-fade_0.4s_ease]">
                  {look.lines[line % look.lines.length]}
                </span>
                <span className="shrink-0 tabular-nums">
                  {progress && <span className="mr-2 text-[0.85em] opacity-70">{formatMb(progress.totalBytes)}</span>}
                  {pct}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Leaves the game for its details page. */
export function BackLink({ game }: { game: GameEntry }) {
  const app = useNativeApp();
  if (app) return null;
  return (
    <Link
      href={`/games/${game.slug}/`}
      className="g-hud g-display inline-flex items-center gap-1.5 px-3.5 py-2 text-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <ArrowLeft className="size-4" /> Back
    </Link>
  );
}

/** Top-right cluster: music, sound, help, fullscreen. */
export function SystemButtons({ onHelp, children, vertical = false, small = false }: { onHelp?: () => void; children?: ReactNode; vertical?: boolean; small?: boolean }) {
  const settings = useAudioSettings();
  // The Android app is already full screen.
  const app = useNativeApp();
  const icon = small ? "size-[18px]" : "size-5";
  return (
    <div className={`pointer-events-auto flex items-center gap-2 ${vertical ? "flex-col" : ""}`}>
      {children}
      <IconButton
        label={settings.music ? "Music off (M)" : "Music on (M)"}
        onClick={() => {
          audio.unlock();
          audio.toggleMusic();
        }}
        dim={!settings.music}
        small={small}
      >
        {settings.music ? <Music className={icon} /> : <Music2 className={icon} />}
      </IconButton>
      <IconButton
        label={settings.sfx ? "Sound effects off (N)" : "Sound effects on (N)"}
        onClick={() => {
          audio.unlock();
          audio.toggleSfx();
        }}
        dim={!settings.sfx}
        small={small}
      >
        {settings.sfx ? <Volume2 className={icon} /> : <VolumeX className={icon} />}
      </IconButton>
      {onHelp && (
        <IconButton label="How to play (H)" onClick={onHelp} small={small}>
          <CircleHelp className={icon} />
        </IconButton>
      )}
      {onHelp && <CreditsButton small={small} iconClass={icon} />}
      {!app && (
        <IconButton label="Fullscreen (F)" onClick={toggleFullscreen} className="hidden sm:grid" small={small}>
          <Expand className={icon} />
        </IconButton>
      )}
    </div>
  );
}

// --- Credits ----------------------------------------------------------------------------------------

/** Who made the game: opened from the Credits button beside "How to play" (and Kingdom Clash's settings). */
export function CreditsSheet({ onClose }: { onClose: () => void }) {
  // Drawn into the game frame so it sits above every HUD layer and keeps the game's theme.
  const root = document.querySelector<HTMLElement>(".g-root");
  if (!root) return null;
  return createPortal(
    <div
      className="absolute inset-0 z-50 overflow-y-auto bg-black/55 backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Credits" className="g-panel relative w-full max-w-xs p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <h2 className="g-panel-title text-2xl sm:text-3xl">Credits</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="g-display g-muted text-xs">Created by</dt>
              <dd className="g-display mt-0.5 text-xl">{SITE.author}</dd>
            </div>
            <div>
              <dt className="g-display g-muted text-xs">Published by</dt>
              <dd className="g-display mt-0.5 text-xl">{SITE.brand}</dd>
            </div>
          </dl>
          <div className="mt-5">
            <BigButton onClick={onClose}>Close</BigButton>
          </div>
        </div>
      </div>
    </div>,
    root,
  );
}

function CreditsButton({ small, iconClass }: { small: boolean; iconClass: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Credits" onClick={() => setOpen(true)} small={small}>
        <Info className={iconClass} />
      </IconButton>
      {open && <CreditsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

// --- How to play ------------------------------------------------------------------------------------

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="g-kbd inline-flex min-w-6 items-center justify-center px-1.5 py-0.5 text-[11px] font-bold">{children}</kbd>;
}

function ControlsList({ game }: { game: GameEntry }) {
  return (
    <ul className="space-y-2">
      {game.controls.map((c) => (
        <li key={c.action} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">{c.action}</span>
          <span className="flex flex-wrap items-center justify-end gap-1">
            {c.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Touch screens: each action's tap / swipe / button, and the on-screen buttons instead of keyboard shortcuts. */
function TouchControlsList({ game }: { game: GameEntry }) {
  return (
    <ul className="space-y-2">
      {game.controls
        .filter((c) => c.touch)
        .map((c) => (
          <li key={c.action} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold">{c.action}</span>
            <span className="g-tint rounded-full px-2.5 py-1 text-right text-xs font-bold">{c.touch}</span>
          </li>
        ))}
    </ul>
  );
}

function ButtonsList() {
  const app = useNativeApp();
  const [canFullscreen] = useState(() => typeof document !== "undefined" && document.fullscreenEnabled);
  return (
    <>
      <p className="g-muted -mt-1 mb-3 text-xs">In the top corner of the screen, or in the pause or settings menu.</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {GAME_BUTTONS.filter((b) => !b.fullscreen || (canFullscreen && !app)).map(({ action, icon: Icon, fullscreen }) => (
          // The fullscreen button only shows on wider screens (see SystemButtons).
          <li key={action} className={`g-tint items-center gap-2.5 rounded-[var(--g-hud-radius)] px-3 py-2 text-xs ${fullscreen ? "hidden sm:flex" : "flex"}`}>
            <span className="g-hud grid size-7 shrink-0 place-items-center">
              <Icon className="size-4" />
            </span>
            {action}
          </li>
        ))}
      </ul>
    </>
  );
}

export function HowToPlay({ game, onClose }: { game: GameEntry; onClose: () => void }) {
  const touch = useTouchScreen();
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-black/55 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="How to play" className="g-panel relative w-full max-w-lg p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="g-tint absolute top-4 right-4 grid size-9 place-items-center rounded-full hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="size-4" />
          </button>
          <p className="g-display text-xs text-[var(--accent)]">{game.genre}</p>
          <h2 className="g-panel-title mt-1 pr-10 text-2xl sm:text-3xl">How to play {game.title}</h2>
          <ul className="mt-4 space-y-2">
            {howToFor(game, touch).map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {line}
              </li>
            ))}
          </ul>
          <h3 className="g-display g-muted mt-6 mb-3 text-xs">{touch ? "Touch controls" : "Controls"}</h3>
          {touch ? <TouchControlsList game={game} /> : <ControlsList game={game} />}
          <h3 className="g-display g-muted mt-6 mb-3 text-xs">{touch ? "Buttons" : "Shortcuts"}</h3>
          {touch ? (
            <ButtonsList />
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GAME_SHORTCUTS.map((s) => (
                <li key={s.action} className="g-tint flex items-center justify-between gap-2 rounded-[var(--g-hud-radius)] px-3 py-2 text-xs">
                  {s.action}
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6">
            <BigButton onClick={onClose}>Got it</BigButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Bits -------------------------------------------------------------------------------------------

export function Modal({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/40 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label={title} className={`g-panel w-full space-y-4 p-6 ${wide ? "max-w-lg" : "max-w-sm"}`}>
          <h2 className="g-panel-title text-center text-3xl sm:text-4xl">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A themed card for your own menus (same material as modals). */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`g-panel ${className}`}>{children}</div>;
}

export function BigButton({ onClick, icon, children, autoFocus, disabled }: { onClick: () => void; icon?: ReactNode; children: ReactNode; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        audio.unlock();
        onClick();
      }}
      autoFocus={autoFocus}
      disabled={disabled}
      className="g-btn flex w-full items-center justify-center px-6 py-4 text-2xl focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:opacity-50"
    >
      <span className="g-unskew gap-2.5">
        {icon}
        {children}
      </span>
    </button>
  );
}

export function SoftButton({ onClick, icon, children, active = false }: { onClick: () => void; icon?: ReactNode; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={() => {
        audio.unlock();
        onClick();
      }}
      className="g-soft flex w-full items-center justify-center px-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="g-unskew gap-2">
        {icon}
        {children}
      </span>
    </button>
  );
}

export function IconButton({
  onClick,
  label,
  children,
  plain = false,
  dim = false,
  small = false,
  className = "",
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  plain?: boolean;
  dim?: boolean;
  /** 36px instead of 44px (landscape phone HUDs). */
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.blur();
        audio.unlock();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`grid ${small ? "size-9" : "size-11"} place-items-center transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        plain ? "rounded-full hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]" : "g-hud hover:brightness-110"
      } ${dim ? "opacity-55" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="g-tint rounded-[var(--g-hud-radius)] px-2 py-2.5 text-center">
      <p className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">{label}</p>
      <p className="g-display text-base tabular-nums">{value}</p>
    </div>
  );
}

/** HUD chip over the 3D view. */
export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`g-hud inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-bold ${className}`}>{children}</div>;
}

export const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
