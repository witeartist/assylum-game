// Body state of the actors this peer simulates: stamina and exhaustion, adrenaline, stuns and the
// flashlight battery. Remote actors are simulated by their own peer and only report flags.
import { BATTERY, STAMINA } from "../data/balance";
import type { Actor } from "../entities/Actor";
import { NET_FLAG } from "../entities/state";
import type { World } from "../game/World";

/** One step of stamina for an actor that is running (and moving) or not. Pure, for tests. */
export function staminaStep(s: { stamina: number; staminaMax: number; exhausted: boolean; adrenaline: number }, running: boolean, moving: boolean, dt: number): void {
  if (running && moving && !s.exhausted) {
    if (s.adrenaline <= 0) s.stamina = Math.max(0, s.stamina - dt);
    if (s.stamina <= 0) s.exhausted = true;
  } else {
    s.stamina = Math.min(s.staminaMax, s.stamina + dt * (moving ? STAMINA.regenWalk : STAMINA.regenRest));
  }
  if (s.exhausted && s.stamina >= s.staminaMax * STAMINA.recoverAt) s.exhausted = false;
}

export class Vitals {
  constructor(private world: World) {}

  update(dt: number): void {
    for (const a of this.world.actors) {
      if (a.control === "remote" || !a.inPlay) continue;
      if (a.stunned > 0) a.stunned = Math.max(0, a.stunned - dt);
      const v = a.velocity;
      // A brute player's lunge (running) is short: it has to catch its breath after. The AI
      // brute keeps its own rhythm of rushing and resting.
      if (a.kit === "brute" && a.control !== "ai") staminaStep(a, a.gait === "run", Math.hypot(v.x, v.y) > 20, dt);
      if (a.role !== "runner") continue;
      if (a.adrenaline > 0) a.adrenaline = Math.max(0, a.adrenaline - dt);
      staminaStep(a, a.gait === "run", Math.hypot(v.x, v.y) > 20, dt);
      if (a.lightJam > 0) a.lightJam = Math.max(0, a.lightJam - dt);
      this.battery(a, dt);
    }
  }

  private battery(a: Actor, dt: number): void {
    const f = a.flashlight;
    if (!a.beamOn) return;
    f.charge = Math.max(0, f.charge - dt / BATTERY.seconds);
    if (f.charge > 0) return;
    f.on = false;
    if (a === this.world.local) this.world.toast("Батарейка села", "bad");
  }
}

/** The flashlight is on and has charge; a low battery makes the beam stutter. */
export function beamStrength(a: Actor, t: number): number {
  const f = a.flashlight;
  if (!a.beamOn) return 0;
  const low = a.control === "remote" ? (a.netFlags & NET_FLAG.batteryLow) !== 0 : f.charge < BATTERY.low;
  if (!low) return 1;
  const s = Math.sin(t * 23 + a.x * 0.1) * Math.sin(t * 9.7);
  return s > 0.6 ? 0.1 : 0.55 + 0.25 * s;
}
