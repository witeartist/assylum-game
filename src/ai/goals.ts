// Where AI actors go: patrol targets, escape spots, search spots and runner objectives.
import { manhattan } from "../core/geom";
import type { Rng } from "../core/rng";
import type { Tile } from "../core/types";
import { distanceMap, distanceTo, type WalkGrid } from "../world/grid";
import { roomCenter, roomInteriorTiles, type LevelData } from "../world/level";

export interface GoalCandidate { tile: Tile; index: number; }
export interface RunnerGoal extends GoalCandidate { kind: "exit" | "key" | "terminal"; }

/** A random room centre from the half of the map farther away from `from`. */
export function choosePatrolTile(rng: Rng, level: LevelData, from: Tile): Tile {
  const candidates = rng.shuffle(level.rooms).map(roomCenter).sort((a, b) => manhattan(b, from) - manhattan(a, from));
  const pool = candidates.slice(0, Math.max(3, Math.floor(candidates.length / 2)));
  return pool.length ? rng.pick(pool) : from;
}

/** A random room centre at least `minDist` tiles away, or a patrol tile if none is that far. */
export function chooseFarRoom(rng: Rng, level: LevelData, from: Tile, minDist: number): Tile {
  const far = level.rooms.map(roomCenter).filter(t => manhattan(t, from) > minDist);
  return far.length ? rng.pick(far) : choosePatrolTile(rng, level, from);
}

/** A room tile far from every threat but not too far from `from`. */
export function chooseEscapeTile(rng: Rng, level: LevelData, from: Tile, threats: Tile[]): Tile {
  const sampled = rng.shuffle(level.rooms).slice(0, 6).flatMap(r => rng.shuffle(roomInteriorTiles(r)).slice(0, 4));
  let best = from, bestScore = -Infinity;
  for (const tile of sampled) {
    const nearest = threats.length ? Math.min(...threats.map(t => manhattan(tile, t))) : 0;
    const score = nearest * 5 - manhattan(from, tile);
    if (score > bestScore) { bestScore = score; best = tile; }
  }
  return best;
}

/** A room tile close to where the target was last seen. */
export function chooseSearchTile(rng: Rng, level: LevelData, from: Tile, focus: Tile): Tile {
  const candidates = rng.shuffle(level.rooms)
    .flatMap(r => rng.shuffle(roomInteriorTiles(r)).slice(0, 5))
    .sort((a, b) => manhattan(a, focus) - manhattan(b, focus));
  return candidates.find(t => manhattan(t, from) < 60) || focus;
}

/**
 * Nearest objective a runner bot can actually walk to: the exit once it is open,
 * otherwise a key, otherwise a terminal whose door guards a key.
 */
export function chooseRunnerGoal(
  grid: WalkGrid, from: Tile, exit: Tile | null, keys: GoalCandidate[], terminals: GoalCandidate[],
): RunnerGoal | null {
  const dist = distanceMap(grid, from);
  const nearest = (cands: GoalCandidate[], kind: RunnerGoal["kind"]): RunnerGoal | null => {
    let best: RunnerGoal | null = null, bestD = Infinity;
    for (const c of cands) {
      const d = distanceTo(dist, c.tile);
      if (d >= 0 && d < bestD) { bestD = d; best = { ...c, kind }; }
    }
    return best;
  };
  if (exit) return nearest([{ tile: exit, index: -1 }], "exit");
  return nearest(keys, "key") || nearest(terminals, "terminal");
}
