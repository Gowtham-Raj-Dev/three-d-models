import type { GameEntry } from "@/lib/games";

/** Cannon Cove — every model it uses, from the site's own library (public/library). No three.js here. */

const P = (name: string) => `pirate-kit/${name}`;

export const SHIPS = {
  playerSmall: P("ship-pirate-small"),
  playerMedium: P("ship-pirate-medium"),
  playerLarge: P("ship-pirate-large"),
  sloop: P("ship-small"),
  brig: P("ship-medium"),
  frigate: P("ship-large"),
  ghost: P("ship-ghost"),
} as const;

export const ISLAND = {
  sand: P("patch-sand"),
  sandFoliage: P("patch-sand-foliage"),
  grass: P("patch-grass"),
  grassFoliage: P("patch-grass-foliage"),
  grassTuft: P("grass"),
  grassPatch: P("grass-patch"),
  grassPlant: P("grass-plant"),
  palmBend: P("palm-bend"),
  palmStraight: P("palm-straight"),
  palmDetailedBend: P("palm-detailed-bend"),
  palmDetailedStraight: P("palm-detailed-straight"),
  rocksA: P("rocks-a"),
  rocksB: P("rocks-b"),
  rocksC: P("rocks-c"),
  rocksSandA: P("rocks-sand-a"),
  rocksSandB: P("rocks-sand-b"),
  rocksSandC: P("rocks-sand-c"),
} as const;

export const PROPS = {
  towerSmall: P("tower-complete-small"),
  towerLarge: P("tower-complete-large"),
  dock: P("structure-platform-dock"),
  dockSmall: P("structure-platform-dock-small"),
  hut: P("structure-roof"),
  flag: P("flag-pirate-high"),
  pennant: P("flag-high-pennant"),
  rowboat: P("boat-row-small"),
  rowboatLarge: P("boat-row-large"),
  wreck: P("ship-wreck"),
  hole: P("hole"),
  shovel: P("tool-shovel"),
  bottle: P("bottle"),
  buoy: "watercraft-kit/buoy",
  buoyFlag: "watercraft-kit/buoy-flag",
} as const;

export const ARMS = {
  cannon: P("cannon"),
  fortCannon: P("cannon-mobile"),
  ball: P("cannon-ball"),
} as const;

export const LOOT = {
  barrel: P("barrel"),
  crate: P("crate"),
  bottles: P("crate-bottles"),
  chest: P("chest"),
} as const;

/** Load order matters: the menu needs the player's ship and the islands first. */
export const MODELS: string[] = [
  SHIPS.playerSmall,
  ...Object.values(ISLAND),
  ARMS.cannon,
  ARMS.ball,
  ...Object.values(PROPS),
  ARMS.fortCannon,
  ...Object.values(LOOT),
  SHIPS.sloop,
  SHIPS.brig,
  SHIPS.frigate,
  SHIPS.playerMedium,
  SHIPS.playerLarge,
  SHIPS.ghost,
];

export const GAME: GameEntry = {
  slug: "cannon-cove",
  title: "Cannon Cove",
  tagline: "Sail with the wind, fire broadsides, plunder the cove.",
  description:
    "A 3D naval battle game. Captain a pirate ship around a tropical archipelago, use the wind to outsail navy frigates, fire port and starboard broadsides, dodge fort cannons and loot the wrecks to upgrade your ship — until the ghost ship rises.",
  genre: "Naval action",
  accent: "#38bdf8",
  cover: "/games/cannon-cove/cover.webp",
  models: MODELS,
  collections: ["Pirate Kit", "Watercraft Kit"],
  controls: [
    { action: "Steer", keys: ["A", "D", "←", "→"], touch: "Left stick" },
    { action: "Raise / lower sails", keys: ["W", "S", "↑", "↓"], touch: "Left stick up / down" },
    { action: "Fire left broadside", keys: ["Q", "J"], touch: "Left cannon button" },
    { action: "Fire right broadside", keys: ["E", "L"], touch: "Right cannon button" },
    { action: "Pick an upgrade between waves", keys: ["1", "2", "3"], touch: "Tap a card" },
    { action: "Repair with gold between waves", keys: ["R"], touch: "Tap Repair" },
    { action: "Zoom the camera", keys: ["Mouse wheel", "Z"] },
  ],
  howTo: [
    "Sink every enemy ship in a wave to win it, and survive as many waves as you can.",
    "Your cannons point sideways: turn side-on to an enemy, then fire left (Q) or right (E). Your gunners aim at the nearest target on that side — hold the key to fire again as soon as they reload.",
    "Watch the wind arrow: sailing across the wind (beam reach) is fastest, straight into it is painfully slow.",
    "More sail means more speed but wider turns. Drop to battle sails to turn tight.",
    "A red ! means an enemy is about to fire — change speed or turn hard and their shots splash behind you.",
    "Sunk ships leave barrels, crates and chests: sail through them for gold and repairs. Island forts shoot back too — knock them down for a big bounty.",
    "Every 5th wave the ghost ship rises: sail out of the green rings before her shots land.",
    "After each wave pick one of three upgrades — faster reloads, more cannons, a stronger hull, bigger sails or a bigger ship — and spend gold on repairs.",
  ],
  features: ["Wind-driven sailing", "Port & starboard broadsides", "Forts, frigates & a ghost ship boss", "Ship upgrades between waves"],
  music: "Salt & Cannon",
};
