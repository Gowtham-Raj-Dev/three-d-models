"use client";

import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { ChefHat, Crown, Flame, Sailboat, TreePalm } from "lucide-react";

/**
 * Each game's own loading screen (drawn by LoadingScreen in ui.tsx over the game's cover art): a
 * progress bar from the game's world — Kingdom Clash's gold-framed bar, Turbo Karts' start lights,
 * Cannon Cove's treasure-map route… — status lines in its voice, and an optional ambient effect.
 * Keyframes (g-*) live in globals.css.
 */
export interface LoadingLook {
  /** Darkens the cover art at the top and bottom so the title and bar stay readable. */
  shade: string;
  /** Text colour, when the theme's loading text would not read on the shaded art. */
  ink?: string;
  /** Shown in turn under the bar. */
  lines: string[];
  Bar: ComponentType<{ pct: number }>;
  /** Ambient effect over the art. */
  Fx?: ComponentType;
}

type BarProps = { pct: number };

/** A fill's width — never empty, so the bar reads as a bar from the first frame. */
const fill = (pct: number): CSSProperties => ({ width: `${Math.max(3, pct)}%` });

/** A fill that starts after a badge covering the bar's left end. */
const fillAfter = (pct: number, badge: string): CSSProperties => ({ width: `calc(${badge} + (100% - ${badge}) * ${Math.max(3, pct) / 100})` });

/** Left position of something riding the fill's tip, kept inside the bar. */
const tip = (pct: number, min = 4, max = 96) => `${Math.min(max, Math.max(min, pct))}%`;

const GROW = "transition-[width] duration-300 ease-out";
const RIDE = "transition-[left] duration-300 ease-out";

/** Diagonal stripes sliding along a fill. */
function Stripes({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <span
      className="absolute inset-0 motion-safe:animate-[g-stripes_0.9s_linear_infinite]"
      style={
        {
          backgroundImage: `linear-gradient(-45deg, ${color} 25%, transparent 25% 50%, ${color} 50% 75%, transparent 75%)`,
          backgroundSize: `${size}px ${size}px`,
          "--stripe": `${size}px`,
        } as CSSProperties
      }
    />
  );
}

// --- Bars -------------------------------------------------------------------------------------------

/** Kingdom Clash: chunky gold-ringed bar with a glossy green fill and a crown badge. */
function ClashBar({ pct }: BarProps) {
  return (
    <div className="relative">
      <div
        className="h-10 rounded-2xl border-[3px] border-[#1f2937] bg-[#1e293b] p-[5px]"
        style={{ boxShadow: "inset 0 0 0 2px #fbbf24, 0 5px 0 #1f2937, 0 14px 30px #0009" }}
      >
        <div
          className={`relative h-full overflow-hidden rounded-[10px] ${GROW}`}
          style={{
            ...fillAfter(pct, "2.5rem"),
            background: "linear-gradient(180deg, #86efac, #22c55e 55%, #16a34a)",
            boxShadow: "inset 0 -4px 0 #15803d, inset 0 3px 0 #ffffff80",
          }}
        >
          <Stripes color="#ffffff2e" />
        </div>
      </div>
      <span
        className="absolute top-1/2 -left-3 grid size-14 -translate-y-1/2 place-items-center rounded-full border-[3px] border-[#1f2937]"
        style={{ background: "linear-gradient(180deg, #fde68a, #f59e0b)", boxShadow: "inset 0 -4px 0 #d97706, 0 4px 0 #1f2937" }}
      >
        <Crown className="size-7 text-[#78350f]" strokeWidth={2.5} />
      </span>
    </div>
  );
}

/** Turbo Karts: five start lights over a slanted carbon bar with a chequered finish. */
function KartBar({ pct }: BarProps) {
  const lit = Math.min(5, Math.floor(pct / 20));
  const go = pct >= 100;
  return (
    <div>
      <div className="mx-auto mb-5 flex w-fit gap-2.5 rounded-md border-2 border-[#262626] bg-[#0a0a0a] px-3 py-2 shadow-[0_8px_20px_#000a]">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="size-6 rounded-full border-2 border-black transition-[background,box-shadow] duration-200 sm:size-7"
            style={
              go
                ? { background: "radial-gradient(circle at 35% 35%, #bbf7d0, #16a34a 60%)", boxShadow: "0 0 16px #22c55e" }
                : i < lit
                  ? { background: "radial-gradient(circle at 35% 35%, #fecaca, #dc2626 60%)", boxShadow: "0 0 16px #ef4444" }
                  : { background: "#2a0b0b" }
            }
          />
        ))}
      </div>
      <div className="relative h-5 -skew-x-12 border-2 border-[#f97316] bg-[#111111e6] shadow-[6px_6px_0_#000]">
        <div className={`relative h-full overflow-hidden ${GROW}`} style={{ ...fill(pct), background: "linear-gradient(90deg, #fdba74, #f97316, #ea580c)" }}>
          <Stripes color="#00000026" size={20} />
        </div>
        <span className="absolute inset-y-0 right-0 w-6" style={{ background: "repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 8px 8px" }} />
      </div>
    </div>
  );
}

/** Skate Rush: a slanted sticker — white outline, hard orange shadow, hazard-striped fill. */
function SkateBar({ pct }: BarProps) {
  return (
    <div className="h-9 -skew-x-6 rounded-[10px] border-[3px] border-white bg-[#111] p-[3px] shadow-[6px_6px_0_#f59e0b]">
      <div className={`relative h-full overflow-hidden rounded-[5px] bg-[#facc15] ${GROW}`} style={fill(pct)}>
        <Stripes color="#11111140" size={22} />
      </div>
    </div>
  );
}

/** Saucer Siege: an uplink of glowing cells; the next one blinks. */
function SaucerBar({ pct }: BarProps) {
  const cells = 24;
  const on = Math.round((pct / 100) * cells);
  return (
    <div className="flex h-5 gap-[3px] rounded-[3px] border border-[#a78bfa99] bg-[#0b0820b3] p-[3px] shadow-[0_0_22px_#8b5cf655]">
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[1px] ${i === on ? "motion-safe:animate-[g-blink_0.7s_linear_infinite]" : ""}`}
          style={i <= on ? { background: "#c4b5fd", boxShadow: "0 0 8px #a78bfa" } : { background: "#a78bfa1f" }}
        />
      ))}
    </div>
  );
}

/** Cannon Cove: a ship sailing a dashed route across a parchment strip to the X. */
function CoveBar({ pct }: BarProps) {
  return (
    <div
      className="rounded-lg border-2 border-[#6b4423] px-6 pt-10 pb-4"
      style={{ background: "linear-gradient(180deg, #f6e7c8, #e7cf9f)", boxShadow: "0 0 0 3px #3b2412, 0 14px 30px #000a" }}
    >
      <div className="relative mr-8 border-t-[3px] border-dashed border-[#6b442359]">
        <div className={`absolute -top-[3px] left-0 border-t-[3px] border-dashed border-[#b91c1c] ${GROW}`} style={fill(pct)} />
        <span className={`absolute -top-9 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 0, 100) }}>
          <Sailboat className="size-8 text-[#3b2412] motion-safe:animate-[g-bob_1.6s_ease-in-out_infinite]" strokeWidth={2.2} />
        </span>
        {/* X marks the spot. */}
        <span className="absolute -top-[13px] -right-9 size-6">
          <span className="absolute top-1/2 left-0 h-[5px] w-full -translate-y-1/2 rotate-45 rounded-full bg-[#b91c1c]" />
          <span className="absolute top-1/2 left-0 h-[5px] w-full -translate-y-1/2 -rotate-45 rounded-full bg-[#b91c1c]" />
        </span>
      </div>
    </div>
  );
}

/** Crypt Knight: a thin crimson bar in gold trim, with a torch flame burning at its tip. */
function CryptBar({ pct }: BarProps) {
  return (
    <div className="relative mx-4 mt-6 h-3">
      <span className="absolute inset-0 border border-[#c9a24a] bg-[#0d0a0bcc] shadow-[0_0_0_1px_#000,0_0_24px_#b91c1c55]" />
      <span
        className={`absolute inset-y-[2px] left-[2px] shadow-[0_0_16px_#ef4444aa] ${GROW}`}
        style={{ width: `calc(${Math.max(3, pct)}% - 4px)`, background: "linear-gradient(90deg, #450a0a, #b91c1c, #ef4444)" }}
      />
      <span className="absolute top-1/2 -left-3 size-4 -translate-y-1/2 rotate-45 border border-[#c9a24a] bg-[#7f1d1d]" />
      <span className="absolute top-1/2 -right-3 size-4 -translate-y-1/2 rotate-45 border border-[#c9a24a] bg-[#7f1d1d]" />
      <span className={`absolute -top-7 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 2, 98) }}>
        <Flame className="size-7 origin-bottom fill-[#f97316] text-[#fde68a] drop-shadow-[0_0_10px_#f97316] motion-safe:animate-[g-flicker_0.18s_ease-in-out_infinite_alternate]" />
      </span>
    </div>
  );
}

/** Order Up: a milkshake-pink candy-stripe pill, with a chef's hat bobbing along. */
function DinerBar({ pct }: BarProps) {
  return (
    <div className="relative pt-9">
      <div className="h-9 rounded-full border-4 border-[#f472b6] bg-[#fff8ef] p-[3px]" style={{ boxShadow: "0 6px 0 #be185d, 0 14px 28px #0008" }}>
        <div className={`relative h-full overflow-hidden rounded-full bg-[#ec4899] ${GROW}`} style={{ ...fill(pct), boxShadow: "inset 0 3px 0 #ffffff66" }}>
          <Stripes color="#f9a8d4" size={24} />
        </div>
      </div>
      <span className={`absolute top-0 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 5, 95) }}>
        <ChefHat className="size-8 text-white drop-shadow-[0_3px_0_#be185d] motion-safe:animate-[g-bob_1.2s_ease-in-out_infinite]" strokeWidth={2.4} />
      </span>
    </div>
  );
}

const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const MEADOW = ["#6ee7b7", "#34d399", "#a7f3d0", "#10b981"];

/** Hex Haven: a row of hex tiles growing over, one after another. */
function HexBar({ pct }: BarProps) {
  const tiles = 12;
  const done = (pct / 100) * tiles;
  return (
    <div className="flex justify-center gap-1.5 drop-shadow-[0_3px_0_#065f46]">
      {Array.from({ length: tiles }, (_, i) => (
        <span key={i} className="relative aspect-[0.87] w-[7.2%] max-w-10 overflow-hidden bg-[#ffffff33]" style={{ clipPath: HEX }}>
          <span
            className="absolute inset-x-0 bottom-0 transition-[height] duration-300"
            style={{ height: `${Math.min(1, Math.max(0, done - i)) * 100}%`, background: MEADOW[i % MEADOW.length] }}
          />
        </span>
      ))}
    </div>
  );
}

/** Sky Hop: a cartoon bar with a little hopper bouncing on its tip. */
function HopBar({ pct }: BarProps) {
  return (
    <div className="relative pt-10">
      <div className="h-10 rounded-full border-4 border-[#1c1917] bg-white p-1 shadow-[0_6px_0_#1c1917]">
        <div className={`h-full rounded-full bg-[#facc15] ${GROW}`} style={{ ...fill(pct), boxShadow: "inset 0 -4px 0 #eab308, inset 0 4px 0 #ffffffaa" }} />
      </div>
      <span className={`absolute top-0 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 5, 95) }}>
        <span className="relative flex size-10 items-center justify-center gap-1 rounded-full border-[3px] border-[#1c1917] bg-[#f472b6] motion-safe:animate-[g-hop_0.45s_ease-in-out_infinite_alternate]">
          {[0, 1].map((eye) => (
            <span key={eye} className="grid size-2.5 place-items-center rounded-full bg-white">
              <span className="size-1.5 rounded-full bg-[#1c1917]" />
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

/** Siege Smash: a riveted stone frame with a boulder rolling along the fill. */
function SiegeBar({ pct }: BarProps) {
  return (
    <div className="relative">
      <div
        className="h-9 rounded-md border-[3px] border-[#44403c] p-[5px]"
        style={{ background: "linear-gradient(180deg, #d6d3d1, #a8a29e)", boxShadow: "0 5px 0 #292524, 0 14px 28px #0009" }}
      >
        <div className="h-full rounded-[3px] bg-[#292524] shadow-[inset_0_2px_4px_#000a]">
          <div
            className={`relative h-full overflow-hidden rounded-[3px] ${GROW}`}
            style={{ ...fill(pct), background: "linear-gradient(180deg, #bef264, #65a30d)", boxShadow: "inset 0 -3px 0 #3f6212" }}
          >
            <Stripes color="#3f621226" size={18} />
          </div>
        </div>
      </div>
      {["top-[3px] left-[3px]", "top-[3px] right-[3px]", "bottom-[3px] left-[3px]", "bottom-[3px] right-[3px]"].map((at) => (
        <span key={at} className={`absolute ${at} size-1.5 rounded-full bg-[#57534e]`} />
      ))}
      <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${RIDE}`} style={{ left: tip(pct, 3, 97) }}>
        <span
          className="relative block size-9 rounded-full border-[3px] border-[#292524] motion-safe:animate-[spin_1.4s_linear_infinite]"
          style={{ background: "radial-gradient(circle at 35% 30%, #e7e5e4, #a8a29e 55%, #78716c)" }}
        >
          <span className="absolute top-1.5 left-2 size-2 rounded-full bg-[#78716c]" />
          <span className="absolute right-2 bottom-2 size-1.5 rounded-full bg-[#78716c]" />
        </span>
      </span>
    </div>
  );
}

/** Beat Street: an equalizer — loaded bars light up neon and dance. */
function BeatBar({ pct }: BarProps) {
  const bars = 32;
  const on = Math.round((pct / 100) * bars);
  return (
    <div className="flex h-14 items-end gap-[3px]">
      {Array.from({ length: bars }, (_, i) => {
        const color = `hsl(${292 - (i / (bars - 1)) * 104} 90% 66%)`;
        return i < on ? (
          <span
            key={i}
            className="h-full flex-1 origin-bottom rounded-t-sm motion-safe:animate-[g-eq_0.5s_ease-in-out_infinite_alternate]"
            style={{ background: color, boxShadow: `0 0 10px ${color}`, animationDuration: `${0.38 + (i % 5) * 0.09}s`, animationDelay: `${-((i * 0.17) % 1)}s` }}
          />
        ) : (
          <span key={i} className="h-[14%] flex-1 rounded-t-sm bg-[#ffffff1f]" />
        );
      })}
    </div>
  );
}

/** Putt Paradise: a striped fairway, a ball rolling along it and the flag waiting at the hole. */
function PuttBar({ pct }: BarProps) {
  return (
    <div className="relative pt-12">
      <div className="relative h-4 rounded-full bg-[#042f2e80] ring-1 ring-white/50">
        <div className={`h-full rounded-full ${GROW}`} style={{ ...fill(pct), background: "repeating-linear-gradient(90deg, #4ade80 0 14px, #22c55e 14px 28px)" }} />
        <span className="absolute top-1/2 right-2 h-2 w-5 -translate-y-1/2 rounded-[50%] bg-[#042f2e]" />
        <span className="absolute right-[17px] bottom-1/2 h-14 w-[2px] bg-white" />
        <span
          className="absolute right-[19px] bottom-[calc(50%+36px)] h-5 w-7 origin-right bg-[#f43f5e] motion-safe:animate-[g-wave_1.1s_ease-in-out_infinite_alternate]"
          style={{ clipPath: "polygon(100% 0, 0 50%, 100% 100%)" }}
        />
        {/* Rolls from the tee to the hole's centre. */}
        <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${RIDE}`} style={{ left: `calc(10px + (100% - 28px) * ${pct / 100})` }}>
          <span
            className="block size-5 rounded-full shadow-[0_2px_4px_#0006] motion-safe:animate-[spin_0.9s_linear_infinite]"
            style={{ background: "radial-gradient(circle at 35% 30%, #fff, #e5e7eb 55%, #9ca3af)" }}
          />
        </span>
      </div>
    </div>
  );
}

/** Castaway: a frayed rope bar in a hand-drawn frame, with the island palm waiting at the end. */
function CastawayBar({ pct }: BarProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-7 flex-1 border-2 border-[#2b2118] bg-[#f7f1e1] p-[3px]"
        style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px", boxShadow: "3px 4px 0 #2b2118" }}
      >
        <div
          className={`h-full ${GROW}`}
          style={{
            ...fill(pct),
            borderRadius: "255px 12px 225px 12px / 12px 225px 12px 255px",
            background: "repeating-linear-gradient(115deg, #c2410c 0 7px, #9a3412 7px 10px)",
          }}
        />
      </div>
      <TreePalm className="size-9 shrink-0 text-[#fdba74] drop-shadow-[2px_2px_0_#2b2118]" strokeWidth={2.2} />
    </div>
  );
}

/** Nova Strike: chunky arcade pixel blocks with a magenta drop shadow. */
function NovaBar({ pct }: BarProps) {
  const blocks = 20;
  const on = Math.round((pct / 100) * blocks);
  return (
    <div className="flex gap-1 border-2 border-[#22d3ee] bg-[#020617cc] p-1 shadow-[4px_4px_0_#db2777]">
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className={`h-5 flex-1 ${i === on ? "motion-safe:animate-[g-blink_0.5s_linear_infinite]" : ""}`}
          style={{ background: i <= on ? "#22d3ee" : "#22d3ee14" }}
        />
      ))}
    </div>
  );
}

const SAFE_CODE = "730514";

/** Night Heist: a safe's combination cracking digit by digit, over a thin alarm-red laser. */
function HeistBar({ pct }: BarProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, []);
  const cracked = Math.floor((pct / 100) * SAFE_CODE.length);
  return (
    <div>
      <div className="flex justify-center gap-1.5 sm:gap-2">
        {[...SAFE_CODE].map((digit, i) => (
          <span
            key={i}
            className="grid h-12 w-9 place-items-center rounded-[3px] border font-mono text-2xl font-bold sm:w-10"
            style={
              i < cracked
                ? { borderColor: "#f5f0e1", color: "#f5f0e1", background: "#0b0f19e6", boxShadow: "0 0 14px #f8717155" }
                : { borderColor: "#f8717166", color: "#f8717199", background: "#0b0f19b3" }
            }
          >
            {i < cracked ? digit : (tick * 7 + i * 3) % 10}
          </span>
        ))}
      </div>
      <div className="mt-4 h-[3px] bg-[#f8717126]">
        <div className={`h-full bg-[#f87171] shadow-[0_0_12px_#f87171] ${GROW}`} style={fill(pct)} />
      </div>
    </div>
  );
}

// Route of Sky Courier's plane: start, curve control point, end (viewBox 300 × 64).
const ROUTE = { from: [14, 54], via: [150, -12], to: [286, 54] } as const;
const PLANE = "M11 0 L5 -1.8 L0 -10 L-2.6 -10 L0.6 -1.8 L-5.5 -1.6 L-8 -5 L-10 -5 L-8.4 0 L-10 5 L-8 5 L-5.5 1.6 L0.6 1.8 L-2.6 10 L0 10 L5 1.8 Z";

/** Sky Courier: a plane flying a gold dotted arc from departure to arrival. */
function CourierBar({ pct }: BarProps) {
  const t = pct / 100;
  const { from: a, via: c, to: b } = ROUTE;
  const at = (k: 0 | 1) => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t ** 2 * b[k];
  const slope = (k: 0 | 1) => 2 * (1 - t) * (c[k] - a[k]) + 2 * t * (b[k] - c[k]);
  const angle = (Math.atan2(slope(1), slope(0)) * 180) / Math.PI;
  const d = `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`;
  return (
    <div className="g-display text-[10px] tracking-[0.3em] text-[#d4af37] uppercase">
      <svg viewBox="0 0 300 64" className="w-full overflow-visible" aria-hidden>
        <path d={d} fill="none" stroke="#d4af3773" strokeWidth={1.5} strokeDasharray="1 6" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#d4af37" strokeWidth={2} pathLength={100} strokeDasharray={`${pct} 100`} />
        {[a, b].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r={4} fill="#0b1d33" stroke="#d4af37" strokeWidth={2} />
        ))}
        <path d={PLANE} transform={`translate(${at(0)} ${at(1)}) rotate(${angle})`} fill="#f8f1e3" stroke="#0b1d33" strokeWidth={0.8} />
      </svg>
      <div className="mt-1 flex justify-between">
        <span>Depart</span>
        <span>Arrive</span>
      </div>
    </div>
  );
}

// --- Ambient effects --------------------------------------------------------------------------------

/** A sensor sweep rolling down the screen. */
function ScanFx() {
  return (
    <span
      className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-0 motion-safe:animate-[g-scan_5s_linear_infinite]"
      style={{ background: "linear-gradient(180deg, transparent, #a78bfa1f 70%, #c4b5fd55 98%, transparent)" }}
    />
  );
}

/** Torchlight flickering up from below. */
function TorchFx() {
  return (
    <span
      className="pointer-events-none absolute inset-0 motion-safe:animate-[g-torch_2.4s_ease-in-out_infinite]"
      style={{ background: "radial-gradient(ellipse 70% 45% at 50% 100%, #b91c1c66, transparent 70%)" }}
    />
  );
}

/** Two club spotlights pulsing in turn. */
function DiscoFx() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 motion-safe:animate-[g-pulse_1.1s_ease-in-out_infinite_alternate]"
        style={{ background: "radial-gradient(ellipse 50% 60% at 12% 0%, #e879f966, transparent 70%)" }}
      />
      <span
        className="pointer-events-none absolute inset-0 [animation-delay:-0.55s] motion-safe:animate-[g-pulse_1.1s_ease-in-out_infinite_alternate]"
        style={{ background: "radial-gradient(ellipse 50% 60% at 88% 0%, #22d3ee66, transparent 70%)" }}
      />
    </>
  );
}

/** CRT scanlines. */
function CrtFx() {
  return <span className="pointer-events-none absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, #0000 0 2px, #02061773 2px 4px)" }} />;
}

/** A guard's searchlight sweeping across. */
function SearchlightFx() {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 -inset-x-1/2 motion-safe:animate-[g-sweep_7s_ease-in-out_infinite_alternate]"
      style={{ background: "radial-gradient(ellipse 22% 75% at 50% 0%, #fef3c72e, transparent 70%)" }}
    />
  );
}

// --- Per game ---------------------------------------------------------------------------------------

export const LOADING_LOOKS: Record<string, LoadingLook> = {
  "skate-rush": {
    shade: "#111111",
    lines: ["Waxing the rails…", "Tightening the trucks…", "Spray-painting the ramps…", "Dropping in…"],
    Bar: SkateBar,
  },
  "saucer-siege": {
    shade: "#05030d",
    lines: ["Calibrating the tractor beam…", "Scanning for earthlings…", "Charging the plasma cannons…", "Entering orbit…"],
    Bar: SaucerBar,
    Fx: ScanFx,
  },
  "cannon-cove": {
    shade: "#04121c",
    lines: ["Hoisting the sails…", "Loading the cannons…", "Reading the treasure map…", "Weighing anchor…"],
    Bar: CoveBar,
  },
  "crypt-knight": {
    shade: "#050304",
    lines: ["Lighting the torches…", "Sharpening the blade…", "Waking the dead…", "Descending into the crypt…"],
    Bar: CryptBar,
    Fx: TorchFx,
  },
  "order-up": {
    shade: "#1c1019",
    lines: ["Firing up the grill…", "Whipping the shakes…", "Wiping the counter…", "Flipping the sign to OPEN…"],
    Bar: DinerBar,
  },
  "hex-haven": {
    shade: "#0b2a1f",
    lines: ["Planting the forests…", "Laying the meadow tiles…", "Filling the rivers…", "Raising the cottages…"],
    Bar: HexBar,
  },
  "sky-hop": {
    shade: "#0c4a6e",
    ink: "#ffffff",
    lines: ["Fluffing the clouds…", "Pumping up the platforms…", "Stretching the legs…", "Polishing the coins…"],
    Bar: HopBar,
  },
  "turbo-karts": {
    shade: "#0a0a0a",
    lines: ["Warming up the tyres…", "Filling the tanks…", "Painting the start line…", "Lining up on the grid…"],
    Bar: KartBar,
  },
  "siege-smash": {
    shade: "#111a05",
    lines: ["Winding the catapult…", "Stacking the towers…", "Rounding up boulders…", "Waking the guards…"],
    Bar: SiegeBar,
  },
  "beat-street": {
    shade: "#020005",
    lines: ["Tuning the decks…", "Dropping the bass…", "Hanging the disco ball…", "Clearing the dance floor…"],
    Bar: BeatBar,
    Fx: DiscoFx,
  },
  "putt-paradise": {
    shade: "#042f2e",
    lines: ["Mowing the greens…", "Raking the bunkers…", "Placing the flags…", "Teeing up…"],
    Bar: PuttBar,
  },
  "kingdom-clash": {
    shade: "#0b1d4a",
    lines: ["Raising the walls…", "Filling the gold mines…", "Training the troops…", "Waking the Axe King…", "Polishing the Town Hall…"],
    Bar: ClashBar,
  },
  castaway: {
    shade: "#0b2531",
    lines: ["Gathering driftwood…", "Lighting the campfire…", "Charting the island…", "Washing ashore…"],
    Bar: CastawayBar,
  },
  "nova-strike": {
    shade: "#020617",
    lines: ["Charging the lasers…", "Warming up the cabinet…", "Loading stage one…", "Player one, get ready…"],
    Bar: NovaBar,
    Fx: CrtFx,
  },
  "night-heist": {
    shade: "#0b1220",
    lines: ["Cutting the cameras…", "Studying the blueprints…", "Timing the guards…", "Cracking the safe…"],
    Bar: HeistBar,
    Fx: SearchlightFx,
  },
  "sky-courier": {
    shade: "#0b1d33",
    lines: ["Filing the flight plan…", "Loading the parcels…", "Checking the weather…", "Cleared for take-off…"],
    Bar: CourierBar,
  },
};

export const loadingLook = (slug: string): LoadingLook => LOADING_LOOKS[slug] ?? LOADING_LOOKS["skate-rush"];
