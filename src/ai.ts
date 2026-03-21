// ============================================================
//  ASSYLUM — ai.ts — Pathfinding & AI behaviours
// ============================================================
import {
  MAP_W, MAP_H, TILE, tileKey, sameTile, tileDist, clamp, shuffle, Tile, worldToTile,
} from "./config";
import { LevelData } from "./level";

// ── Raycasting visibility (fog of war) ───────────────────────
export function computeVisibility(rows: string[], cx: number, cy: number, radius: number): Set<string> {
  const visible = new Set<string>();
  visible.add(tileKey(cx, cy));
  // Mark player tile and immediate neighbors as passable for rays
  // This prevents vision from collapsing in doorways (1-tile openings)
  const nearPlayer = new Set<string>();
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      nearPlayer.add(tileKey(cx + dc, cy + dr));
  const NUM_RAYS = 720;
  for (let i = 0; i < NUM_RAYS; i++) {
    const angle = (i / NUM_RAYS) * Math.PI * 2;
    const dx = Math.cos(angle) * 0.4;
    const dy = Math.sin(angle) * 0.4;
    let x = cx + 0.5;
    let y = cy + 0.5;
    for (let d = 0; d < radius * 2.5; d++) {
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) break;
      visible.add(tileKey(tx, ty));
      if (rows[ty][tx] === "#" && !nearPlayer.has(tileKey(tx, ty))) break;
      x += dx; y += dy;
    }
  }
  return visible;
}

// ── Pathfinding (BFS) ────────────────────────────────────────
function getWalkableNeighbors(rows: string[], tile: Tile): Tile[] {
  return [
    { col: tile.col + 1, row: tile.row },
    { col: tile.col - 1, row: tile.row },
    { col: tile.col, row: tile.row + 1 },
    { col: tile.col, row: tile.row - 1 },
  ].filter(({ col, row }) =>
    row >= 0 && row < rows.length && col >= 0 && col < rows[0].length && rows[row][col] !== "#"
  );
}

export function findPath(rows: string[], start: Tile, goal: Tile): Tile[] {
  if (sameTile(start, goal)) return [];
  const queue: Tile[] = [start];
  const cameFrom = new Map<string, Tile | null>();
  cameFrom.set(tileKey(start.col, start.row), null);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (sameTile(cur, goal)) break;
    for (const next of getWalkableNeighbors(rows, cur)) {
      const k = tileKey(next.col, next.row);
      if (cameFrom.has(k)) continue;
      cameFrom.set(k, cur);
      queue.push(next);
    }
  }

  const gk = tileKey(goal.col, goal.row);
  if (!cameFrom.has(gk)) return [];

  const path: Tile[] = [];
  let cur: Tile | null = goal;
  while (cur && !sameTile(cur, start)) {
    path.unshift(cur);
    cur = cameFrom.get(tileKey(cur.col, cur.row)) ?? null;
  }
  return path;
}

// ── Helpers ──────────────────────────────────────────────────
function tileBlocked(rows: string[], col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= MAP_W || row >= MAP_H) return true;
  return rows[row][col] === "#";
}

export function hasLineOfSight(rows: string[], fromPos: { x: number; y: number }, toPos: { x: number; y: number }): boolean {
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(8, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = fromPos.x + dx * t;
    const py = fromPos.y + dy * t;
    const tc = clamp(Math.floor(px / TILE), 0, MAP_W - 1);
    const tr = clamp(Math.floor(py / TILE), 0, MAP_H - 1);
    if (tileBlocked(rows, tc, tr)) return false;
  }
  return true;
}

// ── Move an actor along its .path array ──────────────────────
export function moveAlongPath(actor: any, speed: number, delta: number) {
  if (!actor.path || actor.path.length === 0) {
    if (actor.body) actor.body.setVelocity(0, 0);
    return;
  }
  const next = actor.path[0];
  const target = { x: next.col * TILE + TILE / 2, y: next.row * TILE + TILE / 2 };
  const ax = actor.x;
  const ay = actor.y;
  const dx = target.x - ax;
  const dy = target.y - ay;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (!actor._prevX) { actor._prevX = ax; actor._prevY = ay; }
  const movedDist = Math.abs(ax - actor._prevX) + Math.abs(ay - actor._prevY);
  actor._prevX = ax; actor._prevY = ay;

  if (len < 4) {
    actor.path.shift();
    actor._stuckT = 0;
    if (actor.body) actor.body.setVelocity(0, 0);
    return;
  }

  const frameDt = delta || 0.016;
  actor._stuckT = (movedDist < 0.15) ? (actor._stuckT || 0) + frameDt : 0;
  if (actor._stuckT > 0.2) {
    // Try skipping waypoints before abandoning path
    if (actor.path.length > 1) {
      actor.path.shift();
      actor._stuckT = 0;
      // Nudge actor perpendicular to direction to unstick from corners
      if (actor.body) {
        const nudge = 3;
        actor.body.x += (Math.random() - 0.5) * nudge;
        actor.body.y += (Math.random() - 0.5) * nudge;
      }
      return;
    }
    actor.path = [];
    actor.pathTimer = 0;
    actor._stuckT = 0;
    if (actor.body) actor.body.setVelocity(0, 0);
    return;
  }

  const ux = dx / len, uy = dy / len;
  if (actor.body) actor.body.setVelocity(ux * speed, uy * speed);
}

// ── AI tile-choice helpers ───────────────────────────────────
function roomCenter(room: { x: number; y: number; w: number; h: number }): Tile {
  return { col: Math.floor(room.x + room.w / 2), row: Math.floor(room.y + room.h / 2) };
}

function roomInteriorTiles(room: { x: number; y: number; w: number; h: number }): Tile[] {
  const tiles: Tile[] = [];
  for (let r = room.y + 1; r < room.y + room.h - 1; r++)
    for (let c = room.x + 1; c < room.x + room.w - 1; c++)
      tiles.push({ col: c, row: r });
  return tiles;
}

export function choosePatrolTile(level: LevelData, fromTile: Tile): Tile {
  const candidates = shuffle(level.rooms)
    .map(r => roomCenter(r))
    .sort((a, b) => tileDist(b, fromTile) - tileDist(a, fromTile));
  const pool = candidates.slice(0, Math.max(3, Math.floor(candidates.length / 2)));
  return pool[Math.floor(Math.random() * pool.length)] || fromTile;
}

export function chooseEscapeTile(level: LevelData, fromTile: Tile, threats: Tile[]): Tile {
  const sampled = shuffle(level.rooms).slice(0, 6)
    .flatMap(r => shuffle(roomInteriorTiles(r)).slice(0, 4));
  const pool = sampled.length > 0 ? sampled : [fromTile];
  let best = fromTile, bestScore = -Infinity;
  for (const tile of pool) {
    const nearest = Math.min(...threats.map(t => tileDist(tile, t)));
    const score = nearest * 5 - tileDist(fromTile, tile);
    if (score > bestScore) { bestScore = score; best = tile; }
  }
  return best;
}

export function chooseSearchTile(level: LevelData, fromTile: Tile, focusTile: Tile): Tile {
  const candidates = shuffle(level.rooms)
    .flatMap(r => shuffle(roomInteriorTiles(r)).slice(0, 5))
    .sort((a, b) => tileDist(a, focusTile) - tileDist(b, focusTile));
  return candidates.find(t => tileDist(t, fromTile) < 60) || focusTile || fromTile;
}

export function chooseObjectiveTile(level: LevelData, fromTile: Tile, keyObjects: any[], exitLocked: boolean): Tile | null {
  if (!exitLocked) return level.exitTile;
  const active = keyObjects
    .filter((k: any) => k.active !== false)
    .map((k: any) => worldToTile(k));
  let best: Tile | null = null, bestDist = Infinity;
  for (const kt of active) {
    const d = tileDist(fromTile, kt);
    if (d < bestDist) { bestDist = d; best = kt; }
  }
  return best;
}
