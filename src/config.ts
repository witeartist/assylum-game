// ============================================================
//  ASSYLUM — config.ts — Constants & shared state
// ============================================================
export const TILE   = 32;
export const MAP_W  = 80;
export const MAP_H  = 50;
export const WORLD_W = MAP_W * TILE;  // 2560
export const WORLD_H = MAP_H * TILE;  // 1600

export const CANVAS_W = 960;
export const CANVAS_H = 600;

// ── Difficulty presets ──────────────────────────────────────
export interface DifficultyPreset {
  foxSpd: number;
  bossSpd: number;
  bossDelay: number;
  keyCount: number;
  partCount: number;
  sight: number;
  foxSight: number;
  label: string;
}

export const DIFFICULTY: Record<string, DifficultyPreset> = {
  easy:   { foxSpd: 144, bossSpd: 55, bossDelay: 150, keyCount: 3, partCount: 0, sight: 13, foxSight: 12, label: "Лёгкий" },
  normal: { foxSpd: 144, bossSpd: 80, bossDelay: 90,  keyCount: 5, partCount: 3, sight: 10, foxSight: 16, label: "Нормальный" },
  hard:   { foxSpd: 144, bossSpd: 105, bossDelay: 50, keyCount: 7, partCount: 5, sight: 7,  foxSight: 20, label: "Хардкор" },
};
export let currentDifficulty = "normal";
export function setDifficulty(d: string) { currentDifficulty = d; }

// ── Cast ─────────────────────────────────────────────────────
export const RUNNER_NAMES = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
export const HUNTER_NAME = "Foxmind";
export const BOSS_NAME = "Желочь";

export const RUNNER_SPD = 120;
export const SPRINT_MULT = 1.6;
export const SNEAK_MULT = 0.5;

export function getDiff(): DifficultyPreset { return DIFFICULTY[currentDifficulty]; }

export const HIDE_KEY = "e";

/** Seconds a runner bot needs to hack a terminal and open its locked door. */
export const BOT_HACK_TIME = 6;
/** Host-side catch distance in multiplayer (generous to absorb network latency). */
export const MP_CATCH_RADIUS = TILE * 1.2;

export const COLORS: Record<string, string> = {
  Naumi:   "#e879a0",
  Kuruna:  "#5baef7",
  Wite:    "#e8e8e8",
  Sumrak:  "#7a7a9a",
  Yoko:    "#f1a127",
  Foxmind: "#e84040",
  Jelo:    "#5ec45e",
};

export const ROOM_TYPES = ["ward", "procedure", "canteen", "isolation", "storage", "morgue"];

export const ROOM_LABELS: Record<string, string> = {
  ward:      "Палата",
  procedure: "Процедурная",
  canteen:   "Столовая",
  isolation: "Изолятор",
  storage:   "Кладовая",
  morgue:    "Морг",
};

export const ROOM_PROPS: Record<string, string> = {
  ward:      "bed",
  procedure: "gurney",
  canteen:   "table",
  isolation: "bars",
  storage:   "cabinet",
  morgue:    "gurney",
};

export let currentCameraPos: { x: number; y: number } | null = null;

export const SPRITE_DIMENSIONS: Record<string, { width: number; height: number }> = {};

// ── Sound state ──────────────────────────────────────────────
export let bgmVolume = 0.4;
export function setBgmVolume(v: number) { bgmVolume = v; }
export let bgmAudio: HTMLAudioElement | null = null;
export function setBgmAudio(a: HTMLAudioElement) { bgmAudio = a; }

// ── Tile type ────────────────────────────────────────────────
export interface Tile {
  col: number;
  row: number;
}

// ── Small helpers used everywhere ────────────────────────────
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function tileKey(c: number, r: number): string { return `${c},${r}`; }
export function sameTile(a: Tile, b: Tile): boolean { return a.col === b.col && a.row === b.row; }
export function tileDist(a: Tile, b: Tile): number { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row); }

/** Replace one character of a level row (rows are immutable strings). */
export function setTileChar(rows: string[], t: Tile, ch: string) {
  const row = rows[t.row];
  rows[t.row] = row.slice(0, t.col) + ch + row.slice(t.col + 1);
}

export function tileCenter(c: number, r: number): { x: number; y: number } {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}

export function worldToTile(p: { x: number; y: number }): Tile {
  return {
    col: clamp(Math.floor(p.x / TILE), 0, MAP_W - 1),
    row: clamp(Math.floor(p.y / TILE), 0, MAP_H - 1),
  };
}

export function hexToRGB(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function spriteScaleForHeight(name: string, h: number): number {
  const d = SPRITE_DIMENSIONS[name] || { width: 16, height: 16 };
  return h / d.height;
}
