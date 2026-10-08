/**
 * The promo's storyboard: scenes in order, each with its length, the presenter's lines (`say` is
 * what the voice reads, `sub` the subtitle), her moves, and the raw capture it shows.
 *
 * Times inside a scene are seconds from the scene's start. `vo` lines are placed at `at`; a line
 * that runs long pushes nothing — voice.mjs reports overlaps so the timing here can be fixed.
 */

export const SITE_NAME = "models.codelove.in";

export const scenes = [
  {
    id: "intro",
    dur: 6.2,
    vo: [{ at: 0.55, say: "Hi, I'm Mia! Welcome to models dot code love dot in. Let me show you around!", sub: "Hi, I'm Mia! Welcome to models.codelove.in. Let me show you around!" }],
    moves: [[0, "wave"], [2.4, "talk"]],
  },
  {
    id: "home",
    dur: 9.2,
    capture: "01-home",
    title: ["Home", "6,781 free 3D models"],
    url: "models.codelove.in",
    vo: [{ at: 0.4, say: "Over six thousand seven hundred free 3D models... rigged characters, vehicles, buildings and more, all ready for production.", sub: "Over 6,700 free 3D models... rigged characters, vehicles, buildings and more, all ready for production." }],
    moves: [[0, "talk"]],
  },
  {
    id: "models",
    dur: 9.6,
    capture: "02-models",
    title: ["Models", "16 categories"],
    url: "models.codelove.in/models",
    vo: [{ at: 0.35, say: "Jump into sixteen categories, from characters and animals to vehicles and space. Or just search for anything you need.", sub: "Jump into 16 categories, from characters and animals to vehicles and space. Or just search for anything you need." }],
    moves: [[0, "talk"], [5.4, "thoughtful"], [7.2, "talk"]],
  },
  {
    id: "character",
    dur: 6.4,
    capture: "03-character",
    title: ["3D Viewer", "rigged & animated"],
    url: "models.codelove.in/models/business-female-01",
    vo: [{ at: 0.3, say: "Every character is rigged and animated. And look... that's me, dancing!", sub: "Every character is rigged and animated. And look... that's me, dancing!" }],
    moves: [[0, "talk"], [3.5, "dance"]],
  },
  {
    id: "customize",
    dur: 8.4,
    capture: "04-customize",
    title: ["Customize", "change colors live"],
    url: "models.codelove.in/models/car-kit-sedan-sports/#customize",
    vo: [{ at: 0.35, say: "Want your own style? Tap a part, pick a colour, and download your custom G L B.", sub: "Want your own style? Tap a part, pick a colour, and download your custom GLB." }],
    moves: [[0, "talk"]],
  },
  {
    id: "viewer",
    dur: 6.0,
    capture: "05-viewer",
    title: ["GLB Viewer", "open your own files"],
    url: "models.codelove.in/viewer",
    vo: [{ at: 0.3, say: "Got your own file? Open it in the free G L B viewer. Nothing gets uploaded.", sub: "Got your own file? Open it in the free GLB viewer. Nothing gets uploaded." }],
    moves: [[0, "talk"]],
  },
  {
    id: "developers",
    dur: 8.4,
    capture: "06-developers",
    title: ["Developers", "catalog · llms.txt · code"],
    url: "models.codelove.in/developers",
    vo: [{ at: 0.3, say: "Developers get a JSON catalog, L L M S dot text for A I, and copy and paste three J S code.", sub: "Developers get a JSON catalog, llms.txt for AI, and copy-and-paste three.js code." }],
    moves: [[0, "thoughtful"], [1.6, "talk"]],
  },
  {
    id: "games",
    dur: 9.2,
    title: ["Games", "play free in your browser"],
    vo: [{ at: 0.35, say: "Need a break? Play free 3D games right in your browser. Skate Rush, Sky Hop, Crypt Knight, and more!", sub: "Need a break? Play free 3D games right in your browser. Skate Rush, Sky Hop, Crypt Knight, and more!" }],
    moves: [[0, "cheer"], [2.0, "talk"]],
  },
  {
    id: "builder",
    dur: 18.6,
    capture: "07-builder",
    title: ["Scene Builder", "build a scene live"],
    url: "models.codelove.in/builder",
    vo: [
      { at: 0.3, say: "And my favourite... the Scene Builder!", sub: "And my favourite... the Scene Builder!" },
      { at: 3.25, say: "Place a tent.", sub: "Place a tent." },
      { at: 5.45, say: "Add some trees.", sub: "Add some trees." },
      { at: 8.8, say: "An archery target...", sub: "An archery target..." },
      { at: 11.35, say: "and a friend!", sub: "and a friend!" },
      { at: 12.95, say: "Switch to sunset, and your scene is ready to export!", sub: "Switch to sunset, and your scene is ready to export!" },
    ],
    moves: [[0, "talk"], [2.4, "idle"], [3.2, "talk"], [12.2, "idle"], [12.9, "talk"], [16.0, "clap"]],
  },
  {
    id: "outro",
    dur: 7.4,
    vo: [{ at: 0.35, say: "It's all free. Start creating today, at models dot code love dot in!", sub: "It's all free. Start creating today at models.codelove.in!" }],
    moves: [[0, "talk"], [4.4, "wave"]],
  },
];

let t = 0;
for (const s of scenes) {
  s.start = t;
  t += s.dur;
}
export const TOTAL = t;

/** Every voice line with its absolute start time. */
export const lines = scenes.flatMap((s) => s.vo.map((v, i) => ({ ...v, scene: s.id, key: `${s.id}-${i}`, t: s.start + v.at })));
