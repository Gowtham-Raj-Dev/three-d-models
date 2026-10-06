"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Banana, ChevronLeft, ChevronRight, ChevronsUp, Coins, Pause, Play, Shield, Zap } from "lucide-react";
import { IconButton, SystemButtons, useStore, type Store } from "../shared/ui";
import type { ItemKind } from "./kart";
import { DRIVERS } from "./manifest";
import { ordinal, type Hud, type TurboKartsGame } from "./engine";

export const formatTime = (t: number | null | undefined) => {
  if (t === null || t === undefined || !Number.isFinite(t)) return "–:––.––";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};

const ITEM_INFO: Record<ItemKind, { label: string; icon: ReactNode; tone: string }> = {
  boost: { label: "Turbo", icon: <Zap className="size-8 fill-current" />, tone: "from-orange-400 to-red-500" },
  triple: { label: "Triple turbo", icon: <ChevronsUp className="size-9" />, tone: "from-amber-300 to-orange-600" },
  shield: { label: "Shield", icon: <Shield className="size-8 fill-current/30" />, tone: "from-sky-300 to-blue-600" },
  banana: { label: "Banana", icon: <Banana className="size-8" />, tone: "from-yellow-200 to-yellow-500" },
  coins: { label: "Coin bag", icon: <Coins className="size-8" />, tone: "from-yellow-300 to-amber-600" },
};
const ROULETTE: ItemKind[] = ["boost", "banana", "shield", "coins", "triple"];

export function ItemIcon({ kind, small = false }: { kind: ItemKind; small?: boolean }) {
  const info = ITEM_INFO[kind];
  return (
    <span className={`grid place-items-center bg-gradient-to-br ${info.tone} text-black/80 ${small ? "size-7 [&_svg]:size-4" : "size-full"}`} aria-label={info.label}>
      {info.icon}
    </span>
  );
}

function Roulette() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 75);
    return () => clearInterval(id);
  }, []);
  return <ItemIcon kind={ROULETTE[i % ROULETTE.length]} />;
}

/** Position, lap, times, item slot, speed, minimap, countdown, banners. */
export function HudOverlay({
  store,
  game,
  paused,
  onPause,
  touch,
  trackName,
}: {
  store: Store<Hud>;
  game: TurboKartsGame | null;
  paused: boolean;
  onPause: () => void;
  touch: boolean;
  trackName: string;
}) {
  const hud = useStore(store);
  const minimap = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    game?.setMinimap(minimap.current);
    return () => game?.setMinimap(null);
  }, [game]);
  const place = ordinal(hud.place);
  const suffix = place.replace(/^\d+/, "");
  const final = hud.lap === hud.laps && hud.laps > 1;
  const timeTrial = hud.mode === "time";

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top-left: place, lap, time */}
      <div className="absolute top-[max(env(safe-area-inset-top),10px)] left-3 flex items-start gap-2 sm:top-4 sm:left-5">
        {!timeTrial && (
          <div className="g-hud flex items-end gap-0.5 px-3 pt-0.5 pb-1 italic sm:px-4">
            <span className={`g-display text-5xl leading-none tabular-nums sm:text-7xl ${hud.place === 1 ? "text-[var(--accent)]" : ""}`}>{hud.place}</span>
            <span className="g-display mb-1 text-xl leading-none sm:mb-2 sm:text-3xl">{suffix}</span>
            <span className="mb-1 ml-1 text-xs font-bold opacity-60 sm:mb-2 sm:text-sm">/{hud.racers}</span>
          </div>
        )}
        <div className="space-y-1.5">
          <div className={`g-hud px-3 py-1 italic ${final ? "border-[var(--accent)] bg-[var(--accent)] text-black" : ""}`}>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">Lap </span>
            <span className="g-display text-xl tabular-nums sm:text-2xl">
              {hud.lap}
              <span className="text-sm opacity-70">/{hud.laps}</span>
            </span>
          </div>
          <div className="g-hud px-3 py-1 tabular-nums">
            <p className="g-display text-base leading-tight sm:text-lg">{formatTime(hud.time)}</p>
            <p className="text-[10px] font-semibold opacity-70 sm:text-[11px]">
              Lap {formatTime(hud.lapTime)}
              {hud.bestLap !== null && <span className="hidden sm:inline"> · best {formatTime(hud.bestLap)}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Live order (desktop) */}
      {!timeTrial && (
        <ol className="absolute top-36 left-5 hidden space-y-1 lg:block">
          {hud.order.map((driver, i) => {
            const d = DRIVERS[driver];
            const me = d && i + 1 === hud.place;
            return (
              <li key={driver} className={`g-hud flex w-32 items-center gap-2 px-2 py-0.5 text-xs font-bold italic ${me ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "opacity-85"}`}>
                <span className="w-3 tabular-nums">{i + 1}</span>
                <span className="size-2.5 rounded-full ring-1 ring-black/40" style={{ background: d?.color }} />
                {d?.name}
              </li>
            );
          })}
        </ol>
      )}

      {/* Top-right: item slot, coins, buttons */}
      <div className="absolute top-[max(env(safe-area-inset-top),10px)] right-3 flex items-start gap-2 sm:top-4 sm:right-5">
        <div className="flex flex-col items-end gap-1.5">
          <div className="g-hud relative size-16 overflow-hidden p-1 sm:size-20" aria-label="Item">
            {hud.rolling ? <Roulette /> : hud.item ? <ItemIcon kind={hud.item} /> : <span className="grid size-full place-items-center text-2xl font-black opacity-25">?</span>}
            {hud.item && hud.itemCount > 1 && <span className="g-display absolute right-1 bottom-0 text-lg text-white [text-shadow:1px_1px_0_#000]">×{hud.itemCount}</span>}
          </div>
          <div className="g-hud inline-flex items-center gap-1.5 px-2 py-0.5 text-sm font-bold tabular-nums">
            <span className="inline-block size-3.5 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ring-1 ring-amber-700" />
            {hud.coins}
            <span className="text-[10px] opacity-60">/10</span>
          </div>
          {hud.shield && (
            <div className="g-hud inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-sky-300">
              <Shield className="size-3.5" /> Shield
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <div className="hidden sm:block">
            <SystemButtons vertical />
          </div>
        </div>
      </div>

      {/* Minimap */}
      <div
        className={`g-hud absolute overflow-hidden p-1 ${
          touch ? "top-[calc(max(env(safe-area-inset-top),10px)+118px)] left-3 size-28 sm:size-36" : "bottom-5 left-5 size-40 lg:size-48"
        }`}
      >
        <canvas ref={minimap} className="block size-full" aria-label="Track map" />
      </div>

      {/* Speedometer */}
      <div className={`absolute flex items-end gap-2 ${touch ? "top-[calc(max(env(safe-area-inset-top),10px)+118px)] right-3 hidden sm:flex" : "right-5 bottom-5"}`}>
        <Speedo speed={hud.speed} boost={hud.boost} drift={hud.drift} />
      </div>

      {/* Countdown */}
      {hud.countdown !== null && <Countdown n={hud.countdown} />}

      {/* Toasts & warnings */}
      <div className="absolute inset-x-0 top-[28%] flex flex-col items-center gap-3 px-4">
        {hud.wrongWay && (
          <p className="g-hud g-display animate-pulse border-red-500 bg-red-600 px-5 py-2 text-2xl text-white italic sm:text-4xl">Wrong way!</p>
        )}
        {hud.toast && hud.countdown === null && (
          <p key={hud.toastId} className="g-title animate-[game-fade_0.25s_ease] text-center text-3xl sm:text-5xl">
            {hud.toast}
          </p>
        )}
      </div>

      {hud.countdown === null && hud.time === 0 && !paused && trackName && <p className="sr-only">{trackName}</p>}
    </div>
  );
}

function Speedo({ speed, boost, drift }: { speed: number; boost: boolean; drift: number }) {
  const t = Math.min(1, speed / 150);
  const r = 40;
  const arc = Math.PI * 1.25;
  const circumference = r * arc;
  const driftColor = ["", "#4fb3ff", "#ff8a1c", "#e15cff"][drift];
  return (
    <div className="g-hud relative grid h-[84px] w-[120px] place-items-center pt-2">
      <svg viewBox="0 0 100 80" className="absolute inset-0 size-full">
        <path
          d={describeArc(50, 52, r, -arc / 2, arc / 2)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={7}
          strokeLinecap="butt"
        />
        <path
          d={describeArc(50, 52, r, -arc / 2, arc / 2)}
          fill="none"
          stroke={boost ? "#facc15" : "var(--accent)"}
          strokeWidth={7}
          strokeDasharray={`${circumference * t} ${circumference}`}
          strokeLinecap="butt"
        />
      </svg>
      <div className="relative text-center leading-none">
        <p className={`g-display text-3xl tabular-nums italic ${boost ? "text-yellow-300" : ""}`}>{speed}</p>
        <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">km/h</p>
      </div>
      {drift > 0 && <span className="absolute bottom-1.5 left-1/2 h-1.5 w-12 -translate-x-1/2 animate-pulse" style={{ background: driftColor }} />}
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function Countdown({ n }: { n: number }) {
  const lit = 4 - n;
  return (
    <div className="absolute inset-x-0 top-[16%] flex flex-col items-center gap-4">
      <div className="g-hud flex gap-3 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`size-7 rounded-full ring-2 ring-black/60 transition-colors sm:size-9 ${
              n === 0 ? "bg-green-400 shadow-[0_0_18px_#4ade80]" : i < lit ? "bg-red-500 shadow-[0_0_16px_#ef4444]" : "bg-neutral-700"
            }`}
          />
        ))}
      </div>
      <p key={n} className="g-title animate-[game-fade_0.2s_ease] text-7xl sm:text-9xl">
        {n === 0 ? <span className="g-title-accent">GO!</span> : n}
      </p>
    </div>
  );
}

// --- Touch controls ---------------------------------------------------------------------------------

function HoldButton({
  label,
  onChange,
  className = "",
  children,
}: {
  label: string;
  onChange: (down: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    setDown(v);
    onChange(v);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`g-hud pointer-events-auto grid touch-none place-items-center font-bold italic select-none ${down ? "scale-95 border-white bg-[var(--accent)] text-black" : ""} ${className}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        set(false);
      }}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** On-screen controls: steering pad (left thumb), drift / item / brake / gas (right thumb). */
export function TouchControls({ game, autoGas }: { game: TurboKartsGame | null; autoGas: boolean }) {
  const [steer, setSteer] = useState(0);
  const pad = useRef<HTMLDivElement>(null);
  const update = (e: ReactPointerEvent) => {
    const el = pad.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = e.clientX < r.left + r.width / 2 ? 1 : -1;
    setSteer(v);
    game?.setTouch({ steer: v });
  };
  const release = () => {
    setSteer(0);
    game?.setTouch({ steer: 0 });
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 pb-[max(env(safe-area-inset-bottom),14px)]">
      <div
        ref={pad}
        className="pointer-events-auto flex touch-none gap-2"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        aria-label="Steering"
      >
        <span className={`g-hud grid size-[76px] place-items-center ${steer === 1 ? "bg-[var(--accent)] text-black" : ""}`}>
          <ChevronLeft className="size-10" />
        </span>
        <span className={`g-hud grid size-[76px] place-items-center ${steer === -1 ? "bg-[var(--accent)] text-black" : ""}`}>
          <ChevronRight className="size-10" />
        </span>
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <HoldButton
          label="Use item"
          className="col-start-2 size-16 text-xs"
          onChange={(d) => {
            if (d) game?.touchItem();
          }}
        >
          ITEM
        </HoldButton>
        {!autoGas && (
          <HoldButton label="Gas" className="col-start-1 row-start-1 size-16 text-xs" onChange={(d) => game?.setTouch({ gas: d })}>
            GAS
          </HoldButton>
        )}
        <HoldButton label="Brake" className="size-16 text-xs" onChange={(d) => game?.setTouch({ brake: d })}>
          BRAKE
        </HoldButton>
        <HoldButton label="Drift" className="size-[84px] text-sm" onChange={(d) => game?.setTouch({ drift: d })}>
          DRIFT
        </HoldButton>
      </div>
    </div>
  );
}
