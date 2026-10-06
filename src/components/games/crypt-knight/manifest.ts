import type { GameEntry } from "@/lib/games";

/** Crypt Knight — every model it uses, from the site's own library (public/library). No three.js here. */

/** Characters and the weapons the skeletons carry (the knight's sword and shield are part of its model). */
export const C = {
  knight: "character-pack-adventures/knight",
  minion: "character-pack-skeletons/skeleton-minion",
  blade: "character-pack-skeletons/skeleton-blade",
  warrior: "character-pack-skeletons/skeleton-warrior",
  axe: "character-pack-skeletons/skeleton-axe",
  shieldLarge: "character-pack-skeletons/skeleton-shield-large-a",
  mage: "character-pack-skeletons/skeleton-mage",
  staff: "character-pack-skeletons/skeleton-staff",
} as const;

const d = (name: string) => `dungeon-remastered/${name}`;

/** Dungeon pieces the rooms are built from. */
export const D = {
  floor: d("floor-tile-large-gltf"),
  floorSmall: d("floor-tile-small-gltf"),
  floorBrokenA: d("floor-tile-small-broken-a-gltf"),
  floorBrokenB: d("floor-tile-small-broken-b-gltf"),
  floorDecorated: d("floor-tile-small-decorated-gltf"),
  floorDirt: d("floor-dirt-large-gltf"),
  spikes: d("floor-tile-big-spikes"),
  wall: d("wall-gltf"),
  wallArched: d("wall-arched-gltf"),
  wallCracked: d("wall-cracked-gltf"),
  wallShelves: d("wall-shelves-gltf"),
  wallWindow: d("wall-window-closed-gltf"),
  wallPillar: d("wall-pillar-gltf"),
  wallCorner: d("wall-corner-small-gltf"),
  doorway: d("wall-doorway"),
  barrier: d("barrier-column-gltf"),
  column: d("column-gltf"),
  pillar: d("pillar-gltf"),
  pillarDecorated: d("pillar-decorated-gltf"),
  torch: d("torch-mounted-gltf"),
  candles: d("candle-triple-gltf"),
  barrel: d("barrel-large-gltf"),
  barrelSmall: d("barrel-small-gltf"),
  barrelStack: d("barrel-small-stack-gltf"),
  box: d("box-small-gltf"),
  boxLarge: d("box-large-gltf"),
  crates: d("crates-stacked-gltf"),
  chest: d("chest"),
  coin: d("coin-gltf"),
  coinStack: d("coin-stack-small-gltf"),
  potion: d("bottle-c-brown-gltf"),
  bannerRed: d("banner-pattern-a-red-gltf"),
  bannerShield: d("banner-shield-red-gltf"),
  bannerThin: d("banner-thin-red-gltf"),
  rubble: d("rubble-half-gltf"),
  tableBroken: d("table-medium-broken-gltf"),
  table: d("table-long-decorated-a-gltf"),
  swordShield: d("sword-shield-broken-gltf"),
  trunk: d("trunk-large-a-gltf"),
} as const;

/** Needed for the menu and the first rooms: the knight, the crypt and the minions. */
export const FIRST_MODELS: string[] = [C.knight, ...Object.values(D), C.minion, C.blade];
/** Streamed in the background while the menu is up: warriors and mages appear from room 3. */
export const LATER_MODELS: string[] = [C.warrior, C.axe, C.shieldLarge, C.mage, C.staff];

/** Load order matters: what the first screen needs goes first. */
export const MODELS: string[] = [...FIRST_MODELS, ...LATER_MODELS];

export const GAME: GameEntry = {
  slug: "crypt-knight",
  title: "Crypt Knight",
  tagline: "Sword, shield and a crypt full of restless skeletons.",
  description:
    "A 3D action roguelite. Fight room by room through a torch-lit crypt as a knight: chain sword combos, block, parry and dodge-roll through attacks and pick a new power after every cleared room. Skeletons claw their way out of the floor — and the Bone King waits at the bottom.",
  genre: "Action roguelite",
  accent: "#f43f5e",
  cover: "/games/crypt-knight/cover.webp",
  models: MODELS,
  collections: ["Character Pack Adventures", "Character Pack Skeletons", "Dungeon Remastered"],
  controls: [
    { action: "Move", keys: ["W", "A", "S", "D"], touch: "Left stick" },
    { action: "Attack (tap for combos)", keys: ["J", "Click"], touch: "Sword button" },
    { action: "Block (hold)", keys: ["K", "Right-click"], touch: "Shield button" },
    { action: "Dodge roll", keys: ["Space", "Shift"], touch: "Roll button" },
    { action: "Spin attack (when charged)", keys: ["L", "E"], touch: "Spin button" },
    { action: "Drink potion", keys: ["Q"], touch: "Potion button" },
    { action: "Pick a power", keys: ["1", "2", "3"], touch: "Tap a card" },
  ],
  howTo: [
    "Clear every skeleton in a room to open the door to the next one. Ten rooms deep, the Bone King waits.",
    "Tap attack for a 3-hit combo: chop, slice, stab. The last hit knocks enemies back and breaks a warrior's shield guard.",
    "Red markers on the floor show where an attack will land. Step out, roll through it or block it.",
    "Hold block to take far less damage. Block right as a hit lands to parry: the attacker is stunned and bolts fly back.",
    "Dodge-roll through attacks: you can't be hurt mid-roll. Rolling has a short cooldown.",
    "Landing hits charges your spin attack. When the ring is full, spin to hit everything around you.",
    "After each room pick one of three powers. Smash chests, barrels and crates for coins and potions; spend coins on potions between rooms.",
  ],
  features: ["Combo, block, parry & dodge-roll combat", "Skeletons claw out of the floor", "Pick a power after every room", "The Bone King waits in room 10"],
  music: "Crypt of Bones",
};
