// Static map visuals: floor, walls and door thresholds are baked once into a few large
// textures (instead of thousands of tile sprites); furniture is placed on top.
import { MAP_W, MAP_H, TILE } from "../core/constants";
import { tileCenter, tileIndex } from "../core/geom";
import { ROOMS } from "../data/rooms";
import type { World } from "../game/World";
import { buildRoomLookup } from "../world/level";
import { DEPTH } from "../ui/theme";

/** Chunk side in tiles (1024 px): few draw calls, texture sizes every GPU supports. */
const CHUNK = 32;

export function buildWorldView(world: World): void {
  const { scene, level } = world;
  const lookup = buildRoomLookup(level.rooms);
  const doorTiles = new Set(level.doors.map(d => tileIndex(d.col, d.row)));

  const textureAt = (c: number, r: number): string => {
    const ch = level.rows[r][c];
    if (ch === "#") return (r + c) % 3 === 0 ? "tile.wall2" : "tile.wall";
    if (ch === "B") return "tile.bloodfloor";
    if (doorTiles.has(tileIndex(c, r))) return "tile.doorfloor";
    const room = lookup[tileIndex(c, r)];
    return room >= 0 ? ROOMS[level.rooms[room].type].floor : "tile.floor";
  };

  for (let cy = 0; cy < MAP_H; cy += CHUNK) {
    for (let cx = 0; cx < MAP_W; cx += CHUNK) {
      const w = Math.min(CHUNK, MAP_W - cx), h = Math.min(CHUNK, MAP_H - cy);
      const rt = scene.add.renderTexture(cx * TILE, cy * TILE, w * TILE, h * TILE).setOrigin(0).setDepth(DEPTH.floor);
      rt.beginDraw();
      for (let r = cy; r < cy + h; r++)
        for (let c = cx; c < cx + w; c++) rt.batchDrawFrame(textureAt(c, r), undefined, (c - cx) * TILE, (r - cy) * TILE);
      rt.endDraw();
    }
  }

  for (const dec of level.decorations) {
    const p = tileCenter(dec.tile);
    const room = ROOMS[dec.room];
    scene.add.image(p.x, p.y, room.prop).setScale(room.propScale).setDepth(DEPTH.decor);
  }
}
