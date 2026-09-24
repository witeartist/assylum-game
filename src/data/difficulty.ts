import type { Tone } from "../ui/theme";

export type DifficultyId = "easy" | "normal" | "hard";

export interface Difficulty {
  id: DifficultyId;
  label: string;
  tone: Tone;
  /** Hunter full (chase) speed, px/s. It patrols slower. */
  foxSpeed: number;
  /** Boss stalking speed, px/s. It rushes faster. */
  bossSpeed: number;
  /** Seconds until the boss wakes up. */
  bossDelay: number;
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
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy:   { id: "easy",   label: "ЛЕГКО",  tone: "good", foxSpeed: 108, bossSpeed: 48, bossDelay: 240, keyCount: 3, fuseCount: 2, itemCount: 16, sight: 13, foxSight: 11, hearing: 0.8,  reaction: 0.6 },
  normal: { id: "normal", label: "НОРМА",  tone: "warn", foxSpeed: 118, bossSpeed: 58, bossDelay: 180, keyCount: 4, fuseCount: 3, itemCount: 14, sight: 11, foxSight: 14, hearing: 1,    reaction: 0.4 },
  hard:   { id: "hard",   label: "СЛОЖНО", tone: "bad",  foxSpeed: 128, bossSpeed: 70, bossDelay: 130, keyCount: 5, fuseCount: 4, itemCount: 11, sight: 9,  foxSight: 17, hearing: 1.25, reaction: 0.25 },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "normal", "hard"];

export function isDifficultyId(v: unknown): v is DifficultyId {
  return typeof v === "string" && v in DIFFICULTIES;
}
