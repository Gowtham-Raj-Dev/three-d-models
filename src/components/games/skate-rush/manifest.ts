import type { GameEntry } from "@/lib/games";

/** Skate Rush — every model it uses, from the site's own library (public/library). No three.js here. */

const letters = (from: string, to: string) =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i));

export const CHARACTERS = [
  { key: "mini-skate/character-skate-boy", name: "Skate Boy" },
  { key: "mini-skate/character-skate-girl", name: "Skate Girl" },
] as const;

export const M = {
  board: "mini-skate/skateboard",
  road: "racing-kit/road-straight-long",
  sidewalk: "city-kit-roads/tile-high",
  barrier: "racing-kit/barrier-wall",
  fence: "city-kit-roads/construction-fence",
  cone: "car-kit/cone",
  gate: "racing-kit/overhead",
  coin: "platformer-kit/coin-gold",
  heart: "platformer-kit/heart",
  star: "platformer-kit/star",
  jewel: "platformer-kit/jewel",
  streetLight: "city-kit-roads/light-curved",
  trafficLight: "city-kit-roads/traffic-light",
  hydrant: "city-builder-bits/firehydrant",
  bench: "city-builder-bits/bench",
  planter: "city-kit-suburban/planter",
  treeLarge: "city-kit-suburban/tree-large",
  treeSmall: "city-kit-suburban/tree-small",
} as const;

export const CARS = [
  "car-kit/taxi",
  "car-kit/sedan",
  "car-kit/sedan-sports",
  "car-kit/police",
  "car-kit/suv",
  "car-kit/suv-luxury",
  "car-kit/van",
  "car-kit/hatchback-sports",
  "car-kit/delivery",
  "car-kit/truck",
  "car-kit/garbage-truck",
  "car-kit/ambulance",
  "car-kit/firetruck",
];

export const DOWNTOWN = letters("a", "n").map((l) => `city-kit-commercial/building-${l}`);
export const SKYSCRAPERS = letters("a", "e").map((l) => `city-kit-commercial/building-skyscraper-${l}`);
export const SUBURB = letters("a", "u").map((l) => `city-kit-suburban/building-type-${l}`);

/** Load order matters: what the menu shows first (riders, road, first buildings) goes first. */
export const MODELS = [...CHARACTERS.map((c) => c.key), ...Object.values(M), ...DOWNTOWN, ...SKYSCRAPERS, ...CARS, ...SUBURB];

export const GAME: GameEntry = {
  slug: "skate-rush",
  title: "Skate Rush",
  tagline: "Skate through the city, dodge the traffic, grab every coin.",
  description:
    "An endless 3D skateboard runner. Switch lanes past taxis and fire trucks, kickflip over barriers, duck under gates and collect coins, shields, magnets and score boosters — the city only gets faster.",
  genre: "Endless runner",
  accent: "#f59e0b",
  cover: "/games/skate-rush/cover.webp",
  models: MODELS,
  collections: ["Mini Skate", "Car Kit", "City Kit Commercial", "City Kit Suburban", "City Kit Roads", "Racing Kit", "Platformer Kit"],
  controls: [
    { action: "Change lane", keys: ["←", "→", "A", "D"], touch: "Swipe left / right" },
    { action: "Jump (kickflip!)", keys: ["↑", "W", "Space"], touch: "Swipe up" },
    { action: "Duck", keys: ["↓", "S"], touch: "Swipe down" },
    { action: "Start / play again", keys: ["Enter"], touch: "Tap Play" },
  ],
  howTo: [
    "Run as far as you can — your score grows with distance, and every coin adds 10 points.",
    "Cars block a lane completely: change lanes before you reach them. Watch for oncoming traffic!",
    "Jump over red-and-white barriers, cones and fences. Duck under the gates with a striped bar.",
    "Follow the coin trails — they always lead to a safe lane.",
    "Heart = shield (survives one crash), star = coin magnet, jewel = double score for 10 seconds.",
    "Press ↓ in mid-air to slam down fast and slide straight under a gate.",
  ],
  touchHowTo: [
    "Run as far as you can — your score grows with distance, and every coin adds 10 points.",
    "Swipe left or right anywhere on the screen to change lanes — a long swipe moves two. Cars block a lane completely: move before you reach them, and watch for oncoming traffic!",
    "Swipe up to jump over red-and-white barriers, cones and fences. Swipe down to duck under the gates with a striped bar.",
    "Follow the coin trails — they always lead to a safe lane.",
    "Heart = shield (survives one crash), star = coin magnet, jewel = double score for 10 seconds.",
    "Swipe down in mid-air to slam down fast and slide straight under a gate.",
  ],
  features: ["3 lanes, endless city", "Kickflips & 360 spins", "Shield, magnet & 2× power-ups", "Downtown and suburb districts"],
  music: "City Rush",
};
