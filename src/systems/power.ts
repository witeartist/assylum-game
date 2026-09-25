// Power for the exit. Fuses lie around the hospital; a runner carries one at a time (in the
// hands, not in a slot) to the fuse box on a wall and plugs it in — it takes a moment and makes
// a noise. When every fuse is in, the exit door has power. A carrier who gets caught drops it.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Vec2 } from "../core/types";
import { FUSE_INSERT_TIME, INTERACT_RANGE, NOISE, PICKUP_RADIUS } from "../data/balance";
import { FUSE_BOX, FUSE_ICON } from "../data/items";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { placeStanding } from "../render/worldView";
import { DEPTH } from "../ui/theme";

export interface Fuse {
  x: number; y: number;
  sprite: Phaser.GameObjects.Image;
  state: "ground" | "carried" | "inserted";
  carrier: Actor | null;
}

const FUSE_SIZE = TILE * 0.5;
const BOX_WIDTH = TILE * 0.7;

export class Power {
  readonly fuses: Fuse[];
  readonly box: { x: number; y: number; sprite: Phaser.GameObjects.Image } | null;
  inserted = 0;
  /** Seconds each runner has spent plugging a fuse in. */
  private inserting = new Map<Actor, number>();

  constructor(private world: World) {
    const scene = world.scene;
    this.fuses = world.level.fuseTiles.map(t => {
      const p = tileCenter(t);
      const sprite = scene.add.image(p.x, p.y, FUSE_ICON).setDepth(DEPTH.floorObjects + 10).setRotation(world.rng.range(-0.8, 0.8));
      sprite.setScale(FUSE_SIZE / Math.max(sprite.width, sprite.height));
      return { x: p.x, y: p.y, sprite, state: "ground", carrier: null };
    });
    const b = world.level.fuseBox;
    this.box = b ? { ...tileCenter(b), sprite: placeStanding(scene, FUSE_BOX, tileCenter(b).x, b.row * TILE + TILE * 0.35, BOX_WIDTH) } : null;
    if (this.box) world.addProp(this.box.sprite, [{ x: this.box.x, y: this.box.sprite.y + 2 }]);
    world.events.on("runnerCaught", ({ actor }) => this.dropFrom(actor));
    world.events.on("runnerLeft", ({ actor }) => this.dropFrom(actor));
  }

  get total(): number { return this.fuses.length; }
  /** The exit has power (always, when the level needs no fuses). */
  get on(): boolean { return this.inserted >= this.total; }

  carried(a: Actor): number { return this.fuses.findIndex(f => f.state === "carried" && f.carrier === a); }
  groundFuses(): Fuse[] { return this.fuses.filter(f => f.state === "ground"); }
  /** Plugging a fuse in right now (can't move meanwhile). */
  busy(a: Actor): boolean { return this.inserting.has(a); }
  insertProgress(a: Actor): number { return (this.inserting.get(a) ?? 0) / FUSE_INSERT_TIME; }

  /** Glinting fuses on the floor, for the light model. */
  glows(): Vec2[] { return this.groundFuses(); }

  nearBox(p: Vec2): boolean { return !!this.box && dist(p, this.box) < INTERACT_RANGE; }

  update(dt: number): void {
    for (const r of this.world.runners()) {
      if (!r.inPlay || r.hiding || r.control === "remote") continue;
      if (this.carried(r) < 0) {
        const i = this.fuses.findIndex(f => f.state === "ground" && dist(r, f) < PICKUP_RADIUS);
        if (i >= 0) this.pick(i, r);
      }
      const t = this.inserting.get(r);
      if (t === undefined) continue;
      if (!this.nearBox(r) || this.carried(r) < 0) { this.inserting.delete(r); continue; }
      r.halt();
      if (t + dt >= FUSE_INSERT_TIME) { this.inserting.delete(r); this.insert(this.carried(r), r); }
      else this.inserting.set(r, t + dt);
    }
    for (const f of this.fuses) {
      if (f.state === "carried" && f.carrier) f.sprite.setPosition(f.carrier.x, f.carrier.y);
    }
  }

  /** E at the box with a fuse in hand. Returns whether plugging in started. */
  startInsert(a: Actor): boolean {
    if (this.carried(a) < 0 || !this.nearBox(a) || this.busy(a)) return false;
    this.inserting.set(a, 0);
    return true;
  }

  /** The single place a fuse is picked up (here or reported over the network). */
  pick(index: number, by: Actor, remote = false): boolean {
    const f = this.fuses[index];
    if (!f || f.state !== "ground") return false;
    f.state = "carried";
    f.carrier = by;
    f.sprite.setVisible(false);
    if (by === this.world.local) this.world.toast("Предохранитель! Отнеси его в щиток", "key");
    this.world.events.emit("fusePicked", { index, by: by.id, remote });
    return true;
  }

  /** The single place a fuse goes into the box. */
  insert(index: number, by: Actor | null, remote = false): boolean {
    const f = this.fuses[index];
    const w = this.world;
    if (!f || f.state === "inserted" || !this.box) return false;
    f.state = "inserted";
    f.carrier = null;
    f.sprite.destroy();
    this.inserted++;
    w.noise.emit(this.box.x, this.box.y, NOISE.fuse, "fuse", by);
    w.events.emit("fuseInserted", { index, by: by?.id ?? "", remote });
    if (this.on) {
      const box = this.box.sprite;
      box.setTexture(FUSE_BOX + "_on").setScale(BOX_WIDTH / box.width);
      w.toast("ПИТАНИЕ ВОССТАНОВЛЕНО", "good");
      w.events.emit("powerRestored", {});
      w.objectives.tryOpenExit();
    } else {
      w.toast("Предохранитель " + this.inserted + "/" + this.total + (by && by !== w.local ? " — " + by.displayName : ""), "key");
    }
    return true;
  }

  /** A carrier is out: the fuse falls where they stood. */
  dropFrom(a: Actor, at?: Vec2, remote = false): void {
    const i = this.carried(a);
    if (i < 0) return;
    const f = this.fuses[i], p = at ?? a;
    f.state = "ground";
    f.carrier = null;
    f.x = p.x; f.y = p.y;
    f.sprite.setPosition(p.x, p.y).setVisible(true);
    this.inserting.delete(a);
    this.world.events.emit("fuseDropped", { index: i, x: p.x, y: p.y, remote });
  }

  /** Network: a fuse dropped on another peer. */
  placeDropped(index: number, p: Vec2): void {
    const f = this.fuses[index];
    if (!f || f.state === "inserted") return;
    f.state = "ground";
    f.carrier = null;
    f.x = p.x; f.y = p.y;
    f.sprite.setPosition(p.x, p.y).setVisible(true);
  }
}
