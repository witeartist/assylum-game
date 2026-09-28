import type { Tone } from "../ui/theme";

export type DifficultyId = "easy" | "normal" | "hard";

export interface Difficulty {
  id: DifficultyId;
  label: string;
  tone: Tone;
  /** The fox's full (chase) speed, px/s. It patrols slower. */
  foxSpeed: number;
  /** The brute's stalking speed, px/s. It rushes faster. */
  bossSpeed: number;
  /** Seconds until the building wakes up (balance.ts WAKE). */
  wakeDelay: number;
  keyCount: number;
  /** Fuses to find and plug into the fuse box before the exit has power (0 = none). */
  fuseCount: number;
  /** Items lying around the level. */
  itemCount: number;
  /** How far away lamp-lit places are still visible, tiles. */
  sight: number;
  /** How far the AI hunter sees lit runners, tiles. */
  foxSight: number;
  /** Multiplier on how far the AI hears. */
  hearing: number;
  /** Seconds a runner must stay in view before the AI hunter recognises it. */
  reaction: number;
  /**
   * The AI brute: how far it sees lit runners (tiles) and its field of view (half angle, as a
   * share of π); how far behind it follows the trail (s: far away / closer than 6 tiles); how long
   * it rushes and rests (s).
   */
  brute: { sight: number; fov: number; lagFar: number; lagNear: number; rush: number; rest: number };
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy:   { id: "easy",   label: "ЛЕГКО",  tone: "good", foxSpeed: 108, bossSpeed: 48, wakeDelay: 240, keyCount: 3, fuseCount: 2, itemCount: 16, sight: 13, foxSight: 11, hearing: 0.8,  reaction: 0.6,
    brute: { sight: 8, fov: 0.45, lagFar: 7, lagNear: 2.5, rush: 3, rest: 3 } },
  normal: { id: "normal", label: "НОРМА",  tone: "warn", foxSpeed: 118, bossSpeed: 58, wakeDelay: 180, keyCount: 4, fuseCount: 3, itemCount: 14, sight: 11, foxSight: 14, hearing: 1,    reaction: 0.4,
    brute: { sight: 11, fov: 0.5, lagFar: 5.5, lagNear: 2, rush: 3.5, rest: 2.75 } },
  hard:   { id: "hard",   label: "СЛОЖНО", tone: "bad",  foxSpeed: 128, bossSpeed: 70, wakeDelay: 130, keyCount: 5, fuseCount: 4, itemCount: 11, sight: 9,  foxSight: 17, hearing: 1.25, reaction: 0.25,
    brute: { sight: 15, fov: 0.55, lagFar: 4.5, lagNear: 1.5, rush: 4, rest: 2.5 } },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "normal", "hard"];

export function isDifficultyId(v: unknown): v is DifficultyId {
  return typeof v === "string" && v in DIFFICULTIES;
}
