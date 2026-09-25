// Pacing: counts down to the boss, warns before it wakes (the lights begin to stutter, the
// building groans) and wakes it up.
import { CHARACTERS, BOSS_ID } from "../data/characters";
import { BOSS_AI, FLICKER, HUNTER_BOSS_BOOST } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { spawnBoss } from "../game/spawn";

const WARNINGS: Record<number, string> = {
  30: "Где-то внизу скрежещет металл…",
  20: "Лампы дрожат. Что-то просыпается.",
  10: "Стены гудят. ОНО ИДЁТ.",
};

export class Director {
  bossSpawned = false;
  boss: Actor | null = null;
  private bossTimer = 0;
  private warned = new Set<number>();

  constructor(private world: World) {}

  /** Whole seconds until the boss wakes up. */
  get bossCountdown(): number {
    return Math.max(0, Math.ceil(this.world.diff.bossDelay - this.bossTimer));
  }

  update(dt: number): void {
    if (this.bossSpawned) return;
    const w = this.world;
    // Every peer counts down for the HUD and the warnings; only the authority spawns.
    this.bossTimer += dt;
    const left = w.diff.bossDelay - this.bossTimer;
    const first = BOSS_AI.warnAt[0];
    if (left < first) w.lighting.flickerStrength = FLICKER.calm + (FLICKER.boss - FLICKER.calm) * 0.6 * (1 - left / first);
    for (const at of BOSS_AI.warnAt) {
      if (left > at || this.warned.has(at)) continue;
      this.warned.add(at);
      w.toast(WARNINGS[at] ?? "…", at <= 10 ? "blood" : "warn");
      w.shake(300 + (30 - at) * 20, 0.004 + (30 - at) * 0.0004);
    }
    if (this.bossTimer >= w.diff.bossDelay && w.isAuthority) this.spawnBoss(false);
  }

  spawnBoss(remote: boolean): void {
    if (this.bossSpawned) return;
    const w = this.world;
    this.bossSpawned = true;
    for (const a of w.actors) if (a.role === "hunter" && a.control === "ai") a.speedMul = HUNTER_BOSS_BOOST;
    w.lighting.flickerStrength = FLICKER.boss;
    this.boss = spawnBoss(w);
    w.events.emit("banner", { text: CHARACTERS[BOSS_ID].name.toUpperCase() + " ПРОСНУЛАСЬ", tone: "blood" });
    w.events.emit("screenFlash", { color: 0x960000, alpha: 0.5, ms: 2000 });
    w.shake(500, 0.02);
    w.events.emit("bossSpawned", { remote });
  }
}
