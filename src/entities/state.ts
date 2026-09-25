// Plain data about an actor that other modules (and tests) need without pulling in Phaser.

/** How an actor moves: sneaking is silent, running is loud and tiring. */
export type Gait = "sneak" | "walk" | "run";
export const GAITS: Gait[] = ["sneak", "walk", "run"];

/** Bits of NetState.k. */
export const NET_FLAG = { exhausted: 1, canBreakFree: 2, batteryLow: 4, carrying: 8 } as const;

/** Network state of an actor (positions in world px, velocities in px/s). */
export interface NetState {
  x: number; y: number; vx: number; vy: number;
  /** Facing angle, radians. */
  a: number;
  /** Flashlight: 0 = off, otherwise the mode (1..3). */
  fl: number;
  /** Gait index in GAITS. */
  g: number;
  /** NET_FLAG bits. */
  k: number;
}
