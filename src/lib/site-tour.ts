/**
 * The site tour video on the home page: Mia (Businesswoman 01, one of the site's rigged characters)
 * walks through every part of the site. Made with scripts/promo (live-site captures, Kokoro voice,
 * original music); the files in /public/video are web encodes of promo/Website-Overview-2K.mp4.
 */

export type TourChapterIcon = "welcome" | "home" | "categories" | "characters" | "colors" | "viewer" | "developers" | "games" | "builder";

export interface TourChapter {
  /** Start, in seconds. */
  at: number;
  label: string;
  icon: TourChapterIcon;
}

export const SITE_TOUR = {
  name: "models.codelove.in — the 90-second site tour",
  description:
    "Mia, one of the site's rigged 3D characters, shows every part of models.codelove.in: over 6,700 free 3D models in 16 categories, the 3D viewer with animations, live color changes, the GLB viewer, developer and AI catalog files, free browser games, and a scene built live in the Scene Builder.",
  /** 1920×1080, 60 fps — desktops and full screen. */
  hd: "/video/site-tour-1080.mp4",
  /** 1280×720, 30 fps — phones and data saver. */
  sd: "/video/site-tour-720.mp4",
  poster: "/video/site-tour-poster.webp",
  seconds: 89.4,
  uploaded: "2026-10-08T12:00:00+05:30",
  chapters: [
    { at: 0, label: "Welcome", icon: "welcome" },
    { at: 6.2, label: "The home page", icon: "home" },
    { at: 15.4, label: "Categories & search", icon: "categories" },
    { at: 25.0, label: "Rigged, animated characters", icon: "characters" },
    { at: 31.4, label: "Change colors live", icon: "colors" },
    { at: 39.8, label: "Open your own GLB", icon: "viewer" },
    { at: 45.8, label: "Developer & AI files", icon: "developers" },
    { at: 54.2, label: "Free 3D games", icon: "games" },
    { at: 63.4, label: "Build a scene live", icon: "builder" },
  ] satisfies TourChapter[],
  /** What Mia says (the subtitles burned into the video). */
  transcript: [
    "Hi, I'm Mia! Welcome to models.codelove.in. Let me show you around!",
    "Over 6,700 free 3D models... rigged characters, vehicles, buildings and more, all ready for production.",
    "Jump into 16 categories, from characters and animals to vehicles and space. Or just search for anything you need.",
    "Every character is rigged and animated. And look... that's me, dancing!",
    "Want your own style? Tap a part, pick a colour, and download your custom GLB.",
    "Got your own file? Open it in the free GLB viewer. Nothing gets uploaded.",
    "Developers get a JSON catalog, llms.txt for AI, and copy-and-paste three.js code.",
    "Need a break? Play free 3D games right in your browser. Skate Rush, Sky Hop, Crypt Knight, and more!",
    "And my favourite... the Scene Builder! Place a tent. Add some trees. An archery target... and a friend! Switch to sunset, and your scene is ready to export!",
    "It's all free. Start creating today at models.codelove.in!",
  ],
};

/** 89.4 → "1:29". */
export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
