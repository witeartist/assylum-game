import { TILE, MAP_W, MAP_H } from "./constants";
import type { Tile, Vec2 } from "./types";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < MAP_W && row < MAP_H;
}

/** Flat index of a tile in MAP_W × MAP_H typed arrays. */
export function tileIndex(col: number, row: number): number {
  return row * MAP_W + col;
}

export function tileCenter(t: Tile): Vec2 {
  return { x: t.col * TILE + TILE / 2, y: t.row * TILE + TILE / 2 };
}

export function worldToTile(p: Vec2): Tile {
  return {
    col: clamp(Math.floor(p.x / TILE), 0, MAP_W - 1),
    row: clamp(Math.floor(p.y / TILE), 0, MAP_H - 1),
  };
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.col === b.col && a.row === b.row;
}

export function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Smallest absolute difference between two angles, in [0, π]. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
