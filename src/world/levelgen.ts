// Hospital level generator. Deterministic: the same seed and key count always give the same
// level, so multiplayer peers only exchange the seed.
import { MAP_W, MAP_H } from "../core/constants";
import { manhattan, tileIndex } from "../core/geom";
import { Rng } from "../core/rng";
import type { Tile } from "../core/types";
import { ROOM_TYPES, BED_SPRITES } from "../data/rooms";
import { WalkGrid, distanceMap, distanceTo } from "./grid";
import {
  roomCenter, roomInteriorTiles, rectContains,
  type Rect, type Room, type Decoration, type LockedDoor, type BedSpot, type LampSource, type LevelData,
} from "./level";

const MAX_ATTEMPTS = 30;
const MAX_LOCKED_DOORS = 2;
const BLOOD_TILES = 30;

type CharGrid = string[][];
const key = (t: Tile) => tileIndex(t.col, t.row);

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

function buildHospitalPlan(rng: Rng) {
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
  return { rooms, corridorRows };
}

function assignRoomTypes(rng: Rng, rooms: Rect[]): Room[] {
  const types = rng.shuffle(ROOM_TYPES);
  return rooms.map((room, i) => ({ ...room, type: types[i % types.length] }));
}

function pickRoomTile(rng: Rng, room: Rect, used: Set<number>): Tile {
  for (const t of rng.shuffle(roomInteriorTiles(room))) {
    if (!used.has(key(t))) { used.add(key(t)); return t; }
  }
  const fb = roomCenter(room);
  used.add(key(fb));
  return fb;
}

function paintBlood(rng: Rng, grid: CharGrid, rooms: Room[], blocked: Set<number>) {
  const paintable = rng.shuffle(rooms.flatMap(r => roomInteriorTiles(r)).filter(t => !blocked.has(key(t))));
  for (const t of paintable.slice(0, BLOOD_TILES)) grid[t.row][t.col] = "B";
}

function buildRoomDecorations(rng: Rng, rooms: Room[], blocked: Set<number>): Decoration[] {
  const decorations: Decoration[] = [];
  const used = new Set<number>();
  for (const room of rooms) {
    if (room.type === "ward") continue; // wards get beds (placeBedSpots)
    const interior = roomInteriorTiles(room);
    const desired = Math.max(1, Math.min(3, Math.floor(interior.length / 10)));
    let placed = 0;
    for (const t of rng.shuffle(interior).filter(t => !blocked.has(key(t)))) {
      if (placed >= desired) break;
      if (used.has(key(t))) continue;
      used.add(key(t));
      decorations.push({ tile: t, room: room.type });
      placed++;
    }
  }
  return decorations;
}

function placeHidingSpots(rng: Rng, rooms: Room[], blocked: Set<number>): Tile[] {
  const spots: Tile[] = [];
  for (const room of rooms) {
    if (room.type === "ward") continue; // wards hide under beds
    if (rng.next() > 0.6) continue;     // ~60% of other rooms get a locker
    const t = rng.shuffle(roomInteriorTiles(room)).find(t => !blocked.has(key(t)));
    if (t) { blocked.add(key(t)); spots.push(t); }
  }
  return spots;
}

function findRoomEntryTiles(grid: CharGrid, room: Room): Tile[] {
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

function placeBedSpots(rng: Rng, rooms: Room[], blocked: Set<number>, grid: CharGrid): BedSpot[] {
  const beds: BedSpot[] = [];
  for (const room of rooms) {
    if (room.type !== "ward") continue;
    const interior = roomInteriorTiles(room);
    const bedCount = rng.int(1, Math.min(3, Math.max(1, Math.floor(interior.length / 6))));

    // Keep the area around the room's entrances clear.
    const nearEntry = new Set<number>();
    for (const e of findRoomEntryTiles(grid, room))
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) nearEntry.add(tileIndex(e.col + dc, e.row + dr));
    const free = (a: Tile, b: Tile) =>
      !nearEntry.has(key(a)) && !nearEntry.has(key(b)) && !blocked.has(key(a)) && !blocked.has(key(b));

    // Beds stand along the walls: vertical ones by the side walls, horizontal by top/bottom.
    const candidates: { t1: Tile; t2: Tile; orientation: BedSpot["orientation"] }[] = [];
    if (room.h - 2 >= 2) {
      for (let r = room.y + 1; r < room.y + room.h - 2; r++)
        for (const c of [room.x + 1, room.x + room.w - 2]) {
          const t1 = { col: c, row: r }, t2 = { col: c, row: r + 1 };
          if (free(t1, t2)) candidates.push({ t1, t2, orientation: "vertical" });
        }
    }
    if (room.w - 2 >= 2) {
      for (let c = room.x + 1; c < room.x + room.w - 2; c++)
        for (const r of [room.y + 1, room.y + room.h - 2]) {
          const t1 = { col: c, row: r }, t2 = { col: c + 1, row: r };
          if (free(t1, t2)) candidates.push({ t1, t2, orientation: "horizontal" });
        }
    }

    const used: Tile[] = [];
    let placed = 0;
    for (const cand of rng.shuffle(candidates)) {
      if (placed >= bedCount) break;
      if (used.some(u => manhattan(u, cand.t1) < 2 || manhattan(u, cand.t2) === 0)) continue;
      used.push(cand.t1, cand.t2);
      blocked.add(key(cand.t1)); blocked.add(key(cand.t2));
      beds.push({ tile: cand.t1, tile2: cand.t2, orientation: cand.orientation, sprite: rng.pick(BED_SPRITES[cand.orientation]) });
      placed++;
    }
  }
  return beds;
}

function placeLights(rng: Rng, rooms: Room[], corridorRows: number[]): LampSource[] {
  const lights: LampSource[] = [];
  for (const room of rooms) {
    if (rng.next() > 0.5) {
      const rc = roomCenter(room);
      lights.push({ col: rc.col, row: rc.row, radius: Math.max(room.w, room.h) * 0.6, intensity: 0.8 });
    }
  }
  for (const cr of corridorRows) {
    for (let c = 3; c < MAP_W - 3; c += rng.int(6, 12)) {
      if (rng.next() > 0.4) continue;
      lights.push({ col: c, row: cr, radius: 4, intensity: 0.6 });
    }
  }
  return lights;
}

/** Room ring tiles that open onto walkable tiles outside the room (doorways). */
function findDoorTiles(grid: CharGrid, rooms: Room[]): Tile[] {
  const doors = new Map<number, Tile>();
  const add = (c: number, r: number) => doors.set(tileIndex(c, r), { col: c, row: r });
  for (const room of rooms) {
    const top = room.y, bot = room.y + room.h - 1, left = room.x, right = room.x + room.w - 1;
    for (let c = left; c <= right; c++) {
      if (top >= 1 && grid[top][c] === "." && grid[top - 1][c] === ".") add(c, top);
      if (bot < MAP_H - 1 && grid[bot][c] === "." && grid[bot + 1][c] === ".") add(c, bot);
    }
    for (let r = top; r <= bot; r++) {
      if (left >= 1 && grid[r][left] === "." && grid[r][left - 1] === ".") add(left, r);
      if (right < MAP_W - 1 && grid[r][right] === "." && grid[r][right + 1] === ".") add(right, r);
    }
  }
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

/** A free floor tile just outside one of the door tiles, reachable while the door is shut. */
function pickTerminalTile(rng: Rng, closed: WalkGrid, room: Room, doorTiles: Tile[], dist: Int32Array, used: Set<number>): Tile | null {
  for (const d of rng.shuffle(doorTiles)) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const t = { col: d.col + dc, row: d.row + dr };
      if (t.row < 0 || t.row >= MAP_H || t.col < 0 || t.col >= MAP_W) continue;
      if (rectContains(room, t) || closed.isSolid(t.col, t.row) || used.has(key(t))) continue;
      if (distanceTo(dist, t) >= 0) return t;
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
    if (doorTiles.length === 0) continue;
    const closed = base.withSolid(sealed.concat(doorTiles));
    const dist = distanceMap(closed, start);
    if (distanceTo(dist, keyTiles[i]) >= 0) continue; // room leaks — locking it would be pointless
    const terminalTile = pickTerminalTile(rng, closed, room, doorTiles, dist, used);
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

/** Furniture, hiding spots, lights and blood — shared by the generator and the fallback. */
function furnish(
  rng: Rng, seed: number, grid: CharGrid, rooms: Room[], corridorRows: number[], used: Set<number>,
  spawns: Pick<LevelData, "playerSpawn" | "foxSpawn" | "npcSpawns" | "exitTile" | "bossSpawn" | "keyTiles" | "lockedDoors">,
  startRoom: Room,
): LevelData {
  const decorations = buildRoomDecorations(rng, rooms, used);
  const hidingSpots = placeHidingSpots(rng, rooms, used);
  const bedSpots = placeBedSpots(rng, rooms, used, grid);
  const doors = findDoorTiles(grid, rooms);
  const lights = placeLights(rng, rooms, corridorRows);
  paintBlood(rng, grid, rooms, used);
  return {
    seed, rows: grid.map(r => r.join("")), rooms, ...spawns,
    decorations, hidingSpots, bedSpots, doors, lights, startRoom: startRoom.type,
  };
}

export function generateLevel(seed: number, keyCount: number): LevelData {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const grid = makeEmptyGrid();
    const plan = buildHospitalPlan(rng);
    if (plan.rooms.length < 14) continue;

    plan.rooms.forEach(r => carveRoomInterior(grid, r));
    const { corridorRows } = plan;
    for (let c = 2; c < MAP_W - 2; c++)
      for (const cr of corridorRows) { grid[cr][c] = "."; grid[cr + 1][c] = "."; }

    const midC = Math.floor(MAP_W / 2);
    for (const vc of [rng.int(10, 15), midC, rng.int(MAP_W - 16, MAP_W - 11)]) {
      for (let r = corridorRows[0]; r <= corridorRows[2] + 1; r++) {
        if (r >= 1 && r < MAP_H - 1 && vc >= 1 && vc + 1 < MAP_W - 1) { grid[r][vc] = "."; grid[r][vc + 1] = "."; }
      }
    }
    for (const room of plan.rooms) {
      const rc = roomCenter(room);
      const nearest = corridorRows.reduce((best, cr) => Math.abs(rc.row - cr) < Math.abs(rc.row - best) ? cr : best, corridorRows[0]);
      carveRoomLink(grid, room, nearest);
    }

    const rooms = assignRoomTypes(rng, plan.rooms);
    const used = new Set<number>();
    const playerRoom = rooms[Math.floor(rng.next() * Math.min(rooms.length, 5))];
    const playerSpawn = pickRoomTile(rng, playerRoom, used);
    const playerCenter = roomCenter(playerRoom);
    const farFromPlayer = (a: Room, b: Room) => manhattan(roomCenter(b), playerCenter) - manhattan(roomCenter(a), playerCenter);

    const foxRoom = rooms.filter(r => r !== playerRoom).sort(farFromPlayer)[0];
    const foxSpawn = pickRoomTile(rng, foxRoom, used);

    const otherRooms = rng.shuffle(rooms.filter(r => r !== playerRoom && r !== foxRoom));
    if (otherRooms.length < keyCount + 5) continue;

    const npcRooms = otherRooms.slice(0, 4);
    const npcSpawns = npcRooms.map(r => pickRoomTile(rng, r, used));

    const exitRoom = otherRooms.filter(r => !npcRooms.includes(r)).sort(farFromPlayer)[0];
    const exitTile = pickRoomTile(rng, exitRoom, used);

    const exitCenter = roomCenter(exitRoom);
    const bossRoom = rooms
      .filter(r => r !== playerRoom && r !== foxRoom && r !== exitRoom && !npcRooms.includes(r))
      .sort((a, b) => manhattan(roomCenter(b), exitCenter) - manhattan(roomCenter(a), exitCenter))[0] || foxRoom;
    const bossSpawn = pickRoomTile(rng, bossRoom, used);

    const keyRooms = rng.shuffle(otherRooms.filter(r => r !== exitRoom && !npcRooms.includes(r))).slice(0, keyCount);
    if (keyRooms.length < keyCount) continue;
    const keyTiles = keyRooms.map(r => pickRoomTile(rng, r, used));

    // With every door open the whole building must be connected.
    const openDist = distanceMap(WalkGrid.fromRows(grid), playerSpawn);
    if (![exitTile, ...keyTiles].every(t => distanceTo(openDist, t) >= 0)) continue;

    const mustReach = [foxSpawn, bossSpawn, exitTile, ...npcSpawns];
    const lockedDoors = pickLockedDoors(rng, grid, keyRooms, keyTiles, playerSpawn, mustReach, used);
    if (lockedDoors.length < Math.min(MAX_LOCKED_DOORS, keyCount)) continue;

    return furnish(rng, seed, grid, rooms, corridorRows, used,
      { playerSpawn, foxSpawn, npcSpawns, exitTile, bossSpawn, keyTiles, lockedDoors }, playerRoom);
  }
  return generateFallbackLevel(seed, keyCount);
}

/** Fixed layout used if random generation keeps failing (never observed, but guaranteed valid). */
export function generateFallbackLevel(seed: number, keyCount: number): LevelData {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const grid = makeEmptyGrid();
  const R = (x: number, y: number, type: Room["type"]): Room => ({ x, y, w: 8, h: 7, type });
  const rooms: Room[] = [
    R(3, 3, "ward"), R(13, 3, "procedure"), R(23, 3, "canteen"), R(33, 3, "isolation"), R(43, 3, "storage"),
    R(53, 3, "morgue"), R(63, 3, "ward"), R(3, 15, "procedure"), R(13, 15, "canteen"), R(23, 15, "isolation"),
    R(33, 15, "storage"), R(43, 15, "morgue"), R(53, 15, "ward"), R(63, 15, "procedure"), R(3, 27, "canteen"),
    R(13, 27, "isolation"), R(23, 27, "ward"), R(33, 27, "storage"), R(43, 27, "morgue"), R(3, 39, "ward"),
    R(13, 39, "procedure"), R(23, 39, "canteen"), R(33, 39, "isolation"),
  ];
  rooms.forEach(r => carveRoomInterior(grid, r));
  for (let c = 2; c < MAP_W - 2; c++) { grid[12][c] = "."; grid[13][c] = "."; grid[36][c] = "."; grid[37][c] = "."; }
  for (const col of [Math.floor(MAP_W / 2), 12, MAP_W - 14])
    for (let r = 12; r <= 37; r++) { grid[r][col] = "."; grid[r][col + 1] = "."; }
  for (const room of rooms) carveRoomLink(grid, room, Math.abs(roomCenter(room).row - 12) < Math.abs(roomCenter(room).row - 36) ? 12 : 36);

  const used = new Set<number>();
  const playerSpawn = pickRoomTile(rng, rooms[0], used);
  const foxSpawn = pickRoomTile(rng, rooms[rooms.length - 1], used);
  const npcSpawns = [rooms[2], rooms[5], rooms[9], rooms[16]].map(r => pickRoomTile(rng, r, used));
  const exitTile = pickRoomTile(rng, rooms[18], used);
  const bossSpawn = pickRoomTile(rng, rooms[14], used);
  // Rooms not used by spawns/exit, in preferred order; the level needs exactly keyCount keys.
  const keyRooms = [3, 7, 11, 15, 20, 1, 4, 6, 8, 10, 12, 13, 17, 19, 21].slice(0, keyCount).map(i => rooms[i]);
  const keyTiles = keyRooms.map(r => pickRoomTile(rng, r, used));
  const lockedDoors = pickLockedDoors(rng, grid, keyRooms, keyTiles, playerSpawn, [foxSpawn, bossSpawn, exitTile, ...npcSpawns], used);
  return furnish(rng, seed, grid, rooms, [12, 36], used,
    { playerSpawn, foxSpawn, npcSpawns, exitTile, bossSpawn, keyTiles, lockedDoors }, rooms[0]);
}
