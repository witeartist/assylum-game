// Level data produced by the generator, plus the room helpers everyone shares.
import { MAP_W, MAP_H } from "../core/constants";
import type { Tile } from "../core/types";
import type { ItemKind } from "../data/items";
import type { RoomType } from "../data/rooms";

export interface Rect { x: number; y: number; w: number; h: number; }

export interface Room extends Rect { type: RoomType; }

/** A piece of furniture; (col, row) is its top-left tile, w × h its footprint. */
export interface FurniturePiece { key: string; col: number; row: number; w: number; h: number; solid: boolean; }

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

export interface ItemSpawn { tile: Tile; kind: ItemKind; }

/** A door in a doorway (1–2 tiles). `horizontal`: set in a wall that runs left–right (you pass up/down). */
export interface GateSpot { tiles: Tile[]; horizontal: boolean; open: boolean; }

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
  furniture: FurniturePiece[];
  hidingSpots: Tile[];
  bedSpots: BedSpot[];
  /** Room ring tiles that are open: doorways between rooms and corridors. */
  doorways: Tile[];
  /** Doors that open and close, in some doorways. */
  gates: GateSpot[];
  /** Holes knocked through walls (drawn broken, with rubble). */
  breaches: Tile[];
  lockedDoors: LockedDoor[];
  lights: LampSource[];
  /** Fuses lying around, and the box on a wall they go into (null when the exit needs no power). */
  fuseTiles: Tile[];
  fuseBox: Tile | null;
  items: ItemSpawn[];
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

export function furnitureTiles(p: FurniturePiece): Tile[] {
  const out: Tile[] = [];
  for (let r = p.row; r < p.row + p.h; r++) for (let c = p.col; c < p.col + p.w; c++) out.push({ col: c, row: r });
  return out;
}

/** Tiles that block movement: solid furniture. */
export function blockingFurnitureTiles(level: Pick<LevelData, "furniture">): Tile[] {
  return level.furniture.filter(p => p.solid).flatMap(furnitureTiles);
}

/** Ring tiles of a room that open to the outside (its doorways). */
export function findRoomEntryTiles(grid: ReadonlyArray<ArrayLike<string>>, room: Rect): Tile[] {
  const entries: Tile[] = [];
  const open = (r: number, c: number) => r >= 0 && r < MAP_H && c >= 0 && c < MAP_W && grid[r][c] !== "#";
  for (let c = room.x + 1; c < room.x + room.w - 1; c++) {
    if (open(room.y, c) && open(room.y - 1, c)) entries.push({ col: c, row: room.y });
    const botY = room.y + room.h - 1;
    if (open(botY, c) && open(botY + 1, c)) entries.push({ col: c, row: botY });
  }
  for (let r = room.y + 1; r < room.y + room.h - 1; r++) {
    if (open(r, room.x) && open(r, room.x - 1)) entries.push({ col: room.x, row: r });
    const rightX = room.x + room.w - 1;
    if (open(r, rightX) && open(r, rightX + 1)) entries.push({ col: rightX, row: r });
  }
  return entries;
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
