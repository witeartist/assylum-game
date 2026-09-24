// Level data produced by the generator, plus the room helpers everyone shares.
import { MAP_W, MAP_H } from "../core/constants";
import type { Tile } from "../core/types";
import type { RoomType } from "../data/rooms";

export interface Rect { x: number; y: number; w: number; h: number; }

export interface Room extends Rect { type: RoomType; }

export interface Decoration { tile: Tile; room: RoomType; }

export interface LockedDoor {
  /** Floor tiles on the room ring that are walled off until the terminal is used. */
  doorTiles: Tile[];
  terminalTile: Tile;
  /** Index into LevelData.keyTiles of the key sealed behind this door. */
  keyIndex: number;
}

export interface BedSpot {
  tile: Tile;
  tile2: Tile;
  orientation: "vertical" | "horizontal";
  sprite: string;
}

export interface LampSource { col: number; row: number; radius: number; intensity: number; }

export interface LevelData {
  seed: number;
  /** "#" wall, "." floor, "B" bloody floor. Locked doors are floor here; see lockedDoors. */
  rows: string[];
  rooms: Room[];
  playerSpawn: Tile;
  foxSpawn: Tile;
  npcSpawns: Tile[];
  exitTile: Tile;
  bossSpawn: Tile;
  keyTiles: Tile[];
  decorations: Decoration[];
  hidingSpots: Tile[];
  bedSpots: BedSpot[];
  doors: Tile[];
  lockedDoors: LockedDoor[];
  lights: LampSource[];
  startRoom: RoomType;
}

export function roomCenter(room: Rect): Tile {
  return { col: Math.floor(room.x + room.w / 2), row: Math.floor(room.y + room.h / 2) };
}

export function roomInteriorTiles(room: Rect): Tile[] {
  const tiles: Tile[] = [];
  for (let r = room.y + 1; r < room.y + room.h - 1; r++)
    for (let c = room.x + 1; c < room.x + room.w - 1; c++)
      tiles.push({ col: c, row: r });
  return tiles;
}

export function rectContains(room: Rect, t: Tile): boolean {
  return t.col >= room.x && t.col < room.x + room.w && t.row >= room.y && t.row < room.y + room.h;
}

/** Room index for every tile (-1 = corridor), for floor textures and the room label. */
export function buildRoomLookup(rooms: readonly Room[]): Int16Array {
  const lookup = new Int16Array(MAP_W * MAP_H).fill(-1);
  rooms.forEach((room, i) => {
    for (let r = room.y; r < room.y + room.h; r++)
      for (let c = room.x; c < room.x + room.w; c++)
        if (c >= 0 && r >= 0 && c < MAP_W && r < MAP_H) lookup[r * MAP_W + c] = i;
  });
  return lookup;
}
