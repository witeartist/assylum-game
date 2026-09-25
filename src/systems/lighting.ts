// One light model for both the picture and the AI. Every light of the frame — lamps, flashlights,
// glowsticks, the fox's flash, glowing objects — is collected once; the renderer draws them and
// `lightAt` answers "is this spot lit?" for vision and AI with the same numbers. Lamps stutter
// around a brute, and once the building wakes they turn red and many die, one by one.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import { dist, tileCenter, tileIndex, worldToTile } from "../core/geom";
import type { Vec2 } from "../core/types";
import { FLASHLIGHT_MODES, FLICKER, FOX_FLASH, SEE_LIGHT, WAKE } from "../data/balance";
import { AWAKE_RED_TINT, EMERGENCY_SHARE, FLICKER_SHARE, LIGHTS, type LightLook, type RGB } from "../data/lights";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";
import { beamStrength } from "./vitals";

/** A light for one frame, world px. kind: 0 lamp (fades with view distance), 1 plain, 2 flashlight beam. */
export interface FrameLight {
  x: number; y: number; radius: number; intensity: number;
  color: RGB;
  kind: 0 | 1 | 2;
  /** Cone: direction and cosines of the outer/inner edge (omni lights: cosOuter = -2). */
  dirX: number; dirY: number; cosOuter: number; cosInner: number;
}

interface Lamp {
  x: number; y: number; radius: number; intensity: number; emergency: boolean; flicker: boolean; seed: number;
  /** Seconds after the building wakes when this lamp dies (Infinity: it never does). */
  dieAt: number;
}

/** Lamps closer than this to a brute stutter and die down — the warning that it is near. */
const BRUTE_DIM_RANGE = TILE * 7;
/** A dying lamp sputters this long before it goes out, seconds. */
const DYING = 1.6;

/** Stable pseudo-random number for a lamp, the same on every peer. */
function lampHash(col: number, row: number): number {
  const h = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Strength of a light at distance `d` inside its cone (the shader uses the same curve). */
function falloff(l: FrameLight, p: Vec2, d: number): number {
  if (d >= l.radius) return 0;
  let att = 1 - d / l.radius;
  att *= att;
  if (l.cosOuter > -1.5 && d > 0.5) {
    const c = ((p.x - l.x) * l.dirX + (p.y - l.y) * l.dirY) / d;
    const t = Math.min(1, Math.max(0, (c - l.cosOuter) / Math.max(1e-4, l.cosInner - l.cosOuter)));
    att *= t * t * (3 - 2 * t);
  }
  return att * l.intensity;
}

export class Lighting {
  flickerStrength: number = FLICKER.calm;
  /** Every light this frame (rebuilt in update). */
  lights: FrameLight[] = [];
  /** Every lamp this frame: where it hangs, how much of its usual light it gives (flicker dips), dead for good. */
  readonly lampLevels: { x: number; y: number; level: number; dead: boolean }[] = [];
  private t = 0;
  private lamps: Lamp[];
  /** For each tile, the lamps that can shine on it (walls block them). */
  private lampsFor: number[][];

  constructor(private world: World) {
    this.lamps = world.level.lights.map(l => {
      const h = lampHash(l.col, l.row), p = tileCenter(l);
      // The order the lamps die in is fixed by the level, so every peer loses the same ones.
      const order = lampHash(l.col + 71.3, l.row + 19.1), emergency = h < EMERGENCY_SHARE;
      const dieAt = !emergency && order < WAKE.share ? order / WAKE.share * WAKE.over : Infinity;
      return { x: p.x, y: p.y, radius: l.radius * TILE, intensity: l.intensity, emergency, flicker: h > 1 - FLICKER_SHARE, seed: h * 100, dieAt };
    });
    this.lampsFor = Array.from({ length: MAP_W * MAP_H }, () => []);
    this.bakeLamps();
    world.events.on("doorOpened", () => this.bakeLamps());
    world.events.on("gateChanged", () => this.bakeLamps());
  }

  /** Which lamp reaches which tile, through the current walls and doors. */
  private bakeLamps(): void {
    for (const list of this.lampsFor) list.length = 0;
    this.world.level.lights.forEach((lamp, i) => {
      const from = tileCenter(lamp);
      const r = Math.ceil(lamp.radius);
      for (let row = Math.max(0, lamp.row - r); row <= Math.min(MAP_H - 1, lamp.row + r); row++) {
        for (let col = Math.max(0, lamp.col - r); col <= Math.min(MAP_W - 1, lamp.col + r); col++) {
          if (Math.hypot(col - lamp.col, row - lamp.row) >= lamp.radius + 0.7) continue;
          if (hasLineOfSight(this.world.sight, from, tileCenter({ col, row }))) this.lampsFor[tileIndex(col, row)].push(i);
        }
      }
    });
  }

  update(dt: number): void {
    this.t += dt;
    this.lights = this.collect();
  }

  /** Lamp positions and kinds, for drawing fixtures. */
  lampsInfo(): { x: number; y: number; emergency: boolean; flicker: boolean }[] {
    return this.lamps.map(l => ({ x: l.x, y: l.y, emergency: l.emergency, flicker: l.flicker }));
  }

  /** Global dimming this frame (flicker), 0..~0.1. */
  get flicker(): number {
    return Math.abs(Math.sin(this.t * 7.3) * Math.sin(this.t * 3.1)) * this.flickerStrength * 0.12;
  }

  /** How brightly `p` is lit right now (0 = pitch dark, ~1 = in a lamp's or beam's heart). */
  lightAt(p: Vec2): number {
    const t = worldToTile(p);
    if (t.col < 0 || t.row < 0 || t.col >= MAP_W || t.row >= MAP_H) return 0;
    let sum = 0;
    for (const l of this.lights) {
      sum += this.strengthAt(l, p);
      if (sum >= 1) return sum;
    }
    return sum;
  }

  /** How strongly light `l` falls on `p` (0 where walls or doors block it). */
  strengthAt(l: FrameLight, p: Vec2): number {
    const d = dist(l, p);
    if (d >= l.radius) return 0;
    const k = falloff(l, p, d);
    if (k <= 0.01) return 0;
    if (l.kind === 0) {
      // Lamps: the baked table says which ones reach this tile.
      const t = worldToTile(p);
      if (t.col < 0 || t.row < 0 || t.col >= MAP_W || t.row >= MAP_H) return 0;
      if (!this.lampsFor[tileIndex(t.col, t.row)].some(i => this.lamps[i].x === l.x && this.lamps[i].y === l.y)) return 0;
    } else if (d > TILE * 0.5 && !hasLineOfSight(this.world.sight, l, p)) return 0;
    return k;
  }

  /** Lit enough to be seen. */
  isLit(p: Vec2): boolean { return this.lightAt(p) >= SEE_LIGHT; }

  /** A runner the hunter can spot from afar: lit, or holding a burning flashlight. */
  isExposed(a: Actor): boolean {
    return a.beamOn || this.isLit(a.authPos);
  }

  /** Every light that can touch the view rect, most important first, plus the viewer's own. */
  frameLights(view: { x: number; y: number; width: number; height: number }, viewer: Actor, max: number): FrameLight[] {
    const w = this.world;
    const me = w.local, own = me.kit && viewer === me ? (me.kit === "brute" ? LIGHTS.bruteEyes : LIGHTS.hunterEyes) : LIGHTS.personal;
    const out: FrameLight[] = [this.omni(viewer.x, viewer.y, own, own.radius ?? 1, 1)];
    const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
    const visible = this.lights.filter(l =>
      l.x + l.radius > view.x && l.x - l.radius < view.x + view.width && l.y + l.radius > view.y && l.y - l.radius < view.y + view.height);
    // Moving lights (flashlights, flash, glows) before lamps, then nearest first.
    visible.sort((a, b) => (a.kind === 0 ? 1 : 0) - (b.kind === 0 ? 1 : 0) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return out.concat(visible.slice(0, max - 1));
  }

  private omni(x: number, y: number, look: LightLook, radiusTiles: number, intensity: number, kind: 0 | 1 | 2 = 1, color = look.color): FrameLight {
    return { x, y, radius: radiusTiles * TILE, intensity: intensity * look.intensity, color, kind, dirX: 1, dirY: 0, cosOuter: -2, cosInner: -1 };
  }

  /** All lights of this frame. */
  private collect(): FrameLight[] {
    const w = this.world, out: FrameLight[] = [];
    for (const a of w.actors) {
      if (!a.inPlay || a.hiding) continue;
      const k = beamStrength(a, this.t);
      if (k <= 0) continue;
      const mode = FLASHLIGHT_MODES[a.flashlight.mode - 1];
      out.push({
        x: a.x, y: a.y, radius: mode.rangeTiles * TILE, intensity: LIGHTS.flashlight.intensity * k, color: LIGHTS.flashlight.color, kind: 2,
        dirX: Math.cos(a.facing), dirY: Math.sin(a.facing), cosOuter: Math.cos(mode.halfAngle), cosInner: Math.cos(mode.halfAngle * 0.55),
      });
      out.push(this.omni(a.x, a.y, LIGHTS.spill, LIGHTS.spill.radius, k));
    }
    for (const f of w.abilities.flashes) out.push(this.omni(f.x, f.y, LIGHTS.foxFlash, FOX_FLASH.radiusTiles, 1));
    for (const g of w.items.glowLights()) out.push(this.omni(g.x, g.y, LIGHTS.glowstick, LIGHTS.glowstick.radius, g.strength));

    const brutes = w.threats().filter(a => a.kit === "brute");
    const awake = w.director.awake, redness = awake ? AWAKE_RED_TINT : 0;
    const dim = 1 - this.flicker * 3;
    this.lamps.forEach((lamp, i) => {
      const look = lamp.emergency ? LIGHTS.emergency : LIGHTS.lamp;
      const dying = awake ? w.director.awakeFor - lamp.dieAt : -1;
      if (dying >= DYING) { this.lampLevels[i] = { x: lamp.x, y: lamp.y, level: 0, dead: true }; return; }
      let k = lamp.intensity * dim;
      const choking = dying >= 0 || brutes.some(b => dist(lamp, b) < BRUTE_DIM_RANGE);
      if (lamp.flicker || choking) {
        const f = Math.sin(this.t * (choking ? 23 : 13) + lamp.seed) * Math.sin(this.t * 7.7 + lamp.seed * 2);
        k *= f > (choking ? 0.2 : 0.82) ? 0.12 : 0.85 + 0.15 * f;
      }
      // Its last moments: the sputter fades out.
      if (dying >= 0) k *= 1 - dying / DYING;
      const c = look.color, e = LIGHTS.emergency.color;
      const color: RGB = [c[0] + (e[0] - c[0]) * redness, c[1] + (e[1] - c[1]) * redness, c[2] + (e[2] - c[2]) * redness];
      out.push(this.omni(lamp.x, lamp.y, look, lamp.radius / TILE, k, 0, color));
      this.lampLevels[i] = { x: lamp.x, y: lamp.y, level: k / Math.max(0.01, lamp.intensity), dead: false };
    });
    for (const d of w.doors.doors) if (!d.open) out.push(this.omni(d.terminal.x, d.terminal.y - 8, LIGHTS.terminal, LIGHTS.terminal.radius, 1 + 0.15 * Math.sin(this.t * 4)));
    const exit = w.objectives.exit;
    const exitLook = exit.open ? LIGHTS.exitOpen : LIGHTS.exitLocked;
    out.push(this.omni(exit.point.x, exit.point.y, exitLook, exitLook.radius, exit.open ? 1 + 0.2 * Math.sin(this.t * 3) : 1));
    for (const k of w.objectives.keys) if (!k.taken) out.push(this.omni(k.sprite.x, k.sprite.y, LIGHTS.key, LIGHTS.key.radius, 0.8 + 0.2 * Math.sin(this.t * 5 + k.bob)));
    for (const f of w.power.glows()) out.push(this.omni(f.x, f.y, LIGHTS.fuse, LIGHTS.fuse.radius, 0.8 + 0.2 * Math.sin(this.t * 4 + f.x)));
    return out;
  }
}
