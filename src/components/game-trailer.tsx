"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { asset } from "@/lib/asset";
import type { GameEntry } from "@/lib/games";

/**
 * A game's trailer in the hero of its page: plays muted and on a loop while it is on screen (never on
 * its own for people who prefer reduced motion), with sound, pause and "Play now" buttons over it.
 */
export function GameTrailer({ game, playHref }: { game: GameEntry & { trailer: NonNullable<GameEntry["trailer"]> }; playHref: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  /** The viewer paused it: don't restart it when it scrolls back into view. */
  const held = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // React sets `muted` as a property after the HTML loads; browsers only autoplay muted video.
    v.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) held.current = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !held.current) void v.play().catch(() => {});
        else if (!entry.isIntersecting) v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      held.current = false;
      void v.play().catch(() => {});
    } else {
      held.current = true;
      v.pause();
    }
  };

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) {
      held.current = false;
      void v.play().catch(() => {});
    }
  };

  const control = "grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="group relative aspect-video overflow-hidden rounded-3xl border border-line bg-elevated">
      <video
        ref={video}
        src={asset(game.trailer.src)}
        poster={asset(game.trailer.poster)}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
        aria-label={`${game.title} gameplay trailer`}
        className="absolute inset-0 h-full w-full cursor-pointer object-cover"
      />
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play the trailer"
          className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-black/80 shadow-2xl shadow-black/50 transition duration-300 hover:scale-110"
          style={{ background: game.accent }}
        >
          <Play className="size-8 translate-x-0.5 fill-current" />
        </button>
      )}
      {/* Top right and bottom right: the trailer's own captions sit top left and bottom left. */}
      <div className="absolute top-3 right-3 flex gap-2 sm:top-4 sm:right-4">
        <button type="button" onClick={toggle} aria-label={playing ? "Pause the trailer" : "Play the trailer"} className={control}>
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
        </button>
        <button type="button" onClick={toggleSound} aria-label={muted ? "Turn the sound on" : "Turn the sound off"} className={control}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </div>
      <Link
        href={playHref}
        className="absolute right-3 bottom-3 hidden items-center gap-1.5 rounded-full sm:inline-flex px-4 py-2 text-sm font-bold text-black/85 shadow-lg shadow-black/30 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:right-4 sm:bottom-4"
        style={{ background: game.accent }}
      >
        <Play className="size-4 fill-current" /> Play now
      </Link>
    </div>
  );
}
