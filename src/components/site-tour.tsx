"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Boxes, CodeXml, FileBox, Gamepad2, Hand, House, LayoutGrid, Maximize, Minimize, Palette, Pause, PersonStanding, Play, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { asset } from "@/lib/asset";
import { formatClock, SITE_TOUR, type TourChapterIcon } from "@/lib/site-tour";

// Safari's prefixed full screen APIs (iPhone can only show a <video> full screen, with its own player).
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type LockableOrientation = ScreenOrientation & { lock?: (to: "landscape") => Promise<void> };

const fullscreenElement = () => document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;

const ICONS: Record<TourChapterIcon, LucideIcon> = {
  welcome: Hand,
  home: House,
  categories: LayoutGrid,
  characters: PersonStanding,
  colors: Palette,
  viewer: FileBox,
  developers: CodeXml,
  games: Gamepad2,
  builder: Boxes,
};

const { chapters, seconds: TOTAL } = SITE_TOUR;

/**
 * The site tour on the home page, with chapters. While it is on screen it plays muted (the subtitles
 * are in the picture); sound restarts it from the top the first time, and picking a chapter jumps there
 * with sound. Controls sit under the picture so they never cover the video's own titles and subtitles.
 * Phones and data saver get the 720p file, larger screens and full screen the 1080p 60 fps one; nothing
 * downloads before it plays, and it never starts on its own for reduced motion or data saver.
 */
export function SiteTour() {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [full, setFull] = useState(false);
  const [time, setTime] = useState(0);
  /** The viewer paused it: don't restart it when it scrolls back into view. */
  const held = useRef(false);
  /** Sound has been turned on once (the first time restarts the tour so Mia's intro plays). */
  const heard = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // React sets `muted` as a property after the HTML loads; browsers only autoplay muted video.
    v.muted = true;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    v.src = asset(!saveData && window.matchMedia("(min-width: 1024px)").matches ? SITE_TOUR.hd : SITE_TOUR.sd);
    if (saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) held.current = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !held.current) void v.play().catch(() => {});
        else if (!entry.isIntersecting && !fullscreenElement()) v.pause();
      },
      { threshold: 0.5 },
    );
    io.observe(v);
    const onFullscreen = () => setFull(!!box.current && fullscreenElement() === box.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    return () => {
      io.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
    };
  }, []);

  // The progress bar follows every frame while playing (the time label and chapters follow timeupdate).
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      const v = video.current;
      if (v && fill.current) fill.current.style.transform = `scaleX(${v.currentTime / TOTAL})`;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const play = (v: HTMLVideoElement) => {
    held.current = false;
    void v.play().catch(() => {});
  };

  const soundOn = (v: HTMLVideoElement, fromTop: boolean) => {
    v.muted = false;
    setMuted(false);
    if (!heard.current) {
      heard.current = true;
      if (fromTop) v.currentTime = 0;
    }
    play(v);
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) play(v);
    else {
      held.current = true;
      v.pause();
    }
  };

  /** A click on the muted preview means "watch it": sound on, from the top. */
  const onPicture = () => {
    const v = video.current;
    if (v && v.muted && !heard.current) soundOn(v, true);
    else toggle();
  };

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    if (v.muted) soundOn(v, true);
    else {
      v.muted = true;
      setMuted(true);
    }
  };

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.min(TOTAL - 0.05, Math.max(0, t));
    setTime(v.currentTime);
    if (fill.current) fill.current.style.transform = `scaleX(${v.currentTime / TOTAL})`;
    if (v.muted) soundOn(v, false);
    else play(v);
  };

  const onBar = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * TOTAL);
  };

  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, Home: -TOTAL, End: TOTAL }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    seek((video.current?.currentTime ?? 0) + step);
  };

  /** Full screen shows the 1080p file: switch to it where the smaller one is playing, keeping the place. */
  const sharpen = (v: HTMLVideoElement) => {
    if (v.currentSrc.endsWith(SITE_TOUR.hd)) return;
    const at = v.currentTime;
    v.src = asset(SITE_TOUR.hd);
    v.addEventListener(
      "loadedmetadata",
      () => {
        v.currentTime = at;
        play(v);
      },
      { once: true },
    );
  };

  const toggleFullscreen = () => {
    const v = video.current as WebkitVideo | null;
    const el = box.current as WebkitElement | null;
    if (!v || !el) return;
    if (fullscreenElement()) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
      else (document as WebkitDocument).webkitExitFullscreen?.();
      return;
    }
    // Ask first, while this still counts as the tap (browsers refuse full screen later).
    if (el.requestFullscreen) {
      void el
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape"))
        .catch(() => {});
    } else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else v.webkitEnterFullscreen?.();
    soundOn(v, true);
    sharpen(v);
  };

  let current = 0;
  chapters.forEach((c, i) => {
    if (time >= c.at) current = i;
  });

  // Phones: the chapters are a sideways row — keep the playing one in view (the row only, never the page).
  useEffect(() => {
    const row = list.current;
    const item = row?.children[current] as HTMLElement | undefined;
    if (!started || !row || !item || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: item.offsetLeft - 8, behavior: "smooth" });
  }, [current, started]);
  const button = "grid size-9 shrink-0 place-items-center rounded-full text-fg transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-4">
      <div ref={box} className={full ? "flex h-full flex-col bg-black" : "overflow-hidden rounded-2xl border border-line bg-black shadow-2xl shadow-black/50"}>
        <div className={`relative ${full ? "min-h-0 flex-1" : "aspect-video"}`}>
          <video
            ref={video}
            poster={asset(SITE_TOUR.poster)}
            muted
            loop
            playsInline
            preload="none"
            onPlay={() => {
              setPlaying(true);
              setStarted(true);
            }}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onClick={onPicture}
            onDoubleClick={toggleFullscreen}
            aria-label="Site tour video: Mia shows every part of the site, with subtitles"
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
          >
            Your browser can’t play this video.
          </video>
          {!started && (
            <button
              type="button"
              onClick={() => video.current && soundOn(video.current, true)}
              className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full bg-white py-2 pr-5 pl-2 text-sm font-semibold text-black shadow-2xl shadow-black/60 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-base"
            >
              <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white sm:size-11">
                <Play className="size-4 translate-x-px fill-current sm:size-5" />
              </span>
              Watch the tour · {formatClock(TOTAL)}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 border-t border-white/10 bg-elevated/95 px-2 py-1.5 sm:gap-2.5 sm:px-3">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className={button}>
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
          </button>
          <span className="hidden w-[5.5rem] shrink-0 text-xs text-muted tabular-nums sm:block">
            {formatClock(time)} / {formatClock(TOTAL)}
          </span>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(TOTAL)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatClock(time)} of ${formatClock(TOTAL)}`}
            onPointerDown={onBar}
            onKeyDown={onBarKey}
            className="group/bar relative h-8 min-w-0 flex-1 cursor-pointer touch-none rounded focus-visible:outline-2 focus-visible:outline-accent"
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15 transition-[height] group-hover/bar:h-1.5">
              {/* Moved directly (every frame while playing, and on seek), not through React state. */}
              <div ref={fill} className="h-full w-full origin-left bg-gradient-to-r from-violet-400 to-cyan-300" style={{ transform: "scaleX(0)" }} />
            </div>
            {chapters.slice(1).map((c) => (
              <span key={c.at} aria-hidden className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-elevated" style={{ left: `${(c.at / TOTAL) * 100}%` }} />
            ))}
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
            className={
              muted
                ? "relative flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 px-3 text-xs font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                : button
            }
          >
            {muted ? (
              <>
                {started && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-violet-400/30" />}
                <VolumeX className="size-4" /> Sound
              </>
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
          <button type="button" onClick={toggleFullscreen} aria-label={full ? "Exit full screen" : "Full screen"} className={button}>
            {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </div>

      <nav aria-label="Tour chapters" className="min-w-0">
        <p className="mb-2 hidden items-center justify-between px-1 text-xs font-semibold tracking-[0.14em] text-subtle uppercase lg:flex">
          <span>Chapters</span>
          <span className="tracking-normal tabular-nums">{formatClock(TOTAL)}</span>
        </p>
        <ol ref={list} className="no-scrollbar relative -mx-2 flex gap-2 overflow-x-auto px-2 pb-1 lg:mx-0 lg:grid lg:gap-1.5 lg:overflow-visible lg:px-0 lg:pb-0">
          {chapters.map((c, i) => {
            const Icon = ICONS[c.icon];
            const active = started && i === current;
            const end = chapters[i + 1]?.at ?? TOTAL;
            return (
              <li key={c.at} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => seek(c.at)}
                  aria-current={active ? "step" : undefined}
                  className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border py-1.5 pr-3 pl-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active ? "border-accent/50 bg-accent/10" : "border-line bg-surface/70 hover:border-line-strong hover:bg-white/[0.04]"
                  }`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors ${active ? "bg-accent/25 text-violet-100" : "bg-white/[0.05] text-muted"}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-tight font-medium whitespace-nowrap lg:truncate ${active ? "text-fg" : "text-fg/85"}`}>{c.label}</span>
                    <span className="block text-[11px] text-subtle tabular-nums">{formatClock(c.at)}</span>
                  </span>
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-violet-400 to-cyan-300"
                      style={{ transform: `scaleX(${Math.min(1, (time - c.at) / (end - c.at))})` }}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
