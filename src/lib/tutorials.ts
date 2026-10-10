/**
 * The Scene Builder tutorials on /tutorials/: narrated screen recordings of a scene being built from
 * an empty plot, each with chapters, the same steps in writing, and a transcript.
 *
 * The videos are made with scripts/tutorial (voice.mjs → record.mjs → finish.mjs): the script drives
 * the live builder and records it; finish.mjs writes the files in /public/tutorials/<slug>/ and the
 * timings (length, chapters, transcript) in src/data/tutorials/<slug>.json. What is written here is
 * the page's own text. To add a tutorial: write scripts/tutorial/<slug>.mjs, run the three scripts,
 * add an entry below — the sitemap picks it up from this list.
 */
import hauntedBackyard from "@/data/tutorials/haunted-backyard.json";

export interface TutorialStep {
  title: string;
  /** What to do, as a few short sentences. */
  text: string;
  /** Keys and buttons the step uses, shown as key caps. */
  keys?: string[];
}

export interface Tutorial {
  slug: string;
  title: string;
  /** One line for cards and the page's lead. */
  summary: string;
  /** Search and share description. */
  description: string;
  level: "Beginner" | "Intermediate";
  /** Kits the scene is built from: collection key and name. */
  kits: { key: string; name: string }[];
  /** Counts for the "what you'll build" line. */
  built: string;
  /** 1920×1080 — desktops and full screen. */
  hd: string;
  /** 1280×720 — phones and data saver. */
  sd: string;
  poster: string;
  /** 1200×630 share image. */
  og: string;
  /** WebVTT captions. */
  captions: string;
  seconds: number;
  /** Date the video was made, YYYY-MM-DD. */
  recorded: string;
  /** The first chapter is the intro; the others match `steps`, in order. */
  chapters: { at: number; label: string }[];
  transcript: { at: number; text: string }[];
  steps: TutorialStep[];
}

const files = (slug: string) => ({
  hd: `/tutorials/${slug}/1080.mp4`,
  sd: `/tutorials/${slug}/720.mp4`,
  poster: `/tutorials/${slug}/poster.webp`,
  og: `/tutorials/${slug}/og.jpg`,
  captions: `/tutorials/${slug}/captions.vtt`,
});

/** Newest first. */
export const tutorials: Tutorial[] = [
  {
    slug: "haunted-backyard",
    title: "Build a haunted backyard from an empty plot",
    summary: "A fenced graveyard with a crypt, glowing lanterns and skeletons that move — built step by step from nothing, then exported as one GLB.",
    description:
      "Scene Builder tutorial: build the Haunted Backyard scene from an empty plot. Lay a tile floor with Array and Ctrl+D, fence it in, add a crypt, graves, animated skeletons and scattered pumpkins, switch to night, light it with flickering point lights, then export one .glb.",
    level: "Beginner",
    kits: [
      { key: "halloween-bits", name: "Halloween Bits" },
      { key: "character-pack-skeletons", name: "Character Pack Skeletons" },
    ],
    built: "225 parts, 7 lights and 5 animated skeletons",
    ...files("haunted-backyard"),
    ...hauntedBackyard,
    steps: [
      {
        title: "Start a new project",
        text: "Click New project, give it a name, keep Empty plot and Day lighting, and create it — daylight is easier to build in, and the scene turns to night at the end. With nothing selected, the panel on the right shows the scene settings: change Ground to Dark and its Size to 160 m.",
        keys: ["Alt+N"],
      },
      {
        title: "Lay the floor",
        text: "Set the grid step to 4 m — the floor tiles are 4 m wide, so they snap together. Pick Floor Dirt in the Halloween kit and click to drop the first tile in the far corner. It flickers, because its top is level with the ground: deselect it and lower the ground Level to −0.5. Select the tile again and, in the inspector's Array tool, ask for 9 copies, 4 m apart: one full row. Select the row, duplicate it and nudge the copy into the next row with the arrow keys; repeat until there are nine rows. For the open grave, delete one tile, drop a Floor Dirt Grave in the gap and set its Y position back to 0. Then lock the floor so it can't be moved by accident.",
        keys: ["Esc", "Ctrl+A", "Ctrl+D", "←", "↓", "Del", "L"],
      },
      {
        title: "Fence it in",
        text: "Set the grid step to 2 m. Drop one Fence on the back edge and array it: 7 copies, 4 m apart. For the sides, turn the piece 90° before you click, and array it along Z (Step X 0, Step Z 4). Leave the middle of the front open for the Arch Gate. Then stamp a Fence Pillar on every joint — hold Shift while you click and the part stays in your hand — and swap a few pieces for Fence Broken and Fence Pillar Broken.",
        keys: ["Shift+]", "Shift+click"],
      },
      {
        title: "Path and crypt",
        text: "Set the grid step to 0.5 m for finer work. Lay Path A, B, C and D pieces from the gate towards the back, mixing them. Type “crypt” in the search box to find the Crypt and place it at the end of the path, then add Skull Candle and Candle Triple by its door.",
        keys: ["/"],
      },
      {
        title: "Dig the graves",
        text: "Stamp the graves in two blocks, either side of the path, switching between Grave A, Grave B, Gravestone and the two Gravemarkers so no two rows look the same. Put a Coffin Decorated by the open grave, a Coffin near the crypt, and a Bench Decorated and Shrine Candles along the side fences.",
        keys: ["Shift+click"],
      },
      {
        title: "Bring in the skeletons",
        text: "Switch to the Skeletons kit and drop a Skeleton Warrior beside the path. Animated parts get an Animation menu in the inspector: search for Idle Combat and pick it. Turn him with the square bracket keys, 15° at a time. Add a Mage (Spellcasting), a Rogue and two Minions; the one at the open grave gets Skeletons Awaken Floor Long, and claws his way out of the ground over and over.",
        keys: ["[", "]"],
      },
      {
        title: "Trees and clutter",
        text: "Back in the Halloween kit, put Tree Dead pieces inside the fence and the orange and yellow pines outside it; plus and minus resize a selected part. For small clutter, place one pumpkin and use Scatter: it drops copies at random spots, sizes and angles around it, with no overlaps. Do the same with bones, skulls and candles.",
        keys: ["+", "−"],
      },
      {
        title: "Light it up",
        text: "Press 3 to switch the scene to night. Stand a Post Lantern on each side of the gate. A lantern is only a model: to make it glow, click Point light at the top of the parts list and drop one next to it, then raise it to the lamp with the Y position. Colour, Power and Range are in the inspector, and Flame flicker makes it dance like a candle. Give every lantern, candle and pumpkin its own small light.",
        keys: ["3"],
      },
      {
        title: "Look around and export",
        text: "Hide the side panels and frame the whole scene. Drag to orbit, right-drag to pan, scroll to zoom. When you're happy, click Export: one .glb with every part, light and animation, ready for Blender, Unity, Godot or three.js — or a zip with the project file, a preview and the licences. Short on time? New project also offers Haunted backyard as a ready-made template.",
        keys: ["Shift+F", "Ctrl+E"],
      },
    ],
  },
];

export function getTutorial(slug: string) {
  return tutorials.find((t) => t.slug === slug);
}

/** 351 → "PT5M51S" (schema.org durations). */
export function isoDuration(seconds: number) {
  return `PT${Math.floor(seconds / 60)}M${Math.floor(seconds % 60)}S`;
}
