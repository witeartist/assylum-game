// ============================================================
//  ASSYLUM — worker.ts — Web Worker for pathfinding & visibility
// ============================================================

let mapRows: string[] | null = null;
let MAP_W = 80;
let MAP_H = 50;

interface Tile { col: number; row: number; }

function tileKey(c: number, r: number): string { return `${c},${r}`; }
function sameTile(a: Tile, b: Tile): boolean { return a.col === b.col && a.row === b.row; }

function computeVisibility(rows: string[], cx: number, cy: number, radius: number): Set<string> {
  const visible = new Set<string>();
  visible.add(tileKey(cx, cy));
  const nearPlayer = new Set<string>();
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      nearPlayer.add(tileKey(cx + dc, cy + dr));
  const NUM_RAYS = 480;
  const step = 0.5;
  const maxD = radius * 2.5;
  for (let i = 0; i < NUM_RAYS; i++) {
    const angle = (i / NUM_RAYS) * 6.283185307;
    const dx = Math.cos(angle) * step;
    const dy = Math.sin(angle) * step;
    let x = cx + 0.5;
    let y = cy + 0.5;
    for (let d = 0; d < maxD; d++) {
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) break;
      visible.add(tileKey(tx, ty));
      if (rows[ty][tx] === "#" && !nearPlayer.has(tileKey(tx, ty))) break;
      x += dx;
      y += dy;
    }
  }
  return visible;
}

function findPath(rows: string[], start: Tile, goal: Tile): Tile[] {
  if (sameTile(start, goal)) return [];
  const queue: Tile[] = [start];
  const cameFrom = new Map<string, Tile | null>();
  cameFrom.set(tileKey(start.col, start.row), null);

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (sameTile(cur, goal)) break;
    const neighbors: Tile[] = [
      { col: cur.col + 1, row: cur.row },
      { col: cur.col - 1, row: cur.row },
      { col: cur.col, row: cur.row + 1 },
      { col: cur.col, row: cur.row - 1 },
    ];
    for (const next of neighbors) {
      if (next.row < 0 || next.row >= rows.length || next.col < 0 || next.col >= rows[0].length) continue;
      if (rows[next.row][next.col] === "#") continue;
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

// ── Message handler ──────────────────────────────────────────
const ctx = self as unknown as Worker;
ctx.onmessage = function(e: MessageEvent) {
  const msg = e.data;

  if (msg.type === "init") {
    mapRows = msg.rows;
    MAP_W = msg.mapW;
    MAP_H = msg.mapH;
    ctx.postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "updateRows") {
    if (msg.row !== undefined && msg.data !== undefined) {
      mapRows![msg.row] = msg.data;
    } else if (msg.rows) {
      mapRows = msg.rows;
    }
    return;
  }

  if (msg.type === "visibility") {
    const visible = computeVisibility(mapRows!, msg.cx, msg.cy, msg.radius);
    ctx.postMessage({ type: "visibility", id: msg.id, visible: Array.from(visible) });
    return;
  }

  if (msg.type === "pathfind") {
    const path = findPath(mapRows!, msg.start, msg.goal);
    ctx.postMessage({ type: "pathfind", id: msg.id, path });
    return;
  }

  if (msg.type === "batchPathfind") {
    const results = msg.requests.map((req: any) => ({
      id: req.id,
      path: findPath(mapRows!, req.start, req.goal),
    }));
    ctx.postMessage({ type: "batchPathfind", results });
    return;
  }
};
