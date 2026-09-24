// One light model for both the picture and the AI. Lamps are static: their light is baked per
// tile (walls block it) for AI checks, and the same lamps — plus flashlights, the hunter's flash
// and glowing objects — are handed to the renderer every frame.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import { tileCenter, tileIndex, worldToTile } from "../core/geom";
import type { Vec2 } from "../core/types";
import { FLASHLIGHT_MODES, FLICKER, FOX_FLASH } from "../data/balance";
import { BOSS_RED_TINT, EMERGENCY_SHARE, FLICKER_SHARE, LIGHTS, type LightLook, type RGB } from "../data/lights";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

/** A light for one frame, world px. kind: 0 lamp (fades with view distance), 1 plain, 2 flashlight beam. */
export interface FrameLight {
  x: number; y: number; radius: number; intensity: number;
  color: RGB;
  kind: 0 | 1 | 2;
  /** Cone: direction and cosines of the outer/inner edge (omni lights: cosOuter = -2). */
  dirX: number; dirY: number; cosOuter: number; cosInner: number;
}

interface Lamp { x: number; y: number; radius: number; intensity: number; emergency: boolean; flicker: boolean; seed: number; }

/** Stable pseudo-random number for a lamp, the same on every peer. */
function lampHash(col: number, row: number): number {
  const h = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export class Lighting {
  /** Lamp brightness per tile, 0..1 (0 = dark). */
  readonly lampLevel = new Float32Array(MAP_W * MAP_H);
  flickerStrength: number = FLICKER.calm;
  private t = 0;
  private lamps: Lamp[];

  constructor(private world: World) {
    this.lamps = world.level.lights.map(l => {
      const h = lampHash(l.col, l.row), p = tileCenter(l);
      return { x: p.x, y: p.y, radius: l.radius * TILE, intensity: l.intensity, emergency: h < EMERGENCY_SHARE, flicker: h > 1 - FLICKER_SHARE, seed: h * 100 };
    });
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
          if (!hasLineOfSight(world.sight, from, tileCenter({ col, row }))) continue;
          this.lampLevel[i] = level;
        }
      }
    }
  }

  update(dt: number): void { this.t += dt; }

  /** Lamp positions and kinds, for drawing fixtures. */
  lampsInfo(): { x: number; y: number; emergency: boolean; flicker: boolean }[] {
    return this.lamps.map(l => ({ x: l.x, y: l.y, emergency: l.emergency, flicker: l.flicker }));
  }

  /** Global dimming this frame (flicker), 0..~0.1. */
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

  /** Every light that can touch the view rect (x, y, w, h), most important first. */
  frameLights(view: { x: number; y: number; width: number; height: number }, viewer: Actor, max: number): FrameLight[] {
    const w = this.world, out: FrameLight[] = [];
    const omni = (x: number, y: number, look: LightLook, radiusTiles: number, intensity: number, kind: 0 | 1 | 2 = 1, color = look.color) =>
      out.push({ x, y, radius: radiusTiles * TILE, intensity: intensity * look.intensity, color, kind, dirX: 1, dirY: 0, cosOuter: -2, cosInner: -1 });

    // Local perception first: it must never be culled.
    if (w.local.role === "hunter" && viewer === w.local) omni(viewer.x, viewer.y, LIGHTS.hunterEyes, LIGHTS.hunterEyes.radius, 1);
    else omni(viewer.x, viewer.y, LIGHTS.personal, LIGHTS.personal.radius, 1);

    for (const a of w.actors) {
      if (!a.inPlay || a.hiding || !a.flashlight.on) continue;
      const mode = FLASHLIGHT_MODES[a.flashlight.mode - 1];
      out.push({
        x: a.x, y: a.y, radius: mode.rangeTiles * TILE, intensity: LIGHTS.flashlight.intensity, color: LIGHTS.flashlight.color, kind: 2,
        dirX: Math.cos(a.facing), dirY: Math.sin(a.facing), cosOuter: Math.cos(mode.halfAngle), cosInner: Math.cos(mode.halfAngle * 0.55),
      });
      omni(a.x, a.y, LIGHTS.spill, LIGHTS.spill.radius, 1);
    }
    const flash = w.foxFlash;
    if (flash.active) omni(flash.x, flash.y, LIGHTS.foxFlash, FOX_FLASH.radiusTiles, 1);

    const redness = w.director.bossSpawned ? BOSS_RED_TINT : 0;
    const dim = 1 - this.flicker * 3;
    for (const lamp of this.lamps) {
      const look = lamp.emergency ? LIGHTS.emergency : LIGHTS.lamp;
      let k = lamp.intensity * dim;
      if (lamp.flicker) {
        const f = Math.sin(this.t * 13 + lamp.seed) * Math.sin(this.t * 7.7 + lamp.seed * 2);
        k *= f > 0.82 ? 0.15 : 0.85 + 0.15 * f;
      }
      const c = look.color, e = LIGHTS.emergency.color;
      const color: RGB = [c[0] + (e[0] - c[0]) * redness, c[1] + (e[1] - c[1]) * redness, c[2] + (e[2] - c[2]) * redness];
      omni(lamp.x, lamp.y, look, lamp.radius / TILE, k, 0, color);
    }
    for (const d of w.doors.doors) if (!d.open) omni(d.terminal.x, d.terminal.y - 8, LIGHTS.terminal, LIGHTS.terminal.radius, 1 + 0.15 * Math.sin(this.t * 4));
    const exit = w.objectives.exit;
    const exitLook = exit.open ? LIGHTS.exitOpen : LIGHTS.exitLocked;
    omni(exit.point.x, exit.point.y, exitLook, exitLook.radius, exit.open ? 1 + 0.2 * Math.sin(this.t * 3) : 1);
    for (const k of w.objectives.keys) if (!k.taken) omni(k.sprite.x, k.sprite.y, LIGHTS.key, LIGHTS.key.radius, 0.8 + 0.2 * Math.sin(this.t * 5 + k.bob));

    const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
    const visible = out.filter(l =>
      l.x + l.radius > view.x && l.x - l.radius < view.x + view.width && l.y + l.radius > view.y && l.y - l.radius < view.y + view.height);
    // Moving lights (flashlights, flash, glows) before lamps, then nearest first.
    visible.sort((a, b) => (a.kind === 0 ? 1 : 0) - (b.kind === 0 ? 1 : 0) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return visible.slice(0, max);
  }
}
