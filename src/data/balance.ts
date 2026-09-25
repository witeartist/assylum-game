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

/** The fox patrols at this share of its full (chase) speed. */
export const HUNTER_WALK = 0.68;
/** The AI brute rushes at this multiple of its stalking speed. */
export const BOSS_RUSH = 1.9;
/**
 * A brute player walks like the fox patrols and lunges (Shift) this much faster than a running
 * runner, for `time` seconds of stamina. The AI brute is slower: it always knows where you are.
 */
export const BRUTE_LUNGE = { speed: 1.05, time: 2 };

/**
 * The building wakes up `wakeDelay` seconds into the round (difficulty.ts): warnings before it,
 * then the lamps turn red and `share` of them (never the emergency ones) die one by one over
 * `over` seconds, and the villains move `boost` times faster.
 */
export const WAKE = { warnAt: [30, 20, 10], share: 0.55, over: 60, boost: 1.1 };

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

/** Seeing in the dark: a runner sees unlit things this close, tiles (villains: by kit, characters.ts). */
export const DARK_SIGHT = { runner: 1.8 };
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
/** The AI brute: senses (it sees lit runners only this far, tiles — it goes by smell), rush and rest. */
export const BOSS_AI = { fovHalf: Math.PI * 0.45, sight: 8, hearing: 1.5, rushTime: 3, rushRest: 3 };

/** Breath held in a hiding spot, seconds; refills twice as fast. */
export const BREATH = { max: 6, refill: 2, hearRange: TILE * 2.6, alertRange: TILE * 4.5 };

/** The fox's R: a burst of light. */
export const FOX_FLASH = { cooldown: 30, duration: 1, radiusTiles: 9 };
/**
 * The brute's R: a roar heard `noise` tiles away that kills the flashlights of runners within
 * `jamRange` tiles for `jam` seconds.
 */
export const ROAR = { cooldown: 30, noise: 14, jamRange: 8, jam: 2.5 };
/** The brute tears a hiding spot open this fast (the fox searches for HUNTER_AI.checkTime). */
export const BRUTE_CHECK_TIME = 0.35;

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

/** Screen flicker of the lights; raised when the building wakes up. */
export const FLICKER = { calm: 0.18, awake: 0.7 };
