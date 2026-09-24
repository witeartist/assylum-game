// What the local viewer (player or spectated runner) can see: tile field of view, and which
// actors are drawn.
import { MAP_W, MAP_H } from "../core/constants";
import { tileIndex, worldToTile } from "../core/geom";
import type { Vec2 } from "../core/types";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { computeVisibility } from "../world/grid";

export class Vision {
  readonly mask = new Uint8Array(MAP_W * MAP_H);
  /** Tiles the local player has ever seen (the map "memory"). */
  readonly explored = new Uint8Array(MAP_W * MAP_H);
  /** Bumped whenever mask/explored change (the renderer re-uploads them). */
  version = 0;
  viewer: Actor;
  private lastIdx = -1;

  constructor(private world: World) {
    this.viewer = world.local;
    world.events.on("doorOpened", () => { this.lastIdx = -1; });
  }

  /** View distance in tiles (the hunter sees further). */
  get radius(): number {
    return this.world.local.role === "hunter" ? this.world.diff.foxSight : this.world.diff.sight;
  }

  update(): void {
    const w = this.world;
    this.viewer = w.round.spectateTarget() ?? w.local;
    const t = worldToTile(this.viewer);
    const idx = tileIndex(t.col, t.row);
    if (idx !== this.lastIdx) {
      computeVisibility(w.grid, t.col, t.row, this.radius, this.mask);
      for (let i = 0; i < this.mask.length; i++) if (this.mask[i]) this.explored[i] = 1;
      this.lastIdx = idx;
      this.version++;
    }
    for (const a of w.actors) {
      if (a === w.local) continue;
      a.seen = this.isVisible(a);
      a.refreshVisibility();
    }
  }

  isVisible(p: Vec2): boolean {
    const t = worldToTile(p);
    return this.mask[tileIndex(t.col, t.row)] === 1;
  }
}
