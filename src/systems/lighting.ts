// One light model for both the picture and the AI: "can the hunter see this runner" uses the
// same lamp light that is drawn on screen. Lamps are static, so their light is baked per tile,
// and walls block it.
import { MAP_W, MAP_H } from "../core/constants";
import { tileCenter, tileIndex, worldToTile } from "../core/geom";
import type { Vec2 } from "../core/types";
import { FLICKER } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

export class Lighting {
  /** Lamp brightness per tile, 0..1 (0 = dark). */
  readonly lampLevel = new Float32Array(MAP_W * MAP_H);
  flickerStrength: number = FLICKER.calm;
  private t = 0;

  constructor(private world: World) {
    for (const lamp of world.level.lights) {
      const from = tileCenter(lamp);
      const r = Math.ceil(lamp.radius);
      for (let row = Math.max(0, lamp.row - r); row <= Math.min(MAP_H - 1, lamp.row + r); row++) {
        for (let col = Math.max(0, lamp.col - r); col <= Math.min(MAP_W - 1, lamp.col + r); col++) {
          const d = Math.hypot(col - lamp.col, row - lamp.row);
          if (d >= lamp.radius) continue;
          const level = lamp.intensity * (1 - d / lamp.radius);
          const i = tileIndex(col, row);
          if (level <= this.lampLevel[i]) continue;
          if (!hasLineOfSight(world.grid, from, tileCenter({ col, row }))) continue;
          this.lampLevel[i] = level;
        }
      }
    }
  }

  update(dt: number): void { this.t += dt; }

  /** How much the lights dim this frame (flicker), 0..~0.1. */
  get flicker(): number {
    return Math.abs(Math.sin(this.t * 7.3) * Math.sin(this.t * 3.1)) * this.flickerStrength * 0.12;
  }

  inLamp(p: Vec2): boolean {
    const t = worldToTile(p);
    return this.lampLevel[tileIndex(t.col, t.row)] > 0;
  }

  /** A runner the hunter can spot: flashlight on, standing in lamp light, or caught in the flash. */
  isExposed(a: Actor): boolean {
    return a.flashlight.on || this.inLamp(a.authPos) || this.world.foxFlash.active;
  }
}
