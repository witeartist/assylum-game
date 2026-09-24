// Hospital level generator. Deterministic: the same seed and options always give the same level,
// so multiplayer peers only exchange the seed.
//
// Layout: three long corridors joined by vertical ones, rows of rooms on both sides. Rooms are
// allowed to overlap and corridors to run through them — that is what makes the odd, tangled
// floor plan. Rooms that grew into each other share one type; big halls get pillars; some walls
// between neighbours are broken through, which makes loops to run around.
import { MAP_W, MAP_H } from "../core/constants";
import { manhattan, tileIndex } from "../core/geom";
import { Rng } from "../core/rng";
import type { Tile } from "../core/types";
import { ITEMS_DEF, ITEM_KINDS, type ItemKind } from "../data/items";
import { BED_SPRITES, type RoomType } from "../data/rooms";
import { placeFurniture } from "./furnish";
import { WalkGrid, distanceMap, distanceTo } from "./grid";
import {
  roomCenter, roomInteriorTiles, rectContains, findRoomEntryTiles,
  type Rect, type Room, type LockedDoor, type BedSpot, type LampSource, type LevelData, type ItemSpawn, type GateSpot,
} from "./level";

export interface LevelOptions {
  keys: number;
  /** Fuses needed to power the exit (0 = the exit needs no power). */
  fuses?: number;
  items?: number;
}

const MAX_ATTEMPTS = 30;
const MAX_LOCKED_DOORS = 2;
const BLOOD_TILES = 24;

type CharGrid = string[][];
const key = (t: Tile) => tileIndex(t.col, t.row);

interface Plan { grid: CharGrid; rooms: Rect[]; corridorRows: number[]; breaches: Tile[]; }

function makeEmptyGrid(): CharGrid {
  return Array.from({ length: MAP_H }, () => Array<string>(MAP_W).fill("#"));
}

function carveRoomInterior(grid: CharGrid, room: Rect) {
  for (let r = room.y + 1; r < room.y + room.h - 1; r++)
    for (let c = room.x + 1; c < room.x + room.w - 1; c++)
      if (r >= 0 && r < MAP_H && c >= 0 && c < MAP_W) grid[r][c] = ".";
}

/** Two-tile-wide vertical passage from the room centre to the corridor row. */
function carveRoomLink(grid: CharGrid, room: Rect, corridorRow: number) {
  const rc = roomCenter(room);
  const rFrom = Math.min(rc.row, corridorRow), rTo = Math.max(rc.row, corridorRow + 1);
  for (let r = rFrom; r <= rTo; r++) {
    if (r >= 1 && r < MAP_H - 1 && rc.col >= 1 && rc.col < MAP_W - 1) {
      grid[r][rc.col] = ".";
      if (rc.col + 1 < MAP_W - 1) grid[r][rc.col + 1] = ".";
    }
  }
}

function weightedPick<T>(rng: Rng, options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let x = rng.range(0, total);
  for (const [v, w] of options) { x -= w; if (x <= 0) return v; }
  return options[options.length - 1][0];
}

/** Rooms in rows along three corridors, a few loose ones, corridors and links carved. */
function buildPlan(rng: Rng): Plan {
  const rooms: Rect[] = [];
  const corridorRows = [rng.int(8, 11), rng.int(21, 25), rng.int(34, 38)];
  const makeRoomRow = (startCol: number, rowY: number, maxCount: number, side: number) => {
    let col = startCol + rng.int(0, 3);
    for (let i = 0; i < maxCount; i++) {
      const rw = rng.int(5, 10);
      const rh = rng.int(4, 7);
      const ry = side < 0 ? rowY - rh : rowY + 2;
      if (col + rw >= MAP_W - 2 || ry < 1 || ry + rh >= MAP_H - 1) break;
      rooms.push({ x: col, y: ry, w: rw, h: rh });
      col += rw + rng.int(0, 2);
    }
  };
  for (const cr of corridorRows) { makeRoomRow(2, cr, 9, -1); makeRoomRow(2, cr, 9, 1); }
  const extras: Rect[] = [];
  for (let i = 0; i < 4; i++) {
    const ex = rng.int(3, MAP_W - 14);
    const ey = rng.int(2, MAP_H - 10);
    const ew = rng.int(6, 10);
    const eh = rng.int(5, 7);
    if (ex + ew < MAP_W - 1 && ey + eh < MAP_H - 1) {
      const overlaps = rooms.concat(extras).some(r =>
        ex < r.x + r.w + 1 && ex + ew + 1 > r.x && ey < r.y + r.h + 1 && ey + eh + 1 > r.y);
      if (!overlaps) extras.push({ x: ex, y: ey, w: ew, h: eh });
    }
  }
  rooms.push(...extras);
  return carvePlan(rng, rooms, corridorRows, [rng.int(10, 15), Math.floor(MAP_W / 2), rng.int(MAP_W - 16, MAP_W - 11)], true);
}

function carvePlan(rng: Rng, rooms: Rect[], corridorRows: number[], verticals: number[], odd: boolean): Plan {
  const grid = makeEmptyGrid();
  rooms.forEach(r => carveRoomInterior(grid, r));
  for (let c = 2; c < MAP_W - 2; c++)
    for (const cr of corridorRows) { grid[cr][c] = "."; grid[cr + 1][c] = "."; }
  for (const vc of verticals) {
    for (let r = corridorRows[0]; r <= corridorRows[corridorRows.length - 1] + 1; r++) {
      if (r >= 1 && r < MAP_H - 1 && vc >= 1 && vc + 1 < MAP_W - 1) { grid[r][vc] = "."; grid[r][vc + 1] = "."; }
    }
  }
  for (const room of rooms) {
    const rc = roomCenter(room);
    const nearest = corridorRows.reduce((best, cr) => Math.abs(rc.row - cr) < Math.abs(rc.row - best) ? cr : best, corridorRows[0]);
    carveRoomLink(grid, room, nearest);
  }
  const breaches = odd ? breakWalls(rng, grid, rooms) : [];
  if (odd) raisePillars(rng, grid, rooms);
  return { grid, rooms, corridorRows, breaches };
}

/** Holes knocked through the wall between rooms standing side by side. Returns the hole tiles. */
function breakWalls(rng: Rng, grid: CharGrid, rooms: Rect[]): Tile[] {
  const holes: Tile[] = [];
  for (const a of rooms) for (const b of rooms) {
    if (b.x !== a.x + a.w || !rng.chance(0.3)) continue;
    const lo = Math.max(a.y, b.y) + 1, hi = Math.min(a.y + a.h, b.y + b.h) - 2;
    if (hi < lo) continue;
    const r = rng.int(lo, hi);
    if (grid[r][a.x + a.w - 2] === "." && grid[r][b.x + 1] === "." && grid[r][a.x + a.w - 1] === "#" && grid[r][b.x] === "#") {
      grid[r][a.x + a.w - 1] = "."; grid[r][b.x] = ".";
      holes.push({ col: a.x + a.w - 1, row: r }, { col: b.x, row: r });
    }
  }
  return holes;
}

/** Square pillars in the middle of big halls: cover to hide behind and loops to run around. */
function raisePillars(rng: Rng, grid: CharGrid, rooms: Rect[]): void {
  const floorAround = (c: number, r: number) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (grid[r + dr]?.[c + dc] !== ".") return false;
    return true;
  };
  for (const room of rooms) {
    if (room.w - 2 < 7 || room.h - 2 < 5 || !rng.chance(0.6)) continue;
    const rc = roomCenter(room);
    const spots = room.w - 2 >= 9 ? [[-2, 0], [2, 0]] : [[0, 0]];
    for (const [dc, dr] of spots) {
      const c = rc.col + dc, r = rc.row + dr;
      if (floorAround(c, r)) grid[r][c] = "#";
    }
  }
}

/** Rooms that grew into each other form one hall: they get one type (one floor, one label). */
function roomGroups(rooms: Rect[]): number[] {
  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    const x0 = Math.max(a.x + 1, b.x + 1), x1 = Math.min(a.x + a.w - 2, b.x + b.w - 2);
    const y0 = Math.max(a.y + 1, b.y + 1), y1 = Math.min(a.y + a.h - 2, b.y + b.h - 2);
    if (x0 <= x1 && y0 <= y1) parent[find(i)] = find(j);
  }
  return rooms.map((_, i) => find(i));
}

/** Room types by size; rooms that grew into one hall share a type. */
function assignRoomTypes(rng: Rng, rooms: Rect[]): Room[] {
  const group = roomGroups(rooms);
  const area = new Map<number, number>();
  rooms.forEach((r, i) => area.set(group[i], (area.get(group[i]) ?? 0) + (r.w - 2) * (r.h - 2)));
  const count: Partial<Record<RoomType, number>> = {};
  const cap: Partial<Record<RoomType, number>> = { canteen: 3, morgue: 4 };
  const typeOf = new Map<number, RoomType>();
  return rooms.map((room, i) => {
    let type = typeOf.get(group[i]);
    if (!type) {
      const size = area.get(group[i]) ?? 0;
      const options: [RoomType, number][] = size >= 40
        ? [["canteen", 3], ["ward", 4], ["procedure", 1], ["storage", 1]]
        : size >= 16
          ? [["ward", 4], ["procedure", 3], ["morgue", 2], ["storage", 2], ["isolation", 1]]
          : [["isolation", 4], ["storage", 3], ["procedure", 1]];
      const allowed = options.filter(([t]) => (count[t] ?? 0) < (cap[t] ?? Infinity));
      type = weightedPick(rng, allowed.length ? allowed : [["storage", 1]]);
      count[type] = (count[type] ?? 0) + 1;
      typeOf.set(group[i], type);
    }
    return { ...room, type };
  });
}

/** Interior tiles of a room that are floor (pillars stand in some halls). */
function floorTiles(grid: CharGrid, room: Rect): Tile[] {
  return roomInteriorTiles(room).filter(t => grid[t.row][t.col] !== "#");
}

function pickRoomTile(rng: Rng, grid: CharGrid, room: Rect, used: Set<number>): Tile {
  const tiles = floorTiles(grid, room);
  for (const t of rng.shuffle(tiles)) {
    if (!used.has(key(t))) { used.add(key(t)); return t; }
  }
  const fb = tiles[0] ?? roomCenter(room);
  used.add(key(fb));
  return fb;
}

function paintBlood(rng: Rng, grid: CharGrid, rooms: Room[], blocked: Set<number>) {
  const paintable = rng.shuffle(rooms.flatMap(r => floorTiles(grid, r)).filter(t => !blocked.has(key(t))));
  for (const t of paintable.slice(0, BLOOD_TILES)) grid[t.row][t.col] = "B";
}

/** Lockers stand against a wall — the north wall if possible — and never in a doorway. */
function placeHidingSpots(rng: Rng, rooms: Room[], blocked: Set<number>, grid: CharGrid): Tile[] {
  const spots: Tile[] = [];
  for (const room of rooms) {
    if (room.type === "ward") continue; // wards hide under beds
    if (rng.next() > 0.6) continue;     // ~60% of other rooms get a locker
    const nearEntry = new Set<number>();
    for (const e of findRoomEntryTiles(grid, room))
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) nearEntry.add(tileIndex(e.col + dc, e.row + dr));
    const ok = (t: Tile) => !blocked.has(key(t)) && !nearEntry.has(key(t));
    const inner = floorTiles(grid, room);
    const north = inner.filter(t => t.row === room.y + 1 && grid[room.y][t.col] === "#");
    const sides = inner.filter(t => (t.col === room.x + 1 && grid[t.row][room.x] === "#") || (t.col === room.x + room.w - 2 && grid[t.row][room.x + room.w - 1] === "#"));
    const t = rng.shuffle(north).find(ok) ?? rng.shuffle(sides).find(ok);
    if (t) { blocked.add(key(t)); spots.push(t); }
  }
  return spots;
}

/** Wards: beds along the walls, in a row, with a gap between them. */
function placeBedSpots(rng: Rng, rooms: Room[], blocked: Set<number>, grid: CharGrid): BedSpot[] {
  const beds: BedSpot[] = [];
  for (const room of rooms) {
    if (room.type !== "ward") continue;
    const interior = floorTiles(grid, room);
    const bedCount = Math.max(1, Math.min(4, Math.floor(interior.length / 7)));
    const nearEntry = new Set<number>();
    for (const e of findRoomEntryTiles(grid, room))
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) nearEntry.add(tileIndex(e.col + dc, e.row + dr));
    const floor = (t: Tile) => grid[t.row][t.col] !== "#";
    const free = (a: Tile, b: Tile) => floor(a) && floor(b) &&
      !nearEntry.has(key(a)) && !nearEntry.has(key(b)) && !blocked.has(key(a)) && !blocked.has(key(b));

    // Heads against the north wall (vertical beds in a row), or against a side wall if the room is low.
    const candidates: { t1: Tile; t2: Tile; orientation: BedSpot["orientation"] }[] = [];
    if (room.h - 2 >= 3) {
      for (let c = room.x + 1; c <= room.x + room.w - 2; c++) {
        const t1 = { col: c, row: room.y + 1 }, t2 = { col: c, row: room.y + 2 };
        if (grid[room.y][c] === "#" && free(t1, t2)) candidates.push({ t1, t2, orientation: "vertical" });
      }
    }
    if (candidates.length < bedCount && room.w - 2 >= 3) {
      for (let r = room.y + 1; r <= room.y + room.h - 2; r++)
        for (const [c1, c2] of [[room.x + 1, room.x + 2], [room.x + room.w - 3, room.x + room.w - 2]]) {
          const t1 = { col: c1, row: r }, t2 = { col: c2, row: r };
          if (free(t1, t2)) candidates.push({ t1, t2, orientation: "horizontal" });
        }
    }
    const used: Tile[] = [];
    for (const cand of candidates) {
      if (beds.filter(b => rectContains(room, b.tile)).length >= bedCount) break;
      if (used.some(u => manhattan(u, cand.t1) < 2 || manhattan(u, cand.t2) < 2)) continue;
      used.push(cand.t1, cand.t2);
      blocked.add(key(cand.t1)); blocked.add(key(cand.t2));
      beds.push({ tile: cand.t1, tile2: cand.t2, orientation: cand.orientation, sprite: rng.pick(BED_SPRITES[cand.orientation]) });
    }
  }
  return beds;
}

/** Lamps hang on north walls and light a pool around them: some rooms, stretches of corridor. */
function placeLights(rng: Rng, grid: CharGrid, rooms: Room[], corridorRows: number[], used: Set<number>): LampSource[] {
  const lights: LampSource[] = [];
  for (const room of rooms) {
    if (rng.next() > 0.45) continue;
    const mid = roomCenter(room).col;
    const cols = Array.from({ length: room.w - 2 }, (_, i) => room.x + 1 + i)
      .filter(c => grid[room.y][c] === "#" && !used.has(tileIndex(c, room.y + 1)))
      .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    if (cols.length === 0) continue;
    const radius = Math.min(5.5, Math.max(3.2, Math.max(room.w, room.h) * 0.5));
    lights.push({ col: cols[0], row: room.y + 1, radius, intensity: 0.8 });
  }
  for (const cr of corridorRows) {
    for (let c = 4; c < MAP_W - 4; c += rng.int(8, 13)) {
      if (rng.next() > 0.5 || grid[cr - 1][c] !== "#" || grid[cr][c] === "#") continue;
      lights.push({ col: c, row: cr, radius: 4, intensity: 0.65 });
    }
  }
  return lights;
}

/** Where the exit's double door goes: two tiles along the room's north wall, under solid wall. */
function exitSpot(rng: Rng, grid: CharGrid, room: Rect, used: Set<number>): Tile | null {
  const row = room.y + 1, cols: number[] = [];
  for (let c = room.x + 1; c + 1 <= room.x + room.w - 2; c++) {
    if (grid[room.y][c] === "#" && grid[room.y][c + 1] === "#" && !used.has(tileIndex(c, row)) && !used.has(tileIndex(c + 1, row))) cols.push(c);
  }
  if (cols.length === 0) return null;
  const t = { col: rng.pick(cols), row };
  used.add(key(t)); used.add(tileIndex(t.col + 1, row));
  return t;
}

/** A tile against the room's north wall for something mounted on it (the fuse box). */
function wallSpot(rng: Rng, grid: CharGrid, room: Rect, used: Set<number>): Tile | null {
  const entries = findRoomEntryTiles(grid, room);
  const row = room.y + 1;
  const cols = Array.from({ length: room.w - 2 }, (_, i) => room.x + 1 + i)
    .filter(c => grid[room.y][c] === "#" && !used.has(tileIndex(c, row)) && !entries.some(e => Math.abs(e.col - c) + Math.abs(e.row - row) <= 1));
  if (cols.length === 0) return null;
  const t = { col: rng.pick(cols), row };
  used.add(key(t));
  return t;
}

/** Room ring tiles that open onto walkable tiles outside the room (doorways). */
function findDoorways(grid: CharGrid, rooms: Room[]): Tile[] {
  const doors = new Map<number, Tile>();
  for (const room of rooms) for (const t of findRoomEntryTiles(grid, room)) doors.set(key(t), t);
  return [...doors.values()];
}

/** Every floor tile on the room's outer ring — walling them all off seals the room. */
function roomRingFloorTiles(grid: CharGrid, room: Room): Tile[] {
  const tiles: Tile[] = [];
  for (let r = room.y; r < room.y + room.h; r++)
    for (let c = room.x; c < room.x + room.w; c++) {
      const onRing = r === room.y || r === room.y + room.h - 1 || c === room.x || c === room.x + room.w - 1;
      if (onRing && grid[r][c] !== "#") tiles.push({ col: c, row: r });
    }
  return tiles;
}

/**
 * Where a locked door's terminal hangs: on a wall next to the door, facing the side you come
 * from (a floor tile outside the room with a wall right above it), reachable while the door is
 * shut. Failing that, any free tile just outside the door.
 */
function pickTerminalTile(rng: Rng, grid: CharGrid, closed: WalkGrid, room: Room, doorTiles: Tile[], dist: Int32Array, used: Set<number>): Tile | null {
  const ok = (t: Tile) => t.row > 0 && t.row < MAP_H && t.col >= 0 && t.col < MAP_W && !rectContains(room, t)
    && !closed.isSolid(t.col, t.row) && !used.has(key(t)) && distanceTo(dist, t) >= 0;
  const onWall: { t: Tile; d: number }[] = [];
  for (const d of doorTiles)
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      const t = { col: d.col + dc, row: d.row + dr };
      if (!ok(t) || grid[t.row - 1][t.col] !== "#" || doorTiles.some(o => o.col === t.col && o.row === t.row - 1)) continue;
      onWall.push({ t, d: Math.abs(dc) + Math.abs(dr) + rng.next() * 0.5 });
    }
  if (onWall.length) return onWall.sort((a, b) => a.d - b.d)[0].t;
  for (const d of rng.shuffle(doorTiles)) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const t = { col: d.col + dc, row: d.row + dr };
      if (ok(t)) return t;
    }
  }
  return null;
}

/**
 * Seal up to MAX_LOCKED_DOORS key rooms behind terminal-operated doors. A room is only
 * locked if that really cuts its key off while every spawn, the exit, the other keys and
 * all terminals stay reachable with every door shut — so a level can never soft-lock.
 */
function pickLockedDoors(
  rng: Rng, grid: CharGrid, keyRooms: Room[], keyTiles: Tile[], start: Tile, mustReach: Tile[], used: Set<number>,
): LockedDoor[] {
  const base = WalkGrid.fromRows(grid);
  const locked: LockedDoor[] = [];
  let sealed: Tile[] = [];
  for (let i = 0; i < keyRooms.length && locked.length < MAX_LOCKED_DOORS; i++) {
    const room = keyRooms[i];
    const doorTiles = roomRingFloorTiles(grid, room);
    if (doorTiles.length === 0 || doorTiles.length > 3) continue;
    const closed = base.withSolid(sealed.concat(doorTiles));
    const dist = distanceMap(closed, start);
    if (distanceTo(dist, keyTiles[i]) >= 0) continue; // room leaks — locking it would be pointless
    const terminalTile = pickTerminalTile(rng, grid, closed, room, doorTiles, dist, used);
    if (!terminalTile) continue;
    const freeKeys = keyTiles.filter((_, k) => k !== i && !locked.some(l => l.keyIndex === k));
    const terminals = locked.map(l => l.terminalTile).concat(terminalTile);
    if (![...mustReach, ...freeKeys, ...terminals].every(t => distanceTo(dist, t) >= 0)) continue;
    used.add(key(terminalTile));
    sealed = sealed.concat(doorTiles);
    locked.push({ doorTiles, terminalTile, keyIndex: i });
  }
  return locked;
}

/** Items spread over the rooms: at least two batteries and a bottle, the rest by weight. */
function placeItems(rng: Rng, grid: CharGrid, rooms: Room[], count: number, used: Set<number>): ItemSpawn[] {
  const pool = rng.shuffle(rooms);
  const weights = ITEM_KINDS.map(k => [k, ITEMS_DEF[k].weight] as [ItemKind, number]);
  const forced: ItemKind[] = ["battery", "battery", "bottle"];
  return Array.from({ length: count }, (_, i) => ({
    tile: pickRoomTile(rng, grid, pool[i % pool.length], used),
    kind: forced[i] ?? weightedPick(rng, weights),
  }));
}

/**
 * Doorways narrow enough for a door (1–2 tiles in a wall line, a room or corridor on each side).
 * Some get a door; many start open. Breaches stay broken holes.
 */
function placeGates(rng: Rng, grid: CharGrid, used: Set<number>, skip: Set<number>): GateSpot[] {
  const floor = (c: number, r: number) => r >= 0 && r < MAP_H && c >= 0 && c < MAP_W && grid[r][c] !== "#";
  const wall = (c: number, r: number) => !floor(c, r);
  type Run = { tiles: Tile[]; horizontal: boolean };
  const runs: Run[] = [];
  // Walls running left–right: a gap of 1–2 tiles with floor above and below, walls at both ends,
  // and those end walls touching open space (not the inside of a thick wall).
  for (let r = 1; r < MAP_H - 1; r++) {
    for (let c = 1; c < MAP_W - 1; c++) {
      if (!wall(c - 1, r) || !floor(c, r)) continue;
      let len = 0;
      while (len < 3 && floor(c + len, r) && floor(c + len, r - 1) && floor(c + len, r + 1)) len++;
      if (len === 0 || len > 2 || !wall(c + len, r)) continue;
      // The wall goes on past each end (a real wall line, not the corner of a corridor).
      const endOk = (x: number, out: number) => (floor(x, r - 1) || floor(x, r + 1)) && wall(out, r);
      if (endOk(c - 1, c - 2) && endOk(c + len, c + len + 1)) runs.push({ tiles: Array.from({ length: len }, (_, i) => ({ col: c + i, row: r })), horizontal: true });
    }
  }
  // Walls running up–down.
  for (let c = 1; c < MAP_W - 1; c++) {
    for (let r = 1; r < MAP_H - 1; r++) {
      if (!wall(c, r - 1) || !floor(c, r)) continue;
      let len = 0;
      while (len < 3 && floor(c, r + len) && floor(c - 1, r + len) && floor(c + 1, r + len)) len++;
      if (len === 0 || len > 2 || !wall(c, r + len)) continue;
      const endOk = (y: number, out: number) => (floor(c - 1, y) || floor(c + 1, y)) && wall(c, out);
      if (endOk(r - 1, r - 2) && endOk(r + len, r + len + 1)) runs.push({ tiles: Array.from({ length: len }, (_, i) => ({ col: c, row: r + i })), horizontal: false });
    }
  }
  // A passage through a thick wall has a gap at each end: keep one door per passage.
  const at = new Set(runs.map(run => key(run.tiles[0]) + (run.horizontal ? "h" : "v")));
  const gates: GateSpot[] = [];
  const taken = new Set<number>();
  for (const run of runs) {
    const t0 = run.tiles[0];
    const next = run.horizontal ? tileIndex(t0.col, t0.row + 1) + "h" : tileIndex(t0.col + 1, t0.row) + "v";
    if (at.has(next)) continue;
    if (run.tiles.some(t => used.has(key(t)) || skip.has(key(t)) || taken.has(key(t)))) continue;
    run.tiles.forEach(t => taken.add(key(t)));
    if (!rng.chance(0.55)) continue;
    gates.push({ tiles: run.tiles, horizontal: run.horizontal, open: rng.chance(0.6) });
  }
  return gates;
}

type Spawns = Pick<LevelData, "playerSpawn" | "foxSpawn" | "npcSpawns" | "exitTile" | "bossSpawn" | "keyTiles" | "lockedDoors" | "fuseTiles" | "fuseBox" | "items">;

/** Hiding spots, lights, blood and furniture — the last step of every level. */
function furnish(rng: Rng, seed: number, grid: CharGrid, rooms: Room[], plan: Plan, used: Set<number>, spawns: Spawns, startRoom: Room): LevelData {
  const hidingSpots = placeHidingSpots(rng, rooms, used, grid);
  const bedSpots = placeBedSpots(rng, rooms, used, grid);
  const doorways = findDoorways(grid, rooms);
  const lights = placeLights(rng, grid, rooms, plan.corridorRows, used);
  // Doors have their own random stream, like furniture.
  const skip = new Set([...plan.breaches, ...spawns.lockedDoors.flatMap(d => d.doorTiles), spawns.exitTile, { col: spawns.exitTile.col + 1, row: spawns.exitTile.row }].map(key));
  const gates = placeGates(new Rng(seed ^ 0x6a7e), grid, used, skip);
  paintBlood(rng, grid, rooms, used);
  const level: LevelData = {
    seed, rows: grid.map(r => r.join("")), rooms, ...spawns,
    furniture: [], hidingSpots, bedSpots, doorways, gates, breaches: plan.breaches, lights, startRoom: startRoom.type,
  };
  // Furniture has its own random stream, so tuning it never changes the rest of the layout.
  level.furniture = placeFurniture(new Rng(seed ^ 0xf00d), level, used);
  return level;
}

/** One attempt at a level on a plan; null if the plan can't hold everything. */
function tryLevel(rng: Rng, seed: number, o: Required<LevelOptions>, plan: Plan, pickStart: (rooms: Room[]) => Room): LevelData | null {
  const { grid } = plan;
  const rooms = assignRoomTypes(rng, plan.rooms);
  if (rooms.length < 14) return null;

  const used = new Set<number>();
  const playerRoom = pickStart(rooms);
  const playerSpawn = pickRoomTile(rng, grid, playerRoom, used);
  const pc = roomCenter(playerRoom);
  const farFromPlayer = (a: Room, b: Room) => manhattan(roomCenter(b), pc) - manhattan(roomCenter(a), pc);

  const foxRoom = rooms.filter(r => r !== playerRoom).sort(farFromPlayer)[0];
  const foxSpawn = pickRoomTile(rng, grid, foxRoom, used);
  const others = rng.shuffle(rooms.filter(r => r !== playerRoom && r !== foxRoom));
  if (others.length < o.keys + 8) return null;
  const npcRooms = others.slice(0, 4);
  const npcSpawns = npcRooms.map(r => pickRoomTile(rng, grid, r, used));

  let exitRoom: Room | null = null, exitTile: Tile | null = null;
  for (const r of others.filter(r => !npcRooms.includes(r)).sort(farFromPlayer)) {
    exitTile = exitSpot(rng, grid, r, used);
    if (exitTile) { exitRoom = r; break; }
  }
  if (!exitRoom || !exitTile) return null;
  const ec = roomCenter(exitRoom);
  const farFromExit = (a: Room, b: Room) => manhattan(roomCenter(b), ec) - manhattan(roomCenter(a), ec);

  const bossRoom = others.filter(r => r !== exitRoom && !npcRooms.includes(r)).sort(farFromExit)[0] ?? foxRoom;
  const bossSpawn = pickRoomTile(rng, grid, bossRoom, used);

  const keyRooms = rng.shuffle(others.filter(r => r !== exitRoom && r !== bossRoom && !npcRooms.includes(r))).slice(0, o.keys);
  if (keyRooms.length < o.keys) return null;
  const keyTiles = keyRooms.map(r => pickRoomTile(rng, grid, r, used));

  // With every door open the whole building must be connected.
  const openDist = distanceMap(WalkGrid.fromRows(grid), playerSpawn);
  if (![exitTile, ...keyTiles].every(t => distanceTo(openDist, t) >= 0)) return null;

  const mustReach = [foxSpawn, bossSpawn, exitTile, ...npcSpawns];
  const lockedDoors = pickLockedDoors(rng, grid, keyRooms, keyTiles, playerSpawn, mustReach, used);
  if (lockedDoors.length < Math.min(MAX_LOCKED_DOORS, o.keys)) return null;
  const closed = WalkGrid.fromRows(grid).withSolid(lockedDoors.flatMap(d => d.doorTiles));
  const dClosed = distanceMap(closed, playerSpawn);
  const reachable = (t: Tile) => distanceTo(dClosed, t) >= 0;

  // Power for the exit: a fuse box far from it, fuses lying where anyone can walk.
  let fuseBox: Tile | null = null;
  const fuseTiles: Tile[] = [];
  if (o.fuses > 0) {
    for (const r of rooms.filter(r => r !== exitRoom && r !== playerRoom && reachable(roomCenter(r))).sort(farFromExit).slice(0, 12)) {
      const t = wallSpot(rng, grid, r, used);
      if (t && reachable(t)) { fuseBox = t; break; }
    }
    if (!fuseBox) return null;
    for (const r of rng.shuffle(rooms.filter(r => r !== playerRoom && r !== exitRoom))) {
      if (fuseTiles.length >= o.fuses) break;
      const t = pickRoomTile(rng, grid, r, used);
      if (reachable(t)) fuseTiles.push(t);
    }
    if (fuseTiles.length < o.fuses) return null;
  }
  const items = placeItems(rng, grid, rooms, o.items, used);

  return furnish(rng, seed, grid, rooms, plan, used,
    { playerSpawn, foxSpawn, npcSpawns, exitTile, bossSpawn, keyTiles, lockedDoors, fuseTiles, fuseBox, items }, playerRoom);
}

function withDefaults(o: LevelOptions): Required<LevelOptions> {
  return { keys: o.keys, fuses: o.fuses ?? 0, items: o.items ?? 0 };
}

export function generateLevel(seed: number, options: LevelOptions): LevelData {
  const rng = new Rng(seed);
  const o = withDefaults(options);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const level = tryLevel(rng, seed, o, buildPlan(rng), rooms => rooms[Math.floor(rng.next() * Math.min(rooms.length, 5))]);
    if (level) return level;
  }
  return generateFallbackLevel(seed, options);
}

/** Fixed layout used if random generation keeps failing (never observed, but guaranteed valid). */
export function generateFallbackLevel(seed: number, options: LevelOptions): LevelData {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const o = withDefaults(options);
  const rooms: Rect[] = [];
  for (const y of [3, 15, 27, 39]) for (let x = 3; x + 8 < MAP_W - 2; x += 10) if (y < 39 || x < 40) rooms.push({ x, y, w: 8, h: 7 });
  for (let attempt = 0; attempt < 200; attempt++) {
    const plan = carvePlan(rng, rooms, [12, 36], [Math.floor(MAP_W / 2), 12, MAP_W - 14], false);
    const level = tryLevel(rng, seed, o, plan, rs => rs[0]);
    if (level) return level;
  }
  throw new Error("level generation failed for seed " + seed);
}
