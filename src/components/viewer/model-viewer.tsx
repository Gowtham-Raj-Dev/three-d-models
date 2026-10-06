"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useProgress } from "@react-three/drei";
import { Bone, Box, Expand, Palette, Pause, Play, RotateCcw, Rotate3d } from "lucide-react";
import { asset } from "@/lib/asset";

const Scene = dynamic(() => import("./scene"), { ssr: false });

export interface ViewerAnimation {
  id: string;
  label: string;
  file: string;
}

interface ModelViewerProps {
  glb: string;
  title: string;
  poster?: string | null;
  animations?: ViewerAnimation[];
  defaultAnimation?: string | null;
  /** "full": toolbar + controls. "hero": minimal, auto-rotating showcase. */
  variant?: "full" | "hero";
  /** Initial camera angle around the model, in radians (0 = straight on). */
  azimuth?: number;
  /** Controlled mode: the playing clip id (null = bind pose) and its change handler. */
  animation?: string | null;
  onAnimationChange?: (id: string | null) => void;
  /** Show the clip picker inside the viewer. */
  showAnimationPicker?: boolean;
  /** Adds a "Customize colors" link to the toolbar. */
  customizeHref?: string;
  className?: string;
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

class ViewerErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid size-9 place-items-center rounded-lg transition-colors ${
        active ? "bg-white/15 text-fg" : "text-muted hover:bg-white/[0.08] hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function Loader({ loaded, poster, title }: { loaded: boolean; poster?: string | null; title: string }) {
  const { progress } = useProgress();
  return (
    <div
      className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-500 ${
        loaded ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden={loaded}
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 m-auto h-[78%] w-auto object-contain opacity-30 blur-[2px]" />
      )}
      <div className="glass relative flex items-center gap-3 rounded-full px-4 py-2 text-xs text-muted">
        <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
        Loading {title}… {Math.round(progress)}%
      </div>
    </div>
  );
}

export function ModelViewer({
  glb,
  title,
  poster,
  animations = [],
  defaultAnimation = null,
  variant = "full",
  azimuth = 0.25,
  animation: controlledAnimation,
  onAnimationChange,
  showAnimationPicker = true,
  customizeHref,
  className = "",
}: ModelViewerProps) {
  const hero = variant === "hero";
  // The color editor opens on top of this viewer; don't render both at once.
  const covered = useSyncExternalStore(subscribeHash, () => !!customizeHref && window.location.hash === customizeHref, () => false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalAnimation, setInternalAnimation] = useState<string | null>(defaultAnimation);
  const animation = controlledAnimation !== undefined ? controlledAnimation : internalAnimation;
  const setAnimation = onAnimationChange ?? setInternalAnimation;
  const [playing, setPlaying] = useState(true);
  const [autoRotate, setAutoRotate] = useState(hero);
  const [wireframe, setWireframe] = useState(false);
  const [skeleton, setSkeleton] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const onLoaded = useCallback(() => setLoaded(true), []);

  const current = animations.find((a) => a.id === animation) ?? null;
  const posterUrl = poster ? asset(poster) : null;

  const fallback = (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt={title} className="absolute inset-0 m-auto h-[80%] w-auto object-contain opacity-80" />
      )}
      <p className="glass relative rounded-xl px-4 py-2 text-sm text-muted">
        3D preview unavailable in this browser (WebGL is required).
      </p>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0">
        <ViewerErrorBoundary fallback={fallback}>
          <Scene
            url={asset(glb)}
            animationUrl={current ? (current.file.startsWith("embedded:") ? current.file : asset(current.file)) : null}
            playing={playing}
            autoRotate={autoRotate}
            wireframe={wireframe}
            skeleton={skeleton}
            resetKey={resetKey}
            interactive={!hero}
            paused={covered}
            azimuth={azimuth}
            onLoaded={onLoaded}
          />
        </ViewerErrorBoundary>
      </div>

      <Loader loaded={loaded} poster={posterUrl} title={title} />

      {!hero && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2 sm:inset-x-4 sm:bottom-4">
          {showAnimationPicker && animations.length > 0 && (
            <div className="pointer-events-auto no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              <AnimationChip active={animation === null} onClick={() => setAnimation(null)}>
                Bind pose
              </AnimationChip>
              {animations.map((a) => (
                <AnimationChip key={a.id} active={animation === a.id} onClick={() => setAnimation(a.id)}>
                  {a.label}
                </AnimationChip>
              ))}
            </div>
          )}
          <div className="glass pointer-events-auto flex w-fit items-center gap-0.5 rounded-xl p-1">
            {animations.length > 0 && (
              <ToolButton label={playing ? "Pause animation" : "Play animation"} onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </ToolButton>
            )}
            <ToolButton label="Auto-rotate" active={autoRotate} onClick={() => setAutoRotate((v) => !v)}>
              <Rotate3d className="size-4" />
            </ToolButton>
            <ToolButton label="Wireframe" active={wireframe} onClick={() => setWireframe((v) => !v)}>
              <Box className="size-4" />
            </ToolButton>
            <ToolButton label="Show skeleton" active={skeleton} onClick={() => setSkeleton((v) => !v)}>
              <Bone className="size-4" />
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-line" />
            <ToolButton label="Reset view" onClick={() => setResetKey((k) => k + 1)}>
              <RotateCcw className="size-4" />
            </ToolButton>
            <ToolButton
              label="Fullscreen"
              onClick={() => {
                const el = containerRef.current;
                if (!el) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void el.requestFullscreen?.();
              }}
            >
              <Expand className="size-4" />
            </ToolButton>
            {customizeHref && (
              <>
                <span className="mx-1 h-5 w-px bg-line" />
                <a
                  href={customizeHref}
                  title="Customize colors"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-white/[0.08] hover:text-fg"
                >
                  <Palette className="size-4" /> <span className="max-sm:sr-only">Customize colors</span>
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {!hero && (
        <p className="pointer-events-none absolute top-3 right-4 hidden text-[11px] text-subtle sm:block">
          Drag to orbit · Scroll to zoom · Right-drag to pan
        </p>
      )}
    </div>
  );
}

export function AnimationChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-colors ${
        active
          ? "border-accent/60 bg-accent/20 text-fg"
          : "border-line bg-black/30 text-muted hover:border-line-strong hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
