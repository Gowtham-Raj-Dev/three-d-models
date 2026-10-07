"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Gem, Heart, Home, Magnet, Pause, Play, RotateCcw, Trophy } from "lucide-react";
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
import { SkateRushGame, type Hud, type Move, type Phase, type RunResult } from "./engine";
import { CHARACTERS, GAME } from "./manifest";

const records = createRecords("skate-rush:v1", { best: 0, bank: 0, runs: 0, character: 0 });

const EMPTY_HUD: Hud = { score: 0, coins: 0, distance: 0, shield: false, magnet: 0, boost: 0 };

const KEY_MOVES: Record<string, Move> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowUp: "jump",
  w: "jump",
  W: "jump",
  " ": "jump",
  ArrowDown: "duck",
  s: "duck",
  S: "duck",
};

export function SkateRush({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SkateRushGame | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(RunResult & { newBest: boolean }) | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [help, setHelp] = useState(false);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new SkateRushGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      over: (run) => {
        const before = records.get();
        const newBest = run.score > before.best;
        records.set({ best: Math.max(before.best, run.score), bank: before.bank + run.coins, runs: before.runs + 1 });
        setResult({ ...run, newBest });
      },
    });
    gameRef.current = game;
    game.selectCharacter(records.get().character);
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  const start = () => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setHelp(false);
    setRunKey((k) => k + 1);
    game.start();
  };

  const toMenu = () => {
    setResult(null);
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

  const changeCharacter = (dir: number) => {
    const next = (saved.character + dir + CHARACTERS.length) % CHARACTERS.length;
    records.set({ character: next });
    gameRef.current?.selectCharacter(next);
  };

  // Game keys: arrows / WASD / Space while running, Enter on the menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.key === "Enter" || e.key === " ";
      if (phase === "playing") {
        const move = KEY_MOVES[e.key];
        if (move) {
          e.preventDefault();
          if (!e.repeat) game.input(move);
        }
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          game.resume();
        }
      } else if (phase === "menu") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          changeCharacter(e.key === "ArrowLeft" ? -1 : 1);
        }
      } else if (phase === "over") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.key === "Escape") toMenu();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab or window pauses the run.
  useEffect(() => {
    const pause = () => gameRef.current?.pause();
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  // Swipes (touch or mouse drag). Each 24px of travel fires one move, so a single touch can chain moves.
  const onPointerDown = (e: ReactPointerEvent) => {
    if (phase === "playing") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = swipe.current;
    const game = gameRef.current;
    if (!s || !game) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 24) return;
    game.input(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "jump" : "duck");
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const endSwipe = () => {
    swipe.current = null;
  };

  const running = phase === "playing" || phase === "paused" || phase === "crashed";

  return (
    <GameRoot game={GAME} className="bg-[#cde3f4]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endSwipe} onPointerCancel={endSwipe}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Skate Rush game" />

      {(phase === "loading" || phase === "error") && <LoadingScreen game={GAME} progress={progress} error={error} />}

      {phase === "menu" && (
        <MenuScreen
          character={saved.character}
          best={saved.best}
          bank={saved.bank}
          onCharacter={changeCharacter}
          onPlay={start}
          onHelp={() => setHelp(true)}
        />
      )}

      {running && <HudOverlay store={hud} best={saved.best} paused={phase === "paused"} onPause={pauseOrResume} />}
      {phase === "playing" && saved.runs < 3 && <ControlsHint key={runKey} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
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
        </Modal>
      )}

      {phase === "over" && result && !help && (
        <Modal title="Wiped out!">
          <div className="text-center">
            {result.newBest && (
              <p className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-black tracking-wider text-amber-950 uppercase">
                <Trophy className="size-3.5" /> New best
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">Score</p>
            <p className="g-display text-6xl tabular-nums">{formatNumber(result.score)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Coins" value={formatNumber(result.coins)} />
            <Stat label="Distance" value={`${formatNumber(result.distance)} m`} />
            <Stat label="Best" value={formatNumber(Math.max(saved.best, result.score))} />
          </div>
          <BigButton onClick={start} icon={<RotateCcw className="size-5" />}>
            Play again
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

// --- Screens -------------------------------------------------------------------------------------

function MenuScreen({
  character,
  best,
  bank,
  onCharacter,
  onPlay,
  onHelp,
}: {
  character: number;
  best: number;
  bank: number;
  onCharacter: (dir: number) => void;
  onPlay: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>

      <div className="px-4 pt-2 text-center sm:pt-4">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-sm text-white [text-shadow:2px_2px_0_#111] sm:text-base">Dodge the traffic · grab the coins · don&apos;t stop</p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <div className="g-hud flex items-center justify-between p-1.5">
          <IconButton onClick={() => onCharacter(-1)} label="Previous skater" plain>
            <ChevronLeft className="size-6" />
          </IconButton>
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">Skater</p>
            <p className="g-display text-lg">{CHARACTERS[character]?.name ?? CHARACTERS[0].name}</p>
          </div>
          <IconButton onClick={() => onCharacter(1)} label="Next skater" plain>
            <ChevronRight className="size-6" />
          </IconButton>
        </div>

        <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
          Play
        </BigButton>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <Trophy className="size-3.5 text-amber-300" /> Best {formatNumber(best)}
          </span>
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <CoinIcon /> {formatNumber(bank)} coins
          </span>
          <button
            type="button"
            onClick={onHelp}
            className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <CircleHelp className="size-3.5" /> How to play
          </button>
        </div>

        <p className="hidden text-center text-xs font-semibold text-white/85 [text-shadow:0_1px_4px_rgb(0_0_0/0.5)] sm:block">
          ← → change lane · ↑ / Space jump · ↓ duck · Esc pause · M music
        </p>
        <p className="text-center text-xs font-semibold text-white/85 [text-shadow:0_1px_4px_rgb(0_0_0/0.5)] sm:hidden">Swipe ← → to change lane · ↑ jump · ↓ duck</p>
      </div>
    </div>
  );
}

function HudOverlay({ store, best, paused, onPause }: { store: Store<Hud>; best: number; paused: boolean; onPause: () => void }) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
      <div className="space-y-2">
        <div className="g-hud inline-flex items-center gap-2 py-1.5 pr-4 pl-1.5">
          <CoinIcon large />
          <span className="g-display text-xl tabular-nums">{formatNumber(hud.coins)}</span>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          {hud.shield && <PowerChip icon={<Heart className="size-3.5 fill-current" />} label="Shield" tone="bg-rose-500" />}
          {hud.magnet > 0 && <PowerChip icon={<Magnet className="size-3.5" />} label="Magnet" tone="bg-amber-500" left={hud.magnet} />}
          {hud.boost > 0 && <PowerChip icon={<Gem className="size-3.5" />} label="2× Score" tone="bg-indigo-500" left={hud.boost} />}
        </div>
      </div>

      <div className="flex items-start gap-2">
        <div className="g-hud px-4 py-1.5 text-right">
          <p className="g-display text-2xl leading-tight tabular-nums sm:text-3xl">{formatNumber(hud.score)}</p>
          <p className="text-[11px] font-bold tabular-nums opacity-70">
            {formatNumber(hud.distance)} m · best {formatNumber(Math.max(best, hud.score))}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <SystemButtons vertical />
        </div>
      </div>
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),24px)] flex animate-[skate-hint_5s_ease_forwards] justify-center px-4">
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">
        <span className="hidden sm:inline">← → change lane · ↑ jump · ↓ duck</span>
        <span className="sm:hidden">Swipe to dodge · up to jump · down to duck</span>
      </p>
    </div>
  );
}

function PowerChip({ icon, label, tone, left }: { icon: ReactNode; label: string; tone: string; left?: number }) {
  return (
    <div className="g-hud inline-flex items-center gap-2 py-1 pr-3 pl-1 text-xs font-bold">
      <span className={`grid size-6 place-items-center rounded-full ${tone}`}>{icon}</span>
      {label}
      {left !== undefined && (
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_20%,transparent)]">
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, (left / 10) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function CoinIcon({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ring-2 ring-amber-600/70 ${large ? "size-7" : "size-3.5"}`}
    />
  );
}
