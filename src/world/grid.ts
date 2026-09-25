// The one implementation of grid queries — walkability, BFS distances, paths, line of sight
// and field of view. Level generation, AI, vision and lighting all use these functions.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import type { Tile, Vec2 } from "../core/types";
import { THIN, crossesThin } from "./walls";

const N = MAP_W * MAP_H;

/** Walls and closed doors of the map as a flat solid/free array. */
export class WalkGrid {
  readonly solid: Uint8Array;
  /** Bumped on every change, so caches (e.g. GPU copies) know when to refresh. */
  version = 0;
  /** What a solid tile covers (walls.ts shape codes): null or 0 = the whole tile. Sight uses it. */
  shape: Uint8Array | null = null;

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
    this.version++;
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
 * Cheapest 4-way path where stepping onto tile i costs 1 + extra[i] (e.g. danger near a monster);
 * same result format as findPath. Dijkstra over a binary heap.
 */
export function findPathWeighted(grid: WalkGrid, start: Tile, goal: Tile, extra: Float32Array): Tile[] {
  const s = start.row * MAP_W + start.col, g = goal.row * MAP_W + goal.col;
  if (s === g || grid.solid[g]) return [];
  const cost = new Float32Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const heap: number[] = [];
  const hc: number[] = [];
  const push = (i: number, c: number) => {
    heap.push(i); hc.push(c);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hc[p] <= hc[k]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]]; [hc[p], hc[k]] = [hc[k], hc[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const li = heap.pop()!, lc = hc.pop()!;
    if (heap.length > 0) {
      heap[0] = li; hc[0] = lc;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < heap.length && hc[l] < hc[m]) m = l;
        if (r < heap.length && hc[r] < hc[m]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; [hc[m], hc[k]] = [hc[k], hc[m]];
        k = m;
      }
    }
    return top;
  };
  cost[s] = 0;
  parent[s] = s;
  push(s, 0);
  const solid = grid.solid;
  while (heap.length) {
    const cur = pop();
    if (cur === g) break;
    const c = cur % MAP_W;
    const base = cost[cur];
    for (const n of [c < MAP_W - 1 ? cur + 1 : -1, c > 0 ? cur - 1 : -1, cur + MAP_W < N ? cur + MAP_W : -1, cur - MAP_W]) {
      if (n < 0 || solid[n]) continue;
      const nc = base + 1 + extra[n];
      if (nc < cost[n]) { cost[n] = nc; parent[n] = cur; push(n, nc); }
    }
  }
  if (parent[g] < 0) return [];
  const path: Tile[] = [];
  for (let cur = g; cur !== s; cur = parent[cur]) path.push({ col: cur % MAP_W, row: Math.floor(cur / MAP_W) });
  return path.reverse();
}

/**
 * Whether the straight segment a→b (world px) crosses no wall. Walks every tile the segment
 * touches (grid DDA). A whole solid tile blocks; a thin wall blocks only if the segment crosses its
 * band. The tiles holding the two end points count only with thin walls (a point beside a
 * partition, in its tile, still can't see through it).
 */
export function hasLineOfSight(grid: WalkGrid, a: Vec2, b: Vec2): boolean {
  let col = Math.floor(a.x / TILE), row = Math.floor(a.y / TILE);
  const endCol = Math.floor(b.x / TILE), endRow = Math.floor(b.y / TILE);
  const shape = grid.shape;
  /** Shape of solid tile (c, r): 0 = whole. */
  const shapeAt = (c: number, r: number) => shape && c >= 0 && r >= 0 && c < MAP_W && r < MAP_H ? shape[r * MAP_W + c] : 0;
  const thinBlocks = (c: number, r: number) => {
    const code = grid.isSolid(c, r) ? shapeAt(c, r) : 0;
    return code >= THIN && crossesThin(code, c, r, a, b);
  };
  if (shape && (thinBlocks(col, row) || ((col !== endCol || row !== endRow) && thinBlocks(endCol, endRow)))) return false;
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
    if (!grid.isSolid(col, row)) continue;
    const code = shapeAt(col, row);
    if (code < THIN || crossesThin(code, col, row, a, b)) return false;
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
