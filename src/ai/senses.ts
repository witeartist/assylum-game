// How monsters perceive runners — the same rules the players' eyes follow, plus a field of view:
// a monster sees what is in front of it, lit (or close enough to make out in the dark), and not
// behind a wall. Anything right next to it, or shining a flashlight in its face, is noticed anyway.
import { angleDiff, dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import { FLASHLIGHT_MODES } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

export interface SightSpec {
  /** Half angle of the field of view, radians. */
  fovHalf: number;
  /** Farthest it sees a lit runner, world px. */
  range: number;
  /** It makes out unlit runners this close, world px. */
  dark: number;
  /** Noticed whatever the direction, world px. */
  near: number;
}

/** `holder`'s flashlight beam reaches `p`. */
export function inBeam(holder: Actor, p: Vec2): boolean {
  if (!holder.beamOn) return false;
  const mode = FLASHLIGHT_MODES[holder.flashlight.mode - 1];
  const d = dist(holder, p);
  if (d > mode.rangeTiles * 32 || d < 1) return false;
  return angleDiff(holder.facing, Math.atan2(p.y - holder.y, p.x - holder.x)) <= mode.halfAngle * 1.1;
}

/** Can monster `me` see runner `r` right now? `evenHidden`: judge as if `r` stood in the open. */
export function sees(world: World, me: Actor, r: Actor, s: SightSpec, evenHidden = false): boolean {
  if (!r.inPlay || (r.hiding && !evenHidden)) return false;
  const p = r.authPos, d = dist(me, p);
  if (d > s.range) return false;
  const shining = inBeam(r, me);
  const near = d <= s.near;
  if (!near && !shining && angleDiff(me.facing, Math.atan2(p.y - me.y, p.x - me.x)) > s.fovHalf) return false;
  if (!hasLineOfSight(world.sight, me, p)) return false;
  if (near || shining) return true;
  if (d <= s.dark * (r.def.ability?.darkStealth ?? 1)) return true;
  return r.beamOn || world.lighting.isLit(p);
}
