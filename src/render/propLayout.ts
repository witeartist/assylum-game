// Where a standing object is drawn and what floor it covers. Small things get their height from
// the catalogue and go right up to the wall they stand by; beds and tables span their footprint.
// One place for the picture and its collision.
import { MAP_W, MAP_H, TILE, WALL_HEIGHT } from "../core/constants";
import { tileIndex } from "../core/geom";
import { FURNITURE_BY_KEY } from "../data/furniture";
import type { World } from "../game/World";
import type { FurniturePiece } from "../world/level";
import { ARM_N, ARM_S, THIN, THIN_WALL } from "../world/walls";

export interface Box { x0: number; y0: number; x1: number; y1: number; }

export interface PropLayout {
  /** Bottom centre of the picture (the line it is depth-sorted on), world px. */
  x: number;
  base: number;
  /** Size of the picture, world px. */
  w: number;
  h: number;
  /** The floor under it, world px: what it bumps into. */
  foot: Box;
}

/** Share of the footprint's width a picture spans when it has no height of its own. */
const SPAN = 0.96;

/**
 * Layout of `key` standing on the w × h tiles from (col, row). `height`: on-screen height, px —
 * the picture keeps its proportions and never gets wider than the footprint.
 */
export function standingLayout(world: World, key: string, col: number, row: number, w: number, h: number, height?: number): PropLayout {
  const frame = world.scene.textures.getFrame(key);
  const aspect = frame && frame.height > 0 ? frame.width / frame.height : 1;
  const maxW = w * TILE * SPAN;
  let pw = maxW, ph = maxW / aspect;
  if (height !== undefined && height < ph) { ph = height; pw = ph * aspect; }
  const small = pw < maxW - 1;

  const wall = (c: number, r: number) => c < 0 || r < 0 || c >= MAP_W || r >= MAP_H || world.level.rows[r][c] === "#";
  const code = (c: number, r: number) => wall(c, r) && c >= 0 && r >= 0 && c < MAP_W && r < MAP_H ? world.walls[tileIndex(c, r)] : 0;
  const rows = Array.from({ length: h }, (_, i) => row + i), cols = Array.from({ length: w }, (_, i) => col + i);
  /** The inner face of the wall beside the footprint (a partition stands in the middle of its tile). */
  const sideFace = (c: number, dir: -1 | 1): number | null => {
    if (!rows.every(r => wall(c, r))) return null;
    const thin = rows.every(r => code(c, r) >= THIN && (code(c, r) & (ARM_N | ARM_S)) !== 0);
    const edge = dir < 0 ? col * TILE : (col + w) * TILE;
    return edge + (thin ? -dir * (TILE / 2 - THIN_WALL / 2) : 0);
  };
  const left = sideFace(col - 1, -1), right = sideFace(col + w, 1);
  const x = left !== null ? left + pw / 2 + 1 : right !== null ? right - pw / 2 - 1 : (col + w / 2) * TILE;

  let base = (row + h) * TILE - 1;
  const northWall = cols.every(c => wall(c, row - 1));
  const southBlock = cols.every(c => wall(c, row + h) && code(c, row + h) < THIN);
  if (small && northWall) base = row * TILE + Math.max(6, Math.min(h * TILE - 1, Math.round(ph * 0.5)));
  // A whole wall in front hides the floor right behind it: stand where it can be seen.
  else if (small && southBlock) base = (row + h) * TILE - WALL_HEIGHT;
  else if (small) base = (row + h) * TILE - 3;

  const foot: Box = small
    ? { x0: x - pw / 2, x1: x + pw / 2, y0: northWall ? row * TILE : base - Math.max(6, Math.min(ph, TILE) * 0.45), y1: base }
    : { x0: col * TILE, x1: (col + w) * TILE, y0: row * TILE, y1: (row + h) * TILE };
  return { x, base, w: pw, h: ph, foot };
}

export function furnitureLayout(world: World, f: FurniturePiece): PropLayout {
  return standingLayout(world, f.key, f.col, f.row, f.w, f.h, FURNITURE_BY_KEY.get(f.key)?.height);
}
