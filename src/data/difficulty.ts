import type { Tone } from "../ui/theme";

export type DifficultyId = "easy" | "normal" | "hard";

export interface Difficulty {
  id: DifficultyId;
  label: string;
  tone: Tone;
  /** Hunter speed, px/s. */
  foxSpeed: number;
  /** Boss speed, px/s. */
  bossSpeed: number;
  /** Seconds until the boss wakes up. */
  bossDelay: number;
  keyCount: number;
  /** Reserved for extra objectives (fuses / power parts), not used yet. */
  partCount: number;
  /** Runner view distance, tiles. */
  sight: number;
  /** Hunter view distance, tiles. */
  foxSight: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy:   { id: "easy",   label: "ЛЕГКО",  tone: "good", foxSpeed: 144, bossSpeed: 55,  bossDelay: 150, keyCount: 3, partCount: 0, sight: 13, foxSight: 12 },
  normal: { id: "normal", label: "НОРМА",  tone: "warn", foxSpeed: 144, bossSpeed: 80,  bossDelay: 90,  keyCount: 5, partCount: 3, sight: 10, foxSight: 16 },
  hard:   { id: "hard",   label: "СЛОЖНО", tone: "bad",  foxSpeed: 144, bossSpeed: 105, bossDelay: 50,  keyCount: 7, partCount: 5, sight: 7,  foxSight: 20 },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "normal", "hard"];

export function isDifficultyId(v: unknown): v is DifficultyId {
  return typeof v === "string" && v in DIFFICULTIES;
}
