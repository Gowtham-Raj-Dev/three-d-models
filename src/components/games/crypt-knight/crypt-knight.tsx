"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  CircleHelp,
  Coins,
  Crown,
  Droplet,
  Flame,
  FlaskConical,
  Footprints,
  Heart,
  Home,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Sword,
  Swords,
  Tornado,
  Trophy,
  Wind,
  Zap,
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
import { CryptKnightGame, type Action, type Hud, type Offer, type Phase, type RunSummary } from "./engine";
import { GAME } from "./manifest";
import type { PowerIcon } from "./powers";

const records = createRecords("crypt-knight:v1", { bestDepth: 0, wins: 0, runs: 0, bestTime: 0, kills: 0 });

const EMPTY_HUD: Hud = { hp: 100, maxHp: 100, potions: 2, maxPotions: 3, coins: 0, charge: 0, roll: 1, room: 1, rooms: 10, enemies: 0, boss: null, doorOpen: false, potionPrice: 30 };

const ICONS: Record<PowerIcon, ReactNode> = {
  sword: <Sword className="size-6" />,
  zap: <Zap className="size-6" />,
  heart: <Heart className="size-6" />,
  wind: <Wind className="size-6" />,
  droplet: <Droplet className="size-6" />,
  tornado: <Tornado className="size-6" />,
  flame: <Flame className="size-6" />,
  shield: <Shield className="size-6" />,
  swords: <Swords className="size-6" />,
  skull: <Skull className="size-6" />,
  flask: <FlaskConical className="size-6" />,
  coins: <Coins className="size-6" />,
  footprints: <Footprints className="size-6" />,
  sparkles: <Sparkles className="size-6" />,
};

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Keyframes used by this game's overlays (scoped names). */
const STYLES = `
@keyframes ck-banner { 0% { opacity: 0; transform: translateY(10px) scale(0.96); } 12% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
@keyframes ck-hurt { 0% { opacity: 0.85; } 100% { opacity: 0; } }
@keyframes ck-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
@keyframes ck-hint { 0% { opacity: 0; transform: translateY(8px); } 8%, 80% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes ck-card { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ck-anim { animation-duration: 0.01s !important; } }
`;

export function CryptKnight({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CryptKnightGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [later, setLater] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Offer[] | null>(null);
  const [summary, setSummary] = useState<(RunSummary & { newBest: boolean }) | null>(null);
  const [banner, setBanner] = useState<{ title: string; sub?: string; id: number } | null>(null);
  const [hurtKey, setHurtKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [touch, setTouch] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CryptKnightGame(canvas, {
      progress: setProgress,
      later: setLater,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      choose: setOptions,
      banner: (title, sub) => setBanner({ title, sub, id: performance.now() }),
      hurt: () => setHurtKey((k) => k + 1),
      over: (run) => {
        const before = records.get();
        const newBest = run.depth > before.bestDepth || (run.won && (!before.bestTime || run.time < before.bestTime));
        records.set({
          bestDepth: Math.max(before.bestDepth, run.depth),
          wins: before.wins + (run.won ? 1 : 0),
          runs: before.runs + 1,
          bestTime: run.won ? (before.bestTime ? Math.min(before.bestTime, run.time) : run.time) : before.bestTime,
          kills: before.kills + run.kills,
        });
        setSummary({ ...run, newBest });
      },
    });
    gameRef.current = game;
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  // Touch controls appear for touch screens (and as soon as someone touches).
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => setTouch((t) => t || coarse.matches);
    sync();
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") setTouch(true);
    };
    window.addEventListener("pointerdown", onPointer);
    coarse.addEventListener("change", sync);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      coarse.removeEventListener("change", sync);
    };
  }, []);

  const start = () => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setSummary(null);
    setOptions(null);
    setHelp(false);
    setRunKey((k) => k + 1);
    game.start();
  };

  const toMenu = () => {
    setSummary(null);
    setOptions(null);
    gameRef.current?.toMenu();
  };

  const pick = (id: string) => {
    setOptions(null);
    gameRef.current?.choosePower(id);
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

  // Menu keys: Enter starts, 1–3 pick a power, Escape leaves the results.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || e.repeat) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.key === "Enter" || (e.key === " " && !onButton);
      if (phase === "menu" && confirm && !onButton) {
        e.preventDefault();
        start();
      } else if (phase === "paused" && confirm && !onButton) {
        e.preventDefault();
        game.resume();
      } else if (phase === "choosing" && options) {
        const i = ["1", "2", "3"].indexOf(e.key);
        if (i >= 0 && options[i]) pick(options[i].power.id);
        else if (e.key.toLowerCase() === "b") game.buyPotion();
      } else if (phase === "over" && summary) {
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

  const running = phase === "playing" || phase === "paused" || phase === "choosing";

  return (
    <GameRoot game={GAME} className="bg-[#07050b]">
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Crypt Knight game" />

      {(phase === "loading" || phase === "error") && <LoadingScreen game={GAME} progress={progress} error={error} />}

      {phase === "menu" && <MenuScreen best={saved.bestDepth} wins={saved.wins} bestTime={saved.bestTime} later={later} onPlay={start} onHelp={() => setHelp(true)} touch={touch} />}

      {running && <HudOverlay store={hud} paused={phase === "paused"} onPause={pauseOrResume} touch={touch} />}
      {running && <LowHealth store={hud} />}
      {hurtKey > 0 && running && (
        <div key={`hurt-${hurtKey}`} className="ck-anim pointer-events-none absolute inset-0 animate-[ck-hurt_0.5s_ease-out_forwards] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(185_28_28/0.55)_100%)]" />
      )}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}
      {phase === "playing" && !touch && saved.runs < 3 && <ControlsHint key={`hint-${runKey}`} />}

      {banner && running && (
        <div key={`banner-${banner.id}`} className="ck-anim pointer-events-none absolute inset-x-0 top-[24%] flex animate-[ck-banner_2.4s_ease_forwards] flex-col items-center px-4 text-center opacity-0">
          <p className="g-title text-4xl sm:text-6xl">{banner.title}</p>
          {banner.sub && <p className="g-display mt-3 border-y border-[#c9a24a]/60 px-4 py-1 text-xs tracking-[0.25em] text-[#f8e7c0] uppercase [text-shadow:0_2px_8px_#000]">{banner.sub}</p>}
        </div>
      )}

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

      {phase === "choosing" && options && !help && <PowerChoice options={options} store={hud} onPick={pick} game={gameRef} />}

      {phase === "over" && summary && !help && (
        <Modal title={summary.won ? "Victory" : "You fell"} wide>
          <div className="text-center">
            {(summary.won || summary.newBest) && (
              <p className="g-display mx-auto mb-3 inline-flex items-center gap-1.5 border-y border-[#c9a24a]/70 px-3 py-1 text-xs tracking-[0.2em] text-[#f8e7c0] uppercase">
                {summary.won ? <Crown className="size-3.5 text-amber-300" /> : <Trophy className="size-3.5 text-amber-300" />}
                {summary.won ? "The Bone King is dust" : "New best"}
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">{summary.won ? "Crypt cleared in" : "Reached room"}</p>
            <p className="g-display text-6xl tabular-nums">{summary.won ? formatTime(summary.time) : `${summary.depth}/10`}</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Cleared" value={summary.cleared} />
            <Stat label="Kills" value={formatNumber(summary.kills)} />
            <Stat label="Time" value={formatTime(summary.time)} />
            <Stat label="Coins" value={formatNumber(summary.coins)} />
          </div>
          {summary.powers.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {summary.powers.map((p) => (
                <span key={p.name} className="g-tint g-display rounded-[var(--g-hud-radius)] px-2.5 py-1 text-xs">
                  {p.name}
                  {p.level > 1 ? ` ×${p.level}` : ""}
                </span>
              ))}
            </div>
          )}
          <p className="g-muted text-center text-xs font-semibold">
            Best: room {Math.max(saved.bestDepth, summary.depth)}/10 · Wins {saved.wins}
            {saved.bestTime ? ` · Fastest win ${formatTime(saved.bestTime)}` : ""}
          </p>
          <BigButton onClick={start} icon={<RotateCcw className="size-5" />} autoFocus>
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

// --- Screens -----------------------------------------------------------------------------------------

function MenuScreen({ best, wins, bestTime, later, onPlay, onHelp, touch }: { best: number; wins: number; bestTime: number; later: number; onPlay: () => void; onHelp: () => void; touch: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col bg-[linear-gradient(to_bottom,rgb(7_5_11/0.8),transparent_35%,transparent_58%,rgb(7_5_11/0.88))]">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>

      <div className="px-4 pt-1 text-center sm:pt-3">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-sm text-[#efe6da] [text-shadow:0_2px_8px_#000] sm:text-base">Ten rooms. One knight. A crypt full of bones.</p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <BigButton onClick={onPlay} icon={<Swords className="size-6" />} autoFocus>
          Enter the crypt
        </BigButton>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
            <Trophy className="size-3.5 text-amber-300" /> Best room {best}/10
          </span>
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
            <Crown className="size-3.5 text-[var(--accent)]" /> Wins {wins}
            {bestTime ? ` · ${formatTime(bestTime)}` : ""}
          </span>
          <button type="button" onClick={onHelp} className="g-soft g-display inline-flex items-center px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <span className="g-unskew gap-1.5">
              <CircleHelp className="size-3.5" /> How to play
            </span>
          </button>
        </div>
        {later < 1 && <p className="g-muted text-center text-[11px] font-semibold">Summoning warriors and mages in the background… {Math.round(later * 100)}%</p>}
        <p className="text-center text-xs font-semibold text-[#efe6da]/80 [text-shadow:0_1px_4px_#000]">
          {touch ? "Left stick to move · buttons to fight" : "WASD move · J / click attack · K / right-click block · Space roll · E spin · Q potion"}
        </p>
      </div>
    </div>
  );
}

function HudOverlay({ store, paused, onPause, touch }: { store: Store<Hud>; paused: boolean; onPause: () => void; touch: boolean }) {
  const hud = useStore(store);
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div className="min-w-0 space-y-2">
          <div className="g-hud w-44 p-2 sm:w-64">
            <div className="g-display flex items-center justify-between px-0.5 text-[11px] tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3.5 fill-[var(--accent)] text-[var(--accent)]" /> Health
              </span>
              <span>
                {hud.hp} / {hud.maxHp}
              </span>
            </div>
            <Bar pct={hpPct} className="mt-1 h-3" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="g-hud g-display inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tabular-nums">
              <FlaskConical className="size-3.5 text-[var(--accent)]" />
              {hud.potions}/{hud.maxPotions}
              {!touch && <span className="g-kbd px-1 text-[9px]">Q</span>}
            </span>
            <span className="g-hud g-display inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tabular-nums">
              <span aria-hidden className="inline-block size-3 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ring-1 ring-amber-700" />
              {hud.coins}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-2 pt-0.5">
          <div className="g-hud px-4 py-1.5 text-center">
            <p className="g-display text-[9px] tracking-[0.25em] text-[var(--accent)] uppercase">Room</p>
            <p className="g-display text-lg leading-none tabular-nums">
              {hud.room}
              <span className="text-sm opacity-55">/{hud.rooms}</span>
            </p>
          </div>
          {hud.doorOpen ? (
            <p className="g-btn px-3 py-1 text-[11px]">
              <span className="g-unskew">The door is open · go north</span>
            </p>
          ) : hud.enemies > 0 && !hud.boss ? (
            <p className="g-hud g-display inline-flex items-center gap-1 px-2.5 py-1 text-[11px]">
              <Skull className="size-3.5" /> {hud.enemies} left
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <SystemButtons vertical />
        </div>
      </div>

      {hud.boss && (
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${touch ? "top-[max(env(safe-area-inset-top),12px)] mt-[118px] pr-16 pl-3" : "bottom-[max(env(safe-area-inset-bottom),20px)]"}`}>
          <div className={`g-hud w-full px-3 pt-1.5 pb-2.5 ${touch ? "max-w-sm" : "max-w-xl"}`}>
            <p className="g-title mb-1.5 text-center text-sm">
              {hud.boss.name}
              {hud.boss.enraged && <span className="g-title-accent"> · Enraged</span>}
            </p>
            <Bar pct={Math.max(0, (hud.boss.hp / hud.boss.max) * 100)} className="h-3.5" boss />
          </div>
        </div>
      )}

      {!touch && (
        <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),16px)] left-4 flex items-end gap-3 sm:left-6">
          <Ability label="Spin" keyHint="E" value={hud.charge} ready={hud.charge >= 1} icon={<Tornado className="size-7" />} big />
          <Ability label="Roll" keyHint="Space" value={hud.roll} ready={hud.roll >= 1} icon={<Wind className="size-5" />} />
        </div>
      )}
    </>
  );
}

/** A crimson gauge in a gold-trimmed stone slot. */
function Bar({ pct, className = "", boss = false }: { pct: number; className?: string; boss?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[var(--g-hud-radius)] bg-black/70 ${className}`} style={{ border: "var(--g-hud-border)" }}>
      <div
        className={`h-full shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-[width] duration-200 ${boss ? "bg-[linear-gradient(180deg,#ef4444,#7f1d1d)]" : "bg-[linear-gradient(180deg,#f43f5e,#9f1239)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A carved stone tile that fills with crimson as the ability charges, and glows gold when ready. */
function Ability({ label, keyHint, value, ready, icon, big = false }: { label: string; keyHint: string; value: number; ready: boolean; icon: ReactNode; big?: boolean }) {
  const size = big ? 64 : 50;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`g-hud relative grid place-items-center overflow-hidden ${ready ? "shadow-[0_0_0_1px_#c9a24a,0_0_22px_rgb(201_162_74/0.55)]" : "opacity-80"}`} style={{ width: size, height: size }}>
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgb(244_63_94/0.7),rgb(127_29_29/0.8))] transition-[height] duration-150" style={{ height: `${Math.min(1, value) * 100}%` }} />
        <span className={`relative ${ready ? "text-[#f8e7c0]" : "opacity-60"}`}>{icon}</span>
      </div>
      <span className="g-display flex items-center gap-1 text-[10px] text-[#efe6da]/80 [text-shadow:0_1px_3px_#000]">
        {label} <Kbd>{keyHint}</Kbd>
      </span>
    </div>
  );
}

function LowHealth({ store }: { store: Store<Hud> }) {
  const hud = useStore(store);
  if (hud.hp <= 0 || hud.hp / hud.maxHp > 0.3) return null;
  return <div className="ck-anim pointer-events-none absolute inset-0 animate-[ck-pulse_1.1s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(153_27_27/0.5)_100%)]" />;
}

function ControlsHint() {
  return (
    <div className="ck-anim pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),24px)] flex animate-[ck-hint_7s_ease_forwards] justify-center px-4 opacity-0">
      <p className="g-hud g-display px-4 py-2 text-center text-sm">
        WASD move · <Kbd>J</Kbd> / click attack · <Kbd>K</Kbd> block · <Kbd>Space</Kbd> roll · <Kbd>E</Kbd> spin · <Kbd>Q</Kbd> potion
      </p>
    </div>
  );
}

function PowerChoice({ options, store, onPick, game }: { options: Offer[]; store: Store<Hud>; onPick: (id: string) => void; game: { current: CryptKnightGame | null } }) {
  const hud = useStore(store);
  const canBuy = hud.coins >= hud.potionPrice && hud.potions < hud.maxPotions;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/60 backdrop-blur-[3px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Choose a power" className="w-full max-w-3xl">
          <p className="g-display text-center text-xs tracking-[0.3em] text-[var(--accent)] uppercase [text-shadow:0_1px_4px_#000]">Room {hud.room} cleared</p>
          <h2 className="g-title mt-2 text-center text-3xl sm:text-5xl">Choose a power</h2>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {options.map(({ power: p, level }, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                style={{ animationDelay: `${i * 70}ms` }}
                className="g-panel ck-anim group flex animate-[ck-card_0.35s_ease_both] items-center gap-3 p-4 text-left transition hover:-translate-y-1 hover:brightness-125 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-col sm:items-start sm:p-5"
              >
                <span
                  className="grid size-12 shrink-0 place-items-center text-[#f8e7c0]"
                  style={{ background: "var(--g-btn)", border: "var(--g-btn-border)", borderRadius: "var(--g-btn-radius)", boxShadow: "var(--g-btn-shadow)" }}
                >
                  {ICONS[p.icon]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="g-panel-title text-lg">{p.name}</span>
                    <Kbd>{i + 1}</Kbd>
                  </span>
                  <span className="g-muted mt-1 block text-[15px] leading-snug">{p.desc}</span>
                  <span className="mt-2 flex items-center gap-1" aria-label={`Level ${level} of ${p.max}`}>
                    {Array.from({ length: p.max }, (_, n) => (
                      <span key={n} className={`h-1.5 w-4 ${n < level ? "bg-[var(--accent)]" : n === level ? "bg-[#c9a24a]" : "g-tint"}`} />
                    ))}
                    {level > 0 && <span className="g-muted g-display ml-1 text-[10px] uppercase">Level {level + 1}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mx-auto mt-5 flex max-w-md flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <button type="button" disabled={!canBuy} onClick={() => game.current?.buyPotion()} className="g-soft g-display px-4 py-2 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-45">
              <span className="g-unskew gap-2">
                <FlaskConical className="size-4 text-[var(--accent)]" /> Buy potion · {hud.potionPrice} coins <Kbd>B</Kbd>
              </span>
            </button>
            <span className="g-display text-xs text-[#efe6da]/75 tabular-nums [text-shadow:0_1px_3px_#000]">
              Health {hud.hp}/{hud.maxHp} · Potions {hud.potions}/{hud.maxPotions} · Coins {hud.coins}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Touch controls ----------------------------------------------------------------------------------

function TouchControls({ game, store }: { game: { current: CryptKnightGame | null }; store: Store<Hud> }) {
  const hud = useStore(store);
  const stickRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = 52;

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stickRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setKnob({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      // The base follows the thumb when it drags past the edge.
      s.x += (dx / l) * (l - R);
      s.y += (dy / l) * (l - R);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
    }
    game.current?.setStick(dx / R, -dy / R);
    setKnob({ ox: s.x, oy: s.y, x: dx, y: dy });
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    stickRef.current = null;
    game.current?.setStick(0, 0);
    setKnob(null);
  };

  const tap = (action: Action) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    game.current?.press(action);
  };

  return (
    <>
      <div className="absolute bottom-0 left-0 h-[55%] w-[55%] touch-none" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} aria-label="Move">
        {knob ? (
          <div className="pointer-events-none fixed" style={{ left: knob.ox - R - 14, top: knob.oy - R - 14 }}>
            <div className="relative rounded-full bg-black/35 ring-2 ring-[#c9a24a]/50" style={{ width: (R + 14) * 2, height: (R + 14) * 2 }}>
              <div className="absolute size-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f8e7c0,#b91c1c_60%,#7f1d1d)] ring-2 ring-[#c9a24a]" style={{ left: R + 14 - 28 + knob.x, top: R + 14 - 28 + knob.y }} />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),28px)] left-7 grid size-32 place-items-center rounded-full bg-black/25 ring-2 ring-[#c9a24a]/30">
            <div className="size-12 rounded-full bg-[#b91c1c]/50 ring-2 ring-[#c9a24a]/50" />
          </div>
        )}
      </div>

      <div className="absolute right-3 bottom-[max(env(safe-area-inset-bottom),18px)] h-[230px] w-[230px] touch-none select-none">
        <TouchButton className="g-btn right-1 bottom-1 size-[92px]" onDown={tap("attack")} label="Attack">
          <Sword className="size-10" />
        </TouchButton>
        <TouchButton
          className="g-hud right-[106px] bottom-0 size-16"
          onDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            game.current?.setTouchBlock(true);
          }}
          onUp={() => game.current?.setTouchBlock(false)}
          label="Block"
        >
          <Shield className="size-7" />
        </TouchButton>
        <TouchButton className="g-hud right-0 bottom-[106px] size-16" onDown={tap("roll")} label="Roll" dim={hud.roll < 1} fill={hud.roll}>
          <Wind className="size-7" />
        </TouchButton>
        <TouchButton className="g-hud right-[88px] bottom-[88px] size-16" onDown={tap("spin")} label="Spin" dim={hud.charge < 1} fill={hud.charge} glow={hud.charge >= 1}>
          <Tornado className="size-7" />
        </TouchButton>
        <TouchButton className="g-hud right-[162px] bottom-[96px] size-12" onDown={tap("potion")} label="Potion" dim={hud.potions <= 0}>
          <FlaskConical className="size-5 text-[var(--accent)]" />
          <span className="g-display absolute -top-2 -right-2 grid size-5 place-items-center bg-[#f8e7c0] text-[11px] text-[#3f0d0d]">{hud.potions}</span>
        </TouchButton>
      </div>
    </>
  );
}

function TouchButton({
  className,
  onDown,
  onUp,
  label,
  children,
  dim = false,
  fill,
  glow = false,
}: {
  className: string;
  onDown: (e: ReactPointerEvent) => void;
  onUp?: () => void;
  label: string;
  children: ReactNode;
  dim?: boolean;
  /** 0..1 charge shown as a crimson fill rising from the bottom. */
  fill?: number;
  glow?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown(e);
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute grid touch-none place-items-center transition active:scale-95 ${dim ? "opacity-60" : ""} ${glow ? "shadow-[0_0_0_1px_#c9a24a,0_0_22px_rgb(201_162_74/0.6)]" : ""} ${className}`}
    >
      {fill !== undefined && fill < 1 && <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgb(244_63_94/0.55),rgb(127_29_29/0.7))]" style={{ height: `${Math.max(0, fill) * 100}%` }} />}
      <span className="relative grid place-items-center">{children}</span>
    </button>
  );
}
