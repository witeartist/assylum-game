// Thin walls. A wall one tile thick standing between open spaces — rooms side by side, a room and
// the corridor — is a partition, not a block: it is a thin band inside its tile, floor shows on
// both sides of it, characters walk right up to it, and light and sight are cut by the band
// alone. Wall masses (any 2×2 of wall) stay solid blocks.
//
// A wall running north–south stands in the middle of its tile. One running west–east lies along
// the bottom edge, so in the 3/4 view its front face is exactly where a block's would be and
// whatever hangs on north walls (lamps, lockers, the fuse box) still sits on it. Where walls meet,
// the bands join into corners and T-junctions; at a doorway a wall ends flush with its tile.
//
// Plain data, no Phaser: the renderer, collision, the light shader and line of sight all read
// the same shapes.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import type { Tile, Vec2 } from "../core/types";
import type { LevelData } from "./level";

/** Thickness of a thin wall, world px. */
export const THIN_WALL = 12;
/** Shape code of a thin wall is THIN + its arms (the neighbours it joins); 0 is a whole tile. */
export const THIN = 16;
export const ARM_N = 1, ARM_E = 2, ARM_S = 4, ARM_W = 8;

/** A rectangle in tile-local px. */
export interface Band { x0: number; y0: number; x1: number; y1: number; }

/** A door standing in a wall line (a gate or a locked door): its tile and which way the wall runs. */
export interface DoorSlot { tile: Tile; horizontal: boolean; }

const WHOLE: Band[] = [{ x0: 0, y0: 0, x1: TILE, y1: TILE }];

/**
 * What a tile of shape `code` covers, in tile-local px. `half` is half the thickness of the
 * north–south band and `top` the upper edge of the west–east one: collision widens both.
 */
export function bands(code: number, half = THIN_WALL / 2, top = TILE - THIN_WALL): Band[] {
  if (code < THIN) return WHOLE;
  const n = code & ARM_N, e = code & ARM_E, s = code & ARM_S, w = code & ARM_W;
  const across = e || w, along = n || s;
  const m0 = TILE / 2 - half, m1 = TILE / 2 + half;
  const out: Band[] = [];
  if (across) out.push({ x0: w ? 0 : along ? m0 : 0, y0: top, x1: e ? TILE : along ? m1 : TILE, y1: TILE });
  if (along) out.push({ x0: m0, y0: n ? 0 : across ? top : 0, x1: m1, y1: TILE });
  return out;
}

/** Bands of every thin shape at the drawn thickness (line of sight asks many times a frame). */
const DRAWN: Band[][] = Array.from({ length: THIN * 2 }, (_, code) => bands(code));

/** Whether tile-local point (x, y) is inside the wall of shape `code`. */
export function insideShape(code: number, x: number, y: number): boolean {
  return DRAWN[code].some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
}

/**
 * Shape code of every tile (row-major): THIN + arms for thin walls and for doors standing in a
 * thin wall line, 0 for everything else (open floor and whole blocks). Walls are "#" in `rows`.
 * `keep`: walls and doors that stay whole blocks whatever their neighbours (the exit's wall and
 * the heavy locked doors, whose pictures fill a block).
 */
export function wallShapes(rows: readonly string[], doors: readonly DoorSlot[] = [], keep: readonly Tile[] = []): Uint8Array {
  const code = new Uint8Array(MAP_W * MAP_H);
  const wall = (c: number, r: number) => c < 0 || r < 0 || c >= MAP_W || r >= MAP_H || rows[r][c] === "#";
  const slots = new Map<number, DoorSlot>();
  for (const d of doors) slots.set(d.tile.row * MAP_W + d.tile.col, d);
  const kept = new Set(keep.map(t => t.row * MAP_W + t.col));
  /** A door on (c, r) set in a wall that runs the way we look (horizontal: west–east). */
  const doorAt = (c: number, r: number, horizontal: boolean) => slots.get(r * MAP_W + c)?.horizontal === horizontal;
  const block = (c: number, r: number) => wall(c, r) && wall(c + 1, r) && wall(c, r + 1) && wall(c + 1, r + 1);

  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const i = r * MAP_W + c;
    if (!wall(c, r) || kept.has(i)) continue;
    if (block(c - 1, r - 1) || block(c, r - 1) || block(c - 1, r) || block(c, r)) continue;
    const arms = (wall(c, r - 1) || doorAt(c, r - 1, false) ? ARM_N : 0)
      | (wall(c + 1, r) || doorAt(c + 1, r, true) ? ARM_E : 0)
      | (wall(c, r + 1) || doorAt(c, r + 1, false) ? ARM_S : 0)
      | (wall(c - 1, r) || doorAt(c - 1, r, true) ? ARM_W : 0);
    // A lone pillar keeps its block: cover to hide behind.
    if (arms) code[i] = THIN + arms;
  }

  // A door is as thin as the wall it stands in: look along the line past other doors.
  for (const d of doors) {
    if (kept.has(d.tile.row * MAP_W + d.tile.col)) continue;
    const [dc, dr] = d.horizontal ? [1, 0] : [0, 1];
    const thinEnd = (sign: number) => {
      let c = d.tile.col + dc * sign, r = d.tile.row + dr * sign;
      while (slots.has(r * MAP_W + c)) { c += dc * sign; r += dr * sign; }
      return wall(c, r) && c >= 0 && r >= 0 && c < MAP_W && r < MAP_H && code[r * MAP_W + c] >= THIN;
    };
    if (thinEnd(1) || thinEnd(-1)) code[d.tile.row * MAP_W + d.tile.col] = THIN + (d.horizontal ? ARM_E | ARM_W : ARM_N | ARM_S);
  }
  return code;
}

/** Which way the wall runs through a doorway tile: west–east if you pass it going up or down. */
function runsAcross(rows: readonly string[], t: Tile, doors: Set<number>): boolean {
  const open = (c: number, r: number) => r >= 0 && r < MAP_H && rows[r][c] !== "#" && !doors.has(r * MAP_W + c);
  return open(t.col, t.row - 1) || open(t.col, t.row + 1);
}

/** The shapes of a level: its walls, the doors in doorways, the exit and locked doors kept whole. */
export function levelWallShapes(level: Pick<LevelData, "rows" | "gates" | "lockedDoors" | "exitTile">): Uint8Array {
  const locked = level.lockedDoors.flatMap(d => d.doorTiles);
  const lockedSet = new Set(locked.map(t => t.row * MAP_W + t.col));
  const doors: DoorSlot[] = [
    ...level.gates.flatMap(g => g.tiles.map(tile => ({ tile, horizontal: g.horizontal }))),
    ...locked.map(tile => ({ tile, horizontal: runsAcross(level.rows, tile, lockedSet) })),
  ];
  const e = level.exitTile;
  const keep = [...locked, { col: e.col, row: e.row - 1 }, { col: e.col + 1, row: e.row - 1 }];
  return wallShapes(level.rows, doors, keep);
}

/** Liang–Barsky: does the segment a→b touch the rectangle? */
function segmentHitsRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
}

/**
 * Whether the segment a→b (world px) crosses the thin wall of shape `code` on tile (col, row).
 * A band holding one of the end points doesn't count (the ray starts or ends inside it).
 */
export function crossesThin(code: number, col: number, row: number, a: Vec2, b: Vec2): boolean {
  const ox = col * TILE, oy = row * TILE;
  for (const band of DRAWN[code]) {
    const x0 = ox + band.x0, y0 = oy + band.y0, x1 = ox + band.x1, y1 = oy + band.y1;
    const holds = (p: Vec2) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    if (holds(a) || holds(b)) continue;
    if (segmentHitsRect(a.x, a.y, b.x, b.y, x0, y0, x1, y1)) return true;
  }
  return false;
}

/** Walls rasterised at `res` world px per cell: whole tiles for blocks, bands for thin walls. */
export interface WallMask { res: number; w: number; h: number; cells: Uint8Array; }

/** `res` must divide the band edges (2 does). Door slots are left open: doors are drawn on their own. */
export function wallMask(rows: readonly string[], code: Uint8Array, res: number): WallMask {
  const per = TILE / res, w = MAP_W * per, h = MAP_H * per;
  const cells = new Uint8Array(w * h);
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    if (rows[r][c] !== "#") continue;
    for (const b of bands(code[r * MAP_W + c])) {
      for (let y = b.y0 / res; y < b.y1 / res; y++) cells.fill(1, (r * per + y) * w + c * per + b.x0 / res, (r * per + y) * w + c * per + b.x1 / res);
    }
  }
  return { res, w, h, cells };
}

/** Where walls stand on open floor, facing south: their front faces. `y` is the floor line, world px. */
export interface FaceRun { x0: number; x1: number; y: number; }

export function faceRuns(m: WallMask): FaceRun[] {
  const runs: FaceRun[] = [];
  for (let y = 1; y < m.h; y++) {
    let start = -1;
    for (let x = 0; x <= m.w; x++) {
      const face = x < m.w && m.cells[(y - 1) * m.w + x] === 1 && m.cells[y * m.w + x] === 0;
      if (face && start < 0) start = x;
      if (!face && start >= 0) { runs.push({ x0: start * m.res, x1: x * m.res, y: y * m.res }); start = -1; }
    }
  }
  return runs;
}
