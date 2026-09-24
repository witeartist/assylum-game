// Pacing: counts down to the boss and wakes it up.
import { CHARACTERS, BOSS_ID } from "../data/characters";
import { FLICKER, HUNTER_BOSS_BOOST } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { spawnBoss } from "../game/spawn";

export class Director {
  bossSpawned = false;
  boss: Actor | null = null;
  private bossTimer = 0;

  constructor(private world: World) {}

  /** Whole seconds until the boss wakes up. */
  get bossCountdown(): number {
    return Math.max(0, Math.ceil(this.world.diff.bossDelay - this.bossTimer));
  }

  update(dt: number): void {
    if (this.bossSpawned) return;
    // Every peer counts down for the HUD; only the authority spawns.
    this.bossTimer += dt;
    if (this.bossTimer >= this.world.diff.bossDelay && this.world.isAuthority) this.spawnBoss(false);
  }

  spawnBoss(remote: boolean): void {
    if (this.bossSpawned) return;
    const w = this.world;
    this.bossSpawned = true;
    for (const a of w.actors) if (a.role === "hunter" && a.control === "ai") a.speed = w.diff.foxSpeed * HUNTER_BOSS_BOOST;
    w.lighting.flickerStrength = FLICKER.boss;
    this.boss = spawnBoss(w);
    w.events.emit("banner", { text: CHARACTERS[BOSS_ID].name.toUpperCase() + " ПРОСНУЛАСЬ", tone: "blood" });
    w.events.emit("screenFlash", { color: 0x960000, alpha: 0.5, ms: 2000 });
    w.shake(500, 0.02);
    w.events.emit("bossSpawned", { remote });
  }
}
