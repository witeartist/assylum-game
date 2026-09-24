// Keys and the exit. Collect every key to open the exit; reach it to escape.
import type Phaser from "phaser";
import { dist, tileCenter } from "../core/geom";
import type { Tile } from "../core/types";
import { EXIT_RADIUS, PICKUP_RADIUS } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { GoalCandidate } from "../ai/goals";
import { DEPTH } from "../ui/theme";

interface KeyPickup {
  tile: Tile;
  sprite: Phaser.GameObjects.Image;
  baseY: number;
  bob: number;
  taken: boolean;
}

const KEY_SCALE = 1.4;
const EXIT_SCALE = 2;
const BOB_SPEED = 3;
const BOB_HEIGHT = 3;

export class Objectives {
  readonly keys: KeyPickup[];
  readonly total: number;
  collected = 0;
  readonly exit: { tile: Tile; sprite: Phaser.GameObjects.Image; open: boolean };

  constructor(private world: World) {
    const scene = world.scene;
    this.keys = world.level.keyTiles.map(tile => {
      const p = tileCenter(tile);
      const sprite = scene.add.image(p.x, p.y, "item.key").setScale(KEY_SCALE).setDepth(DEPTH.pickups);
      return { tile, sprite, baseY: p.y, bob: world.rng.range(0, Math.PI * 2), taken: false };
    });
    this.total = this.keys.length;
    const ep = tileCenter(world.level.exitTile);
    this.exit = {
      tile: world.level.exitTile,
      sprite: scene.add.image(ep.x, ep.y, "item.exitLocked").setScale(EXIT_SCALE).setDepth(DEPTH.pickups),
      open: false,
    };
  }

  update(dt: number): void {
    for (const k of this.keys) {
      if (k.taken) continue;
      k.bob += dt;
      k.sprite.y = k.baseY + Math.sin(k.bob * BOB_SPEED) * BOB_HEIGHT;
    }
    // Pickups and escapes are detected by the peer that simulates the runner.
    for (const r of this.world.runners()) {
      if (!r.inPlay || r.hiding || r.control === "remote") continue;
      this.keys.forEach((k, i) => {
        if (!k.taken && dist(r, { x: k.sprite.x, y: k.baseY }) < PICKUP_RADIUS) this.collectKey(i, r);
      });
      if (this.exit.open && r.inPlay && dist(r, this.exit.sprite) < EXIT_RADIUS) this.world.round.escape(r);
    }
  }

  /** The single place a key is picked up — by a local runner or reported over the network. */
  collectKey(index: number, by: Actor | string | null, remote = false): boolean {
    const k = this.keys[index];
    if (!k || k.taken) return false;
    const w = this.world;
    k.taken = true;
    k.sprite.destroy();
    this.collected++;
    const local = by === w.local;
    const byName = typeof by === "string" ? by : by ? by.def.name : null;
    w.events.emit("keyCollected", { index, by: byName, local, remote });
    if (this.collected >= this.total) {
      this.exit.open = true;
      this.exit.sprite.setTexture("item.exit");
      w.toast("ВЫХОД ОТКРЫТ! БЕГИ!", "good");
      w.events.emit("exitOpened", {});
    } else {
      w.toast("Ключ " + this.collected + "/" + this.total + (byName && !local ? " — " + byName : ""), "key");
    }
    if (local) w.shake(200, 0.005);
    return true;
  }

  isKeyTaken(index: number): boolean { return this.keys[index]?.taken ?? true; }

  /** Keys still lying on the map, for bot goal selection. */
  keyGoals(): GoalCandidate[] {
    return this.keys.flatMap((k, index) => k.taken ? [] : [{ tile: k.tile, index }]);
  }
}
