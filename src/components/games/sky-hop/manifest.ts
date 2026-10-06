import type { GameEntry } from "@/lib/games";

/** Sky Hop — every model it uses, from the site's own library (public/library). No three.js here. */

const pk = (name: string) => `platformer-kit/${name}`;

export const CHARACTERS = [
  { key: pk("character-oobi"), name: "Oobi" },
  { key: pk("character-oodi"), name: "Oodi" },
  { key: pk("character-ooli"), name: "Ooli" },
  { key: pk("character-oopi"), name: "Oopi" },
  { key: pk("character-oozi"), name: "Oozi" },
] as const;

/** Island blocks per biome: the builder picks the largest tile that fits. */
export const BLOCKS = {
  grass: {
    large: pk("block-grass-overhang-large"),
    long: pk("block-grass-overhang-long"),
    one: pk("block-grass-overhang-corner"),
    lowLarge: pk("block-grass-overhang-low-large"),
    lowLong: pk("block-grass-overhang-low-long"),
    low: pk("block-grass-overhang-low"),
    tall: pk("block-grass-large-tall"),
    slope: pk("block-grass-large-slope"),
  },
  snow: {
    large: pk("block-snow-overhang-large"),
    long: pk("block-snow-overhang-long"),
    one: pk("block-snow-overhang-corner"),
    lowLarge: pk("block-snow-overhang-low-large"),
    lowLong: pk("block-snow-overhang-low-long"),
    low: pk("block-snow-overhang-low"),
    tall: pk("block-snow-large-tall"),
  },
} as const;

/** Gameplay pieces and decoration. */
export const M = {
  coin: pk("coin-gold"),
  star: pk("star"),
  heart: pk("heart"),
  key: pk("key"),
  lock: pk("lock"),
  chest: pk("chest"),
  flag: pk("flag"),
  spring: pk("spring"),
  spikes: pk("trap-spikes-large"),
  spikeBlock: pk("spike-block"),
  saw: pk("saw"),
  crate: pk("crate"),
  crateStrong: pk("crate-strong"),
  crateItem: pk("crate-item"),
  brick: pk("brick"),
  mover: pk("block-moving-large"),
  moverBlue: pk("block-moving-blue"),
  plank: pk("platform"),
  jewel: pk("jewel"),
  tree: pk("tree"),
  treePine: pk("tree-pine"),
  treePineSmall: pk("tree-pine-small"),
  treeSnow: pk("tree-snow"),
  treePineSnow: pk("tree-pine-snow"),
  treePineSnowSmall: pk("tree-pine-snow-small"),
  flowers: pk("flowers"),
  flowersTall: pk("flowers-tall"),
  grass: pk("grass"),
  mushrooms: pk("mushrooms"),
  rocks: pk("rocks"),
  stones: pk("stones"),
  plant: pk("plant"),
  fence: pk("fence-low-straight"),
  sign: pk("sign"),
  arrow: pk("arrow"),
  barrel: pk("barrel"),
} as const;

export const ENEMIES = {
  crab: "cube-pets/animal-crab",
  bee: "cube-pets/animal-bee",
  hog: "cube-pets/animal-hog",
  penguin: "cube-pets/animal-penguin",
  polar: "cube-pets/animal-polar",
} as const;

export type EnemyKind = keyof typeof ENEMIES;

/** Load order matters: the menu island (characters, grass blocks, trees) comes first. */
export const MODELS: string[] = [
  ...CHARACTERS.map((c) => c.key),
  ...Object.values(BLOCKS.grass),
  M.tree,
  M.treePine,
  M.flowers,
  M.grass,
  ...Object.values(M).filter((k) => k !== M.tree && k !== M.treePine && k !== M.flowers && k !== M.grass),
  ...Object.values(ENEMIES),
  ...Object.values(BLOCKS.snow),
];

export const GAME: GameEntry = {
  slug: "sky-hop",
  title: "Sky Hop",
  tagline: "Run, double-jump and stomp across floating sky islands.",
  description:
    "A 3D platformer across five floating sky islands, from sunny meadows to a frozen summit. Double-jump over gaps, ride moving platforms, bounce on springs, dodge spikes and saws, stomp crabs, bees, hogs, penguins and polar bears, ground-pound crates, and find the three hidden stars and the key to the treasure chest in every level.",
  genre: "3D platformer",
  accent: "#facc15",
  cover: "/games/sky-hop/cover.webp",
  models: MODELS,
  collections: ["Platformer Kit", "Cube Pets"],
  controls: [
    { action: "Move", keys: ["W", "A", "S", "D", "Arrows"], touch: "Left stick" },
    { action: "Jump / double jump (hold = higher)", keys: ["Space"], touch: "Jump button" },
    { action: "Ground pound (in the air)", keys: ["Shift"], touch: "Pound button" },
    { action: "Turn the camera", keys: ["Q", "E", "Mouse drag"], touch: "Drag right side" },
    { action: "Back to last checkpoint", keys: ["R"], touch: "Pause → Checkpoint" },
    { action: "Start / continue", keys: ["Enter"], touch: "Tap the buttons" },
  ],
  howTo: [
    "Reach the big flag at the end of each level. Touch the small flags on the way — they are checkpoints and refill your hearts.",
    "Press jump again in mid-air for a flipping double jump. Hold jump for a higher jump, tap it for a short hop.",
    "Jump on crabs, bees, hogs and penguins to stomp them (polar bears take two). Touching them from the side costs a heart. Hogs charge when they see you!",
    "Ground pound (Shift in the air) smashes crates and every enemy around you. Wooden crates also break when you bump them from below; metal ones only break with a pound.",
    "Every level hides three stars: one inside a metal crate, one somewhere high or out of the way, and one in the chest that the level's key opens.",
    "Springs launch you high, moving platforms carry you, and brick blocks crumble a moment after you land on them.",
    "Coins: 100 of them earn an extra life. Falling off the islands costs a life — you restart at the last checkpoint.",
    "Snow is slippery! Start braking early on the snowy levels.",
  ],
  features: ["5 handcrafted levels, meadow to snowy summit", "Double jump, ground pound & enemy stomps", "Hidden stars, keys & treasure chests", "5 playable characters"],
  music: "Sky Hop",
};
