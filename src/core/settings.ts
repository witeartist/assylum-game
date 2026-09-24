// Player settings, persisted in localStorage (silently in-memory only if storage is blocked).
import { isDifficultyId, type DifficultyId } from "../data/difficulty";

export type Quality = "low" | "medium" | "high";
const QUALITIES: Quality[] = ["low", "medium", "high"];

export interface Settings {
  musicVolume: number;
  difficulty: DifficultyId;
  showFps: boolean;
  /** Graphics preset; the render resolution part applies after a page reload. */
  quality: Quality;
}

const STORAGE_KEY = "assylum.settings";
const DEFAULTS: Settings = { musicVolume: 0.4, difficulty: "normal", showFps: true, quality: "high" };

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      musicVolume: typeof raw.musicVolume === "number" ? Math.min(1, Math.max(0, raw.musicVolume)) : DEFAULTS.musicVolume,
      difficulty: isDifficultyId(raw.difficulty) ? raw.difficulty : DEFAULTS.difficulty,
      showFps: typeof raw.showFps === "boolean" ? raw.showFps : DEFAULTS.showFps,
      quality: QUALITIES.includes(raw.quality) ? raw.quality : DEFAULTS.quality,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const current = load();

export const settings: Readonly<Settings> = current;

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(current, patch);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
}
