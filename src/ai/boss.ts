// Boss (Желочь): slow, sees further than the hunter, goes straight for the nearest runner.
import { TILE } from "../core/constants";
import { dist, worldToTile } from "../core/geom";
import type { Vec2 } from "../core/types";
import { BOSS_SIGHT_BONUS } from "../data/balance";
import type { Actor, Brain } from "../entities/Actor";
import type { World } from "../game/World";
import { findPath } from "../world/grid";
import { chooseFarRoom } from "./goals";
import { canSee } from "./perception";

export class BossAI implements Brain {
  state: "hunt" | "roam" = "roam";

  constructor(private world: World, private actor: Actor) {}

  update(dt: number): void {
    const w = this.world, a = this.actor;
    const range = (w.diff.foxSight + BOSS_SIGHT_BONUS) * TILE;
    let target: Vec2 | null = null, bestD = Infinity;
    for (const r of w.runners()) {
      if (!r.inPlay || r.hiding) continue;
      const p = r.authPos, d = dist(a, p);
      if (d < bestD && canSee(w, a, p, range)) { bestD = d; target = p; }
    }
    this.state = target ? "hunt" : "roam";

    a.pathTimer -= dt;
    if (a.pathTimer <= 0 || a.path.length === 0) {
      const from = worldToTile(a);
      if (target) {
        a.path = findPath(w.grid, from, worldToTile(target));
        a.pathTimer = 0.4;
      } else {
        a.path = findPath(w.grid, from, chooseFarRoom(w.rng, w.level, from, 8));
        a.pathTimer = w.rng.range(2, 3);
      }
    }
    a.followPath(a.speed, dt);
  }
}
