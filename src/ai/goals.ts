// Where AI actors go: patrol targets, escape spots and runner objectives.
import { manhattan } from "../core/geom";
import type { Rng } from "../core/rng";
import type { Tile } from "../core/types";
import { distanceMap, distanceTo, type WalkGrid } from "../world/grid";
import { roomCenter, roomInteriorTiles, type LevelData } from "../world/level";

export interface GoalCandidate { tile: Tile; index: number; }
export type GoalKind = "exit" | "key" | "terminal" | "fuse" | "box";
export interface RunnerGoal extends GoalCandidate { kind: GoalKind; }

/** Stable name of a goal, for claims ("bot X is going for key 2"). */
export function goalKey(g: { kind: GoalKind; index: number }): string { return g.kind + ":" + g.index; }

/** A random room centre from the half of the map farther away from `from`. */
export function choosePatrolTile(rng: Rng, level: LevelData, from: Tile): Tile {
  const candidates = rng.shuffle(level.rooms).map(roomCenter).sort((a, b) => manhattan(b, from) - manhattan(a, from));
  const pool = candidates.slice(0, Math.max(3, Math.floor(candidates.length / 2)));
  return pool.length ? rng.pick(pool) : from;
}

/** A room tile far from every threat but not too far from `from`. */
export function chooseEscapeTile(rng: Rng, level: LevelData, from: Tile, threats: Tile[]): Tile {
  const sampled = rng.shuffle(level.rooms).slice(0, 8).flatMap(r => rng.shuffle(roomInteriorTiles(r)).slice(0, 4));
  let best = from, bestScore = -Infinity;
  for (const tile of sampled) {
    const nearest = threats.length ? Math.min(...threats.map(t => manhattan(tile, t))) : 0;
    const score = Math.min(nearest, 18) * 5 - manhattan(from, tile);
    if (score > bestScore) { bestScore = score; best = tile; }
  }
  return best;
}

export interface GoalOptions {
  /** The exit, once it is open. */
  exit: Tile | null;
  keys: GoalCandidate[];
  terminals: GoalCandidate[];
  fuses: GoalCandidate[];
  /** The fuse box, when carrying a fuse. */
  box: Tile | null;
}

/**
 * Nearest objective a runner can actually walk to, preferring ones nobody else has claimed:
 * the fuse box with a fuse in hand, the exit once it's open, otherwise a key or a fuse, otherwise
 * a terminal whose door guards a key.
 */
export function chooseRunnerGoal(grid: WalkGrid, from: Tile, o: GoalOptions, claimed: ReadonlySet<string> = new Set()): RunnerGoal | null {
  const dist = distanceMap(grid, from);
  const nearest = (cands: GoalCandidate[], kind: GoalKind, free: boolean): RunnerGoal | null => {
    let best: RunnerGoal | null = null, bestD = Infinity;
    for (const c of cands) {
      if (free && claimed.has(goalKey({ kind, index: c.index }))) continue;
      const d = distanceTo(dist, c.tile);
      if (d >= 0 && d < bestD) { bestD = d; best = { ...c, kind }; }
    }
    return best;
  };
  if (o.box) return nearest([{ tile: o.box, index: 0 }], "box", false);
  if (o.exit) return nearest([{ tile: o.exit, index: -1 }], "exit", false);
  const pick = (free: boolean) => {
    const k = nearest(o.keys, "key", free), f = nearest(o.fuses, "fuse", free);
    const kd = k ? distanceTo(dist, k.tile) : Infinity, fd = f ? distanceTo(dist, f.tile) : Infinity;
    return (kd <= fd ? k : f) ?? nearest(o.terminals, "terminal", free);
  };
  return pick(true) ?? pick(false);
}
