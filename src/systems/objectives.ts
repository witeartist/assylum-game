// Keys and the exit. Collect every key — and restore the power, if the level has fuses — to open
// the exit; reach it to escape.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Tile, Vec2 } from "../core/types";
import { EXIT_RADIUS, PICKUP_RADIUS } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { GoalCandidate } from "../ai/goals";
import { placeStanding } from "../render/worldView";

interface KeyPickup {
  tile: Tile;
  sprite: Phaser.GameObjects.Image;
  baseY: number;
  bob: number;
  taken: boolean;
}

const KEY_SIZE = TILE * 0.6;
const EXIT_WIDTH = TILE * 1.9;
const BOB_SPEED = 3;
const BOB_HEIGHT = 3;

export class Objectives {
  readonly keys: KeyPickup[];
  readonly total: number;
  collected = 0;
  /** The exit: a double door in the north wall over `tile` and the tile to its right. */
  readonly exit: { tile: Tile; point: Vec2; sprite: Phaser.GameObjects.Image; open: boolean };

  constructor(private world: World) {
    const scene = world.scene;
    this.keys = world.level.keyTiles.map(tile => {
      const p = tileCenter(tile);
      const sprite = scene.add.image(p.x, p.y, "interactive/key").setDepth(p.y + TILE * 0.3);
      sprite.setScale(KEY_SIZE / sprite.width);
      return { tile, sprite, baseY: p.y, bob: world.rng.range(0, Math.PI * 2), taken: false };
    });
    this.total = this.keys.length;
    const et = world.level.exitTile;
    const doorX = (et.col + 1) * TILE;
    this.exit = {
      tile: et,
      point: { x: doorX, y: et.row * TILE + TILE / 2 },
      sprite: placeStanding(scene, "interactive/exit_door_closed", doorX, et.row * TILE, EXIT_WIDTH),
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
      if (this.exit.open && r.inPlay && dist(r, this.exit.point) < EXIT_RADIUS) this.world.round.escape(r);
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
    if (!this.tryOpenExit()) {
      const more = this.collected >= this.total ? " — нужно питание: предохранители в щиток" : "";
      w.toast("Ключ " + this.collected + "/" + this.total + (byName && !local ? " — " + byName : "") + more, "key");
    }
    if (local) w.shake(200, 0.005);
    return true;
  }

  /** Open the exit once every key is in and the power is on. Returns whether it opened now. */
  tryOpenExit(): boolean {
    const w = this.world;
    if (this.exit.open || this.collected < this.total || !w.power.on) return false;
    this.exit.open = true;
    const sprite = this.exit.sprite;
    sprite.setTexture("interactive/exit_door_open");
    sprite.setScale(EXIT_WIDTH / sprite.width);
    w.toast("ВЫХОД ОТКРЫТ! БЕГИ!", "good");
    w.events.emit("exitOpened", {});
    return true;
  }

  isKeyTaken(index: number): boolean { return this.keys[index]?.taken ?? true; }

  /** Keys still lying on the map, for bot goal selection. */
  keyGoals(): GoalCandidate[] {
    return this.keys.flatMap((k, index) => k.taken ? [] : [{ tile: k.tile, index }]);
  }
}
