// AI hunter (Foxmind): chases runners it can see, searches where it last saw them, patrols
// otherwise; checks hiding spots around it and uses its flash.
import { TILE } from "../core/constants";
import { dist, manhattan, worldToTile } from "../core/geom";
import type { Tile, Vec2 } from "../core/types";
import { HUNTER_MEMORY, HUNTER_SEARCH_INTERVAL, HUNTER_SEARCH_RANGE } from "../data/balance";
import type { Actor, Brain } from "../entities/Actor";
import type { World } from "../game/World";
import { findPath } from "../world/grid";
import { chooseFarRoom, choosePatrolTile, chooseSearchTile } from "./goals";
import { canSee } from "./perception";

type State = "patrol" | "chase" | "search";

export class HunterAI implements Brain {
  state: State = "patrol";
  private memoryTile: Tile;
  private memoryTime = 0;
  private searchT = HUNTER_SEARCH_INTERVAL;

  constructor(private world: World, private actor: Actor) {
    this.memoryTile = worldToTile(actor);
  }

  update(dt: number): void {
    const w = this.world, a = this.actor;
    const range = w.diff.foxSight * TILE;

    // Runners in view. Players in the dark with the flashlight off are invisible;
    // players are preferred over bots.
    let target: Vec2 | null = null, bestPri = Infinity, bestD = Infinity;
    for (const r of w.runners()) {
      if (!r.inPlay || r.hiding) continue;
      const isBot = r.control === "bot";
      if (!isBot && !w.lighting.isExposed(r)) continue;
      const p = r.authPos;
      if (!canSee(w, a, p, range)) continue;
      const pri = isBot ? 1 : 0, d = dist(a, p);
      if (pri < bestPri || (pri === bestPri && d < bestD)) { bestPri = pri; bestD = d; target = p; }
    }

    if (target) {
      this.state = "chase";
      this.memoryTile = worldToTile(target);
      this.memoryTime = HUNTER_MEMORY;
    } else if (this.memoryTime > 0) {
      this.memoryTime -= dt;
      this.state = "search";
    } else {
      this.state = "patrol";
    }

    a.pathTimer -= dt;
    if (a.pathTimer <= 0 || a.path.length === 0) {
      const from = worldToTile(a);
      if (target) {
        a.path = findPath(w.grid, from, worldToTile(target));
        a.pathTimer = 0.35;
      } else if (this.memoryTime > 0) {
        a.path = findPath(w.grid, from, chooseSearchTile(w.rng, w.level, from, this.memoryTile));
        a.pathTimer = 0.7;
      } else {
        let dest = choosePatrolTile(w.rng, w.level, from);
        if (manhattan(dest, from) < 4) dest = chooseFarRoom(w.rng, w.level, from, 10);
        a.path = findPath(w.grid, from, dest);
        a.pathTimer = w.rng.range(2, 3.5);
      }
    }
    a.followPath(a.speed, dt);

    this.searchT -= dt;
    if (this.searchT <= 0) {
      this.searchT = HUNTER_SEARCH_INTERVAL;
      for (const r of w.hiding.hiddenNear(a, HUNTER_SEARCH_RANGE)) {
        if (r === w.local) w.toast("ВАС НАШЛИ!", "bad");
        w.round.catchRunner(r, a.def.name);
      }
    }

    if (w.foxFlash.ready) w.foxFlash.trigger(a);
  }
}
