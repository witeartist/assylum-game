import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

/** `to` is within `range` px of `from` and not behind a wall. */
export function canSee(world: World, from: Vec2, to: Vec2, range: number): boolean {
  return dist(from, to) < range && hasLineOfSight(world.grid, from, to);
}
