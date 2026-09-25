// Furniture placement. Each piece knows where it belongs — against the north wall, along any wall,
// or in the middle of the room with space around it — and some bring a companion (a bench at a
// canteen table). Every solid piece is checked so the level stays winnable and has no cut-off
// corners: everything important stays reachable with the locked doors shut, and every free floor
// tile stays reachable with them open.
import { MAP_W, MAP_H } from "../core/constants";
import { tileIndex } from "../core/geom";
import type { Rng } from "../core/rng";
import type { Tile } from "../core/types";
import { CORRIDOR_TILES_PER_PIECE, FURNITURE, TILES_PER_PIECE, type FurnitureDef, type Place } from "../data/furniture";
import { WalkGrid, distanceMap, distanceTo } from "./grid";
import { buildRoomLookup, findRoomEntryTiles, type FurniturePiece, type LevelData, type Rect } from "./level";

const ATTEMPTS_PER_PIECE = 8;

function footprint(col: number, row: number, def: FurnitureDef): Tile[] {
  const out: Tile[] = [];
  for (let r = row; r < row + def.h; r++) for (let c = col; c < col + def.w; c++) out.push({ col: c, row: r });
  return out;
}

function pickDef(rng: Rng, place: Place): FurnitureDef | null {
  const defs = FURNITURE.filter(d => d.places.includes(place));
  const total = defs.reduce((s, d) => s + d.weight, 0);
  let x = rng.range(0, total);
  for (const d of defs) { x -= d.weight; if (x <= 0) return d; }
  return defs[defs.length - 1] ?? null;
}

export function placeFurniture(rng: Rng, level: LevelData, reserved: Set<number>): FurniturePiece[] {
  const rows = level.rows;
  const open = WalkGrid.fromRows(rows);
  const doorTiles = level.lockedDoors.flatMap(d => d.doorTiles);
  const lookup = buildRoomLookup(level.rooms);
  const mustReachClosed: Tile[] = [
    ...level.villainSpawns, level.exitTile, ...level.npcSpawns, ...level.fuseTiles,
    ...(level.fuseBox ? [level.fuseBox] : []),
    ...level.lockedDoors.map(d => d.terminalTile),
    ...level.keyTiles.filter((_, i) => !level.lockedDoors.some(d => d.keyIndex === i)),
  ];
  const floorTiles: Tile[] = [];
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) if (!open.isSolid(c, r)) floorTiles.push({ col: c, row: r });

  const taken = new Set<number>(reserved);
  // Keep doorways and everything around them clear.
  const keepClear = new Set<number>();
  const clearAround = (t: Tile, radius: number) => {
    for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) keepClear.add(tileIndex(t.col + dc, t.row + dr));
  };
  for (const room of level.rooms) for (const e of findRoomEntryTiles(rows, room)) clearAround(e, 1);
  for (const t of doorTiles) clearAround(t, 1);
  for (const g of level.gates) for (const t of g.tiles) clearAround(t, 1);
  for (const d of level.lockedDoors) clearAround(d.terminalTile, 1);
  for (const t of mustReachClosed) clearAround(t, 0);

  const blocked = new WalkGrid(open.solid.slice());
  const pieces: FurniturePiece[] = [];

  const free = (tiles: Tile[]) => tiles.every(t =>
    !open.isSolid(t.col, t.row) && !taken.has(tileIndex(t.col, t.row)) && !keepClear.has(tileIndex(t.col, t.row)));
  const wall = (c: number, r: number) => rows[r]?.[c] === "#";
  const touchesWall = (tiles: Tile[]) => tiles.some(t => wall(t.col - 1, t.row) || wall(t.col + 1, t.row) || wall(t.col, t.row - 1) || wall(t.col, t.row + 1));
  /** Stands where it belongs: backed by the north wall, touching a wall, or clear of walls. */
  const fits = (def: FurnitureDef, tiles: Tile[]) =>
    def.spot === "north" ? tiles.filter(t => t.row === tiles[0].row).every(t => wall(t.col, t.row - 1))
      : def.spot === "wall" ? touchesWall(tiles)
        : !touchesWall(tiles);
  /** No other solid piece right next to this one (keeps walkways between furniture). */
  const spaced = (tiles: Tile[], friends: Tile[] = []) => tiles.every(t =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dc, dr]) => {
      const n = { col: t.col + dc, row: t.row + dr };
      return tiles.some(o => o.col === n.col && o.row === n.row) || friends.some(o => o.col === n.col && o.row === n.row)
        || open.isSolid(n.col, n.row) || !blocked.isSolid(n.col, n.row);
    }));
  const keepsLevelWhole = (tiles: Tile[]) => {
    const g = blocked.withSolid(tiles);
    const dOpen = distanceMap(g, level.playerSpawn);
    const cut = new Set(tiles.map(t => tileIndex(t.col, t.row)));
    for (const t of floorTiles) if (!g.isSolid(t.col, t.row) && !cut.has(tileIndex(t.col, t.row)) && distanceTo(dOpen, t) < 0) return false;
    const dClosed = distanceMap(g.withSolid(doorTiles), level.playerSpawn);
    return mustReachClosed.every(t => distanceTo(dClosed, t) >= 0);
  };
  const tryPlace = (def: FurnitureDef, col: number, row: number, friends: Tile[] = []): Tile[] | null => {
    const tiles = footprint(col, row, def);
    if (!free(tiles) || (friends.length === 0 && !fits(def, tiles))) return null;
    if (def.solid && (!spaced(tiles, friends) || !keepsLevelWhole(tiles))) return null;
    for (const t of tiles) {
      taken.add(tileIndex(t.col, t.row));
      if (def.solid) blocked.setSolid(t, true);
    }
    pieces.push({ key: def.key, col, row, w: def.w, h: def.h, solid: def.solid });
    return tiles;
  };
  /** The companion piece right below (or beside) its parent. */
  const placeCompanion = (parent: FurnitureDef, col: number, row: number, tiles: Tile[]) => {
    const def = parent.with ? FURNITURE.find(d => d.key === parent.with) : undefined;
    if (!def) return;
    const spots: [number, number][] = def.w === parent.w
      ? [[col, row + parent.h], [col, row - def.h]]
      : [[col + parent.w, row], [col - def.w, row]];
    for (const [c, r] of spots) if (tryPlace(def, c, r, tiles)) return;
  };

  /** A spot for `def` inside `area` according to where it belongs. */
  const spotIn = (def: FurnitureDef, area: Rect): [number, number] | null => {
    const maxCol = area.x + area.w - def.w, maxRow = area.y + area.h - def.h;
    if (maxCol < area.x || maxRow < area.y) return null;
    switch (def.spot) {
      case "north": return [rng.int(area.x, maxCol), area.y];
      case "center":
        if (maxCol - 1 < area.x + 1 || maxRow - 1 < area.y + 1) return null;
        return [rng.int(area.x + 1, maxCol - 1), rng.int(area.y + 1, maxRow - 1)];
      default:
        switch (rng.int(0, 3)) {
          case 0: return [rng.int(area.x, maxCol), area.y];
          case 1: return [rng.int(area.x, maxCol), maxRow];
          case 2: return [area.x, rng.int(area.y, maxRow)];
          default: return [maxCol, rng.int(area.y, maxRow)];
        }
    }
  };

  for (const room of level.rooms) {
    const inner: Rect = { x: room.x + 1, y: room.y + 1, w: room.w - 2, h: room.h - 2 };
    const want = Math.floor((inner.w * inner.h) / TILES_PER_PIECE);
    let placed = 0;
    for (let a = 0; a < want * ATTEMPTS_PER_PIECE && placed < want; a++) {
      const def = pickDef(rng, room.type);
      const spot = def && spotIn(def, inner);
      const tiles = def && spot && tryPlace(def, spot[0], spot[1]);
      if (!def || !spot || !tiles) continue;
      placed++;
      placeCompanion(def, spot[0], spot[1], tiles);
    }
  }

  // Corridors: only where there is a wall to lean on and room to walk past.
  const corridor = floorTiles.filter(t => lookup[tileIndex(t.col, t.row)] < 0);
  const want = Math.floor(corridor.length / CORRIDOR_TILES_PER_PIECE);
  let placed = 0;
  for (let a = 0; a < want * ATTEMPTS_PER_PIECE && placed < want; a++) {
    const def = pickDef(rng, "corridor");
    const t = rng.pick(corridor);
    if (!def || !open.isSolid(t.col, t.row - 1)) continue;
    const below = footprint(t.col, t.row + def.h, { ...def, h: 2 });
    if (!below.every(b => !open.isSolid(b.col, b.row))) continue;
    if (tryPlace(def, t.col, t.row)) placed++;
  }
  return pieces;
}
