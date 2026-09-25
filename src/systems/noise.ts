// Noise. Footsteps, breathing, doors, glass, alarms… every sound is an event with a radius. The AI
// listens to fresh events; players see ripples for what they could hear, even in total darkness —
// someone running behind you gives themselves away, someone sneaking does not.
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import { NOISE, RIPPLE_LIFE, STAMINA } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

export type NoiseKind = "step" | "run" | "breath" | "gasp" | "door" | "glass" | "alarm" | "whistle" | "locker" | "fuse" | "monster";

export interface NoiseEvent {
  /** Increasing id: listeners remember the last one they processed. */
  id: number;
  x: number; y: number;
  /** How far it carries in the open, world px. */
  radius: number;
  kind: NoiseKind;
  source: Actor | null;
  age: number;
}

/** Footstep sound of an actor's current gait: radius in tiles and seconds between steps. */
function stepOf(a: Actor): { radius: number; every: number; kind: NoiseKind } | null {
  if (a.kit === "brute") return { ...NOISE.bossStep, kind: "monster" };
  if (a.gait === "sneak") return null;
  if (a.role === "hunter") return a.gait === "run" ? { ...NOISE.hunterRun, kind: "monster" } : { ...NOISE.hunterWalk, kind: "monster" };
  if (a.gait === "run" && !a.exhausted) return { radius: NOISE.run.radius * (a.def.ability?.runNoise ?? 1), every: NOISE.run.every, kind: "run" };
  return { ...NOISE.walk, kind: "step" };
}

export class Noise {
  /** Recent noises (they ripple on screen for RIPPLE_LIFE; listeners read them by id). */
  readonly events: NoiseEvent[] = [];
  private nextId = 1;
  private stepT = new Map<Actor, number>();
  private breathT = new Map<Actor, number>();

  constructor(private world: World) {}

  /**
   * Make a noise at (x, y) that carries `radiusTiles`. `share`: other peers can't work it out
   * themselves (a gasp in a locker, a terminal alarm), so it goes over the network.
   */
  emit(x: number, y: number, radiusTiles: number, kind: NoiseKind, source: Actor | null = null, share = false): NoiseEvent {
    const e: NoiseEvent = { id: this.nextId++, x, y, radius: radiusTiles * TILE, kind, source, age: 0 };
    this.events.push(e);
    if (share) this.world.events.emit("noiseMade", { x, y, radius: radiusTiles, kind, by: source?.id ?? "" });
    return e;
  }

  /** Id of the newest noise so far. */
  get lastId(): number { return this.nextId - 1; }

  /** Noises made after `id`. */
  since(id: number): NoiseEvent[] {
    const out: NoiseEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && this.events[i].id > id; i--) out.push(this.events[i]);
    return out;
  }

  /** Would someone at `p` hear `e`? Walls between muffle it. `mult` scales their hearing. */
  hears(p: Vec2, e: NoiseEvent, mult = 1): boolean {
    const d = dist(p, e);
    const r = e.radius * mult;
    if (d > r) return false;
    return d <= r * NOISE.wallMuffle || hasLineOfSight(this.world.sight, p, e);
  }

  update(dt: number): void {
    for (const a of this.world.actors) {
      if (!a.inPlay || a.hiding) { this.stepT.delete(a); continue; }
      this.footsteps(a, dt);
      this.breathing(a, dt);
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.age += dt;
      if (e.age >= RIPPLE_LIFE) this.events.splice(i, 1);
    }
  }

  private footsteps(a: Actor, dt: number): void {
    const v = a.velocity;
    const step = stepOf(a);
    if (!step || Math.hypot(v.x, v.y) < 20) { this.stepT.set(a, 0); return; }
    let t = (this.stepT.get(a) ?? step.every * 0.5) + dt;
    if (t >= step.every) {
      t -= step.every;
      this.emit(a.x, a.y, step.radius, step.kind, a);
    }
    this.stepT.set(a, t);
  }

  /** Exhausted runners pant. */
  private breathing(a: Actor, dt: number): void {
    if (a.role !== "runner" || !a.exhausted) { this.breathT.delete(a); return; }
    let t = (this.breathT.get(a) ?? 0) + dt;
    if (t >= STAMINA.breathEvery) { t = 0; this.emit(a.x, a.y, NOISE.breath, "breath", a); }
    this.breathT.set(a, t);
  }
}
