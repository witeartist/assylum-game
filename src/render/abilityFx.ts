// What the villains' abilities look like in the world. Naumi's blight: sparks from her horns with a
// violet trail, bursts with cyan crackle, patches of blight on the floor (you see them only where
// it is lit — a flashlight shows them), and the veins of a marked runner glowing. The brute's
// lunge leaves afterimages and a smashed door splinters; the fox's flash spreads a ring of light.
// All of it is lit by the same lights as the world (sparks and bursts bring their own).
import Phaser from "phaser";
import { TILE } from "../core/constants";
import { Rng } from "../core/rng";
import { BLIGHT, FOX_FLASH } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { Burst, Spark, Trap } from "../systems/abilities";
import { DEPTH } from "../ui/theme";

/** Sparks fly at chest height: drawn this far above their spot on the floor, px. */
const SPARK_HEIGHT = 15;
const VIOLET = 0xa878ff, CYAN = 0x7ff0ff;
const TRAP_LOOKS = 3;
/** Above everything standing on the floor. */
const AIR = DEPTH.dust - 10;

interface SparkLook { core: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; floor: Phaser.GameObjects.Image; }
interface Ghost { img: Phaser.GameObjects.Image; age: number; }

export class AbilityFx {
  private sparks = new Map<Spark, SparkLook>();
  private traps = new Map<Trap, Phaser.GameObjects.Image>();
  private bursts = new Set<Burst>();
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private crackle: Phaser.GameObjects.Graphics;
  private chips: Phaser.GameObjects.Particles.ParticleEmitter;
  private rings: { x: number; y: number; age: number; life: number; reach: number; color: number; width: number }[] = [];
  private ringG: Phaser.GameObjects.Graphics;
  private ghosts: Ghost[] = [];
  private ghostT = new Map<Actor, number>();
  private tinted = new Set<Actor>();
  private veinT = 0;
  private t = 0;

  constructor(private world: World) {
    const scene = world.scene;
    makeTrapTextures(scene);
    this.trail = scene.add.particles(0, 0, "fx/dust", {
      lifespan: { min: 220, max: 420 }, speed: { min: 4, max: 22 }, scale: { start: 0.42, end: 0 },
      alpha: { start: 0.9, end: 0 }, color: [0xffffff, CYAN, VIOLET], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(AIR);
    this.chips = scene.add.particles(0, 0, "fx/dust", {
      lifespan: { min: 350, max: 650 }, speed: { min: 40, max: 150 }, scale: { start: 0.3, end: 0.12 },
      alpha: { start: 0.95, end: 0 }, tint: 0x6b4a30, gravityY: 260, emitting: false,
    }).setDepth(AIR);
    this.crackle = scene.add.graphics().setDepth(AIR).setBlendMode(Phaser.BlendModes.ADD);
    this.ringG = scene.add.graphics().setDepth(AIR).setBlendMode(Phaser.BlendModes.ADD);
    world.events.on("abilityUsed", ({ kind, slot, x, y }) => {
      if (kind === "fox") this.rings.push({ x, y, age: 0, life: 0.45, reach: FOX_FLASH.radiusTiles * TILE, color: 0xfff4e6, width: 5 });
      if (kind === "blight" && slot === "q") this.rings.push({ x, y, age: 0, life: 0.5, reach: TILE * 0.9, color: VIOLET, width: 3 });
    });
    world.events.on("gateChanged", ({ index, open, by }) => {
      const g = world.gates.gates[index];
      if (g && open && world.byId(by)?.kit === "brute") this.chips.explode(22, g.x, g.y);
    });
  }

  update(dt: number): void {
    this.t += dt;
    const ab = this.world.abilities;
    this.updateSparks(ab.sparks);
    this.updateTraps(ab.traps);
    this.updateBursts(ab.bursts);
    this.updateRings(dt);
    this.updateMarks(dt);
    this.updateGhosts(dt);
  }

  /** A bright core with a violet halo, a trail behind and a glow on the floor under it. */
  private updateSparks(sparks: Spark[]): void {
    const scene = this.world.scene;
    for (const [s, look] of this.sparks) if (!sparks.includes(s)) { look.core.destroy(); look.halo.destroy(); look.floor.destroy(); this.sparks.delete(s); }
    for (const s of sparks) {
      let look = this.sparks.get(s);
      if (!look) {
        look = {
          halo: scene.add.image(0, 0, "fx/dust").setTint(VIOLET).setBlendMode(Phaser.BlendModes.ADD).setDepth(AIR),
          core: scene.add.image(0, 0, "fx/dust").setTint(0xeafcff).setBlendMode(Phaser.BlendModes.ADD).setDepth(AIR + 1),
          floor: scene.add.image(0, 0, "fx/dust").setTint(VIOLET).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.floorObjects + 30).setAlpha(0.35),
        };
        this.sparks.set(s, look);
      }
      const y = s.y - SPARK_HEIGHT, flick = 0.85 + 0.15 * Math.sin(this.t * 60 + s.x);
      look.halo.setPosition(s.x, y).setScale(1.5 * flick).setAlpha(0.7);
      look.core.setPosition(s.x, y).setScale(0.55 * flick);
      look.floor.setPosition(s.x, s.y).setScale(2.2, 1);
      this.trail.emitParticleAt(s.x - s.dx * 3, y - s.dy * 3, 2);
    }
  }

  /** Patches of blight: they grow while arming and pulse slowly; lit only by the world's lights. */
  private updateTraps(traps: Trap[]): void {
    const scene = this.world.scene;
    for (const [t, img] of this.traps) if (!traps.includes(t)) { img.destroy(); this.traps.delete(t); }
    for (const t of traps) {
      let img = this.traps.get(t);
      if (!img) {
        const h = hashOf(t.id);
        img = scene.add.image(t.x, t.y + 4, "fx/blight" + (h % TRAP_LOOKS)).setDepth(DEPTH.floorObjects + 20).setRotation((h % 628) / 100);
        this.traps.set(t, img);
      }
      const grow = Math.min(1, 0.35 + 0.65 * t.age / BLIGHT.trap.arm);
      const pulse = 0.88 + 0.12 * Math.sin(this.t * 2.2 + t.x * 0.05);
      const wither = Math.min(1, (BLIGHT.trap.life - t.age) / 6);
      img.setDisplaySize(TILE * 1.5 * grow * pulse, TILE * 1.5 * grow * pulse).setAlpha(0.95 * wither);
    }
  }

  /** Blight bursting: a ring and cyan crackle, sparks flying. */
  private updateBursts(bursts: Burst[]): void {
    const g = this.crackle;
    g.clear();
    for (const b of bursts) {
      if (!this.bursts.has(b)) {
        this.bursts.add(b);
        this.trail.explode(b.hit ? 26 : 12, b.x, b.y - SPARK_HEIGHT * 0.6);
        this.rings.push({ x: b.x, y: b.y, age: 0, life: 0.45, reach: TILE * (b.hit ? 1.6 : 1), color: VIOLET, width: 4 });
      }
      const k = b.age / 0.5;
      if (k >= 1) continue;
      const rng = new Rng(Math.floor(b.x * 7 + b.y * 13) + Math.floor(b.age * 20));
      g.lineStyle(1.5, CYAN, 0.9 * (1 - k));
      for (let i = 0; i < (b.hit ? 6 : 4); i++) {
        let a = rng.range(0, Math.PI * 2), x = b.x, y = b.y - SPARK_HEIGHT * 0.6;
        const len = TILE * rng.range(0.6, 1.3) * (0.4 + k);
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          a += rng.range(-0.7, 0.7);
          x += Math.cos(a) * len / 4; y += Math.sin(a) * len / 4;
          g.lineTo(x, y);
        }
        g.strokePath();
      }
    }
    for (const b of this.bursts) if (!bursts.includes(b)) this.bursts.delete(b);
  }

  /** Rings of light and blight spreading: the fox's flash, a patch being laid, a burst. */
  private updateRings(dt: number): void {
    const g = this.ringG;
    g.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) { this.rings.splice(i, 1); continue; }
      const e = 1 - (1 - k) * (1 - k);
      g.lineStyle(r.width * (1 - k * 0.6), r.color, 0.55 * (1 - k)).strokeCircle(r.x, r.y, 4 + r.reach * e);
    }
  }

  /** A marked runner's veins glow violet, pulsing, with motes rising off it. */
  private updateMarks(dt: number): void {
    this.veinT -= dt;
    const emit = this.veinT <= 0;
    if (emit) this.veinT = 0.18;
    for (const a of this.world.runners()) {
      const on = a.inPlay && a.isMarked;
      if (!on) { if (this.tinted.delete(a)) a.view.clearTint(); continue; }
      this.tinted.add(a);
      const k = 0.5 + 0.5 * Math.sin(this.t * 6);
      a.view.setTint(Phaser.Display.Color.GetColor(255 - 55 * k, 255 - 95 * k, 255));
      if (emit && a.shown) this.trail.emitParticleAt(a.x + (Math.random() - 0.5) * 10, a.feetY - a.figureHeight * Math.random(), 1);
    }
  }

  /** The brute lunging: afterimages that fade behind it. */
  private updateGhosts(dt: number): void {
    for (const a of this.world.threats()) {
      if (a.kit !== "brute" || a.gait !== "run" || !a.shown) continue;
      const v = a.velocity;
      if (Math.hypot(v.x, v.y) < 60) continue;
      const t = (this.ghostT.get(a) ?? 0) - dt;
      if (t > 0) { this.ghostT.set(a, t); continue; }
      this.ghostT.set(a, 0.07);
      const s = a.view;
      const img = this.world.scene.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY)
        .setScale(s.scaleX, s.scaleY).setFlipX(s.flipX).setRotation(s.rotation).setTint(0x7ed65a).setAlpha(0.4 * a.fade).setDepth(s.depth - 0.5);
      this.ghosts.push({ img, age: 0 });
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      if (g.age >= 0.3) { g.img.destroy(); this.ghosts.splice(i, 1); continue; }
      g.img.setAlpha(0.4 * (1 - g.age / 0.3));
    }
  }
}

function hashOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Patches of blight seen from above: a dark violet stain, veins branching out, cyan cracks. */
function makeTrapTextures(scene: Phaser.Scene): void {
  for (let n = 0; n < TRAP_LOOKS; n++) {
    const key = "fx/blight" + n;
    if (scene.textures.exists(key)) continue;
    const S = 96, c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d")!, rng = new Rng(0xb119 + n * 77), m = S / 2;
    for (let i = 0; i < 7; i++) {
      const x = m + rng.range(-10, 10), y = m + rng.range(-10, 10), r = rng.range(12, 22);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(44,12,70,0.75)"); g.addColorStop(1, "rgba(44,12,70,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    }
    const vein = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      ctx.strokeStyle = `rgba(178,132,255,${0.7 + 0.1 * depth})`; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        a += rng.range(-0.45, 0.45);
        x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5;
        ctx.lineTo(x, y);
        if (depth > 0 && rng.chance(0.3)) { const sx = x, sy = y; ctx.stroke(); vein(sx, sy, a + rng.range(-1, 1), len * 0.5, w * 0.6, depth - 1); ctx.beginPath(); ctx.moveTo(sx, sy); }
      }
      ctx.stroke();
    };
    const count = 7 + n;
    for (let i = 0; i < count; i++) vein(m, m, (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3), rng.range(22, 38), 2.4, 2);
    ctx.shadowColor = "#7ff0ff"; ctx.shadowBlur = 5;
    ctx.strokeStyle = "rgba(160,250,255,0.95)"; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      let a = rng.range(0, Math.PI * 2), x = m + rng.range(-4, 4), y = m + rng.range(-4, 4);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) { a += rng.range(-0.8, 0.8); x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(200,170,255,0.9)";
    ctx.beginPath(); ctx.arc(m, m, 3, 0, Math.PI * 2); ctx.fill();
    scene.textures.addCanvas(key, c);
  }
}
