// Footprints and dust underfoot. Everyone who walks leaves prints that fade in a few seconds —
// red and lasting after crossing blood — and running kicks up a little dust. Both belong to the
// lit world: in the dark you see nothing, in a beam you see where someone went.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { DEPTH } from "../ui/theme";
import { quality } from "./display";

/** Distance between prints, world px, by gait. */
const STRIDE = { sneak: 9, walk: 12, run: 17 };
/** How long a print lasts, seconds. */
const LIFE = { dirt: 6, blood: 20 };
const ALPHA = { dirt: 0.42, blood: 0.75 };
const COLOR = { dirt: 0x17130f, blood: 0x5c0c08 };
/** Prints after crossing blood before the soles are clean. */
const BLOOD_STEPS = 10;
const MAX_PRINTS = 160;
/** Print size, world px: shoes and claws. */
const SIZE = { runner: { w: 5, h: 9 }, monster: { w: 8, h: 11 } };

interface Print { img: Phaser.GameObjects.Image; age: number; life: number; alpha: number; }
interface Walker { last: Vec2; run: number; left: boolean; blood: number; }

export class Footprints {
  private prints: Print[] = [];
  private next = 0;
  private walkers = new Map<Actor, Walker>();
  /** Blood left by catches: stepping in it stains the soles. */
  private pools: Vec2[] = [];
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null;

  constructor(private world: World) {
    world.events.on("runnerCaught", ({ actor }) => this.pools.push({ x: actor.x, y: actor.feetY }));
    this.dust = quality.dust > 0 ? world.scene.add.particles(0, 0, "fx/dust", {
      speed: { min: 6, max: 20 },
      lifespan: { min: 400, max: 700 },
      scale: { start: 0.22, end: 0.55 },
      alpha: { start: 0.4, end: 0 },
      tint: 0xb8ab98,
      emitting: false,
    }).setDepth(DEPTH.shadows + 1) : null;
  }

  update(dt: number): void {
    for (const a of this.world.actors) {
      if (!a.inPlay || a.hiding) { this.walkers.delete(a); continue; }
      const feet = { x: a.x, y: a.feetY };
      let w = this.walkers.get(a);
      if (!w) { w = { last: feet, run: 0, left: false, blood: 0 }; this.walkers.set(a, w); }
      const dx = feet.x - w.last.x, dy = feet.y - w.last.y, d = Math.hypot(dx, dy);
      w.last = feet;
      if (d > TILE) { w.run = 0; continue; } // a jump (teleport), not a step
      if (this.onBlood(feet)) w.blood = BLOOD_STEPS;
      w.run += d;
      const stride = a.gait === "run" && !a.exhausted ? STRIDE.run : a.gait === "sneak" ? STRIDE.sneak : STRIDE.walk;
      if (w.run < stride || d === 0) continue;
      w.run = 0;
      w.left = !w.left;
      this.step(a, feet, dx / d, dy / d, w);
    }
    for (const p of this.prints) {
      if (!p.img.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.img.setVisible(false); continue; }
      p.img.setAlpha(p.alpha * (1 - k * k));
    }
  }

  private onBlood(p: Vec2): boolean {
    const w = this.world, c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);
    return w.level.rows[r]?.[c] === "B" || this.pools.some(q => dist(p, q) < TILE * 0.8);
  }

  /** A print at the feet (left or right of the line of travel), and dust when running. */
  private step(a: Actor, feet: Vec2, ux: number, uy: number, w: Walker): void {
    const monster = a.role !== "runner";
    const size = monster ? SIZE.monster : SIZE.runner;
    const side = (w.left ? -1 : 1) * (monster ? 3.5 : 2.5);
    const blood = w.blood > 0;
    if (blood) w.blood--;
    const p = this.take();
    p.age = 0;
    p.life = blood ? LIFE.blood : LIFE.dirt;
    p.alpha = blood ? ALPHA.blood * Math.max(0.35, w.blood / BLOOD_STEPS) : ALPHA.dirt;
    p.img.setTexture(monster ? "fx/clawprint" : "fx/footprint")
      .setPosition(feet.x - uy * side, feet.y - 2 + ux * side)
      .setRotation(Math.atan2(ux, -uy))
      .setDisplaySize(size.w, size.h)
      .setTint(blood ? COLOR.blood : COLOR.dirt)
      .setAlpha(p.alpha)
      .setVisible(true);
    if (this.dust && a.gait === "run" && !a.exhausted) this.dust.explode(monster ? 4 : 2, feet.x, feet.y - 1);
  }

  /** A print to (re)use: a new one while there are few, else the oldest. */
  private take(): Print {
    if (this.prints.length < MAX_PRINTS) {
      const p = { img: this.world.scene.add.image(0, 0, "fx/footprint").setDepth(DEPTH.floorObjects + 5), age: 0, life: 1, alpha: 0 };
      this.prints.push(p);
      return p;
    }
    const p = this.prints[this.next];
    this.next = (this.next + 1) % MAX_PRINTS;
    return p;
  }
}
