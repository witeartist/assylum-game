// Pacing: the building wakes up. It counts down, warns (the lights begin to stutter, the walls
// groan) and wakes: the lamps turn red and die one after another (lighting.ts), the villains move
// faster. Every peer counts down for the HUD and the warnings; the authority decides the moment.
import { FLICKER, WAKE } from "../data/balance";
import type { World } from "../game/World";

const WARNINGS: Record<number, string> = {
  30: "Где-то внизу скрежещет металл…",
  20: "Лампы дрожат. Здание просыпается.",
  10: "Стены гудят. СВЕТ СЕЙЧАС ПОГАСНЕТ.",
};

export class Director {
  /** The building is awake. */
  awake = false;
  /** Seconds since it woke up. */
  awakeFor = 0;
  private timer = 0;
  private warned = new Set<number>();

  constructor(private world: World) {}

  /** Whole seconds until the building wakes up. */
  get countdown(): number {
    return Math.max(0, Math.ceil(this.world.diff.wakeDelay - this.timer));
  }

  update(dt: number): void {
    const w = this.world;
    if (this.awake) { this.awakeFor += dt; return; }
    this.timer += dt;
    const left = w.diff.wakeDelay - this.timer;
    const first = WAKE.warnAt[0];
    if (left < first) w.lighting.flickerStrength = FLICKER.calm + (FLICKER.awake - FLICKER.calm) * 0.6 * (1 - left / first);
    for (const at of WAKE.warnAt) {
      if (left > at || this.warned.has(at)) continue;
      this.warned.add(at);
      w.toast(WARNINGS[at] ?? "…", at <= 10 ? "blood" : "warn");
      w.shake(300 + (30 - at) * 20, 0.004 + (30 - at) * 0.0004);
    }
    if (left <= 0 && w.isAuthority) this.wake(false);
  }

  /** The single place the building wakes (the authority's clock, or its message). */
  wake(remote: boolean): void {
    if (this.awake) return;
    const w = this.world;
    this.awake = true;
    // Each peer speeds up the villains it simulates.
    for (const a of w.threats()) if (a.control !== "remote") a.speedMul = WAKE.boost;
    w.lighting.flickerStrength = FLICKER.awake;
    w.events.emit("banner", { text: "ЗДАНИЕ ПРОСНУЛОСЬ", tone: "blood" });
    w.events.emit("screenFlash", { color: 0x960000, alpha: 0.5, ms: 2000 });
    w.shake(500, 0.02);
    w.events.emit("buildingAwake", { remote });
  }
}
