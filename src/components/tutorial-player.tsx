"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Captions, CaptionsOff, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { asset } from "@/lib/asset";
import { formatClock } from "@/lib/site-tour";
import type { Tutorial } from "@/lib/tutorials";

// Safari's prefixed full screen APIs (iPhone can only show a <video> full screen, with its own player).
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const fullscreenElement = () => document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;

/** The page's "jump to this step" buttons ask the player to seek with this window event. */
const SEEK_EVENT = "tutorial:seek";
const SPEEDS = [1, 1.25, 1.5, 2];

/**
 * A tutorial video with chapters. Nothing downloads before Play; phones and data saver get the 720p
 * file, larger screens and full screen the 1080p one. Controls sit under the picture so they never
 * cover the builder's own toolbar and status line in the recording.
 */
export function TutorialPlayer({ tutorial }: { tutorial: Pick<Tutorial, "title" | "hd" | "sd" | "poster" | "captions" | "seconds" | "chapters"> }) {
  const { chapters, seconds: TOTAL } = tutorial;
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [full, setFull] = useState(false);
  const [time, setTime] = useState(0);

  /** The file for this screen, chosen at the first Play. */
  const load = (v: HTMLVideoElement) => {
    if (v.currentSrc || v.src) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    v.src = asset(!saveData && window.matchMedia("(min-width: 1024px)").matches ? tutorial.hd : tutorial.sd);
  };

  const play = (v: HTMLVideoElement) => {
    load(v);
    void v.play().catch(() => {});
  };

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    load(v);
    const to = Math.min(TOTAL - 0.05, Math.max(0, t));
    // Before the file's metadata is in, the place is kept until it can be set.
    if (v.readyState < 1) v.addEventListener("loadedmetadata", () => (v.currentTime = to), { once: true });
    else v.currentTime = to;
    setTime(to);
    if (fill.current) fill.current.style.transform = `scaleX(${to / TOTAL})`;
    play(v);
  };
  const seekRef = useRef(seek);
  useEffect(() => {
    seekRef.current = seek;
  });

  useEffect(() => {
    const onFullscreen = () => setFull(!!box.current && fullscreenElement() === box.current);
    const onSeek = (e: Event) => {
      seekRef.current((e as CustomEvent<number>).detail);
      box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      window.removeEventListener(SEEK_EVENT, onSeek);
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
  }, [playing, TOTAL]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) play(v);
    else v.pause();
  };

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleCaptions = () => {
    const v = video.current;
    if (!v || !v.textTracks.length) return;
    v.textTracks[0].mode = captions ? "hidden" : "showing";
    setCaptions(!captions);
  };

  const nextSpeed = () => {
    const v = video.current;
    if (!v) return;
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    v.playbackRate = next;
    setSpeed(next);
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
    if (!v.currentSrc || v.currentSrc.endsWith(tutorial.hd)) return;
    const at = v.currentTime;
    const rate = v.playbackRate;
    v.src = asset(tutorial.hd);
    v.addEventListener(
      "loadedmetadata",
      () => {
        v.currentTime = at;
        v.playbackRate = rate;
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
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else v.webkitEnterFullscreen?.();
    sharpen(v);
    play(v);
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
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-4">
      <div ref={box} className={full ? "flex h-full flex-col bg-black" : "scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-black shadow-2xl shadow-black/50"}>
        <div className={`relative ${full ? "min-h-0 flex-1" : "aspect-video"}`}>
          <video
            ref={video}
            poster={asset(tutorial.poster)}
            playsInline
            preload="none"
            onPlay={() => {
              setPlaying(true);
              setStarted(true);
            }}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onClick={toggle}
            onDoubleClick={toggleFullscreen}
            aria-label={`Tutorial video: ${tutorial.title}`}
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
          >
            <track kind="captions" src={asset(tutorial.captions)} srcLang="en" label="English" />
            Your browser can’t play this video.
          </video>
          {!started && (
            <button
              type="button"
              onClick={() => video.current && play(video.current)}
              className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full bg-white py-2 pr-5 pl-2 text-sm font-semibold text-black shadow-2xl shadow-black/60 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-base"
            >
              <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white sm:size-11">
                <Play className="size-4 translate-x-px fill-current sm:size-5" />
              </span>
              Watch the tutorial · {formatClock(TOTAL)}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 border-t border-white/10 bg-elevated/95 px-2 py-1.5 sm:gap-2 sm:px-3">
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
          <button type="button" onClick={nextSpeed} aria-label={`Playback speed: ${speed}×`} className="h-8 w-11 shrink-0 rounded-full text-xs font-semibold text-fg tabular-nums transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {speed}×
          </button>
          <button type="button" onClick={toggleCaptions} aria-label={captions ? "Hide captions" : "Show captions"} aria-pressed={captions} className={`${button} ${captions ? "bg-accent/25" : ""}`}>
            {captions ? <Captions className="size-4" /> : <CaptionsOff className="size-4" />}
          </button>
          <button type="button" onClick={toggleSound} aria-label={muted ? "Turn the sound on" : "Turn the sound off"} className={button}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button type="button" onClick={toggleFullscreen} aria-label={full ? "Exit full screen" : "Full screen"} className={button}>
            {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </div>

      <nav aria-label="Tutorial chapters" className="min-w-0">
        <p className="mb-2 hidden items-center justify-between px-1 text-xs font-semibold tracking-[0.14em] text-subtle uppercase lg:flex">
          <span>Chapters</span>
          <span className="tracking-normal tabular-nums">{formatClock(TOTAL)}</span>
        </p>
        <ol ref={list} className="no-scrollbar relative -mx-2 flex gap-2 overflow-x-auto px-2 pb-1 lg:mx-0 lg:grid lg:gap-1.5 lg:overflow-visible lg:px-0 lg:pb-0">
          {chapters.map((c, i) => {
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
                  <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums transition-colors ${active ? "bg-accent/25 text-violet-100" : "bg-white/[0.05] text-muted"}`}>
                    {i === 0 ? <Play className="size-3 fill-current" /> : i}
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

/** A timestamp in the written steps or the transcript: plays the video from there. */
export function SeekButton({ at, className, children }: { at: number; className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: at }))} aria-label={`Play from ${formatClock(at)}`} className={className}>
      {children}
    </button>
  );
}
