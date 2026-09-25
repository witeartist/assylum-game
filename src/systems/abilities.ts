// The villain's R, by kit: the fox's flash (a burst of light that shows who hides in the dark) or
// the brute's roar (heard across the floor; flashlights nearby die for a moment). Every villain
// has its own cooldown; what one uses, every peer sees and hears.
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import { FOX_FLASH, ROAR } from "../data/balance";
import type { Vec2 } from "../core/types";
import type { KitId } from "../data/characters";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";

/** How R reads for each kit: its name, the HUD line when it is ready, the shout when used. */
export const ABILITY: Record<KitId, { name: string; ready: string; shout: string }> = {
  fox: { name: "Вспышка", ready: "[R] вспышка готова", shout: "ВСПЫШКА!" },
  brute: { name: "Рёв", ready: "[R] рёв готов", shout: "РЁВ!" },
};
const COOLDOWN: Record<KitId, number> = { fox: FOX_FLASH.cooldown, brute: ROAR.cooldown };

/** A flash burning right now; it follows its owner. */
export interface Flash { owner: Actor; x: number; y: number; left: number; }

export class Abilities {
  readonly flashes: Flash[] = [];
  private cooldowns = new Map<Actor, number>();

  constructor(private world: World) {
    // A villain player starts ready; the AI waits a full cooldown.
    for (const a of world.threats()) if (a.kit) this.cooldowns.set(a, a.control === "ai" ? COOLDOWN[a.kit] : 0);
  }

  /** Seconds until `a` can use its ability again. */
  cooldown(a: Actor): number { return this.cooldowns.get(a) ?? 0; }
  ready(a: Actor): boolean { return a.kit !== null && this.cooldown(a) <= 0; }

  /**
   * Use it now if it is ready. `remote`: another peer already did, at `at` (where the villain
   * stood there — our copy of it may lag behind); no cooldown here.
   */
  use(a: Actor, remote = false, at: Vec2 = a): boolean {
    if (!a.kit || !a.inPlay) return false;
    if (!remote) {
      if (!this.ready(a)) return false;
      this.cooldowns.set(a, COOLDOWN[a.kit]);
    }
    if (a.kit === "fox") this.flashes.push({ owner: a, x: at.x, y: at.y, left: FOX_FLASH.duration });
    else this.roar(a, at);
    this.world.events.emit("abilityUsed", { kind: a.kit, by: a.id, x: at.x, y: at.y, remote });
    return true;
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

  update(dt: number): void {
    for (const [a, t] of this.cooldowns) if (t > 0) this.cooldowns.set(a, Math.max(0, t - dt));
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.left -= dt;
      if (f.left <= 0) { this.flashes.splice(i, 1); continue; }
      f.x = f.owner.x; f.y = f.owner.y;
    }
  }
}
