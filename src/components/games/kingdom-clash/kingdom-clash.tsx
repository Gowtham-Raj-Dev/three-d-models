"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { useNativeBack, useNativeLifecycle } from "../shared/native-app";
import { createRecords, createStore, GameRoot, HowToPlay, LoadingScreen, useShortcuts, useStore } from "../shared/ui";
import type { BKind } from "./data";
import { KingdomEngine, type BattleHud, type BattleResult, type Mode, type VillageHud } from "./engine";
import { ArmyPanel, BattleBar, BottomBar, BuildingPanel, Campaign, NameDialog, PauseModal, PlacingBar, ResultModal, SettingsPanel, Shop, Toasts, TopBar, TutorialHint } from "./hud";
import { villageName } from "./layouts";
import { GAME } from "./manifest";
import * as V from "./village";

const records = createRecords<{ save: V.Save | null }>("kingdom-clash:v1", { save: null });

type Panel = null | "shop" | "army" | "lab" | "spells" | "campaign" | "settings" | "rename";

const KEY_DIRS: Record<string, string> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
  z: "zoomIn",
  "+": "zoomIn",
  "=": "zoomIn",
  x: "zoomOut",
  "-": "zoomOut",
};

export function KingdomClash({ sizes }: { sizes: Record<string, number> }) {
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<KingdomEngine | null>(null);
  const [hudStore] = useState(() => createStore<VillageHud | null>(null));
  const [battleStore] = useState(() => createStore<BattleHud | null>(null));
  const hud = useStore(hudStore);
  const battle = useStore(battleStore);
  const [mode, setMode] = useState<Mode>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [help, setHelp] = useState(false);
  const [paused, setPaused] = useState(false);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: string }[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const engine = new KingdomEngine(
      canvas,
      overlay,
      {
        progress: setProgress,
        mode: setMode,
        hud: hudStore.set,
        battle: battleStore.set,
        result: setResult,
        toast,
        error: setError,
        icons: setIcons,
      },
      { get: () => records.get().save, set: (save) => records.set({ save }) },
    );
    engineRef.current = engine;
    // Console access for testing in development only.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __kc?: KingdomEngine }).__kc = engine;
    void engine.load(modelSizes);
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [hudStore, battleStore, modelSizes, toast]);

  const e = () => engineRef.current;
  const modalOpen = panel !== null || help || !!result || paused || (mode === "village" && !!hud && !hud.name);

  useEffect(() => {
    e()?.setUiBusy(modalOpen);
  }, [modalOpen]);

  // Tutorial steps follow what you have done.
  useEffect(() => {
    const engine = e();
    if (!engine || !hud || mode !== "village") return;
    const s = engine.save;
    if (hud.tutorial === 1 && V.countOf(s, "goldmine") > 0) engine.setTutorial(2);
    else if (hud.tutorial === 2 && V.countOf(s, "elixirpump") > 0) engine.setTutorial(3);
    else if (hud.tutorial === 3 && hud.army + hud.queued >= 5) engine.setTutorial(4);
  }, [hud, mode]);

  const closeAll = () => {
    setPanel(null);
    setHelp(false);
  };

  const onPause = () => {
    const engine = e();
    if (help) return setHelp(false);
    if (panel) return setPanel(null);
    if (mode === "village") {
      if (hud?.placing) engine?.cancelPlacing();
      else if (hud?.selected) engine?.select(null);
      return;
    }
    if (mode === "raid" || mode === "defence") {
      if (result) return;
      const next = !paused;
      setPaused(next);
      engine?.pauseBattle(next);
    }
  };

  useShortcuts({ onPause, onHelp: () => setHelp((h) => !h) });

  // Android app: the back button closes what is open, deselects or pauses a battle; with nothing
  // left to close the app asks to press back again to exit.
  useNativeBack(() => {
    const engine = e();
    if (help || panel) {
      closeAll();
      return true;
    }
    if (mode === "village" && hud?.name) {
      if (hud.placing) engine?.cancelPlacing();
      else if (hud.selected) engine?.select(null);
      else return false;
      return true;
    }
    if (mode === "raid" || mode === "defence") {
      if (result) {
        setResult(null);
        setPaused(false);
        engine?.returnHome();
      } else {
        setPaused(!paused);
        engine?.pauseBattle(!paused);
      }
      return true;
    }
    return false;
  });

  // Android app in the background: silence it and pause a running battle.
  useNativeLifecycle((background) => {
    audio.hold(background);
    if (background && (mode === "raid" || mode === "defence") && !result) {
      setPaused(true);
      engineRef.current?.pauseBattle(true);
    }
  });

  // Game keys.
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      const engine = engineRef.current;
      if (!engine) return;
      const k = ev.key.toLowerCase();
      const dir = KEY_DIRS[k];
      if (dir && !panel) {
        if (k.startsWith("arrow")) ev.preventDefault();
        engine.setKey(dir, true);
        return;
      }
      if (ev.repeat) return;
      if (mode === "village" && !panel && !result && hud?.name) {
        if (k === "b") setPanel("shop");
        else if (k === "t") setPanel("army");
        else if (k === "r") setPanel("campaign");
        else if (k === "u") engine.upgradeSelected();
        else if (k === "c") engine.collectAll();
        else if (k === "enter" && hud?.placing) {
          ev.preventDefault();
          engine.confirmPlacing();
        } else return;
        ev.preventDefault();
      } else if ((mode === "raid" || mode === "defence") && !result && !paused) {
        if (/^[0-9]$/.test(k)) {
          engine.pickSlotIndex(k === "0" ? 9 : Number(k) - 1);
          ev.preventDefault();
        } else if (k === " ") {
          ev.preventDefault();
          engine.setSpeed(battle?.speed === 1 ? 2 : battle?.speed === 2 ? 3 : 1);
        }
      }
    };
    const up = (ev: KeyboardEvent) => {
      const dir = KEY_DIRS[ev.key.toLowerCase()];
      if (dir) engineRef.current?.setKey(dir, false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // Leaving the tab pauses a battle.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && (mode === "raid" || mode === "defence") && !result) {
        setPaused(true);
        engineRef.current?.pauseBattle(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mode, result]);

  const save = hud?.save;
  const inBattle = (mode === "raid" || mode === "defence") && !!battle;

  return (
    <GameRoot game={GAME} className="bg-[#8fc7e8]">
      <style>{`@keyframes kc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}} @media (pointer:coarse){.kc-hide-sm{display:none}}`}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Kingdom Clash village" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {(mode === "loading" || mode === "error") && <LoadingScreen game={GAME} progress={progress} error={error} />}

      {mode === "village" && hud && save && (
        <>
          <TopBar hud={hud} onSettings={() => setPanel("settings")} onHelp={() => setHelp(true)} onDefend={() => e()?.defendNow()} />
          {hud.placing ? (
            <PlacingBar hud={hud} onConfirm={() => e()?.confirmPlacing()} onCancel={() => e()?.cancelPlacing()} />
          ) : hud.selected ? (
            <BuildingPanel
              info={hud.selected}
              hud={hud}
              icon={hud.selected.kind !== "obstacle" ? icons[`b:${hud.selected.kind}`] : undefined}
              onUpgrade={() => e()?.upgradeSelected()}
              onFinish={() => e()?.finishSelected()}
              onCollect={() => e()?.collectAll()}
              onPanel={(p) => setPanel(p)}
              onWalls={() => e()?.upgradeWallRow()}
              onClose={() => e()?.select(null)}
              onBuy={(res, amount, gems) => e()?.buyResource(res, amount, gems)}
              onHeal={() => e()?.healSelectedHero()}
            />
          ) : (
            hud.name && <TutorialHint step={hud.tutorial} onDismiss={() => e()?.setTutorial(7)} />
          )}
          <BottomBar hud={hud} tutorial={hud.tutorial} onRaid={() => setPanel("campaign")} onShop={() => setPanel("shop")} onArmy={() => setPanel("army")} />
          {panel === "shop" && (
            <Shop
              save={save}
              icons={icons}
              onBuy={(k: BKind) => {
                closeAll();
                e()?.startPlacing(k);
              }}
              onClose={closeAll}
            />
          )}
          {(panel === "army" || panel === "lab" || panel === "spells") && (
            <ArmyPanel
              key={hud.rev >= 0 ? panel : panel}
              save={save}
              hud={hud}
              icons={icons}
              initial={panel}
              onTrain={(k) => e()?.train(k)}
              onUntrain={(k) => e()?.untrain(k)}
              onBrew={(k) => e()?.brew(k)}
              onUnbrew={(k) => e()?.unbrew(k)}
              onResearch={(k) => e()?.research(k)}
              onFinishTraining={() => e()?.finishTraining()}
              onFinishResearch={() => e()?.finishResearch()}
              onClose={closeAll}
            />
          )}
          {panel === "campaign" && (
            <Campaign
              save={save}
              hud={hud}
              onAttack={(n) => {
                closeAll();
                e()?.startRaid(n);
              }}
              onClose={closeAll}
            />
          )}
          {panel === "settings" && <SettingsPanel save={save} onRename={() => setPanel("rename")} onReset={() => { e()?.resetVillage(); closeAll(); }} onClose={closeAll} />}
          {panel === "rename" && <NameDialog title="Rename village" initial={hud.name} suggest={() => villageName()} onDone={(n) => { e()?.setName(n); closeAll(); }} onClose={closeAll} />}
          {!hud.name && <NameDialog initial={villageName()} suggest={() => villageName()} onDone={(n) => e()?.setName(n)} />}
        </>
      )}

      {inBattle && battle && !result && (
        <BattleBar
          b={battle}
          icons={icons}
          onSlot={(id) => e()?.pickSlot(id)}
          onEnd={() => e()?.endBattle()}
          onPause={() => {
            setPaused(true);
            e()?.pauseBattle(true);
          }}
          onSpeed={() => e()?.setSpeed(battle.speed === 1 ? 2 : battle.speed === 2 ? 3 : 1)}
        />
      )}
      {paused && inBattle && !result && (
        <PauseModal
          onResume={() => {
            setPaused(false);
            e()?.pauseBattle(false);
          }}
          onEnd={() => {
            setPaused(false);
            e()?.pauseBattle(false);
            e()?.endBattle();
          }}
        />
      )}
      {result && (
        <ResultModal
          r={result}
          icons={icons}
          onHome={() => {
            setResult(null);
            setPaused(false);
            e()?.returnHome();
          }}
        />
      )}
      <Toasts items={toasts} />
      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}
