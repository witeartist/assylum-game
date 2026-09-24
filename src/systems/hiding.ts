// Hiding spots: lockers in most rooms, beds in wards. A hidden runner can't be seen or caught
// by contact, but the hunter periodically checks the spots around it.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Vec2 } from "../core/types";
import { BED_RANGE, LOCKER_RANGE } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { DEPTH } from "../ui/theme";

export interface HideSpot extends Vec2 {
  kind: "locker" | "bed";
  sprite: Phaser.GameObjects.Image;
}

const LOCKER_SCALE = 1.6;

export class Hiding {
  readonly spots: HideSpot[] = [];

  constructor(private world: World) {
    const scene = world.scene;
    for (const t of world.level.hidingSpots) {
      const p = tileCenter(t);
      const sprite = scene.add.image(p.x, p.y, "prop.locker").setScale(LOCKER_SCALE).setDepth(DEPTH.decor);
      this.spots.push({ x: p.x, y: p.y, kind: "locker", sprite });
    }
    for (const bed of world.level.bedSpots) {
      const a = tileCenter(bed.tile), b = tileCenter(bed.tile2);
      const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const sprite = scene.add.image(p.x, p.y, bed.sprite).setDepth(DEPTH.decor);
      // Beds span two tiles along their orientation.
      sprite.setScale(bed.orientation === "vertical" ? TILE * 2 / sprite.height : TILE * 2 / sprite.width);
      this.spots.push({ x: p.x, y: p.y, kind: "bed", sprite });
    }
  }

  nearest(p: Vec2): HideSpot | null {
    let best: HideSpot | null = null, bestD = Infinity;
    for (const s of this.spots) {
      const d = dist(p, s);
      if (d < (s.kind === "bed" ? BED_RANGE : LOCKER_RANGE) && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** E key: hide in the nearest spot, or come out. */
  toggleLocal(): void {
    const w = this.world, a = w.local;
    if (a.role !== "runner" || !w.round.canAct()) return;
    if (a.hiding) {
      this.set(a, false);
      w.toast("Укрытие покинуто", "warn");
      return;
    }
    const spot = this.nearest(a);
    if (spot) {
      this.set(a, true, spot);
      w.toast("В УКРЫТИИ (E — выйти)", "good");
    }
  }

  set(a: Actor, on: boolean, spot?: Vec2, remote = false): void {
    if (a.hiding === on || !a.inPlay) return;
    a.setHiding(on, spot);
    this.world.events.emit("hidingChanged", { actor: a, remote });
  }

  /** Runners hiding in any spot within `range` of `p`. */
  hiddenNear(p: Vec2, range: number): Actor[] {
    const spots = this.spots.filter(s => dist(s, p) <= range);
    return this.world.runners().filter(r => r.inPlay && r.hiding && spots.some(s => dist(r.authPos, s) < TILE));
  }
}
