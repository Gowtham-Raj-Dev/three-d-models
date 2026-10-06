"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, CircleHelp, Clock, Flag, Heart, Home, KeyRound, Lock, Pause, Play, RotateCcw, Snowflake, Star, Sun, Trophy } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import {
  BackLink,
  BigButton,
  createRecords,
  createStore,
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
import { SkyHopGame, START_LIVES, type Hud, type LevelResult, type Phase, type ToastKind } from "./engine";
import { buildLevel, coinTotal, LEVELS } from "./levels";
import { CHARACTERS, GAME } from "./manifest";

interface LevelRecord {
  /** Bit mask of the stars found. */
  stars: number;
  coins: number;
  /** Best time in seconds (0 = not finished yet). */
  time: number;
}

const records = createRecords("sky-hop:v1", { character: 0, unlocked: 1, levels: {} as Record<string, LevelRecord> });

const EMPTY_HUD: Hud = { level: 0, coins: 0, levelCoins: 0, lives: START_LIVES, hp: 3, stars: [false, false, false], key: false, chest: false, time: 0 };

/** Body colours of the five characters, for the lives badge and the picker. */
const CHARACTER_TINT = ["#a78bfa", "#f472b6", "#facc15", "#34d399", "#fdba74"];

const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyQ", "KeyE", "KeyR"]);

const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

const countStars = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
const starsFound = (index: number) => {
  const mask = records.get().levels[String(index)]?.stars ?? 0;
  return [0, 1, 2].map((i) => (mask & (1 << i)) !== 0);
};

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

type Screen = "title" | "levels";

export function SkyHop({ sizes }: { sizes: Record<string, number> }) {
  // A page re-render passes a new object: keep the first one so the game isn't rebuilt.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SkyHopGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [toasts] = useState(() => createStore<Toast | null>(null));
  const [phase, setPhase] = useState<Phase>("loading");
  const [screen, setScreen] = useState<Screen>("title");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(LevelResult & { best: number; newBest: boolean; record: LevelRecord }) | null>(null);
  const [overLevel, setOverLevel] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [help, setHelp] = useState(false);
  // Only read after loading (nothing touch-specific renders before), so SSR markup still matches.
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [runKey, setRunKey] = useState(0);
  const saved = useRecords(records);
  const totals = useMemo(() => LEVELS.map((def, i) => coinTotal(buildLevel(def, 1234 + i * 77))), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let toastId = 0;
    const game = new SkyHopGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      toast: (text, kind) => toasts.set({ id: ++toastId, text, kind }),
      fade: (alpha) => {
        if (fadeRef.current) fadeRef.current.style.opacity = String(alpha);
      },
      complete: (run) => {
        const before = records.get();
        const key = String(run.level);
        const prev = before.levels[key] ?? { stars: 0, coins: 0, time: 0 };
        const mask = run.stars.reduce((m, s, i) => (s ? m | (1 << i) : m), 0);
        const newBest = !prev.time || run.time < prev.time;
        const record: LevelRecord = { stars: prev.stars | mask, coins: Math.max(prev.coins, run.coins), time: newBest ? run.time : prev.time };
        records.set({ levels: { ...before.levels, [key]: record }, unlocked: Math.max(before.unlocked, Math.min(LEVELS.length, run.level + 2)) });
        setResult({ ...run, best: record.time, newBest: newBest && !!prev.time, record });
      },
      over: (level) => setOverLevel(level),
    });
    gameRef.current = game;
    game.selectCharacter(records.get().character);
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, toasts, modelSizes]);

  const startLevel = (index: number, fresh: boolean) => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setOverLevel(null);
    setHelp(false);
    setCurrent(index);
    setRunKey((k) => k + 1);
    toasts.set(null);
    game.startLevel(index, fresh, starsFound(index));
  };

  const toLevels = () => {
    setResult(null);
    setOverLevel(null);
    setScreen("levels");
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
    else if (phase === "menu" && screen === "levels") setScreen("title");
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

  const nextLevel = result && result.level + 1 < LEVELS.length ? result.level + 1 : null;

  // Keyboard: game controls while playing, Enter / arrows on the menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey) return;
      if (help) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (phase === "playing") {
        if (GAME_KEYS.has(e.code)) {
          e.preventDefault();
          game.setKey(e.code, true);
        }
        return;
      }
      if (e.repeat) return;
      const confirm = e.key === "Enter" || (e.key === " " && !onButton);
      if (phase === "paused" && confirm && !onButton) {
        e.preventDefault();
        game.resume();
      } else if (phase === "menu" && screen === "title") {
        if (confirm && !onButton) {
          e.preventDefault();
          setScreen("levels");
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          changeCharacter(e.key === "ArrowLeft" ? -1 : 1);
        }
      } else if (phase === "menu" && screen === "levels") {
        if (confirm && !onButton) {
          e.preventDefault();
          startLevel(Math.min(saved.unlocked, LEVELS.length) - 1, true);
        }
      } else if (phase === "complete" && result && confirm && !onButton) {
        e.preventDefault();
        if (nextLevel !== null) startLevel(nextLevel, false);
        else toLevels();
      } else if (phase === "over" && confirm && !onButton) {
        e.preventDefault();
        startLevel(overLevel ?? current, true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => gameRef.current?.setKey(e.code, false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // Leaving the tab or window pauses the game.
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

  const inLevel = phase === "playing" || phase === "paused" || phase === "dying" || phase === "complete";
  const totalStars = Object.values(saved.levels).reduce((n, r) => n + countStars(r.stars), 0);

  return (
    <GameRoot game={GAME} className="bg-[#9fd3f7]">
      <style>{KEYFRAMES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Sky Hop game" />
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-[#1c1917]" style={{ opacity: 0 }} />

      {(phase === "loading" || phase === "error") && <LoadingScreen game={GAME} progress={progress} error={error} />}

      {phase === "menu" && screen === "title" && (
        <TitleScreen
          character={saved.character}
          stars={totalStars}
          onCharacter={changeCharacter}
          onPlay={() => setScreen("levels")}
          onHelp={() => setHelp(true)}
          touch={touch}
        />
      )}

      {phase === "menu" && screen === "levels" && (
        <LevelSelect levels={saved.levels} unlocked={saved.unlocked} totals={totals} onPick={(i) => startLevel(i, true)} onBack={() => setScreen("title")} onHelp={() => setHelp(true)} />
      )}

      {phase === "playing" && <Controls key={runKey} game={gameRef} touch={touch} onTouch={() => setTouch(true)} />}

      {inLevel && (
        <HudOverlay
          store={hud}
          character={saved.character}
          found={saved.levels[String(current)]?.stars ?? 0}
          paused={phase === "paused"}
          onPause={pauseOrResume}
        />
      )}
      {inLevel && <ToastLayer store={toasts} />}
      {phase === "playing" && <LevelBanner key={`banner-${runKey}`} index={current} />}
      {phase === "playing" && current === 0 && <ControlsHint key={`hint-${runKey}`} touch={touch} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => gameRef.current?.toCheckpoint()} icon={<Flag className="size-4" />}>
              Checkpoint
            </SoftButton>
            <SoftButton onClick={() => startLevel(current, false)} icon={<RotateCcw className="size-4" />}>
              Restart level
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              How to play
            </SoftButton>
            <SoftButton onClick={toLevels} icon={<Home className="size-4" />}>
              Levels
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "complete" && result && !help && (
        <Modal title="Level clear!" wide>
          <p className="g-display -mt-2 text-center text-sm text-[var(--accent)] [text-shadow:1px_1px_0_#1c1917]">
            {result.level + 1}. {LEVELS[result.level].name}
          </p>
          <div className="flex justify-center gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ animationDelay: `${0.2 + i * 0.18}s` }} className="animate-[skyhop-pop_0.5s_ease_both]">
                <Star
                  className={`size-12 stroke-[2.5] ${result.stars[i] ? "fill-[var(--accent)] text-[#1c1917]" : result.record.stars & (1 << i) ? "fill-[#fde68a] text-[#1c1917] opacity-60" : "fill-transparent text-[#1c1917] opacity-30"}`}
                />
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Time" value={formatTime(result.time)} />
            <Stat label="Coins" value={`${result.coins}/${result.totalCoins}`} />
            <Stat label="Best" value={formatTime(result.best)} />
          </div>
          {result.newBest && (
            <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full border-2 border-[#1c1917] bg-[var(--accent)] px-3 py-1 text-xs font-black tracking-wider text-[#1c1917] uppercase">
              <Trophy className="size-3.5" /> New best time
            </p>
          )}
          {nextLevel !== null ? (
            <BigButton onClick={() => startLevel(nextLevel, false)} icon={<Play className="size-6 fill-current" />} autoFocus>
              Next level
            </BigButton>
          ) : (
            <div className="space-y-3 text-center">
              <p className="g-display text-lg">You conquered every island!</p>
              <BigButton onClick={toLevels} icon={<Trophy className="size-6" />} autoFocus>
                All levels
              </BigButton>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => startLevel(result.level, false)} icon={<RotateCcw className="size-4" />}>
              Play again
            </SoftButton>
            <SoftButton onClick={toLevels} icon={<Home className="size-4" />}>
              Levels
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "over" && overLevel !== null && !help && (
        <Modal title="Game over">
          <p className="text-center text-sm">
            Out of lives on <span className="font-bold">{LEVELS[overLevel].name}</span>. Stars and coins you found are kept — try again with {START_LIVES} fresh lives!
          </p>
          <BigButton onClick={() => startLevel(overLevel, true)} icon={<RotateCcw className="size-5" />} autoFocus>
            Try again
          </BigButton>
          <SoftButton onClick={toLevels} icon={<Home className="size-4" />}>
            Levels
          </SoftButton>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

const KEYFRAMES = `
@keyframes skyhop-pop { 0% { opacity: 0; transform: scale(0.3) rotate(-20deg); } 60% { opacity: 1; transform: scale(1.2) rotate(6deg); } 100% { opacity: 1; transform: none; } }
@keyframes skyhop-toast { 0% { opacity: 0; transform: translateY(-12px) scale(0.8); } 12% { opacity: 1; transform: translateY(0) scale(1.06); } 18% { transform: scale(1); } 80% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes skyhop-banner { 0% { opacity: 0; transform: translateY(16px) scale(0.9); } 12%, 75% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-10px); } }
@keyframes skyhop-hint { 0% { opacity: 0; } 8%, 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes skyhop-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
`;

// --- Screens -------------------------------------------------------------------------------------

function TitleScreen({
  character,
  stars,
  onCharacter,
  onPlay,
  onHelp,
  touch,
}: {
  character: number;
  stars: number;
  onCharacter: (dir: number) => void;
  onPlay: () => void;
  onHelp: () => void;
  touch: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5 [@media(max-height:480px)]:py-2">
        <BackLink game={GAME} />
        <SystemButtons onHelp={onHelp} />
      </div>

      <div className="flex flex-1 flex-col justify-between px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:justify-center sm:px-10 sm:pb-10 lg:px-16 [@media(max-height:480px)]:pb-3">
        <div className="text-center sm:max-w-md sm:text-left [@media(max-height:480px)]:origin-top-left [@media(max-height:480px)]:scale-75">
          <GameTitle game={GAME} />
          <p className="g-display mt-3 text-sm text-white [text-shadow:2px_2px_0_#1c1917] sm:text-lg [@media(max-height:480px)]:hidden">Hop · stomp · find the stars</p>
        </div>

        <div className="mt-6 w-full max-w-sm space-y-3 self-center sm:self-start [@media(max-height:480px)]:-mt-4 [@media(max-height:480px)]:space-y-2">
          <div className="g-panel flex items-center justify-between p-1.5">
            <IconButton onClick={() => onCharacter(-1)} label="Previous character" plain>
              <ChevronLeft className="size-6" />
            </IconButton>
            <div className="flex items-center gap-2.5">
              <span className="size-5 rounded-full border-[3px] border-[#1c1917]" style={{ background: CHARACTER_TINT[character] }} />
              <div className="text-center">
                <p className="g-muted text-[10px] font-bold tracking-[0.2em] uppercase">Hero</p>
                <p className="g-display text-xl leading-none">{CHARACTERS[character]?.name ?? CHARACTERS[0].name}</p>
              </div>
            </div>
            <IconButton onClick={() => onCharacter(1)} label="Next character" plain>
              <ChevronRight className="size-6" />
            </IconButton>
          </div>

          <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
            Play
          </BigButton>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold sm:justify-start">
            <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
              <Star className="size-3.5 fill-[var(--accent)] stroke-[#1c1917] stroke-[2.5]" /> {stars} / {LEVELS.length * 3} stars
            </span>
            <button
              type="button"
              onClick={onHelp}
              className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <CircleHelp className="size-3.5" /> How to play
            </button>
          </div>
          {!touch && (
            <p className="hidden text-center text-xs font-bold text-white [text-shadow:1px_1px_0_#1c1917,0_0_6px_rgb(0_0_0/0.4)] sm:block sm:text-left [@media(max-height:480px)]:!hidden">
              WASD move · Space jump · Shift ground pound · Q/E or drag to look
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LevelSelect({
  levels,
  unlocked,
  totals,
  onPick,
  onBack,
  onHelp,
}: {
  levels: Record<string, LevelRecord>;
  unlocked: number;
  totals: number[];
  onPick: (index: number) => void;
  onBack: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="flex items-center justify-between p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <button
          type="button"
          onClick={onBack}
          className="g-hud g-display inline-flex items-center gap-1.5 px-3.5 py-2 text-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <ChevronLeft className="size-4" /> Back
        </button>
        <SystemButtons onHelp={onHelp} />
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-10">
        <h2 className="g-title text-center text-4xl sm:text-6xl">Pick an island</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map((def, i) => {
            const rec = levels[String(i)];
            const open = i < unlocked;
            return (
              <button
                key={def.name}
                type="button"
                disabled={!open}
                onClick={() => onPick(i)}
                autoFocus={i === Math.min(unlocked, LEVELS.length) - 1}
                className="g-panel group relative flex flex-col gap-2 p-4 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-70"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="g-display grid size-11 shrink-0 place-items-center rounded-full border-[3px] border-[#1c1917] text-xl"
                    style={{ background: def.theme === "snow" ? "#bfdbfe" : i === 2 ? "#fdba74" : "#86efac" }}
                  >
                    {open ? i + 1 : <Lock className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="g-display truncate text-lg leading-tight">{def.name}</p>
                    <p className="g-muted flex items-center gap-1 text-xs font-bold">
                      {def.theme === "snow" ? <Snowflake className="size-3.5" /> : <Sun className="size-3.5" />}
                      {def.theme === "snow" ? "Snow" : "Grassland"} · {["Easy", "Easy", "Medium", "Medium", "Hard"][i]}
                    </p>
                  </div>
                </div>
                {open ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex gap-0.5">
                      {[0, 1, 2].map((s) => (
                        <Star
                          key={s}
                          className={`size-6 stroke-[#1c1917] stroke-[2.5] ${rec && rec.stars & (1 << s) ? "fill-[var(--accent)]" : "fill-transparent opacity-35"}`}
                        />
                      ))}
                    </span>
                    <span className="flex flex-col items-end text-xs font-bold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <CoinIcon /> {rec?.coins ?? 0}/{totals[i]}
                      </span>
                      <span className="g-muted inline-flex items-center gap-1">
                        <Clock className="size-3" /> {rec?.time ? formatTime(rec.time) : "--:--"}
                      </span>
                    </span>
                  </div>
                ) : (
                  <p className="g-muted text-xs font-bold">Finish level {i} to unlock</p>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs font-bold text-white [text-shadow:1px_1px_0_#1c1917,0_0_6px_rgb(0_0_0/0.4)]">
          You start each visit with {START_LIVES} lives · 100 coins = 1-UP
        </p>
      </div>
    </div>
  );
}

function HudOverlay({ store, character, found, paused, onPause }: { store: Store<Hud>; character: number; found: number; paused: boolean; onPause: () => void }) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="g-hud inline-flex items-center gap-1 px-2 py-1.5" aria-label={`${hud.hp} hearts`}>
            {[0, 1, 2].map((i) => (
              <Heart key={i} className={`size-5 stroke-[#1c1917] stroke-[2.5] sm:size-6 ${i < hud.hp ? "fill-[#f43f5e]" : "fill-transparent opacity-30"}`} />
            ))}
          </div>
          <div className="g-hud inline-flex items-center gap-1.5 py-1 pr-3 pl-1.5" aria-label={`${hud.lives} lives`}>
            <span className="size-6 rounded-full border-[3px] border-[#1c1917]" style={{ background: CHARACTER_TINT[character] }} />
            <span className="g-display text-lg tabular-nums">×{hud.lives}</span>
          </div>
        </div>
        <div className="g-hud inline-flex items-center gap-2 py-1 pr-3 pl-1.5">
          <CoinIcon large />
          <span key={hud.coins} className="g-display text-xl tabular-nums sm:text-2xl">
            {hud.coins}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <div className="flex flex-col items-end gap-2">
          <div className="g-hud inline-flex items-center gap-1 px-2 py-1.5" aria-label="Stars">
            {hud.stars.map((s, i) => (
              <Star
                key={i}
                className={`size-5 stroke-[#1c1917] stroke-[2.5] sm:size-6 ${s ? "fill-[var(--accent)]" : found & (1 << i) ? "fill-[#fde68a] opacity-45" : "fill-transparent opacity-30"}`}
              />
            ))}
            <KeyRound className={`ml-1 size-5 sm:size-6 ${hud.key ? "text-[#b45309]" : hud.chest ? "text-[#16a34a]" : "opacity-25"}`} aria-label={hud.key ? "Key" : "No key"} />
          </div>
          <div className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1 text-base tabular-nums">
            <Clock className="size-4" /> {formatTime(hud.time)}
          </div>
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

function ToastLayer({ store }: { store: Store<Toast | null> }) {
  const toast = useStore(store);
  if (!toast) return null;
  const icon =
    toast.kind === "star" ? (
      <Star className="size-6 fill-[var(--accent)] stroke-[#1c1917] stroke-[2.5]" />
    ) : toast.kind === "life" ? (
      <Heart className="size-6 fill-[#f43f5e] stroke-[#1c1917] stroke-[2.5]" />
    ) : toast.kind === "key" ? (
      <KeyRound className="size-6 text-[#b45309]" />
    ) : (
      <Flag className="size-6 fill-[#ef4444] stroke-[#1c1917]" />
    );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-4">
      <div key={toast.id} className="g-panel g-display flex animate-[skyhop-toast_2.4s_ease_forwards] items-center gap-2 px-5 py-2.5 text-lg sm:text-2xl">
        {icon}
        {toast.text}
      </div>
    </div>
  );
}

function LevelBanner({ index }: { index: number }) {
  const def = LEVELS[index];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[30%] flex animate-[skyhop-banner_2.6s_ease_forwards] flex-col items-center px-4 text-center">
      <p className="g-display text-lg text-white [text-shadow:2px_2px_0_#1c1917]">Level {index + 1}</p>
      <h2 className="g-title text-5xl sm:text-7xl">{def.name}</h2>
    </div>
  );
}

function ControlsHint({ touch }: { touch: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex animate-[skyhop-hint_9s_ease_forwards] justify-center px-4 opacity-0 [animation-delay:2.4s] ${
        touch ? "top-[38%]" : "bottom-[max(env(safe-area-inset-bottom),20px)]"
      }`}
    >
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">
        {touch ? "Left stick to run · Jump twice to double jump · drag the right side to look" : "WASD run · Space jump (twice = double jump) · Shift in the air = ground pound · Q/E look"}
      </p>
    </div>
  );
}

// --- Touch & mouse controls -----------------------------------------------------------------------

function Controls({ game, touch, onTouch }: { game: React.RefObject<SkyHopGame | null>; touch: boolean; onTouch: () => void }) {
  const stickBase = useRef<HTMLDivElement>(null);
  const stickKnob = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { kind: "stick" | "look"; x: number; y: number; ox: number; oy: number }>());
  const RADIUS = 56;

  const showStick = (x: number, y: number, kx: number, ky: number, visible: boolean) => {
    const base = stickBase.current;
    const knob = stickKnob.current;
    if (!base || !knob) return;
    base.style.opacity = visible ? "1" : "0";
    base.style.transform = `translate(${x - RADIUS}px, ${y - RADIUS}px)`;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") onTouch();
    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
    const kind = isTouch && e.clientX < window.innerWidth * 0.5 ? "stick" : "look";
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { kind, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
    if (kind === "stick") showStick(e.clientX, e.clientY, 0, 0, true);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    const g = game.current;
    if (!p || !g) return;
    if (p.kind === "look") {
      g.orbit(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    let dx = e.clientX - p.ox;
    let dy = e.clientY - p.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      // Drag the stick's centre along so it never feels stuck.
      p.ox += (dx / d) * (d - RADIUS);
      p.oy += (dy / d) * (d - RADIUS);
      dx = e.clientX - p.ox;
      dy = e.clientY - p.oy;
    }
    showStick(p.ox, p.oy, dx, dy, true);
    const nx = dx / RADIUS;
    const ny = dy / RADIUS;
    const len = Math.hypot(nx, ny);
    // Small dead zone, then full speed comes quickly.
    const k = len < 0.12 ? 0 : Math.min(1, (len - 0.12) / 0.7) / len;
    g.setStick(nx * k, -ny * k);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (p?.kind === "stick") {
      game.current?.setStick(0, 0);
      showStick(p.ox, p.oy, 0, 0, false);
    }
  };

  useEffect(() => {
    const g = game.current;
    return () => g?.setStick(0, 0);
  }, [game]);

  return (
    <>
      <div className="absolute inset-0 touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div
        ref={stickBase}
        className="pointer-events-none absolute top-0 left-0 grid size-28 place-items-center rounded-full border-4 border-[#1c1917]/70 bg-white/35 opacity-0 transition-opacity duration-150"
      >
        <div ref={stickKnob} className="size-12 rounded-full border-4 border-[#1c1917] bg-[var(--accent)] shadow-[0_4px_0_#1c1917]" />
      </div>
      {touch && (
        <>
          <p className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),18px)] left-5 text-xs font-bold text-white/90 [text-shadow:1px_1px_0_#1c1917]">
            Touch &amp; drag to run
          </p>
          <div className="absolute right-4 bottom-[max(env(safe-area-inset-bottom),18px)] flex items-end gap-3">
            <TouchButton label="Ground pound" size="size-16" onDown={() => game.current?.touchPound()}>
              <ArrowDownToLine className="size-7" />
            </TouchButton>
            <TouchButton label="Jump" size="size-24" onDown={() => game.current?.touchJump(true)} onUp={() => game.current?.touchJump(false)}>
              <span className="g-display text-lg">Jump</span>
            </TouchButton>
          </div>
        </>
      )}
    </>
  );
}

function TouchButton({ label, size, children, onDown, onUp }: { label: string; size: string; children: ReactNode; onDown: () => void; onUp?: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      className={`${size} grid touch-none place-items-center rounded-full border-4 border-[#1c1917] bg-[var(--accent)] text-[#1c1917] transition-transform select-none ${
        pressed ? "translate-y-1 shadow-[0_2px_0_#1c1917]" : "shadow-[0_6px_0_#1c1917]"
      }`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressed(true);
        onDown();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        setPressed(false);
        onUp?.();
      }}
      onPointerCancel={() => {
        setPressed(false);
        onUp?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function CoinIcon({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full border-[#1c1917] bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ${large ? "size-7 border-[3px]" : "size-3.5 border-2"}`}
    >
      {large && <span className="h-3 w-1 rounded-full bg-amber-100/80" />}
    </span>
  );
}
