// The AI villain with the brute kit (once the boss Желочь). Slow, but it never stops: it follows
// the scent trail of the nearest runner a few seconds behind and hears far, but sees little in the
// dark. When it sees you it roars (if it can) and rushes — faster than you walk — then has to
// catch its breath. It stops at the locker where your trail ends and may tear it open. The lamps
// around it stutter and die down: that is how you know it's near.
import { TILE } from "../core/constants";
import { dist, worldToTile } from "../core/geom";
import { BOSS_AI, NOISE } from "../data/balance";
import { KITS } from "../data/characters";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { HideSpot } from "../systems/hiding";
import { MonsterBrain, NOISE_INTEREST } from "./monster";
import { sees, type SightSpec } from "./senses";

type State = "stalk" | "rush" | "rest" | "investigate" | "check" | "stunned";

/** It follows the trail this many seconds behind the runner (closer than 6 tiles: `near`). */
const TRAIL_LAG = { far: 7, near: 2.5 };

export class BossAI extends MonsterBrain {
  state: State = "stalk";
  private target: Actor | null = null;
  private checkSpot: HideSpot | null = null;
  private triedSpots = new Map<HideSpot, number>();

  constructor(world: World, actor: Actor) { super(world, actor); }

  private spec(): SightSpec {
    const d = this.world.diff;
    return { fovHalf: BOSS_AI.fovHalf, range: Math.min(d.foxSight, BOSS_AI.sight) * TILE, dark: KITS.brute.darkSight * TILE, near: TILE * 1.6 };
  }

  update(dt: number): void {
    const w = this.world, a = this.actor;
    this.tick(dt);
    if (a.stunned > 0) { a.halt(); this.enter("stunned"); return; }
    if (this.state === "stunned") this.enter("stalk");

    let seen: Actor | null = null, bestD = Infinity;
    for (const r of w.runners()) {
      if (!sees(w, a, r, this.spec())) continue;
      const d = dist(a, r.authPos);
      if (d < bestD) { bestD = d; seen = r; }
    }
    for (const e of this.heard(w.diff.hearing * BOSS_AI.hearing)) this.notice(e.x, e.y, NOISE_INTEREST[e.kind] ?? 1, null);

    if (seen) {
      this.target = seen;
      if (this.state !== "rush" && this.state !== "rest") {
        this.enter("rush");
        if (!w.abilities.use(a)) w.noise.emit(a.x, a.y, NOISE.bossStep.radius + 3, "monster", a);
        if (w.local.inPlay && dist(w.local, a) < TILE * 12) w.shake(350, 0.012);
      }
    }

    switch (this.state) {
      case "rush": {
        const p = (seen ?? this.target)?.authPos;
        if (p) this.charge(p, "run", dt);
        if (this.stateT > BOSS_AI.rushTime) this.enter("rest");
        break;
      }
      case "rest": {
        const p = this.target?.authPos;
        if (p) this.charge(p, "sneak", dt); else a.halt();
        if (this.stateT > BOSS_AI.rushRest) this.enter(seen ? "rush" : "stalk");
        break;
      }
      case "investigate": {
        const c = this.clue!;
        if (this.phase === 0) { if (this.goTo(this.walkableNear(c), "walk", dt)) { this.phase = 1; this.waitT = 1.5; } }
        else { this.lookAround(dt, 1.4); if ((this.waitT -= dt) <= 0) this.enter("stalk"); }
        break;
      }
      case "check": this.check(dt); break;
      default: this.stalk(dt);
    }
  }

  /** Straight at the target when close, along a path otherwise. */
  private charge(p: { x: number; y: number }, gait: "run" | "sneak", dt: number): void {
    const a = this.actor;
    if (dist(a, p) < TILE * 1.2) { a.gait = gait; a.move(p.x - a.x, p.y - a.y, a.gaitSpeed()); }
    else this.goTo(worldToTile(p), gait, dt, 0.3);
    this.face(p, dt);
  }

  /** Follow the scent of the nearest runner, a few seconds behind them. */
  private stalk(dt: number): void {
    const w = this.world, a = this.actor;
    const c = this.clue;
    if (c && this.t - c.t < 0.05 && c.strength >= 2) { this.enter("investigate"); return; }
    let prey: Actor | null = null, bestD = Infinity;
    for (const r of w.runners()) {
      if (!r.inPlay) continue;
      const d = dist(a, r.authPos);
      if (d < bestD) { bestD = d; prey = r; }
    }
    if (!prey) { a.halt(); return; }
    const spot = prey.hiding ? w.hiding.spotOf(prey) : null;
    if (spot && dist(a, spot) < TILE * 1.8 && this.t - (this.triedSpots.get(spot) ?? -999) > 25) {
      // The trail ends at this locker.
      this.triedSpots.set(spot, this.t);
      if (w.rng.chance(0.55)) { this.checkSpot = spot; this.enter("check"); return; }
    }
    const mark = w.scent.pointAgo(prey, dist(a, prey.authPos) < TILE * 6 ? TRAIL_LAG.near : TRAIL_LAG.far) ?? prey.authPos;
    if (this.goTo(this.walkableNear(mark), "walk", dt, 1)) this.lookAround(dt, 1.2);
  }

  private check(dt: number): void {
    const w = this.world, a = this.actor, s = this.checkSpot;
    if (!s) { this.enter("stalk"); return; }
    if (this.phase === 0) {
      if (dist(a, s) > TILE * 1.1 && !this.goTo(this.walkableNear(s), "walk", dt, 0.4)) return;
      a.halt();
      w.hiding.check(s, a);
      this.phase = 1;
      this.waitT = 1.4;
      return;
    }
    a.halt();
    if ((this.waitT -= dt) <= 0) { this.checkSpot = null; this.enter("stalk"); }
  }
}
