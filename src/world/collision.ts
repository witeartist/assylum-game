// Wall collision as an invisible tilemap layer mirroring the WalkGrid: arcade physics only
// tests the few tiles around each body, and walls have no seams to snag on.
import Phaser from "phaser";
import { MAP_W, MAP_H, TILE } from "../core/constants";
import type { Tile } from "../core/types";
import type { WalkGrid } from "./grid";

const TEXTURE = "__collision";

export class CollisionLayer {
  readonly layer: Phaser.Tilemaps.TilemapLayer;

  constructor(private scene: Phaser.Scene, grid: WalkGrid) {
    if (!scene.textures.exists(TEXTURE)) {
      const c = document.createElement("canvas");
      c.width = TILE; c.height = TILE;
      scene.textures.addCanvas(TEXTURE, c);
    }
    const data: number[][] = [];
    for (let r = 0; r < MAP_H; r++) {
      const row: number[] = [];
      for (let c = 0; c < MAP_W; c++) row.push(grid.isSolid(c, r) ? 0 : -1);
      data.push(row);
    }
    const map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage(TEXTURE)!;
    this.layer = map.createLayer(0, tiles, 0, 0)!;
    this.layer.setVisible(false);
    this.layer.setCollision(0);
  }

  collide(obj: Phaser.GameObjects.GameObject): void {
    this.scene.physics.add.collider(obj, this.layer);
  }

  open(t: Tile): void {
    this.layer.removeTileAt(t.col, t.row, true, true);
  }
}
