// The villain's abilities, by kit. R: the fox's flash (a burst of light that shows who hides in
// the dark), the brute's roar (heard across the floor; flashlights nearby die for a moment) or
// Naumi's spark (it flies straight from her horns and marks the first runner it hits). Q: Naumi's
// blight, a patch on the floor that marks whoever steps in it. A marked runner stumbles, and
// Naumi sees them anywhere for a while. Every villain has its own cooldowns; what one uses, every
// peer sees and hears — and the peer that simulates a runner decides whether it was hit.
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import { BLIGHT, FOX_FLASH, ROAR } from "../data/balance";
import type { Vec2 } from "../core/types";
import type { KitId } from "../data/characters";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

export type Slot = "r" | "q";

interface AbilityText { name: string; ready: string; shout: string; }

/** How R reads for each kit: its name, the HUD line when it is ready, the shout when used. */
export const ABILITY: Record<KitId, AbilityText> = {
  fox: { name: "Вспышка", ready: "[R] вспышка готова", shout: "ВСПЫШКА!" },
  brute: { name: "Рёв", ready: "[R] рёв готов", shout: "РЁВ!" },
  blight: { name: "Искра", ready: "[R] искра готова", shout: "ИСКРА!" },
};
/** Q, for the kits that have one. */
export const ABILITY_Q: Partial<Record<KitId, AbilityText>> = {
  blight: { name: "Скверна", ready: "[Q] скверна готова", shout: "СКВЕРНА" },
};
const COOLDOWN: Record<KitId, number> = { fox: FOX_FLASH.cooldown, brute: ROAR.cooldown, blight: BLIGHT.spark.cooldown };
const COOLDOWN_Q: Partial<Record<KitId, number>> = { blight: BLIGHT.trap.cooldown };
/** How far a spark moves between wall checks, px. */
const SPARK_STEP = 4;
/** A burst of blight shows this long, s. */
const BURST_LIFE = 0.9;

/** A flash burning right now; it follows its owner. */
export interface Flash { owner: Actor; x: number; y: number; left: number; }
/** A spark in flight: where it is, where it goes, how far it still flies (px). */
export interface Spark { owner: Actor; x: number; y: number; dx: number; dy: number; left: number; age: number; }
/** A patch of blight on the floor. `id`: the same on every peer (owner + how many it placed). */
export interface Trap { id: string; owner: Actor; x: number; y: number; age: number; }
/** Blight bursting: a spark that hit something, a trap sprung. */
export interface Burst { x: number; y: number; age: number; hit: boolean; }

export class Abilities {
  readonly flashes: Flash[] = [];
  readonly sparks: Spark[] = [];
  readonly traps: Trap[] = [];
  readonly bursts: Burst[] = [];
  private cooldowns = new Map<string, number>();
  private placed = new Map<Actor, number>();

  constructor(private world: World) {
    // A villain player starts ready; the AI waits a full cooldown (half of it for its traps).
    for (const a of world.threats()) {
      if (!a.kit) continue;
      const ai = a.control === "ai", q = COOLDOWN_Q[a.kit];
      this.cooldowns.set(a.id + "r", ai ? COOLDOWN[a.kit] : 0);
      if (q !== undefined) this.cooldowns.set(a.id + "q", ai ? q * 0.5 : 0);
    }
  }

  /** `a` has an ability on this key. */
  has(a: Actor, slot: Slot = "r"): boolean { return a.kit !== null && (slot === "r" || COOLDOWN_Q[a.kit] !== undefined); }
  /** Seconds until `a` can use it again. */
  cooldown(a: Actor, slot: Slot = "r"): number { return this.cooldowns.get(a.id + slot) ?? 0; }
  ready(a: Actor, slot: Slot = "r"): boolean { return this.has(a, slot) && this.cooldown(a, slot) <= 0; }

  /**
   * Use it now if it is ready. `remote`: another peer already did, at `at` (where the villain
   * stood there — our copy of it may lag behind), aiming at `angle`; no cooldown here.
   */
  use(a: Actor, remote = false, at: Vec2 = a, slot: Slot = "r", angle = a.facing): boolean {
    if (!a.kit || !a.inPlay || !this.has(a, slot)) return false;
    if (!remote) {
      if (!this.ready(a, slot)) return false;
      this.cooldowns.set(a.id + slot, slot === "r" ? COOLDOWN[a.kit] : COOLDOWN_Q[a.kit] ?? 0);
    }
    if (slot === "q") this.placeTrap(a, at);
    else if (a.kit === "fox") this.flashes.push({ owner: a, x: at.x, y: at.y, left: FOX_FLASH.duration });
    else if (a.kit === "brute") this.roar(a, at);
    else this.sparks.push({ owner: a, x: at.x, y: at.y, dx: Math.cos(angle), dy: Math.sin(angle), left: BLIGHT.spark.range * TILE, age: 0 });
    this.world.events.emit("abilityUsed", { kind: a.kit, slot, by: a.id, x: at.x, y: at.y, angle, remote });
    return true;
  }

  /**
   * Another peer's runner was hit (by a spark, or in trap `trap`) at (x, y): the spark or the
   * trap is gone here too. That peer marks the runner; we learn it from its flags.
   */
  blightHit(by: Actor | null, trap: string | null, at: Vec2): void {
    if (trap) {
      const i = this.traps.findIndex(t => t.id === trap);
      if (i >= 0) this.traps.splice(i, 1);
    } else {
      const i = this.sparks.findIndex(s => s.owner === by);
      if (i >= 0) this.sparks.splice(i, 1);
    }
    this.bursts.push({ x: at.x, y: at.y, age: 0, hit: true });
  }

  /** Everyone hears it; the runners this peer simulates lose their light for a moment. */
  private roar(a: Actor, at: Vec2): void {
    const w = this.world;
    w.noise.emit(at.x, at.y, ROAR.noise, "monster", a);
    for (const r of w.runners()) {
      if (r.control !== "remote" && r.inPlay && dist(r, at) <= ROAR.jamRange * TILE) r.lightJam = ROAR.jam;
    }
    if (w.local.inPlay && dist(w.local, at) < TILE * 12) w.shake(400, 0.012);
  }

  /** A patch of blight where `a` stands; the oldest of its patches goes when there are too many. */
  private placeTrap(a: Actor, at: Vec2): void {
    const n = (this.placed.get(a) ?? 0) + 1;
    this.placed.set(a, n);
    this.traps.push({ id: a.id + "#" + n, owner: a, x: at.x, y: at.y, age: 0 });
    const mine = this.traps.filter(t => t.owner === a);
    if (mine.length > BLIGHT.trap.max) this.traps.splice(this.traps.indexOf(mine[0]), 1);
  }

  /** The runners whose fate is decided on this peer. */
  private localRunners(): Actor[] {
    return this.world.runners().filter(r => r.control !== "remote" && r.inPlay && !r.hiding);
  }

  /** Blight gets `r`: it stumbles and is marked. */
  private mark(r: Actor, by: Actor, trap: string | null, at: Vec2): void {
    r.marked = BLIGHT.mark;
    r.stumble = BLIGHT.stumble.time;
    this.bursts.push({ x: at.x, y: at.y, age: 0, hit: true });
    this.world.events.emit("blightHit", { id: r.id, by: by.id, trap, x: at.x, y: at.y, remote: false });
  }

  update(dt: number): void {
    for (const [k, t] of this.cooldowns) if (t > 0) this.cooldowns.set(k, Math.max(0, t - dt));
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.left -= dt;
      if (f.left <= 0) { this.flashes.splice(i, 1); continue; }
      f.x = f.owner.x; f.y = f.owner.y;
    }
    this.updateSparks(dt);
    this.updateTraps(dt);
    for (let i = this.bursts.length - 1; i >= 0; i--) if ((this.bursts[i].age += dt) >= BURST_LIFE) this.bursts.splice(i, 1);
  }

  /** Sparks fly on until a wall, the end of their range or a runner (one this peer simulates). */
  private updateSparks(dt: number): void {
    const w = this.world, hit = BLIGHT.spark.hit * TILE;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.age += dt;
      let move = Math.min(s.left, BLIGHT.spark.speed * TILE * dt), gone = false;
      while (move > 0 && !gone) {
        const step = Math.min(SPARK_STEP, move), next = { x: s.x + s.dx * step, y: s.y + s.dy * step };
        move -= step;
        s.left -= step;
        if (!hasLineOfSight(w.sight, s, next)) { this.bursts.push({ x: s.x, y: s.y, age: 0, hit: false }); gone = true; break; }
        s.x = next.x; s.y = next.y;
        const r = this.localRunners().find(r => dist(r, s) < hit);
        if (r) { this.mark(r, s.owner, null, s); gone = true; }
      }
      if (!gone && s.left <= 0) { this.bursts.push({ x: s.x, y: s.y, age: 0, hit: false }); gone = true; }
      if (gone) this.sparks.splice(i, 1);
    }
  }

  /** Patches wither after a while; once armed, a runner stepping in springs one. */
  private updateTraps(dt: number): void {
    const w = this.world, radius = BLIGHT.trap.radius * TILE;
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.age += dt;
      if (t.age >= BLIGHT.trap.life || !t.owner.inPlay) { this.traps.splice(i, 1); continue; }
      if (t.age < BLIGHT.trap.arm) continue;
      const r = this.localRunners().find(r => dist(r, t) < radius);
      if (!r) continue;
      this.traps.splice(i, 1);
      w.noise.emit(t.x, t.y, 4, "monster", t.owner);
      this.mark(r, t.owner, t.id, t);
    }
  }
}
