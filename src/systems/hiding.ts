// Hiding spots: lockers in most rooms, beds in wards. A hidden runner can't be seen or caught by
// contact — but breathing gives them away when a monster is right outside: hold your breath
// (Space). A hunter who saw you get in, or heard you, opens the spot; so can a hunter player (E).
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Vec2 } from "../core/types";
import { BED_RANGE, BREATH, HUNTER_AI, LOCKER_RANGE, NOISE } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { placeStanding, sideHug } from "../render/worldView";
import { isPlaceholder } from "../render/textures";

export interface HideSpot extends Vec2 {
  kind: "locker" | "bed";
  /** The locker or bed picture (beds that are furniture are drawn by the world view). */
  sprite: Phaser.GameObjects.Image | null;
  occupant: Actor | null;
  /** Where you stand when you come out (next to a bed you can't stand on). */
  out: Vec2;
}

/** Furniture you can crawl under. */
const HIDE_UNDER = new Set(["props/restraint_bed"]);

const LOCKER_WIDTH = TILE * 0.62;
const LOCKER_SIDE = { closed: "interactive/locker_side_closed", open: "interactive/locker_side_open" };
/** A hidden runner breathes audibly this often when nobody holds their breath. */
const BREATH_EVERY = 1.1;

export class Hiding {
  readonly spots: HideSpot[] = [];
  /** The local player's held breath, seconds left (refills when released). */
  breath: number = BREATH.max;
  /** The local player is holding their breath (set by input each frame). */
  holding = false;
  /** Bots: when each started holding their breath. */
  private botHold = new Map<Actor, number>();
  private breathT = new Map<Actor, number>();
  /** Spots being searched: seconds left, and who searches. */
  private checks = new Map<HideSpot, { left: number; by: Actor }>();

  constructor(private world: World) {
    const scene = world.scene;
    for (const t of world.level.hidingSpots) {
      const p = tileCenter(t);
      // Against a side wall a locker is seen from the side (when that picture exists).
      const wall = (c: number, r: number) => world.sight.isSolid(c, r);
      const side = !wall(t.col, t.row - 1) && (wall(t.col - 1, t.row) || wall(t.col + 1, t.row)) && !isPlaceholder(LOCKER_SIDE.closed);
      const sprite = placeStanding(scene, side ? LOCKER_SIDE.closed : "interactive/locker_closed", p.x + sideHug(world, t.col, t.row, 1, 1), p.y + TILE * 0.2, LOCKER_WIDTH);
      if (side && wall(t.col + 1, t.row)) sprite.setFlipX(true);
      this.spots.push({ x: p.x, y: p.y, kind: "locker", sprite, occupant: null, out: p });
    }
    for (const bed of world.level.bedSpots) {
      const a = tileCenter(bed.tile), b = tileCenter(bed.tile2);
      const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Beds cover their two tiles; the picture rises above the footprint like any 3/4 object.
      const width = (bed.orientation === "vertical" ? 1 : 2) * TILE * 0.95;
      const hug = bed.orientation === "vertical" ? 0 : sideHug(world, Math.min(bed.tile.col, bed.tile2.col), bed.tile.row, 2, 1);
      const sprite = placeStanding(scene, bed.sprite, p.x + hug, (Math.max(bed.tile.row, bed.tile2.row) + 1) * TILE - 1, width);
      this.spots.push({ x: p.x, y: p.y, kind: "bed", sprite, occupant: null, out: p });
    }
    for (const f of world.level.furniture) {
      if (!HIDE_UNDER.has(f.key)) continue;
      const p = { x: (f.col + f.w / 2) * TILE, y: (f.row + f.h / 2) * TILE };
      this.spots.push({ x: p.x, y: p.y, kind: "bed", sprite: null, occupant: null, out: this.besideOf(f.col, f.row, f.w, f.h) ?? p });
    }
  }

  /** A walkable tile centre next to a piece of furniture. */
  private besideOf(col: number, row: number, w: number, h: number): Vec2 | null {
    const g = this.world.grid;
    for (let r = row - 1; r <= row + h; r++) for (let c = col - 1; c <= col + w; c++) {
      const inside = c >= col && c < col + w && r >= row && r < row + h;
      if (!inside && !g.isSolid(c, r)) return tileCenter({ col: c, row: r });
    }
    return null;
  }

  /** The nearest free spot within reach of `p`. */
  nearest(p: Vec2, free = true): HideSpot | null {
    let best: HideSpot | null = null, bestD = Infinity;
    for (const s of this.spots) {
      if (free && s.occupant) continue;
      const d = dist(p, s);
      if (d < (s.kind === "bed" ? BED_RANGE : LOCKER_RANGE) && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  spotOf(a: Actor): HideSpot | null { return this.spots.find(s => s.occupant === a) ?? null; }

  /** E: hide in the nearest spot, or come out. */
  toggleLocal(): void {
    const w = this.world, a = w.local;
    if (a.role !== "runner" || !w.round.canAct()) return;
    if (a.hiding) { this.set(a, false); return; }
    const spot = this.nearest(a);
    if (spot) this.set(a, true, spot);
  }

  /** Get in or out of a spot (the single place; network updates come here too). */
  set(a: Actor, on: boolean, spot?: HideSpot | null, remote = false): void {
    if (a.hiding === on || !a.inPlay) return;
    const target = on ? spot ?? this.nearest(a) : this.spotOf(a);
    if (target) target.occupant = on ? a : null;
    a.setHiding(on, on && target ? target : undefined);
    if (!on && target && target.out !== target && a.control !== "remote") a.teleport(target.out);
    if (a === this.world.local) this.breath = BREATH.max;
    this.botHold.delete(a);
    this.world.noise.emit(a.x, a.y, NOISE.locker, "locker", a);
    this.world.events.emit("hidingChanged", { actor: a, remote });
  }

  update(dt: number): void {
    const w = this.world;
    // The local player's breath.
    if (w.local.hiding && this.holding) {
      this.breath -= dt;
      if (this.breath <= 0) {
        this.breath = -1.5; // gasp, then a moment before you can hold again
        this.gasp(w.local);
      }
    } else {
      this.breath = Math.min(BREATH.max, this.breath + dt * BREATH.refill);
    }
    for (const r of w.runners()) {
      if (!r.inPlay || !r.hiding || r.control === "remote") continue;
      const threat = this.nearestThreat(r);
      const holding = r === w.local ? this.holding && this.breath > 0 : this.botHolds(r, threat, dt);
      if (holding || threat > BREATH.alertRange) { this.breathT.delete(r); continue; }
      // Breathing in the dark, quietly — only a monster right outside hears it.
      const t = (this.breathT.get(r) ?? 0) + dt;
      if (t >= BREATH_EVERY) { this.breathT.set(r, 0); w.noise.emit(r.x, r.y, BREATH.hearRange / TILE, "breath", r, true); }
      else this.breathT.set(r, t);
    }
    for (const [spot, c] of this.checks) {
      c.left -= dt;
      if (c.left > 0) continue;
      this.checks.delete(spot);
      if (spot.kind === "locker") this.setLocker(spot, false);
      if (spot.occupant && w.isAuthority) {
        const r = spot.occupant;
        this.set(r, false);
        if (r === w.local) w.toast("ТЕБЯ НАШЛИ!", "bad");
        w.round.grab(r, c.by);
      }
    }
  }

  private nearestThreat(r: Actor): number {
    let best = Infinity;
    for (const t of this.world.threats()) best = Math.min(best, dist(r, t.authPos));
    return best;
  }

  /** Bots hold their breath while a monster is close, for as long as they can. */
  private botHolds(r: Actor, threat: number, dt: number): boolean {
    if (threat > BREATH.alertRange) { this.botHold.delete(r); return false; }
    const held = (this.botHold.get(r) ?? 0) + dt;
    this.botHold.set(r, held);
    if (held > BREATH.max) { this.botHold.set(r, -2); this.gasp(r); return false; }
    return held >= 0;
  }

  private gasp(r: Actor): void {
    this.world.noise.emit(r.x, r.y, NOISE.gasp, "gasp", r, true);
    if (r === this.world.local) this.world.toast("Не хватило воздуха!", "bad");
  }

  /** A monster searches a spot: after a moment it is opened, and whoever is inside is found. */
  check(spot: HideSpot, by: Actor): void {
    if (this.checks.has(spot)) return;
    this.checks.set(spot, { left: HUNTER_AI.checkTime, by });
    if (spot.kind === "locker") this.setLocker(spot, true);
    this.world.events.emit("spotChecked", { index: this.spots.indexOf(spot), by: by.id });
  }

  checking(spot: HideSpot): boolean { return this.checks.has(spot); }

  /** A hunter player searches a spot: decided by the authority (clients ask the host). */
  requestCheck(spot: HideSpot, by: Actor): void {
    if (this.world.isAuthority) this.check(spot, by);
    else this.world.events.emit("checkRequested", { index: this.spots.indexOf(spot) });
  }

  private setLocker(spot: HideSpot, open: boolean): void {
    const s = spot.sprite;
    if (!s) return;
    const side = s.texture.key.startsWith("interactive/locker_side");
    s.setTexture(side ? (open ? LOCKER_SIDE.open : LOCKER_SIDE.closed) : open ? "interactive/locker_open" : "interactive/locker_closed");
    s.setScale(LOCKER_WIDTH / s.width);
  }

  /** Runners hiding in any spot within `range` of `p`. */
  hiddenNear(p: Vec2, range: number): Actor[] {
    return this.spots.filter(s => s.occupant && dist(s, p) <= range).map(s => s.occupant!);
  }
}
