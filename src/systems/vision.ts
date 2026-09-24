// What the local viewer (player or spectated runner) sees. The canon: darkness hides everyone.
// You see a character only in your line of sight AND where it is lit — a lamp, a beam, a glow —
// or right next to you. Someone walking behind you in the dark stays invisible; their flashlight
// or footsteps may give them away.
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import { DARK_SIGHT } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

export class Vision {
  viewer: Actor;

  constructor(private world: World) {
    this.viewer = world.local;
  }

  /** How far lamp-lit places stay visible, world px. */
  get sightRange(): number {
    const w = this.world;
    return (w.local.role === "hunter" ? Math.max(w.diff.sight, w.diff.foxSight) : w.diff.sight) * TILE;
  }

  /** How far the viewer makes out unlit things, world px. */
  darkSight(target?: Actor): number {
    const hunter = this.viewer.role === "hunter";
    const base = (hunter ? DARK_SIGHT.hunter : DARK_SIGHT.runner) * TILE;
    return hunter && target ? base * (target.def.ability?.darkStealth ?? 1) : base;
  }

  update(dt: number): void {
    const w = this.world;
    this.viewer = w.round.spectateTarget() ?? w.local;
    for (const a of w.actors) {
      a.seen = a === this.viewer || (a === w.local && !w.round.localDone) || this.canSee(a);
      a.updateFade(dt);
    }
  }

  /** Can the viewer see this actor right now? */
  canSee(a: Actor): boolean {
    if (!a.inPlay || a.hiding) return false;
    const v = this.viewer, d = dist(v, a);
    if (d > this.sightRange * 1.3 || !hasLineOfSight(this.world.sight, v, a)) return false;
    if (d <= this.darkSight(a)) return true;
    return a.flashlight.on || this.world.lighting.isLit(a);
  }

  /** Can the viewer see this spot? `glows`: the thing lights itself (terminals, keys). */
  canSeePoint(p: Vec2, glows = false): boolean {
    const v = this.viewer, d = dist(v, p);
    if (d > this.sightRange * 1.3 || !hasLineOfSight(this.world.sight, v, p)) return false;
    return glows || d <= this.darkSight() || this.world.lighting.isLit(p);
  }
}
