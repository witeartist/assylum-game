// Gameplay tuning in one place. Distances are world px (TILE = one tile), times in seconds.
import { TILE } from "../core/constants";

export const RUNNER_SPEED = 120;
export const SPRINT_MULT = 1.6;
export const SNEAK_MULT = 0.5;
/** Runner bots get a random speed in this range × RUNNER_SPEED. */
export const BOT_SPEED_RANGE: [number, number] = [0.85, 1.15];

/** Contact distance for a catch between two locally simulated actors. */
export const CATCH_RADIUS = TILE * 0.6;
/** Host-side catch distance when a remote player is involved (absorbs network latency). */
export const NET_CATCH_RADIUS = TILE * 1.2;

export const PICKUP_RADIUS = TILE * 0.6;
export const EXIT_RADIUS = TILE * 0.75;
export const LOCKER_RANGE = TILE * 1.5;
export const BED_RANGE = TILE * 2;
export const TERMINAL_RANGE = TILE * 2;

export const TERMINAL_CODE_LENGTH = 4;
/** Seconds a runner bot needs to hack a terminal and open its locked door. */
export const BOT_HACK_TIME = 6;
export const BOT_HACK_RANGE = TILE * 1.2;
/** Bots notice a hunter within this distance (with line of sight) and flee. */
export const BOT_DANGER_RANGE = TILE * 12;

/** How long the hunter keeps searching where it last saw someone. */
export const HUNTER_MEMORY = 5;
/** The hunter checks hiding spots around it this often… */
export const HUNTER_SEARCH_INTERVAL = 30;
/** …within this distance. */
export const HUNTER_SEARCH_RANGE = TILE * 3;
/** Hunter speed multiplier once the boss is awake. */
export const HUNTER_BOSS_BOOST = 1.5;
/** The boss sees this many tiles further than the hunter. */
export const BOSS_SIGHT_BONUS = 4;

export const FOX_FLASH = { cooldown: 30, duration: 1, radiusTiles: 9 };

export interface FlashlightMode { label: string; halfAngle: number; rangeTiles: number; }
/** Flashlight modes 1..3 (index + 1). */
export const FLASHLIGHT_MODES: FlashlightMode[] = [
  { label: "Узкий луч", halfAngle: Math.PI * 0.12, rangeTiles: 14 },
  { label: "Средний",   halfAngle: Math.PI * 0.28, rangeTiles: 9 },
  { label: "Широкий",   halfAngle: Math.PI * 0.5,  rangeTiles: 5 },
];
export const DEFAULT_FLASHLIGHT_MODE = 2;

/** Footstep noise: speeds in px/s, ripple radius in px, life in seconds. */
export const FOOTSTEPS = {
  minSpeed: 70,
  runSpeed: 140,
  walk: { interval: 0.5, life: 1.0, radius: TILE * 3 },
  run:  { interval: 0.35, life: 1.5, radius: TILE * 5 },
};

/** Screen flicker of the lights; raised when the boss wakes up. */
export const FLICKER = { calm: 0.18, boss: 0.7 };
