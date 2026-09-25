// What the hunter and the boss have in common: a clock, walking somewhere, looking around,
// listening to new noises, a heat map of where runners were noticed, and searching hiding spots.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import { dist, sameTile, tileCenter, tileIndex, worldToTile } from "../core/geom";
import type { Tile, Vec2 } from "../core/types";
import { turnTowards, type Actor, type Brain } from "../entities/Actor";
import type { Gait } from "../entities/state";
import type { World } from "../game/World";
import type { NoiseEvent, NoiseKind } from "../systems/noise";
import type { HideSpot } from "../systems/hiding";
import { findPath } from "../world/grid";

/** How much a sound makes a monster want to go and look. */
export const NOISE_INTEREST: Partial<Record<NoiseKind, number>> = {
  step: 0.8, run: 1.5, breath: 3, gasp: 3, locker: 2.2, glass: 2, alarm: 2.6, whistle: 2.6, fuse: 2.2, door: 1.2,
};

export interface Clue extends Vec2 { t: number; strength: number; spot: HideSpot | null; }

export abstract class MonsterBrain implements Brain {
  abstract state: string;
  protected t = 0;
  protected stateT = 0;
  /** Step within the current state (0 = on the way, 1 = arrived…). */
  protected phase = 0;
  protected waitT = 0;
  protected clue: Clue | null = null;
  protected readonly heat = new Float32Array(MAP_W * MAP_H);
  private lastNoise: number;
  private dest: Tile | null = null;
  private lookT = 0;
  private lookBase = 0;
  private heatT = 0;

  constructor(protected world: World, protected actor: Actor) {
    this.lastNoise = world.noise.lastId;
  }

  abstract update(dt: number): void;

  protected tick(dt: number): void {
    this.t += dt;
    this.stateT += dt;
    this.heatT += dt;
    if (this.heatT >= 1) {
      this.heatT = 0;
      for (let i = 0; i < this.heat.length; i++) this.heat[i] *= 0.95;
    }
  }

  protected enter(state: string): void {
    if (this.state === state) return;
    this.state = state;
    this.stateT = 0;
    this.phase = 0;
    this.waitT = 0;
    this.lookT = 0;
    this.dest = null;
    this.actor.path = [];
  }

  /** Walk (or run) to `dest`, re-planning every `every` seconds. True once there. */
  protected goTo(dest: Tile, gait: Gait, dt: number, every = 0.6): boolean {
    const a = this.actor, here = worldToTile(a);
    if (sameTile(here, dest) && dist(a, tileCenter(dest)) < TILE * 0.4) { a.halt(); a.path = []; return true; }
    a.pathTimer -= dt;
    if (!this.dest || !sameTile(this.dest, dest) || a.path.length === 0 || a.pathTimer <= 0) {
      this.dest = dest;
      a.path = findPath(this.world.grid, here, dest);
      a.pathTimer = every;
      if (a.path.length === 0 && !sameTile(here, dest)) { a.halt(); return true; }
    }
    a.gait = gait;
    if (!this.world.gates.aiPass(a, dt)) a.followPath(a.gaitSpeed(), dt);
    return false;
  }

  /** Stand still and sweep the gaze left and right. */
  protected lookAround(dt: number, speed = 2.2): void {
    const a = this.actor;
    a.halt();
    if (this.lookT === 0) this.lookBase = a.facing;
    this.lookT += dt;
    a.facing = this.lookBase + Math.sin(this.lookT * speed) * 1.4;
  }

  protected face(p: Vec2, dt: number): void {
    this.actor.facing = turnTowards(this.actor.facing, Math.atan2(p.y - this.actor.y, p.x - this.actor.x), dt * 8);
  }

  /** New runner noises this monster can hear. */
  protected heard(mult: number): NoiseEvent[] {
    const w = this.world;
    const out = w.noise.since(this.lastNoise).filter(e => (!e.source || e.source.role === "runner") && w.noise.hears(this.actor, e, mult));
    this.lastNoise = w.noise.lastId;
    return out;
  }

  /** Something worth a look at (x, y); a stronger clue replaces a weaker, fresher one. */
  protected notice(x: number, y: number, strength: number, spot: HideSpot | null): void {
    const c = this.clue;
    if (c && this.t - c.t < 2 && c.strength > strength) return;
    this.clue = { x, y, t: this.t, strength, spot };
  }

  protected warm(p: Vec2, amount: number): void {
    const t = worldToTile(p);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const c = t.col + dc, r = t.row + dr;
      if (c >= 0 && r >= 0 && c < MAP_W && r < MAP_H) this.heat[tileIndex(c, r)] += amount * (dc === 0 && dr === 0 ? 1 : 0.5);
    }
  }

  /** The hiding spot right at a noise (someone breathing inside it). */
  protected spotAt(p: Vec2): HideSpot | null {
    let best: HideSpot | null = null, bestD = TILE * 1.2;
    for (const s of this.world.hiding.spots) { const d = dist(s, p); if (d < bestD) { bestD = d; best = s; } }
    return best;
  }

  /** A walkable tile at (or near) `p`. */
  protected walkableNear(p: Vec2): Tile {
    const t = worldToTile(p), g = this.world.grid;
    if (!g.isSolid(t.col, t.row)) return t;
    for (let r = 1; r <= 3; r++)
      for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++)
        if (!g.isSolid(t.col + dc, t.row + dr)) return { col: t.col + dc, row: t.row + dr };
    return worldToTile(this.actor);
  }

  /** A random walkable tile within `radius` tiles of `p` that can be reached. */
  protected wanderNear(p: Vec2, radius: number): Tile {
    const w = this.world, c = worldToTile(p);
    for (let i = 0; i < 12; i++) {
      const t = { col: c.col + w.rng.int(-radius, radius), row: c.row + w.rng.int(-radius, radius) };
      if (!w.grid.isSolid(t.col, t.row) && findPath(w.grid, worldToTile(this.actor), t).length > 0) return t;
    }
    return this.walkableNear(p);
  }
}
