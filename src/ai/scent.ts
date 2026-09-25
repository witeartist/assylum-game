// Runners leave a scent: where they were over the last half minute. The brute follows it, a few
// seconds behind — it always finds you in the end, unless you break the trail. A brute player
// sees the fresh trails around it (ui/worldOverlay.ts).
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";

interface Mark extends Vec2 { t: number; }

/** A point of a trail, and how long ago the runner was there, seconds. */
export interface ScentMark extends Vec2 { age: number; }

const EVERY = 0.5;
const KEEP = 40;

export class Scent {
  private trails = new Map<Actor, Mark[]>();
  private t = 0;
  private acc = 0;

  constructor(private world: World) {}

  update(dt: number): void {
    this.t += dt;
    this.acc += dt;
    if (this.acc < EVERY) return;
    this.acc = 0;
    for (const r of this.world.runners()) {
      if (!r.inPlay) { this.trails.delete(r); continue; }
      const trail = this.trails.get(r) ?? [];
      const p = r.authPos, last = trail[trail.length - 1];
      if (!last || dist(last, p) > 4) trail.push({ x: p.x, y: p.y, t: this.t });
      else last.t = this.t;
      while (trail.length && this.t - trail[0].t > KEEP) trail.shift();
      this.trails.set(r, trail);
    }
  }

  /** Where runner `a` was about `ago` seconds ago (the oldest mark if the trail is shorter). */
  pointAgo(a: Actor, ago: number): Vec2 | null {
    const trail = this.trails.get(a);
    if (!trail || trail.length === 0) return null;
    for (let i = trail.length - 1; i >= 0; i--) if (this.t - trail[i].t >= ago) return trail[i];
    return trail[0];
  }

  /** Every runner's trail within `range` of `p`, marks at most `maxAge` seconds old. */
  near(p: Vec2, range: number, maxAge: number): ScentMark[] {
    const out: ScentMark[] = [];
    for (const trail of this.trails.values()) {
      for (const m of trail) {
        const age = this.t - m.t;
        if (age <= maxAge && dist(m, p) <= range) out.push({ x: m.x, y: m.y, age });
      }
    }
    return out;
  }

  /** Seconds since runner `a` was last at a place (0 = here now). */
  freshness(a: Actor): number {
    const trail = this.trails.get(a);
    return trail?.length ? this.t - trail[trail.length - 1].t : Infinity;
  }
}
