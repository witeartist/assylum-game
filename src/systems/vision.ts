// What the local viewer (player or spectated runner) sees. The canon: darkness hides everyone.
// You see a character only in your line of sight AND where it is lit — a lamp, a beam, a glow —
// or right next to you. Someone walking behind you in the dark stays invisible; their flashlight
// or footsteps may give them away. Standing objects show only while the floor under them is in
// sight: a tall locker behind a wall doesn't peek over it.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import { DARK_SIGHT } from "../data/balance";
import { KITS } from "../data/characters";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

/** A standing object and the floor points it shows from (World.addProp); `casts`: it throws a shadow. */
export interface StandingProp { sprite: Phaser.GameObjects.Image; at: Vec2[]; fade: number; casts: boolean; }

export class Vision {
  viewer: Actor;
  /** Screenshots: everything shows, in sight or not. Never in play. */
  photo = false;

  constructor(private world: World) {
    this.viewer = world.local;
  }

  /** How far lamp-lit places stay visible, world px. */
  get sightRange(): number {
    const w = this.world;
    return (w.local.kit === "fox" ? Math.max(w.diff.sight, w.diff.foxSight) : w.diff.sight) * TILE;
  }

  /** How far the viewer makes out unlit things, world px. */
  darkSight(target?: Actor): number {
    const hunter = this.viewer.role === "hunter";
    const base = (this.viewer.kit ? KITS[this.viewer.kit].darkSight : DARK_SIGHT.runner) * TILE;
    return hunter && target ? base * (target.def.ability?.darkStealth ?? 1) : base;
  }

  update(dt: number): void {
    const w = this.world;
    this.viewer = w.round.spectateTarget() ?? w.local;
    for (const a of w.actors) {
      a.seen = a === this.viewer || (a === w.local && !w.round.localDone) || this.canSee(a);
      a.updateFade(dt);
    }
    const v = this.viewer, range = this.sightRange * 1.3;
    for (const p of w.props) {
      const seen = this.photo || p.at.some(q => dist(v, q) <= range && hasLineOfSight(w.sight, v, q));
      const target = seen ? 1 : 0;
      if (p.fade === target) continue;
      p.fade += (target - p.fade) * Math.min(1, dt * (seen ? 14 : 8));
      if (Math.abs(p.fade - target) < 0.02) p.fade = target;
      p.sprite.setAlpha(p.fade);
    }
  }

  /** Can the viewer see this actor right now? */
  canSee(a: Actor): boolean {
    if (!a.inPlay || a.hiding) return false;
    if (this.photo) return true;
    const v = this.viewer, d = dist(v, a);
    if (d > this.sightRange * 1.3 || !hasLineOfSight(this.world.sight, v, a)) return false;
    if (d <= this.darkSight(a)) return true;
    return a.beamOn || this.world.lighting.isLit(a);
  }

  /** Can the viewer see this spot? `glows`: the thing lights itself (terminals, keys). */
  canSeePoint(p: Vec2, glows = false): boolean {
    const v = this.viewer, d = dist(v, p);
    if (d > this.sightRange * 1.3 || !hasLineOfSight(this.world.sight, v, p)) return false;
    return glows || d <= this.darkSight() || this.world.lighting.isLit(p);
  }
}
