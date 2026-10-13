"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Play } from "lucide-react";
import { asset } from "@/lib/asset";
import { formatClock } from "@/lib/site-tour";
import { youtubeWatchUrl, type Tutorial, type TutorialVersion } from "@/lib/tutorials";

// The part of YouTube's IFrame Player API the player uses.
interface YouTubePlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YouTubeApi {
  Player: new (
    el: HTMLElement,
    options: { videoId: string; host: string; width: string; height: string; playerVars: Record<string, string | number>; events: { onReady: () => void } },
  ) => YouTubePlayer;
}
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };

let api: Promise<YouTubeApi> | undefined;
/** YouTube's player script, fetched once, at the first Play. */
const loadApi = () =>
  (api ??= new Promise<YouTubeApi>((resolve) => {
    const w = window as YouTubeWindow;
    if (w.YT?.Player) return resolve(w.YT);
    const earlier = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      earlier?.();
      resolve(w.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  }));

/** The page's "jump to this step" buttons ask the player to seek with this window event. */
const SEEK_EVENT = "tutorial:seek";
/** Where to jump: a chapter of whichever language is playing, or a time in one language's video. */
type SeekTarget = { chapter: number } | { at: number; lang: TutorialVersion["lang"] };
type PlayerVersion = Pick<TutorialVersion, "lang" | "label" | "youtube" | "seconds" | "chapters">;

/**
 * A tutorial video with chapters, played from YouTube. Nothing of YouTube's loads before Play: until
 * then the picture is the poster. The chapters sit beside the video and seek it.
 */
export function TutorialPlayer({ title, poster, versions }: { title: Tutorial["title"]; poster: Tutorial["poster"]; versions: PlayerVersion[] }) {
  const [lang, setLang] = useState(versions[0].lang);
  const tutorial = versions.find((v) => v.lang === lang) ?? versions[0];
  const { chapters, seconds: TOTAL, youtube } = tutorial;
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  /** YouTube's player, once it can take commands. */
  const player = useRef<YouTubePlayer | null>(null);
  /** Where the video starts when its player is made. */
  const startAt = useRef(0);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);

  // The player is made at the first Play, and again for the other language's video.
  useEffect(() => {
    const holder = frame.current;
    if (!started || !holder) return;
    let gone = false;
    let made: YouTubePlayer | undefined;
    let clock = 0;
    void loadApi().then((YT) => {
      if (gone) return;
      // YouTube swaps this element for its iframe, so it is one React doesn't own.
      const el = document.createElement("div");
      holder.append(el);
      made = new YT.Player(el, {
        videoId: youtube,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, start: Math.floor(startAt.current), playsinline: 1, rel: 0, hl: lang, cc_lang_pref: lang },
        events: {
          onReady: () => {
            if (gone || !made) return;
            player.current = made;
            holder.querySelector("iframe")?.setAttribute("title", `Tutorial video: ${title}`);
            clock = window.setInterval(() => setTime(made!.getCurrentTime()), 500);
          },
        },
      });
    });
    return () => {
      gone = true;
      window.clearInterval(clock);
      player.current = null;
      made?.destroy();
      holder.replaceChildren();
    };
  }, [started, youtube, lang, title]);

  const seek = (t: number) => {
    const to = Math.min(TOTAL - 1, Math.max(0, t));
    setTime(to);
    if (player.current) {
      player.current.seekTo(to, true);
      player.current.playVideo();
      return;
    }
    startAt.current = to;
    setStarted(true);
  };

  /** Switches the narration language: the other video, from `at` (the two are paced differently). */
  const pick = (next: TutorialVersion["lang"], at?: number) => {
    if (next === lang) return;
    startAt.current = at ?? 0;
    setLang(next);
    setStarted(at !== undefined);
    setTime(at ?? 0);
  };

  /** A jump asked for by the page: a chapter of the language that is playing, or a line of one language's transcript. */
  const jump = (target: SeekTarget) => {
    if ("chapter" in target) return seek(chapters[target.chapter]?.at ?? 0);
    if (target.lang === lang) return seek(target.at);
    pick(target.lang, target.at);
  };
  const jumpRef = useRef(jump);
  useEffect(() => {
    jumpRef.current = jump;
  });

  useEffect(() => {
    const onSeek = (e: Event) => {
      jumpRef.current((e as CustomEvent<SeekTarget>).detail);
      box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {versions.length > 1 && (
          <div role="radiogroup" aria-label="Narration language" className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
            {versions.map((v) => (
              <button
                key={v.lang}
                type="button"
                role="radio"
                aria-checked={v.lang === lang}
                lang={v.lang}
                onClick={() => pick(v.lang)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  v.lang === lang ? "bg-fg text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <a
          href={youtubeWatchUrl(youtube)}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Watch on YouTube <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-4">
        <div ref={box} className="scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-black shadow-2xl shadow-black/50">
          <div className="relative aspect-video">
            {!started && (
              <button
                type="button"
                onClick={() => setStarted(true)}
                aria-label={`Play the tutorial video: ${title}`}
                className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(poster)} alt="" width={1280} height={720} decoding="async" className="h-full w-full object-cover" />
                <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full bg-white py-2 pr-5 pl-2 text-sm font-semibold whitespace-nowrap text-black shadow-2xl shadow-black/60 transition group-hover:scale-105 sm:text-base">
                  <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white sm:size-11">
                    <Play className="size-4 translate-x-px fill-current sm:size-5" />
                  </span>
                  Watch the tutorial · {formatClock(TOTAL)}
                </span>
              </button>
            )}
            <div ref={frame} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" hidden={!started} />
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
                        style={{ transform: `scaleX(${Math.min(1, Math.max(0, (time - c.at) / (end - c.at)))})` }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

/** A timestamp in the written steps or the transcript: plays the video from there. */
export function SeekButton({ to, label, className, children }: { to: SeekTarget; label: string; className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: to }))} aria-label={label} className={className}>
      {children}
    </button>
  );
}
