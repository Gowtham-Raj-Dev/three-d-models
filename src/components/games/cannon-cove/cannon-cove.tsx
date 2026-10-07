"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Anchor,
  CircleHelp,
  Coins,
  Crosshair,
  Flag,
  Gauge,
  Hammer,
  Home,
  Pause,
  Play,
  RotateCcw,
  Sailboat,
  Ship,
  ShieldPlus,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Wind,
  Wrench,
} from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import {
  BigButton,
  createRecords,
  createStore,
  formatNumber,
  GameRoot,
  GameTitle,
  HowToPlay,
  IconButton,
  Kbd,
  LoadingScreen,
  Modal,
  SoftButton,
  Stat,
  SystemButtons,
  useRecords,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { CannonCoveGame, EMPTY_HUD, type Card, type Hud, type Offer, type Phase, type UpgradeId, type VoyageResult } from "./engine";
import { GAME } from "./manifest";

const records = createRecords("cannon-cove:v1", { bestWave: 0, bestGold: 0, mostSunk: 0, voyages: 0 });

const STYLES = `
@keyframes cove-hint { 0% { opacity: 0; transform: translateY(8px); } 8%, 80% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes cove-banner { 0% { opacity: 0; transform: translateY(-10px) scale(0.96); } 100% { opacity: 1; transform: none; } }
@keyframes cove-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
`;

export function CannonCove({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CannonCoveGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [result, setResult] = useState<(VoyageResult & { newBest: boolean }) | null>(null);
  const [help, setHelp] = useState(false);
  const [touch, setTouch] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CannonCoveGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      offer: setOffer,
      error: setError,
      over: (run) => {
        const before = records.get();
        const newBest = run.wave > before.bestWave;
        records.set({
          bestWave: Math.max(before.bestWave, run.wave),
          bestGold: Math.max(before.bestGold, run.gold),
          mostSunk: Math.max(before.mostSunk, run.sunk),
          voyages: before.voyages + 1,
        });
        setResult({ ...run, newBest });
      },
    });
    gameRef.current = game;
    game.setOverlay(overlayRef.current);
    // Floating texts over the 3D view use the game's display face.
    game.setFont(getComputedStyle(canvas).getPropertyValue("--game-display"));
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  useEffect(() => {
    // Touch controls on phones and tablets (and as soon as anyone touches the screen).
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => coarse.matches && setTouch(true);
    sync();
    const onTouch = (e: PointerEvent) => e.pointerType === "touch" && setTouch(true);
    window.addEventListener("pointerdown", onTouch);
    coarse.addEventListener("change", sync);
    return () => {
      window.removeEventListener("pointerdown", onTouch);
      coarse.removeEventListener("change", sync);
    };
  }, []);

  const start = () => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setOffer(null);
    setHelp(false);
    setRunKey((k) => k + 1);
    game.start();
  };

  const toMenu = () => {
    setResult(null);
    setOffer(null);
    gameRef.current?.toMenu();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Game keys.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const confirm = k === "Enter" || k === " ";
      if (phase === "playing") {
        let used = true;
        if (k === "a" || k === "ArrowLeft") game.setSteerKey("left", true);
        else if (k === "d" || k === "ArrowRight") game.setSteerKey("right", true);
        else if (e.repeat) used = k === "w" || k === "s" || k === "ArrowUp" || k === "ArrowDown" || k === " ";
        else if (k === "w" || k === "ArrowUp") game.sailStep(1);
        else if (k === "s" || k === "ArrowDown") game.sailStep(-1);
        else if (k === "q" || k === "j") game.setFire(1, true);
        else if (k === "e" || k === "l") game.setFire(-1, true);
        else if (k === "z") game.zoomStep();
        else used = k === " ";
        if (used) e.preventDefault();
      } else if (phase === "upgrade") {
        if (k === "1" || k === "2" || k === "3") game.choose(Number(k) - 1);
        else if (k === "r") game.repair();
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          game.resume();
        }
      } else if (phase === "menu" || phase === "over") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "a" || k === "ArrowLeft") game.setSteerKey("left", false);
      else if (k === "d" || k === "ArrowRight") game.setSteerKey("right", false);
      else if (k === "q" || k === "j") game.setFire(1, false);
      else if (k === "e" || k === "l") game.setFire(-1, false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the voyage.
  useEffect(() => {
    const pause = () => {
      gameRef.current?.releaseInput();
      gameRef.current?.pause();
    };
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  const onMinimap = useCallback((canvas: HTMLCanvasElement | null) => gameRef.current?.setMinimap(canvas), []);

  const running = phase === "playing" || phase === "paused" || phase === "upgrade" || phase === "sinking";

  return (
    <GameRoot game={GAME} className="bg-[#9fd3ee]" onWheel={(e) => running && gameRef.current?.zoomBy(e.deltaY * 0.0009)}>
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Cannon Cove game" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden />

      {(phase === "loading" || phase === "error") && <LoadingScreen game={GAME} progress={progress} error={error} />}

      {phase === "menu" && <MenuScreen best={saved.bestWave} bestGold={saved.bestGold} touch={touch} onPlay={start} onHelp={() => setHelp(true)} />}

      {running && <HudOverlay store={hud} paused={phase === "paused"} touch={touch} onPause={pauseOrResume} onMinimap={onMinimap} />}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}
      {phase === "playing" && saved.voyages < 3 && <ControlsHint key={runKey} touch={touch} />}

      {phase === "upgrade" && offer && !help && <UpgradeModal offer={offer} onPick={(i) => gameRef.current?.choose(i)} onRepair={() => gameRef.current?.repair()} />}

      {phase === "paused" && !help && (
        <Modal title="Anchors dropped">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={start} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
          <div className="flex justify-center">
            <SystemButtons />
          </div>
        </Modal>
      )}

      {phase === "over" && result && !help && (
        <Modal title="Sent to the depths!">
          <div className="text-center">
            {result.newBest && (
              <p className="g-display mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-sm text-amber-950 ring-2 ring-amber-700/60">
                <Trophy className="size-3.5" /> New best voyage
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.18em] uppercase">Reached wave</p>
            <p className="g-display text-7xl leading-none tabular-nums">{result.wave}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Ships sunk" value={formatNumber(result.sunk)} />
            <Stat label="Gold" value={formatNumber(result.gold)} />
            <Stat label="Best wave" value={Math.max(saved.bestWave, result.wave)} />
          </div>
          <p className="g-muted text-center text-sm">
            {result.forts > 0 ? `${result.forts} fort${result.forts > 1 ? "s" : ""} destroyed · ` : ""}
            {Math.floor(result.seconds / 60)}m {result.seconds % 60}s at sea
          </p>
          <BigButton onClick={start} icon={<RotateCcw className="size-5" />} autoFocus>
            Sail again
          </BigButton>
          <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Menu ----------------------------------------------------------------------------------------

function MenuScreen({ best, bestGold, touch, onPlay, onHelp }: { best: number; bestGold: number; touch: boolean; onPlay: () => void; onHelp: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>
      <div className="px-4 pt-2 text-center sm:pt-4">
        <GameTitle game={GAME} />
        <p className="g-hud g-display mx-auto mt-4 inline-block px-4 py-1 text-base sm:text-lg">Sail with the wind · fire broadsides · plunder the cove</p>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <BigButton onClick={onPlay} icon={<Sailboat className="size-6" />} autoFocus>
          Set sail
        </BigButton>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1">
            <Trophy className="size-4 text-amber-700" /> Best wave {best}
          </span>
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1">
            <Coins className="size-4 text-amber-700" /> Best haul {formatNumber(bestGold)}
          </span>
          <button
            type="button"
            onClick={onHelp}
            className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <CircleHelp className="size-4" /> How to play
          </button>
        </div>
        <p className="g-hud mx-auto w-fit px-3 py-1 text-center text-xs font-semibold">
          {touch ? "Left stick steers and sets sails · buttons fire each side" : "A D steer · W S sails · Q fire left · E fire right · Esc pause"}
        </p>
      </div>
    </div>
  );
}

function ControlsHint({ touch }: { touch: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex animate-[cove-hint_9s_ease_forwards] justify-center px-4 ${touch ? "top-[38%]" : "bottom-[max(calc(env(safe-area-inset-bottom)+96px),112px)]"}`}
    >
      <div className="g-panel max-w-md px-5 py-3 text-center text-sm font-semibold">
        <p className="g-panel-title mb-1.5 text-2xl">Hoist the colours, captain!</p>
        {touch ? (
          <p>Stick ← → steers · push ↑ ↓ for more or less sail · the buttons fire each side</p>
        ) : (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span>
              <Kbd>A</Kbd> <Kbd>D</Kbd> steer
            </span>
            <span>
              <Kbd>W</Kbd> <Kbd>S</Kbd> sails
            </span>
            <span>
              <Kbd>Q</Kbd> fire left
            </span>
            <span>
              <Kbd>E</Kbd> fire right
            </span>
          </p>
        )}
        <p className="g-muted mt-1.5 text-xs">Your cannons point sideways: turn side-on to a ship, then fire.</p>
      </div>
    </div>
  );
}

// --- HUD -----------------------------------------------------------------------------------------

function HudOverlay({
  store,
  paused,
  touch,
  onPause,
  onMinimap,
}: {
  store: Store<Hud>;
  paused: boolean;
  touch: boolean;
  onPause: () => void;
  onMinimap: (canvas: HTMLCanvasElement | null) => void;
}) {
  const hud = useStore(store);
  const hullFrac = hud.maxHull ? hud.hull / hud.maxHull : 0;
  const hullColor = hullFrac > 0.6 ? "bg-emerald-600" : hullFrac > 0.3 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top-left: hull, gold, wave. */}
      <div className="absolute top-0 left-0 w-[min(60vw,320px)] space-y-1.5 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div className="g-hud px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="g-display inline-flex items-center gap-1.5 text-base sm:text-lg">
              <Ship className="size-4" /> {hud.ship}
            </span>
            <span className="g-display text-base tabular-nums sm:text-lg">
              {hud.hull}
              <span className="g-muted text-sm"> / {hud.maxHull}</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)] ring-1 ring-[color-mix(in_srgb,currentColor_30%,transparent)]">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${hullColor} ${hullFrac < 0.3 ? "animate-[cove-pulse_0.8s_ease_infinite]" : ""}`}
              style={{ width: `${hullFrac * 100}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <HudChip icon={<Coins className="size-4 text-amber-700" />}>{formatNumber(hud.gold)}</HudChip>
          <HudChip icon={<Flag className="size-4" />}>Wave {hud.wave}</HudChip>
          <HudChip icon={<Swords className="size-4 text-red-700" />}>{hud.enemies} left</HudChip>
          <HudChip icon={<Skull className="size-4" />} wide>
            {hud.sunk} sunk
          </HudChip>
        </div>
      </div>

      {/* Top-right: pause and system buttons (desktop), minimap. */}
      <div className="absolute top-0 right-0 flex flex-col items-end gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div className="pointer-events-auto flex items-center gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <div className="hidden sm:block">
            <SystemButtons />
          </div>
        </div>
        <div className="g-hud rounded-full! p-1">
          <canvas ref={onMinimap} className={`block rounded-full ${touch ? "size-24" : "size-28 sm:size-36"}`} aria-label="Minimap" />
        </div>
      </div>

      {/* Banner and boss bar. */}
      <div className="absolute inset-x-0 top-[max(env(safe-area-inset-top),12px)] flex flex-col items-center gap-2 px-3 pt-36 sm:pt-4">
        {hud.boss && (
          <div className="g-hud w-[min(86vw,420px)] px-4 py-1.5">
            <p className="g-display text-center text-lg leading-tight text-emerald-900">{hud.boss.name}</p>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)] ring-1 ring-emerald-900/40">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-teal-500 transition-[width] duration-200" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
            </div>
          </div>
        )}
        {hud.banner && <BannerView key={hud.banner.id} banner={hud.banner} />}
      </div>

      {hud.warn && (
        <div className="absolute inset-x-0 top-[46%] flex justify-center px-4">
          <p className="g-hud g-display animate-[cove-pulse_1s_ease_infinite] px-4 py-1.5 text-lg text-red-800">{hud.warn}</p>
        </div>
      )}

      {/* Helm: reloads, wind, sails. */}
      {!touch && (
        <div className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] flex items-end justify-center gap-3 px-4">
          <ReloadGauge label="Port" keyName="Q" value={hud.reloadL} guns={hud.guns} />
          <HelmPanel hud={hud} />
          <ReloadGauge label="Starboard" keyName="E" value={hud.reloadR} guns={hud.guns} />
        </div>
      )}
      {touch && (
        <div className="absolute inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),16px)+138px)] flex justify-center">
          <HelmPanel hud={hud} compact />
        </div>
      )}
    </div>
  );
}

function HudChip({ icon, children, wide = false }: { icon: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <span className={`g-hud g-display items-center gap-1.5 px-2.5 py-0.5 text-base tabular-nums ${wide ? "hidden sm:inline-flex" : "inline-flex"}`}>
      {icon}
      {children}
    </span>
  );
}

function BannerView({ banner }: { banner: NonNullable<Hud["banner"]> }) {
  const tone = {
    info: "",
    good: "text-amber-800",
    boss: "text-emerald-900",
    bad: "text-red-800",
  }[banner.tone];
  return (
    <div className="g-panel animate-[cove-banner_0.35s_ease] px-6 py-2 text-center">
      <p className={`g-panel-title text-3xl sm:text-5xl ${tone}`}>{banner.title}</p>
      <p className="g-muted mt-0.5 text-sm font-semibold sm:text-base">{banner.sub}</p>
    </div>
  );
}

function ReloadGauge({ label, keyName, value, guns }: { label: string; keyName: string; value: number; guns: number }) {
  const ready = value >= 1;
  return (
    <div className={`g-hud w-40 px-3 py-1.5 transition ${ready ? "ring-2 ring-[var(--accent)]" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="g-display inline-flex items-center gap-1.5 text-base">
          <Kbd>{keyName}</Kbd> {label}
        </span>
        <span className={`g-display text-sm ${ready ? "text-sky-800" : "g-muted"}`}>{ready ? "Ready!" : "Loading"}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: guns }, (_, i) => (
          <span key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)]">
            <span className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.min(1, Math.max(0, value * guns - i)) * 100}%` }} />
          </span>
        ))}
      </div>
    </div>
  );
}

function HelmPanel({ hud, compact = false }: { hud: Hud; compact?: boolean }) {
  const effColor = hud.trimEff > 0.85 ? "text-emerald-800" : hud.trimEff > 0.5 ? "text-amber-800" : "text-red-800";
  return (
    <div className={`g-hud flex items-center gap-3 ${compact ? "px-2.5 py-1" : "px-3.5 py-1.5"}`}>
      <div
        className="relative grid size-12 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,currentColor_10%,transparent)] ring-2 ring-[color-mix(in_srgb,currentColor_45%,transparent)]"
        title={`Wind: ${hud.windStrength < 0.92 ? "light breeze" : hud.windStrength < 1.06 ? "steady breeze" : "strong wind"}`}
      >
        <svg
          viewBox="0 0 40 40"
          className="size-10 transition-transform duration-150 ease-linear"
          style={{ transform: `rotate(${hud.wind}deg) scale(${0.7 + hud.windStrength * 0.28})` }}
          aria-hidden
        >
          <path d="M20 6 L27 18 L22.5 16.5 L22.5 33 L17.5 33 L17.5 16.5 L13 18 Z" fill="var(--accent)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className={`g-display text-base leading-tight whitespace-nowrap ${effColor}`}>
          <Wind className="mr-1 inline size-3.5" />
          {hud.trim}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="g-muted text-xs font-bold">Sails</span>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-3.5 w-2.5 rounded-[2px] ring-1 ring-[color-mix(in_srgb,currentColor_45%,transparent)] ${hud.sail >= n ? "bg-current" : "bg-transparent"}`} />
          ))}
          {!compact && (
            <span className="g-display ml-2 inline-flex items-center gap-1 text-base tabular-nums">
              <Gauge className="size-3.5 opacity-70" /> {hud.speed} kn
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Touch controls ------------------------------------------------------------------------------

type GameRef = { readonly current: CannonCoveGame | null };

function TouchControls({ game, store }: { game: GameRef; store: Store<Hud> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <Joystick game={game} />
      <FireButtons game={game} store={store} />
    </div>
  );
}

function Joystick({ game }: { game: GameRef }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const state = useRef<{ id: number; cx: number; cy: number; latch: 0 | 1 | -1 } | null>(null);
  const R = 46;

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.cx;
    let dy = e.clientY - s.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    const x = dx / R;
    game.current?.setStick(Math.abs(x) < 0.12 ? 0 : x);
    // Push up / down past the rim to raise / lower one sail level per push.
    const y = dy / R;
    if (s.latch === 0 && y < -0.7) {
      s.latch = 1;
      game.current?.sailStep(1);
    } else if (s.latch === 0 && y > 0.7) {
      s.latch = -1;
      game.current?.sailStep(-1);
    } else if (s.latch !== 0 && Math.abs(y) < 0.35) s.latch = 0;
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (state.current?.id !== e.pointerId) return;
    state.current = null;
    setKnob({ x: 0, y: 0 });
    game.current?.setStick(0);
  };

  return (
    <div
      className="g-hud pointer-events-auto relative grid size-32 touch-none place-items-center rounded-full!"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        state.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, latch: 0 };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Steering stick: left and right to steer, up and down to set sails"
      role="application"
    >
      <span className="g-display absolute top-1 text-xs leading-none">▲ sail</span>
      <span className="g-display absolute bottom-1 text-xs leading-none">▼ sail</span>
      <span className="absolute left-2 text-sm opacity-70">◀</span>
      <span className="absolute right-2 text-sm opacity-70">▶</span>
      <span className="g-btn size-14 rounded-full!" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function FireButtons({ game, store }: { game: GameRef; store: Store<Hud> }) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-auto flex items-end gap-3">
      <FireButton label="Fire left" side={1} value={hud.reloadL} game={game} />
      <FireButton label="Fire right" side={-1} value={hud.reloadR} game={game} />
    </div>
  );
}

function FireButton({ label, side, value, game }: { label: string; side: 1 | -1; value: number; game: GameRef }) {
  const ready = value >= 1;
  const deg = Math.min(1, Math.max(0, value)) * 360;
  return (
    <button
      type="button"
      className="relative grid size-[78px] touch-none place-items-center rounded-full p-[5px] select-none"
      style={{ background: `conic-gradient(var(--accent) ${deg}deg, rgb(59 36 18 / 0.55) ${deg}deg)` }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        game.current?.setFire(side, true);
      }}
      onPointerUp={() => game.current?.setFire(side, false)}
      onPointerCancel={() => game.current?.setFire(side, false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      <span className={`g-btn grid size-full place-items-center rounded-full! ${ready ? "" : "opacity-70 grayscale"}`}>
        <span className="flex flex-col items-center leading-none">
          <Crosshair className="size-6" />
          <span className="mt-1 text-xs">{side === 1 ? "◀ Left" : "Right ▶"}</span>
        </span>
      </span>
    </button>
  );
}

// --- Upgrades ------------------------------------------------------------------------------------

const CARD_ICONS: Record<UpgradeId, ReactNode> = {
  reload: <Timer className="size-6" />,
  guns: <Crosshair className="size-6" />,
  hull: <ShieldPlus className="size-6" />,
  sails: <Sailboat className="size-6" />,
  shot: <Sparkles className="size-6" />,
  range: <Anchor className="size-6" />,
  ship: <Ship className="size-6" />,
  carpenter: <Hammer className="size-6" />,
  plunder: <Coins className="size-6" />,
};

function UpgradeModal({ offer, onPick, onRepair }: { offer: Offer; onPick: (i: number) => void; onRepair: () => void }) {
  const canRepair = offer.gold >= offer.repairCost && offer.hull < offer.maxHull;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/40 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Choose an upgrade" className="g-panel w-full max-w-3xl space-y-4 p-5 sm:p-6">
          <div className="text-center">
            <p className="g-display text-base text-amber-800">Wave {offer.wave} cleared — the crew wants a reward</p>
            <h2 className="g-panel-title mt-1 text-4xl sm:text-5xl">Choose an upgrade</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {offer.cards.map((card, i) => (
              <UpgradeCard key={card.id} card={card} index={i} onPick={() => onPick(i)} />
            ))}
          </div>
          <div className="g-tint flex flex-col items-center justify-between gap-3 rounded-[var(--g-hud-radius)] p-3 sm:flex-row">
            <div className="g-display flex items-center gap-4 text-lg">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="size-4 text-amber-700" /> {formatNumber(offer.gold)} gold
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ship className="size-4" /> Hull {offer.hull} / {offer.maxHull}
              </span>
            </div>
            <button
              type="button"
              onClick={onRepair}
              disabled={!canRepair}
              className="g-btn px-4 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="g-unskew gap-2">
                <Wrench className="size-4" /> Repair +{offer.repairAmount} hull · {offer.repairCost} gold
                <span className="hidden sm:inline">
                  <Kbd>R</Kbd>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpgradeCard({ card, index, onPick }: { card: Card; index: number; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      autoFocus={index === 0}
      className={`g-soft relative flex flex-row items-start gap-3 p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-col sm:items-center sm:text-center ${
        card.rare ? "bg-amber-300/40! ring-2 ring-amber-600" : ""
      }`}
    >
      <span className="absolute top-2 right-2 hidden sm:block">
        <Kbd>{index + 1}</Kbd>
      </span>
      <span className={`g-btn grid size-12 shrink-0 place-items-center rounded-full! ${card.rare ? "bg-[linear-gradient(180deg,#f5c542,#b7791f)]!" : ""}`}>{CARD_ICONS[card.id]}</span>
      <span className="min-w-0">
        <span className="g-panel-title block text-2xl">{card.title}</span>
        <span className="mt-1 block text-sm leading-snug">{card.text}</span>
        {card.max > 1 && (
          <span className="mt-2 flex gap-1 sm:justify-center" aria-label={`Level ${card.level} of ${card.max}`}>
            {Array.from({ length: card.max }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-4 rounded-full ring-1 ring-[color-mix(in_srgb,currentColor_35%,transparent)] ${i < card.level ? "bg-[var(--accent)]" : i === card.level ? "bg-amber-500" : "bg-transparent"}`}
              />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
