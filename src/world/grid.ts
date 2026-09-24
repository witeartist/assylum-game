// The one implementation of grid queries — walkability, BFS distances, paths, line of sight
// and field of view. Level generation, AI, vision and lighting all use these functions.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import type { Tile, Vec2 } from "../core/types";

const N = MAP_W * MAP_H;

/** Walls and closed doors of the map as a flat solid/free array. */
export class WalkGrid {
  readonly solid: Uint8Array;

  constructor(solid?: Uint8Array) {
    this.solid = solid ?? new Uint8Array(N).fill(1);
  }

  /** Build from level rows or a generator char grid: "#" is solid, anything else walkable. */
  static fromRows(rows: ReadonlyArray<ArrayLike<string>>): WalkGrid {
    const g = new WalkGrid();
    for (let r = 0; r < MAP_H; r++)
      for (let c = 0; c < MAP_W; c++) g.solid[r * MAP_W + c] = rows[r][c] === "#" ? 1 : 0;
    return g;
  }

  isSolid(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= MAP_W || row >= MAP_H) return true;
    return this.solid[row * MAP_W + col] === 1;
  }

  setSolid(t: Tile, solid: boolean): void {
    this.solid[t.row * MAP_W + t.col] = solid ? 1 : 0;
  }

  /** Copy with extra solid tiles (e.g. every locked door shut). */
  withSolid(tiles: readonly Tile[]): WalkGrid {
    const g = new WalkGrid(this.solid.slice());
    for (const t of tiles) g.setSolid(t, true);
    return g;
  }
}

/** BFS step distance from `from` to every tile, indexed row * MAP_W + col; -1 = unreachable. */
export function distanceMap(grid: WalkGrid, from: Tile): Int32Array {
  const dist = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const solid = grid.solid;
  let head = 0, tail = 0;
  const start = from.row * MAP_W + from.col;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++];
    const c = cur % MAP_W, r = (cur - c) / MAP_W;
    const d = dist[cur] + 1;
    if (c < MAP_W - 1 && dist[cur + 1] < 0 && !solid[cur + 1]) { dist[cur + 1] = d; queue[tail++] = cur + 1; }
    if (c > 0 && dist[cur - 1] < 0 && !solid[cur - 1]) { dist[cur - 1] = d; queue[tail++] = cur - 1; }
    if (r < MAP_H - 1 && dist[cur + MAP_W] < 0 && !solid[cur + MAP_W]) { dist[cur + MAP_W] = d; queue[tail++] = cur + MAP_W; }
    if (r > 0 && dist[cur - MAP_W] < 0 && !solid[cur - MAP_W]) { dist[cur - MAP_W] = d; queue[tail++] = cur - MAP_W; }
  }
  return dist;
}

export function distanceTo(dist: Int32Array, t: Tile): number {
  return dist[t.row * MAP_W + t.col];
}

/** Shortest 4-way path, excluding `start` and including `goal`; [] if unreachable or already there. */
export function findPath(grid: WalkGrid, start: Tile, goal: Tile): Tile[] {
  const s = start.row * MAP_W + start.col, g = goal.row * MAP_W + goal.col;
  if (s === g || grid.solid[g]) return [];
  const parent = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const solid = grid.solid;
  let head = 0, tail = 0;
  parent[s] = s;
  queue[tail++] = s;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === g) break;
    const c = cur % MAP_W, r = (cur - c) / MAP_W;
    if (c < MAP_W - 1 && parent[cur + 1] < 0 && !solid[cur + 1]) { parent[cur + 1] = cur; queue[tail++] = cur + 1; }
    if (c > 0 && parent[cur - 1] < 0 && !solid[cur - 1]) { parent[cur - 1] = cur; queue[tail++] = cur - 1; }
    if (r < MAP_H - 1 && parent[cur + MAP_W] < 0 && !solid[cur + MAP_W]) { parent[cur + MAP_W] = cur; queue[tail++] = cur + MAP_W; }
    if (r > 0 && parent[cur - MAP_W] < 0 && !solid[cur - MAP_W]) { parent[cur - MAP_W] = cur; queue[tail++] = cur - MAP_W; }
  }
  if (parent[g] < 0) return [];
  const path: Tile[] = [];
  for (let cur = g; cur !== s; cur = parent[cur]) path.push({ col: cur % MAP_W, row: Math.floor(cur / MAP_W) });
  return path.reverse();
}

/**
 * Whether the straight segment a→b (world px) crosses no solid tile. Walks every tile the
 * segment touches (grid DDA); the tiles holding the two end points are not tested.
 */
export function hasLineOfSight(grid: WalkGrid, a: Vec2, b: Vec2): boolean {
  let col = Math.floor(a.x / TILE), row = Math.floor(a.y / TILE);
  const endCol = Math.floor(b.x / TILE), endRow = Math.floor(b.y / TILE);
  const dx = b.x - a.x, dy = b.y - a.y;
  const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tMaxX = dx !== 0 ? ((stepC > 0 ? (col + 1) * TILE - a.x : a.x - col * TILE) / Math.abs(dx)) : Infinity;
  let tMaxY = dy !== 0 ? ((stepR > 0 ? (row + 1) * TILE - a.y : a.y - row * TILE) / Math.abs(dy)) : Infinity;
  let guard = MAP_W + MAP_H;
  while ((col !== endCol || row !== endRow) && guard-- > 0) {
    if (tMaxX < tMaxY) { col += stepC; tMaxX += tDeltaX; }
    else { row += stepR; tMaxY += tDeltaY; }
    if (col === endCol && row === endRow) break;
    if (grid.isSolid(col, row)) return false;
  }
  return true;
}

const VIS_RAYS = 720;
const VIS_STEP = 0.4;

/**
 * Tiles visible from the centre of (cx, cy) within `radius` tiles: 1 = visible. The first wall
 * a ray hits is visible too. Walls right next to the viewer don't block, so vision doesn't
 * collapse in one-tile doorways.
 */
export function computeVisibility(grid: WalkGrid, cx: number, cy: number, radius: number, out?: Uint8Array): Uint8Array {
  const vis = out ?? new Uint8Array(N);
  vis.fill(0);
  if (cx >= 0 && cy >= 0 && cx < MAP_W && cy < MAP_H) vis[cy * MAP_W + cx] = 1;
  const steps = radius * 2.5;
  for (let i = 0; i < VIS_RAYS; i++) {
    const angle = (i / VIS_RAYS) * Math.PI * 2;
    const dx = Math.cos(angle) * VIS_STEP, dy = Math.sin(angle) * VIS_STEP;
    let x = cx + 0.5, y = cy + 0.5;
    for (let d = 0; d < steps; d++) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) break;
      const idx = ty * MAP_W + tx;
      vis[idx] = 1;
      if (grid.solid[idx] && (Math.abs(tx - cx) > 1 || Math.abs(ty - cy) > 1)) break;
      x += dx; y += dy;
    }
  }
  return vis;
}
