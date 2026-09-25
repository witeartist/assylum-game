// Items: pickups on the floor, the inventory (three slots) of every runner simulated here, and
// using them. A bottle flies and shatters — a noise that lures the AI; a glowstick keeps burning
// where it lands; a battery refills the flashlight; adrenaline lets you run without tiring; a
// sedative saves you once when grabbed. Notes and map pieces are read on the spot.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Vec2 } from "../core/types";
import { ITEMS, NOISE, PICKUP_RADIUS, WHISTLE_COOLDOWN } from "../data/balance";
import { ITEMS_DEF, type ItemKind } from "../data/items";
import { NOTES } from "../data/notes";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { DEPTH } from "../ui/theme";

export interface GroundItem { kind: ItemKind; x: number; y: number; sprite: Phaser.GameObjects.Image; taken: boolean; }
interface Flight { kind: ItemKind; sprite: Phaser.GameObjects.Image; from: Vec2; to: Vec2; t: number; dur: number; }
interface Glow { x: number; y: number; left: number; sprite: Phaser.GameObjects.Image; }
/** Something revealed by a map piece: shown through the dark for a while. */
export interface Marker { x: number; y: number; left: number; icon: string; }

export type Bag = (ItemKind | null)[];

const ITEM_SIZE = TILE * 0.55;
const FLIGHT_SPEED = TILE * 11;

export class Items {
  readonly ground: GroundItem[];
  readonly markers: Marker[] = [];
  /** The note being read, if any. */
  noteOpen: { title: string; text: string } | null = null;
  whistleCooldown = 0;
  private bags = new Map<Actor, Bag>();
  private glows: Glow[] = [];
  private flights: Flight[] = [];
  private noteT = 0;

  constructor(private world: World) {
    const scene = world.scene;
    this.ground = world.level.items.map(it => {
      const p = tileCenter(it.tile);
      const x = p.x + world.rng.range(-6, 6), y = p.y + world.rng.range(-4, 6);
      const sprite = scene.add.image(x, y, ITEMS_DEF[it.kind].icon).setDepth(DEPTH.floorObjects + 10).setRotation(world.rng.range(-0.6, 0.6));
      sprite.setScale(ITEM_SIZE / Math.max(sprite.width, sprite.height));
      return { kind: it.kind, x, y, sprite, taken: false };
    });
  }

  /** Inventory of a runner simulated on this peer. */
  bag(a: Actor): Bag {
    let b = this.bags.get(a);
    if (!b) { b = Array<ItemKind | null>(ITEMS.slots).fill(null); this.bags.set(a, b); }
    return b;
  }

  has(a: Actor, kind: ItemKind): boolean { return this.bag(a).includes(kind); }

  update(dt: number): void {
    const w = this.world;
    if (this.whistleCooldown > 0) this.whistleCooldown = Math.max(0, this.whistleCooldown - dt);
    if (this.noteOpen && (this.noteT -= dt) <= 0) this.noteOpen = null;
    for (const r of w.runners()) {
      if (!r.inPlay || r.hiding || r.control === "remote") continue;
      this.ground.forEach((g, i) => {
        if (!g.taken && dist(r, g) < PICKUP_RADIUS && this.canCarry(r, g.kind)) this.pick(i, r);
      });
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const arc = Math.sin(k * Math.PI) * Math.min(28, f.dur * 40);
      f.sprite.setPosition(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (f.to.y - f.from.y) * k - arc).setRotation(f.t * 12);
      f.sprite.setDepth(f.sprite.y + 20);
      if (k >= 1) { this.flights.splice(i, 1); this.land(f); }
    }
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      g.left -= dt;
      if (g.left <= 0) { g.sprite.destroy(); this.glows.splice(i, 1); }
    }
    for (let i = this.markers.length - 1; i >= 0; i--) if ((this.markers[i].left -= dt) <= 0) this.markers.splice(i, 1);
  }

  private canCarry(a: Actor, kind: ItemKind): boolean {
    return !ITEMS_DEF[kind].stored || this.bag(a).includes(null);
  }

  /** The single place an item is picked up: by a runner here, or reported over the network. */
  pick(index: number, by: Actor | string | null, remote = false): boolean {
    const g = this.ground[index];
    if (!g || g.taken) return false;
    const w = this.world;
    g.taken = true;
    g.sprite.destroy();
    const actor = typeof by === "string" ? null : by;
    if (actor) this.receive(actor, g.kind, index);
    w.events.emit("itemPicked", { index, by: typeof by === "string" ? by : by?.id ?? "", remote });
    return true;
  }

  /** A runner here got an item. */
  private receive(a: Actor, kind: ItemKind, index: number): void {
    const w = this.world, def = ITEMS_DEF[kind], local = a === w.local;
    if (def.stored) {
      const bag = this.bag(a);
      bag[bag.indexOf(null)] = kind;
      if (local) w.toast(def.name + " — " + def.hint, "key");
      return;
    }
    if (!local) return;
    if (kind === "note") {
      this.noteOpen = NOTES[(w.level.seed + index) % NOTES.length];
      this.noteT = 14;
    } else if (kind === "map") {
      this.revealNearest(a);
      w.toast("Обрывок карты: отмечены ближайшие цели", "key");
    }
  }

  closeNote(): void { this.noteOpen = null; }

  /** Keys 1–3: use the item in that slot. */
  useLocal(slot: number): void {
    const a = this.world.local;
    if (a.role !== "runner" || a.hiding || !a.inPlay) return;
    this.use(a, slot);
  }

  /** Use slot `slot` of runner `a` (the local player or a bot). */
  use(a: Actor, slot: number): boolean {
    const w = this.world, bag = this.bag(a), kind = bag[slot];
    if (!kind) return false;
    const local = a === w.local;
    switch (kind) {
      case "battery":
        if (a.flashlight.charge >= 0.98) { if (local) w.toast("Фонарик и так заряжен", "neutral"); return false; }
        a.flashlight.charge = Math.min(1, a.flashlight.charge + 0.65);
        if (local) w.toast("Новая батарейка", "good");
        break;
      case "adrenaline":
        a.adrenaline = ITEMS.adrenalineTime;
        a.stamina = a.staminaMax;
        a.exhausted = false;
        if (local) w.toast("АДРЕНАЛИН", "good");
        break;
      case "sedative":
        if (local) w.toast("Седативное сработает само, если схватят", "neutral");
        return false;
      case "bottle":
      case "glowstick": {
        const to = this.throwTarget(a);
        w.events.emit("itemThrown", { kind, by: a.id, x: a.x, y: a.y, tx: to.x, ty: to.y, remote: false });
        this.startThrow(kind, a, to);
        break;
      }
      default: return false;
    }
    bag[slot] = null;
    if (kind === "battery" || kind === "adrenaline") w.events.emit("itemUsed", { kind, by: a.id });
    return true;
  }

  /** Grabbed: a sedative (if any) is used up. Returns whether one was there. */
  useSedative(a: Actor): boolean {
    const bag = this.bag(a), i = bag.indexOf("sedative");
    if (i < 0) return false;
    bag[i] = null;
    this.world.events.emit("itemUsed", { kind: "sedative", by: a.id });
    return true;
  }

  /** Where a throw lands: along the facing direction, short of the first wall. */
  private throwTarget(a: Actor): Vec2 {
    const dx = Math.cos(a.facing), dy = Math.sin(a.facing);
    const sight = this.world.sight;
    let x = a.x, y = a.y;
    for (let d = 0; d < ITEMS.throwTiles * TILE; d += TILE / 4) {
      const nx = a.x + dx * d, ny = a.y + dy * d;
      if (sight.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) break;
      x = nx; y = ny;
    }
    return { x, y };
  }

  /** A bottle or glowstick leaves the hand (also for throws reported over the network). */
  startThrow(kind: ItemKind, from: Vec2, to: Vec2): void {
    const sprite = this.world.scene.add.image(from.x, from.y, ITEMS_DEF[kind].icon);
    sprite.setScale(ITEM_SIZE * 0.8 / Math.max(sprite.width, sprite.height));
    this.flights.push({ kind, sprite, from: { x: from.x, y: from.y }, to, t: 0, dur: Math.max(0.15, dist(from, to) / FLIGHT_SPEED) });
  }

  private land(f: Flight): void {
    const w = this.world, scene = w.scene;
    if (f.kind === "bottle") {
      f.sprite.destroy();
      w.noise.emit(f.to.x, f.to.y, NOISE.glass, "glass");
      const shards = scene.add.image(f.to.x, f.to.y, "decals/glass_shards").setDepth(DEPTH.floorObjects).setRotation(Math.random() * 6.28);
      shards.setScale(TILE * 0.9 / Math.max(shards.width, shards.height));
    } else {
      f.sprite.setRotation(Math.random() * 6.28).setDepth(DEPTH.floorObjects + 12);
      this.glows.push({ x: f.to.x, y: f.to.y, left: ITEMS.glowstickTime, sprite: f.sprite });
    }
  }

  /** Burning glowsticks (landed or in the air), for the light model. */
  glowLights(): { x: number; y: number; strength: number }[] {
    const out = this.glows.map(g => ({ x: g.x, y: g.y, strength: Math.min(1, g.left / 10) }));
    for (const f of this.flights) if (f.kind === "glowstick") out.push({ x: f.sprite.x, y: f.sprite.y, strength: 1 });
    return out;
  }

  /** Q: Yoko's whistle — loud, and the AI comes to look. */
  abilityLocal(): void {
    const w = this.world, a = w.local;
    if (!a.def.ability?.whistle || !a.inPlay || !w.round.canAct()) return;
    if (this.whistleCooldown > 0) { w.toast("Свист: ещё " + Math.ceil(this.whistleCooldown) + "с", "neutral"); return; }
    this.whistleCooldown = WHISTLE_COOLDOWN;
    w.events.emit("itemThrown", { kind: "whistle", by: a.id, x: a.x, y: a.y, tx: a.x, ty: a.y, remote: false });
    this.whistle(a.x, a.y, a);
    w.toast("Свист! Охотник идёт на звук", "warn");
  }

  whistle(x: number, y: number, by: Actor | null): void {
    this.world.noise.emit(x, y, NOISE.whistle, "whistle", by);
  }

  /** Map piece: the two nearest remaining keys or fuses show through the dark for a while. */
  private revealNearest(a: Actor): void {
    const w = this.world;
    const targets = [
      ...w.objectives.keys.filter(k => !k.taken).map(k => ({ x: k.sprite.x, y: k.baseY, icon: "ui/icon_key" })),
      ...w.power.groundFuses().map(f => ({ x: f.x, y: f.y, icon: "items/fuse" })),
    ].sort((p, q) => dist(a, p) - dist(a, q)).slice(0, 2);
    for (const t of targets) this.markers.push({ ...t, left: ITEMS.markerTime });
  }
}
