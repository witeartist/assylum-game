// Gameplay tuning in one place. Distances are world px (TILE = one tile), times in seconds.
import { TILE } from "../core/constants";

/** Runners walk by default; Shift runs, C sneaks. Speeds in px/s. */
export const RUNNER_WALK = 96;
export const RUNNER_RUN = 154;
export const SNEAK_MULT = 0.5;
/** Walking while out of breath. */
export const EXHAUSTED_MULT = 0.78;
/** Runner bots get a random speed in this range × the runner speeds. */
export const BOT_SPEED_RANGE: [number, number] = [0.94, 1.06];

/** The hunter patrols at this share of its full (chase) speed. */
export const HUNTER_WALK = 0.68;
/** The boss rushes at this multiple of its stalking speed once it has a target. */
export const BOSS_RUSH = 1.9;
/** Hunter speed multiplier once the boss is awake. */
export const HUNTER_BOSS_BOOST = 1.1;

/**
 * Stamina, in seconds of running. Running drains 1 per second; rest refills it. At zero the
 * runner is exhausted: no running until `recoverAt` of the bar is back, slower walk, loud breath.
 */
export const STAMINA = { max: 5, regenWalk: 0.45, regenRest: 0.8, recoverAt: 0.4, breathEvery: 0.9 };

/** Contact distance for a catch between two locally simulated actors. */
export const CATCH_RADIUS = TILE * 0.6;
/** Host-side catch distance when a remote player is involved (absorbs network latency). */
export const NET_CATCH_RADIUS = TILE * 1.2;
/** A runner who breaks free: the hunter is stunned, the runner gets a head start. */
export const BREAK_FREE = { stun: 2.5, stamina: 0.6 };

export const PICKUP_RADIUS = TILE * 0.6;
export const EXIT_RADIUS = TILE * 0.75;
export const LOCKER_RANGE = TILE * 1.5;
export const BED_RANGE = TILE * 2;
export const TERMINAL_RANGE = TILE * 2;
export const INTERACT_RANGE = TILE * 1.4;

/** Terminal minigame: remember a sequence of digits shown one by one, then type it. */
export const TERMINAL = { length: 4, showMs: 650, gapMs: 200 };
/** Seconds a runner bot needs to hack a terminal and open its locked door. */
export const BOT_HACK_TIME = 7;
export const BOT_HACK_RANGE = TILE * 1.2;
/** Seconds to insert a fuse into the fuse box. */
export const FUSE_INSERT_TIME = 1.6;

/** How far runners notice a threat (it must be lit or close, like anything else they see). */
export const BOT_DANGER_RANGE = TILE * 11;

/** Seeing in the dark: a viewer sees unlit things this close, tiles. */
export const DARK_SIGHT = { runner: 1.8, hunter: 4.5, boss: 5 };
/** Light level above which a thing counts as lit. */
export const SEE_LIGHT = 0.14;

/** The AI hunter: field of view (half angle), reaction time per difficulty and memory. */
export const HUNTER_AI = {
  fovHalf: Math.PI * 0.34,
  /** Anything this close is noticed whatever the direction, tiles. */
  nearSense: 1.4,
  /** Seconds it keeps the scent after losing sight. */
  pursue: 4,
  /** Seconds it searches the area afterwards. */
  search: 14,
  /** Seconds to open a locker or look under a bed. */
  checkTime: 0.9,
  /** Guarding the exit: how long in one go, and how long before it may guard again. */
  guardTime: 18,
  guardCooldown: 25,
};
/** The boss: senses, rush and warnings before it wakes. */
export const BOSS_AI = { fovHalf: Math.PI * 0.55, hearing: 1.5, rushTime: 4, rushRest: 2.5, warnAt: [30, 20, 10] };

/** Breath held in a hiding spot, seconds; refills twice as fast. */
export const BREATH = { max: 6, refill: 2, hearRange: TILE * 2.6, alertRange: TILE * 4.5 };

export const FOX_FLASH = { cooldown: 30, duration: 1, radiusTiles: 9 };

export interface FlashlightMode { label: string; halfAngle: number; rangeTiles: number; }
/** Flashlight modes 1..3 (index + 1), switched with V. */
export const FLASHLIGHT_MODES: FlashlightMode[] = [
  { label: "Узкий луч", halfAngle: Math.PI * 0.12, rangeTiles: 14 },
  { label: "Средний",   halfAngle: Math.PI * 0.28, rangeTiles: 9 },
  { label: "Широкий",   halfAngle: Math.PI * 0.5,  rangeTiles: 5 },
];
export const DEFAULT_FLASHLIGHT_MODE = 2;
/** A full battery lasts this many seconds of light; below `low` the beam stutters. */
export const BATTERY = { seconds: 150, low: 0.15, start: 0.8 };

/** Noise, radius in tiles: how far it carries (walls muffle it to `wallMuffle`). */
export const NOISE = {
  wallMuffle: 0.6,
  run:    { radius: 7, every: 0.3 },
  walk:   { radius: 2.5, every: 0.5 },
  hunterWalk: { radius: 3.5, every: 0.55 },
  hunterRun:  { radius: 7, every: 0.35 },
  bossStep:   { radius: 9, every: 0.7 },
  breath: 3,
  gasp: 5.5,
  door: 6,
  locker: 3.5,
  glass: 10,
  alarm: 11,
  fuse: 5,
  whistle: 13,
};
/** Ripples on screen live this long, seconds. */
export const RIPPLE_LIFE = 1.2;

/** Items: inventory size, throw distance and how long a glowstick burns. */
export const ITEMS = { slots: 3, throwTiles: 7, glowstickTime: 90, adrenalineTime: 6, markerTime: 30 };
/** Yoko's whistle cooldown. */
export const WHISTLE_COOLDOWN = 40;

/** Screen flicker of the lights; raised when the boss wakes up. */
export const FLICKER = { calm: 0.18, boss: 0.7 };
