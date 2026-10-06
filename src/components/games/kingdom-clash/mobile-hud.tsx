"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { ArrowBigUp, BrickWall, Check, Clock, Coins, Crown, FlaskConical, Gem, Hammer, Info, Moon, Pause, Settings, Shield, ShoppingCart, Star, Swords, Trophy, Users, X, Zap } from "lucide-react";
import { BUILDINGS, HEROES, SPELLS, TROOPS, formatTime, gemsForResource, isHero, shortNumber, type HeroKind, type SpellKind, type TroopKind } from "./data";
import type { BattleHud, SelectedInfo, Slot, VillageHud } from "./engine";
import { Pic, ResIcon, SpellOrb, Stars } from "./hud";

/**
 * The phone layout (landscape phones and the Android app), laid out like a mobile strategy game:
 * chunky buttons in the corners — Attack bottom-left, Army and Shop bottom-right — resources
 * top-right, the village name top-left, and a row of round action buttons under a selected
 * building. Every target is at least 44 px and every text at least 11 px. The parent places these
 * inside `.g-safe`, so nothing sits under the camera cutout.
 */

/** Shared look: bevelled buttons, outlined text, the tutorial glow (in the components layer, so utilities override it). */
export const MOBILE_CSS = `@layer components{
.kc-chunky{box-shadow:inset 0 -5px 0 #0000002e,inset 0 3px 0 #ffffff70,0 4px 0 var(--edge),0 7px 12px #0000005c;transition:transform .08s,box-shadow .08s,filter .15s}
.kc-chunky:active:not(:disabled){transform:translateY(3px);box-shadow:inset 0 -3px 0 #0000002e,inset 0 2px 0 #ffffff70,0 1px 0 var(--edge),0 3px 6px #0000005c}
.kc-chunky:disabled{filter:saturate(.3) brightness(.9)}
.kc-ink{color:#fff;text-shadow:0 1.5px 0 #1f2937,1px 0 0 #1f2937,-1px 0 0 #1f2937,0 -1px 0 #1f2937}
@keyframes kc-glow{0%,100%{box-shadow:0 0 0 0 #fde04700}50%{box-shadow:0 0 0 7px #fde047cc}}
.kc-glow{animation:kc-glow 1.1s ease-in-out infinite}
}`;

type Tone = "green" | "blue" | "gold" | "red" | "purple" | "gray";

const TONES: Record<Tone, { bg: string; edge: string }> = {
  green: { bg: "linear-gradient(180deg,#d9f99d 0%,#4ade80 38%,#16a34a 100%)", edge: "#14532d" },
  blue: { bg: "linear-gradient(180deg,#bae6fd 0%,#60a5fa 40%,#1d4ed8 100%)", edge: "#1e3a8a" },
  gold: { bg: "linear-gradient(180deg,#fef9c3 0%,#fcd34d 38%,#d97706 100%)", edge: "#78350f" },
  red: { bg: "linear-gradient(180deg,#fecaca 0%,#f87171 38%,#b91c1c 100%)", edge: "#7f1d1d" },
  purple: { bg: "linear-gradient(180deg,#f5d0fe 0%,#c084fc 40%,#7e22ce 100%)", edge: "#3b0764" },
  gray: { bg: "linear-gradient(180deg,#f3f4f6 0%,#9ca3af 40%,#4b5563 100%)", edge: "#1f2937" },
};

function Chunky({ tone, glow = false, className = "", style, children, ...rest }: { tone: Tone; glow?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      {...rest}
      className={`kc-chunky pointer-events-auto grid shrink-0 place-items-center text-white ${className.split(" ").includes("absolute") ? "" : "relative"} ${className}`}
      style={{ background: t.bg, border: `3px solid ${t.edge}`, "--edge": t.edge, ...style } as CSSProperties}
    >
      {glow && <span aria-hidden className="kc-glow pointer-events-none absolute -inset-[5px] rounded-[inherit]" />}
      {children}
    </button>
  );
}

/** Dark rounded chip over the 3D view. */
const CHIP = "rounded-xl border-2 border-[#fbbf24] bg-[#111827e0] text-[#fef3c7]";
/** The free band between the corner buttons (Attack left; Army + Shop right). */
const MIDDLE = "pointer-events-none absolute bottom-2.5 left-[86px] right-[140px] flex flex-col items-center";

// --- Village ------------------------------------------------------------------------------------------------

export function MobileTopBar({ hud, onSettings, onDefend }: { hud: VillageHud; onSettings: () => void; onDefend: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-2.5 pt-2">
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <div className="flex items-center">
          <span className="g-display kc-ink relative z-10 grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700 text-xl ring-[2.5px] ring-[#1f2937]" title="Town Hall level">
            {hud.th}
          </span>
          <div className={`${CHIP} -ml-2.5 min-w-0 rounded-l-none py-0.5 pr-3 pl-4`}>
            <p className="g-display max-w-[10rem] truncate text-[14px] leading-tight text-white">{hud.name || "Your village"}</p>
            <p className="flex items-center gap-2.5 text-[12px] font-extrabold leading-tight">
              <span className="inline-flex items-center gap-1">
                <Trophy className="size-3 text-amber-300" />
                {hud.trophies}
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-3 fill-amber-300 text-amber-300" />
                {hud.stars}
              </span>
            </p>
          </div>
        </div>
        <Chunky tone="gray" onClick={onSettings} aria-label="Settings" className="size-[38px] rounded-full">
          <Settings className="size-5 drop-shadow-[0_1.5px_0_#1f2937]" />
        </Chunky>
      </div>
      <div className="absolute top-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className={`${CHIP} inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[13px] font-extrabold whitespace-nowrap`}>
          <Hammer className="size-3.5 text-amber-300" />
          <span className="g-display">
            {hud.freeBuilders}/{hud.builders}
          </span>
          <span className="text-[11px] opacity-80">builders free</span>
        </div>
        {hud.raidIn >= 0 && hud.raidIn <= 45 && (
          <div className="pointer-events-auto flex animate-[game-fade_0.4s_ease] items-center gap-2 rounded-xl border-2 border-red-400 bg-[#450a0ae6] py-0.5 pr-0.5 pl-2 text-[12px] font-extrabold whitespace-nowrap text-red-50">
            <Shield className="size-3.5 text-red-300" />
            Raiders in {formatTime(hud.raidIn)}
            <Chunky tone="red" onClick={onDefend} className="rounded-lg px-2 py-0.5">
              <span className="g-display kc-ink text-[12px]">Defend</span>
            </Chunky>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ResourceMeter res="gold" value={hud.gold} cap={hud.goldCap} />
        <ResourceMeter res="elixir" value={hud.elixir} cap={hud.elixirCap} />
        <ResourceMeter res="gems" value={hud.gems} />
      </div>
    </div>
  );
}

const FILL = {
  gold: "linear-gradient(180deg,#fef08a,#f59e0b 55%,#b45309)",
  elixir: "linear-gradient(180deg,#fbcfe8,#d946ef 55%,#86198f)",
};

/** A resource bar: the fill shows how full the storages are; the icon sits on the right end. */
function ResourceMeter({ res, value, cap }: { res: "gold" | "elixir" | "gems"; value: number; cap?: number }) {
  const full = cap !== undefined && value >= cap;
  return (
    <div className="relative h-[26px] w-[150px]">
      <div className="absolute inset-y-[3px] right-[12px] left-0 overflow-hidden rounded-l-[8px] rounded-r-[4px] border-2 border-[#1f2937] bg-[#0b1220d9]">
        {cap !== undefined && res !== "gems" && <div className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{ width: `${Math.min(100, (value / Math.max(1, cap)) * 100)}%`, background: FILL[res] }} />}
        {cap !== undefined && <span className="kc-ink absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] font-black opacity-90">{full ? "FULL" : `max ${shortNumber(cap)}`}</span>}
        <span className="g-display kc-ink absolute inset-y-0 right-3.5 flex items-center text-[14px] tabular-nums">{shortNumber(value)}</span>
      </div>
      <span className="absolute top-1/2 right-0 grid size-[26px] -translate-y-1/2 place-items-center">
        <ResIcon res={res} size={res === "gold" ? 20 : 18} />
      </span>
    </div>
  );
}

export function MobileBottomBar({ hud, tutorial, onRaid, onShop, onArmy }: { hud: VillageHud; tutorial: number; onRaid: () => void; onShop: () => void; onArmy: () => void }) {
  return (
    <>
      <Chunky tone="gold" glow={tutorial === 4} onClick={onRaid} aria-label="Attack" className="absolute bottom-2.5 left-2.5 h-[64px] w-[64px] rounded-[18px]">
        <span className="flex flex-col items-center">
          <Swords className="size-7 drop-shadow-[0_1.5px_0_#78350f]" strokeWidth={2.4} />
          <span className="g-display kc-ink text-[13px] leading-none">Attack!</span>
        </span>
      </Chunky>
      <div className="pointer-events-none absolute right-2.5 bottom-2.5 flex items-end gap-2">
        <Chunky tone="blue" glow={tutorial === 3} onClick={onArmy} aria-label="Army" className="h-[52px] w-[52px] rounded-[16px]">
          <span className="flex flex-col items-center">
            <Users className="size-5 drop-shadow-[0_1.5px_0_#1e3a8a]" strokeWidth={2.4} />
            <span className="g-display kc-ink text-[11px] leading-none">Army</span>
          </span>
          <span className="g-display absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border-2 border-[#1f2937] bg-[#1f2937] px-1.5 text-[10px] leading-tight text-white tabular-nums whitespace-nowrap">
            {hud.army}/{hud.housing}
          </span>
        </Chunky>
        <Chunky tone="green" glow={tutorial === 1 || tutorial === 2} onClick={onShop} aria-label="Shop" className="h-[60px] w-[60px] rounded-[18px]">
          <span className="flex flex-col items-center">
            <ShoppingCart className="size-7 drop-shadow-[0_1.5px_0_#14532d]" strokeWidth={2.4} />
            <span className="g-display kc-ink text-[12px] leading-none">Shop</span>
          </span>
        </Chunky>
      </div>
    </>
  );
}

/** One round action under a selected building, with its label and price underneath. */
function Action({ tone, icon, label, cost, onClick, disabled }: { tone: Tone; icon: ReactNode; label: string; cost?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex w-[62px] flex-col items-center gap-0.5">
      <Chunky tone={tone} onClick={onClick} disabled={disabled} aria-label={label} className="size-[44px] rounded-full">
        {icon}
      </Chunky>
      <span className="g-display kc-ink max-w-full truncate text-center text-[11px] leading-tight">{label}</span>
      {cost}
    </div>
  );
}

/** A price under an action; red when you can't pay it. */
function Price({ res, amount, have }: { res: "gold" | "elixir" | "gems"; amount: number; have?: number }) {
  const short = have !== undefined && have < amount;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-[1.5px] px-1.5 text-[11px] font-black tabular-nums ${short ? "border-red-700 bg-white text-red-600" : "border-[#1f2937] bg-[#111827e0] text-white"}`}>
      <ResIcon res={res} size={10} />
      {shortNumber(amount)}
    </span>
  );
}

const ICON = "size-[22px] drop-shadow-[0_1.5px_0_#0006]";

export function MobileBuildingBar({
  info,
  hud,
  onDetails,
  onUpgrade,
  onFinish,
  onCollect,
  onPanel,
  onWalls,
  onBuy,
  onHeal,
}: {
  info: SelectedInfo;
  hud: VillageHud;
  /** Opens the full popup: "info", or "upgrade" (this level and the next side by side). */
  onDetails: (mode: "info" | "upgrade") => void;
  onUpgrade: () => void;
  onFinish: () => void;
  onCollect: () => void;
  onPanel: (p: "army" | "lab" | "spells") => void;
  onWalls: () => void;
  onBuy: (res: "gold" | "elixir", amount: number, gems: number) => void;
  onHeal: () => void;
}) {
  const up = info.upgrade;
  const have = up ? (up.res === "gold" ? hud.gold : up.res === "elixir" ? hud.elixir : hud.gems) : 0;
  const missing = up && up.res !== "gems" && have < up.cost ? up.cost - have : 0;
  const cap = up?.res === "gold" ? hud.goldCap : hud.elixirCap;
  const upLabel = up ? (up.label.startsWith("Upgrade") ? "Upgrade" : up.label) : "";
  return (
    <div className={MIDDLE}>
      <p className="g-display kc-ink text-center text-[16px] leading-tight">
        {info.name}
        {info.kind !== "obstacle" && <span className="ml-1.5 text-[13px] text-amber-200">Level {info.level}</span>}
      </p>
      {info.busy && (
        <div className="mt-1 w-56">
          <div className="kc-ink flex items-center justify-between text-[12px] font-black">
            <span>{info.busy.label}</span>
            <span className="tabular-nums">{formatTime(info.busy.left)}</span>
          </div>
          <div className="mt-0.5 h-2.5 overflow-hidden rounded-full border-2 border-[#1f2937] bg-[#0b1220d9]">
            <div className="h-full bg-gradient-to-b from-green-300 to-green-600" style={{ width: `${Math.max(0, Math.min(100, (1 - info.busy.left / info.busy.total) * 100))}%` }} />
          </div>
        </div>
      )}
      {up?.reason && !up.can && <p className="mt-1 rounded-full bg-[#7f1d1de6] px-2.5 py-0.5 text-[12px] font-extrabold text-white">{up.reason}</p>}
      <div className="pointer-events-auto mt-1.5 flex max-w-full flex-wrap items-start justify-center gap-x-1 gap-y-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <Action tone="blue" icon={<Info className={ICON} strokeWidth={2.6} />} label="Info" onClick={() => onDetails("info")} />
        {info.busy && <Action tone="purple" icon={<Zap className={ICON} strokeWidth={2.4} />} label="Finish now" cost={<Price res="gems" amount={info.busy.gems} have={hud.gems} />} onClick={onFinish} />}
        {up && (
          <Action
            tone={up.can ? "green" : "gray"}
            icon={<ArrowBigUp className={ICON} strokeWidth={2.4} />}
            label={upLabel}
            cost={up.cost > 0 ? <Price res={up.res} amount={up.cost} have={have} /> : undefined}
            // Buildings: the upgrade popup shows the next level first; clearing an obstacle starts at once.
            onClick={info.kind === "obstacle" ? onUpgrade : () => onDetails("upgrade")}
          />
        )}
        {missing > 0 && missing <= cap && (
          <Action
            tone="purple"
            icon={<Gem className={ICON} strokeWidth={2.4} />}
            label={`Buy ${shortNumber(missing)}`}
            cost={<Price res="gems" amount={gemsForResource(missing)} have={hud.gems} />}
            onClick={() => onBuy(up!.res as "gold" | "elixir", missing, gemsForResource(missing))}
          />
        )}
        {info.kind === "wall" && up?.cost ? <Action tone="gold" icon={<BrickWall className={ICON} strokeWidth={2.4} />} label="All walls" onClick={onWalls} /> : null}
        {info.heal && <Action tone="purple" icon={<Moon className={ICON} strokeWidth={2.4} />} label="Wake now" cost={<Price res="gems" amount={info.heal.gems} have={hud.gems} />} onClick={onHeal} />}
        {info.collect && <Action tone="gold" icon={<Coins className={ICON} strokeWidth={2.4} />} label="Collect" cost={<Price res={info.collect.res} amount={info.collect.amount} />} onClick={onCollect} />}
        {info.panel && (
          <Action
            tone="blue"
            icon={info.panel === "army" ? <Users className={ICON} strokeWidth={2.4} /> : info.panel === "lab" ? <FlaskConical className={ICON} strokeWidth={2.4} /> : <Zap className={ICON} strokeWidth={2.4} />}
            label={info.panel === "army" ? "Train" : info.panel === "lab" ? "Research" : "Brew"}
            onClick={() => onPanel(info.panel!)}
          />
        )}
      </div>
    </div>
  );
}

export function MobilePlacingBar({ hud, onConfirm, onCancel }: { hud: VillageHud; onConfirm: () => void; onCancel: () => void }) {
  const p = hud.placing!;
  return (
    <div className={MIDDLE}>
      <div className={`${CHIP} pointer-events-auto flex items-center gap-2.5 py-1.5 pr-1.5 pl-3`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="g-display text-[15px] leading-tight">{BUILDINGS[p.kind].name}</p>
          <p className={`text-[12px] font-bold ${p.valid ? "opacity-85" : "text-red-300"}`}>{p.valid ? "Drag it into place" : "Not enough room here"}</p>
        </div>
        <Price res={p.res as "gold" | "elixir"} amount={p.cost} have={p.res === "gold" ? hud.gold : hud.elixir} />
        <Chunky tone="green" onClick={onConfirm} disabled={!p.valid} aria-label="Place" className="size-[44px] rounded-full">
          <Check className="size-6" strokeWidth={3} />
        </Chunky>
        <Chunky tone="red" onClick={onCancel} aria-label="Cancel" className="size-[44px] rounded-full">
          <X className="size-6" strokeWidth={3} />
        </Chunky>
      </div>
    </div>
  );
}

const TUTORIAL: Record<number, string> = {
  1: "Welcome, chief! Tap Shop and build a Gold Mine.",
  2: "Gold pays for defences and walls. Now build an Elixir Collector — elixir trains your army.",
  3: "Tap Army and train some Warriors. They march from the Barracks to the Army Camp.",
  4: "Your army is ready! Tap Attack and raid the first village of the campaign.",
  6: "Great raid! Spend the loot on upgrades — the Town Hall unlocks new buildings and levels. Raiders will come for your gold, so build defences!",
};

export function MobileTutorialHint({ step, onDismiss }: { step: number; onDismiss: () => void }) {
  const text = TUTORIAL[step];
  if (!text) return null;
  return (
    <div className={MIDDLE}>
      <div className="g-panel pointer-events-auto flex max-w-[420px] animate-[game-fade_0.4s_ease] items-center gap-2 px-3 py-2" onPointerDown={(e) => e.stopPropagation()}>
        <Crown className="size-6 shrink-0 text-amber-600" />
        <p className="text-[13px] leading-snug font-semibold">{text}</p>
        {step === 6 && (
          <button type="button" onClick={onDismiss} className="g-btn shrink-0 px-3 py-1.5 text-sm">
            <span className="g-unskew">Got it</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Battle ---------------------------------------------------------------------------------------------------

/** 2:05 — the battle clock. */
const clock = (t: number) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MobileBattleHud({ b, icons, onSlot, onEnd, onPause, onSpeed }: { b: BattleHud; icons: Record<string, string>; onSlot: (id: string) => void; onEnd: () => void; onPause: () => void; onSpeed: () => void }) {
  const raid = b.mode === "raid";
  const endLabel = b.percent > 0 || b.started ? "End battle" : raid ? "Retreat" : "Skip";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-2.5 pt-2">
        <div className={`${CHIP} max-w-[30%] px-2.5 py-1`}>
          <p className="g-display truncate text-[14px] leading-tight text-white">{raid ? `${b.stage}. ${b.name}` : b.name}</p>
          {raid ? (
            <>
              <p className="text-[10px] font-bold opacity-75">Loot taken</p>
              <p className="flex items-center gap-1 text-[12px] font-extrabold">
                <ResIcon res="gold" size={12} />
                <span className="tabular-nums">{shortNumber(b.gold)}</span>
                <span className="text-[11px] opacity-60">/ {shortNumber(b.goldAvail)}</span>
              </p>
              <p className="flex items-center gap-1 text-[12px] font-extrabold">
                <ResIcon res="elixir" size={12} />
                <span className="tabular-nums">{shortNumber(b.elixir)}</span>
                <span className="text-[11px] opacity-60">/ {shortNumber(b.elixirAvail)}</span>
              </p>
            </>
          ) : (
            <p className="text-[12px] font-extrabold">Raiders left: {b.raidersLeft}</p>
          )}
        </div>
        <div className="absolute top-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
          <div className={`${CHIP} flex items-center gap-2 px-2.5 py-0.5`}>
            <Stars n={b.stars} size={18} />
            <span className="g-display kc-ink text-[18px] tabular-nums">{b.percent}%</span>
          </div>
          {!b.started && raid && <p className={`${CHIP} px-2 py-0.5 text-[11px] font-bold whitespace-nowrap`}>The timer starts with your first troop</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className={`${CHIP} flex items-center gap-1 px-2.5 py-0.5`}>
            <Clock className="size-4" />
            <span className={`g-display kc-ink text-[18px] tabular-nums ${b.timeLeft <= 30 ? "!text-red-300" : ""}`}>{clock(b.timeLeft)}</span>
          </div>
          <div className="flex gap-1.5">
            <Chunky tone="gray" onClick={onSpeed} aria-label="Battle speed" className="size-[38px] rounded-full">
              <span className="g-display kc-ink text-[14px]">{b.speed}×</span>
            </Chunky>
            <Chunky tone="gray" onClick={onPause} aria-label="Pause" className="size-[38px] rounded-full">
              <Pause className="size-4 fill-current drop-shadow-[0_1.5px_0_#1f2937]" />
            </Chunky>
          </div>
        </div>
      </div>
      <Chunky tone="red" onClick={onEnd} className="absolute bottom-2.5 left-2.5 rounded-xl px-2.5 py-2">
        <span className="g-display kc-ink text-[13px] leading-none whitespace-nowrap">{endLabel}</span>
      </Chunky>
      <div className="pointer-events-none absolute right-2.5 bottom-2 left-[104px] flex justify-center">
        <div className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-xl border-2 border-[#fbbf24] bg-[#111827d9] p-1 pt-2 no-scrollbar" onPointerDown={(e) => e.stopPropagation()}>
          {b.slots.length === 0 && <p className="px-3 py-3 text-[13px] font-bold text-[#fef3c7]">{raid ? "No troops" : "No troops to defend with — your defences are on their own!"}</p>}
          {b.slots.map((s) => (
            <TroopCard key={s.id} s={s} active={b.selected === s.id} icon={icons[`t:${s.kind}`]} onClick={() => onSlot(s.id)} />
          ))}
        </div>
      </div>
    </>
  );
}

function TroopCard({ s, active, icon, onClick }: { s: Slot; active: boolean; icon?: string; onClick: () => void }) {
  const hero = s.hero;
  const name = s.spell ? SPELLS[s.kind as SpellKind].name : isHero(s.kind) ? HEROES[s.kind as HeroKind].name : (TROOPS[s.kind as TroopKind]?.name ?? s.kind);
  const ability = !!hero && hero.out && hero.ability;
  const spent = !!hero && hero.out && !hero.ability;
  const bg = ability
    ? "linear-gradient(180deg,#f5d0fe,#a855f7 55%,#6b21a8)"
    : active
      ? "linear-gradient(180deg,#fef9c3,#fcd34d 50%,#d97706)"
      : s.spell
        ? "linear-gradient(180deg,#e9d5ff,#a78bfa 55%,#5b21b6)"
        : "linear-gradient(180deg,#e0f2fe,#7dd3fc 50%,#0369a1)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={hero ? spent : s.count === 0}
      aria-label={hero ? (ability ? `${name}: ${HEROES[s.kind as HeroKind].ability.name}` : name) : `${name} ×${s.count}`}
      className={`relative flex w-[52px] shrink-0 flex-col items-center overflow-hidden rounded-lg border-[2.5px] pb-0.5 transition-transform disabled:opacity-40 ${active || ability ? "-translate-y-1 border-white" : "border-[#1f2937]"} ${ability ? "animate-pulse" : ""}`}
      style={{ background: bg }}
    >
      {s.spell ? (
        <span className="mt-1 mb-0.5">
          <SpellOrb kind={s.kind as SpellKind} size={34} />
        </span>
      ) : icon ? (
        <Pic src={icon} alt="" className="size-[42px]" />
      ) : (
        <span className="size-[42px]" />
      )}
      {hero ? (
        <>
          <span className="g-display kc-ink max-w-full truncate px-0.5 text-[10px] leading-none">{ability ? "Ability!" : !hero.out ? "Hero" : hero.hp > 0 ? "Fighting" : "Fallen"}</span>
          <span className="mt-0.5 h-1.5 w-10 overflow-hidden rounded-full bg-black/45">
            <span className="block h-full rounded-full bg-green-400" style={{ width: `${Math.round(hero.hp * 100)}%` }} />
          </span>
        </>
      ) : (
        <span className="g-display kc-ink text-[13px] leading-none tabular-nums">×{s.count}</span>
      )}
      <span className="g-display kc-ink absolute top-0.5 left-1 text-[10px] leading-none">{s.level}</span>
    </button>
  );
}
