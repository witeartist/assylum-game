// Footstep noise. Every moving actor leaves ripples that show through the darkness; running
// is louder than walking, sneaking is silent. (Stage 3: the hunter will hear them too.)
import { FOOTSTEPS } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";

export interface Ripple { x: number; y: number; age: number; life: number; radius: number; }

export class Noise {
  readonly ripples: Ripple[] = [];
  private stepT = new Map<Actor, number>();

  constructor(private world: World) {}

  update(dt: number): void {
    for (const a of this.world.actors) {
      if (!a.inPlay || a.hiding) { this.stepT.delete(a); continue; }
      const v = a.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed < FOOTSTEPS.minSpeed) { this.stepT.set(a, 0); continue; }
      const step = speed >= FOOTSTEPS.runSpeed ? FOOTSTEPS.run : FOOTSTEPS.walk;
      let t = (this.stepT.get(a) ?? 0) + dt;
      if (t >= step.interval) {
        t -= step.interval;
        this.ripples.push({ x: a.x, y: a.y, age: 0, life: step.life, radius: step.radius });
      }
      this.stepT.set(a, t);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      if (r.age >= r.life) this.ripples.splice(i, 1);
    }
  }
}
