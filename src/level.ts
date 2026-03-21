// ============================================================
//  ASSYLUM — level.ts — Hospital-style level generation
// ============================================================
import {
  MAP_W, MAP_H, TILE, ROOM_TYPES, ROOM_LABELS, ROOM_PROPS,
  tileKey, tileDist, randInt, shuffle, Tile,
} from "./config";

// ── Types ────────────────────────────────────────────────────
export interface Room {
  x: number; y: number; w: number; h: number;
  type: string;
}

export interface Decoration {
  tile: Tile;
  sprite: string;
  type: string;
}

export interface LockedDoor {
  doorTiles: Tile[];
  terminalTile: Tile;
}

export interface BedSpot {
  tile: Tile;
  tile2: Tile;
  orientation: "vertical" | "horizontal";
  sprite: string;
}

export interface LevelData {
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
  startRoomLabel: string;
  lightSources: { col: number; row: number; radius: number; intensity: number }[];
}

// ── Grid helpers ─────────────────────────────────────────────
function makeEmptyGrid(): string[][] {
  return Array.from({ length: MAP_H }, () => Array(MAP_W).fill("#"));
}

function roomCenter(room: { x: number; y: number; w: number; h: number }): Tile {
  return { col: Math.floor(room.x + room.w / 2), row: Math.floor(room.y + room.h / 2) };
}

function roomInteriorTiles(room: { x: number; y: number; w: number; h: number }): Tile[] {
  const tiles: Tile[] = [];
  for (let r = room.y + 1; r < room.y + room.h - 1; r++)
    for (let c = room.x + 1; c < room.x + room.w - 1; c++)
      tiles.push({ col: c, row: r });
  return tiles;
}

// ── Hospital layout generator ────────────────────────────────
function carveRoomInterior(grid: string[][], room: { x: number; y: number; w: number; h: number }) {
  for (let r = room.y + 1; r < room.y + room.h - 1; r++)
    for (let c = room.x + 1; c < room.x + room.w - 1; c++)
      if (r >= 0 && r < MAP_H && c >= 0 && c < MAP_W)
        grid[r][c] = ".";
}

function carveCorridor(grid: string[][], r1: number, c1: number, r2: number, c2: number) {
  const midC = c2;
  const cFrom = Math.min(c1, midC), cTo = Math.max(c1, midC);
  for (let c = cFrom; c <= cTo; c++) {
    if (r1 >= 1 && r1 < MAP_H - 1 && c >= 1 && c < MAP_W - 1) grid[r1][c] = ".";
    if (r1 + 1 >= 1 && r1 + 1 < MAP_H - 1 && c >= 1 && c < MAP_W - 1) grid[r1 + 1][c] = ".";
  }
  const rFrom = Math.min(r1, r2), rTo = Math.max(r1, r2);
  for (let r = rFrom; r <= rTo; r++) {
    if (r >= 1 && r < MAP_H - 1 && midC >= 1 && midC < MAP_W - 1) grid[r][midC] = ".";
    if (r >= 1 && r < MAP_H - 1 && midC + 1 >= 1 && midC + 1 < MAP_W - 1) grid[r][midC + 1] = ".";
  }
}

function buildHospitalPlan() {
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const corridorRow1 = randInt(8, 11);
  const corridorRow2 = randInt(21, 25);
  const corridorRow3 = randInt(34, 38);

  function makeRoomRow(startCol: number, rowY: number, maxCount: number, side: number) {
    let col = startCol + randInt(0, 3);
    for (let i = 0; i < maxCount; i++) {
      const rw = randInt(5, 10);
      const rh = randInt(4, 7);
      const ry = side < 0 ? rowY - rh : rowY + 2;
      if (col + rw >= MAP_W - 2 || ry < 1 || ry + rh >= MAP_H - 1) break;
      rooms.push({ x: col, y: ry, w: rw, h: rh });
      col += rw + randInt(0, 2);
    }
  }

  makeRoomRow(2, corridorRow1, 9, -1);
  makeRoomRow(2, corridorRow1, 9, 1);
  makeRoomRow(2, corridorRow2, 9, -1);
  makeRoomRow(2, corridorRow2, 9, 1);
  makeRoomRow(2, corridorRow3, 9, -1);
  makeRoomRow(2, corridorRow3, 9, 1);

  const extras: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const ex = randInt(3, MAP_W - 14);
    const ey = randInt(2, MAP_H - 10);
    const ew = randInt(6, 10);
    const eh = randInt(5, 7);
    if (ex + ew < MAP_W - 1 && ey + eh < MAP_H - 1) {
      const overlaps = rooms.concat(extras).some(r =>
        ex < r.x + r.w + 1 && ex + ew + 1 > r.x && ey < r.y + r.h + 1 && ey + eh + 1 > r.y
      );
      if (!overlaps) extras.push({ x: ex, y: ey, w: ew, h: eh });
    }
  }
  rooms.push(...extras);
  return { rooms, corridorRow1, corridorRow2, corridorRow3 };
}

function assignRoomTypes(rooms: { x: number; y: number; w: number; h: number }[]): Room[] {
  const types = shuffle([...ROOM_TYPES]);
  return rooms.map((room, i) => ({ ...room, type: types[i % types.length] }));
}

function pickRoomTile(room: { x: number; y: number; w: number; h: number }, usedTiles: Set<string>): Tile {
  const candidates = shuffle(roomInteriorTiles(room));
  for (const t of candidates) {
    const k = tileKey(t.col, t.row);
    if (!usedTiles.has(k)) { usedTiles.add(k); return t; }
  }
  const fb = roomCenter(room);
  usedTiles.add(tileKey(fb.col, fb.row));
  return fb;
}

function paintBlood(grid: string[][], rooms: Room[], blockedTiles: Set<string>) {
  const paintable = shuffle(
    rooms.flatMap(r => roomInteriorTiles(r)).filter(t => !blockedTiles.has(tileKey(t.col, t.row)))
  );
  const count = Math.min(30, paintable.length);
  for (let i = 0; i < count; i++) grid[paintable[i].row][paintable[i].col] = "B";
}

function buildRoomDecorations(rooms: Room[], blockedTiles: Set<string>): Decoration[] {
  const decorations: Decoration[] = [];
  const used = new Set<string>();
  for (const room of rooms) {
    // Wards get beds as decorations via placeBedSpots — skip standard props
    if (room.type === "ward") continue;
    const propSprite = ROOM_PROPS[room.type] || "cabinet";
    const interior = roomInteriorTiles(room);
    const area = interior.length;
    const desired = Math.max(1, Math.min(3, Math.floor(area / 10)));
    const candidates = shuffle(interior).filter(t => !blockedTiles.has(tileKey(t.col, t.row)));
    let placed = 0;
    for (const t of candidates) {
      if (placed >= desired) break;
      const k = tileKey(t.col, t.row);
      if (used.has(k)) continue;
      used.add(k);
      decorations.push({ tile: t, sprite: propSprite, type: room.type });
      placed++;
    }
  }
  return decorations;
}

function placeHidingSpots(rooms: Room[], blockedTiles: Set<string>): Tile[] {
  const spots: Tile[] = [];
  const used = new Set<string>();
  for (const room of rooms) {
    // Wards (палаты) get beds instead of lockers — skip them here
    if (room.type === "ward") continue;
    // Only ~60% of non-ward rooms get a locker
    if (Math.random() > 0.6) continue;
    const candidates = shuffle(roomInteriorTiles(room))
      .filter(t => !blockedTiles.has(tileKey(t.col, t.row)) && !used.has(tileKey(t.col, t.row)));
    if (candidates.length > 0) {
      const t = candidates[0];
      used.add(tileKey(t.col, t.row));
      blockedTiles.add(tileKey(t.col, t.row));
      spots.push(t);
    }
  }
  return spots;
}

const BED_VERTICAL_SPRITES = ["bed_vertical", "bed_vertical_type_2", "bed_vertical_type_3"];
const BED_HORIZONTAL_SPRITES = ["bed_horizontal_type_1"];

function placeBedSpots(rooms: Room[], blockedTiles: Set<string>, grid: string[][]): BedSpot[] {
  const beds: BedSpot[] = [];
  for (const room of rooms) {
    if (room.type !== "ward") continue;
    const interior = roomInteriorTiles(room);
    // Reduced bed count: 1-3 based on room area
    const maxBeds = Math.min(3, Math.max(1, Math.floor(interior.length / 6)));
    const bedCount = randInt(1, maxBeds);
    let placed = 0;
    const used = new Set<string>();

    // Build set of tiles near room entrances (avoid placing beds there)
    const entryTiles = findRoomEntryTiles(grid, room);
    const nearEntry = new Set<string>();
    for (const e of entryTiles) {
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          nearEntry.add(tileKey(e.col + dc, e.row + dr));
    }

    // Try to place beds along walls (realistic hospital layout)
    const candidates: { t1: Tile; t2: Tile; orientation: "vertical" | "horizontal" }[] = [];

    // Vertical beds (2 tiles tall) — along left/right walls
    const innerH = room.h - 2;
    if (innerH >= 2) {
      for (let r = room.y + 1; r < room.y + room.h - 2; r++) {
        for (const c of [room.x + 1, room.x + room.w - 2]) {
          const t1: Tile = { col: c, row: r };
          const t2: Tile = { col: c, row: r + 1 };
          const k1 = tileKey(t1.col, t1.row), k2 = tileKey(t2.col, t2.row);
          if (nearEntry.has(k1) || nearEntry.has(k2)) continue;
          if (blockedTiles.has(k1) || blockedTiles.has(k2)) continue;
          candidates.push({ t1, t2, orientation: "vertical" });
        }
      }
    }
    // Horizontal beds (2 tiles wide) — along top/bottom walls
    const innerW = room.w - 2;
    if (innerW >= 2) {
      for (let c = room.x + 1; c < room.x + room.w - 2; c++) {
        for (const r of [room.y + 1, room.y + room.h - 2]) {
          const t1: Tile = { col: c, row: r };
          const t2: Tile = { col: c + 1, row: r };
          const k1 = tileKey(t1.col, t1.row), k2 = tileKey(t2.col, t2.row);
          if (nearEntry.has(k1) || nearEntry.has(k2)) continue;
          if (blockedTiles.has(k1) || blockedTiles.has(k2)) continue;
          candidates.push({ t1, t2, orientation: "horizontal" });
        }
      }
    }

    const shuffled = shuffle(candidates);
    for (const cand of shuffled) {
      if (placed >= bedCount) break;
      const k1 = tileKey(cand.t1.col, cand.t1.row);
      const k2 = tileKey(cand.t2.col, cand.t2.row);
      if (used.has(k1) || used.has(k2)) continue;
      // Ensure spacing between beds (at least 1 tile gap)
      let tooClose = false;
      for (const bk of used) {
        const [bc, br] = bk.split(",").map(Number);
        if (Math.abs(bc - cand.t1.col) + Math.abs(br - cand.t1.row) < 2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      used.add(k1); used.add(k2);
      blockedTiles.add(k1); blockedTiles.add(k2);
      const sprites = cand.orientation === "vertical" ? BED_VERTICAL_SPRITES : BED_HORIZONTAL_SPRITES;
      beds.push({
        tile: cand.t1,
        tile2: cand.t2,
        orientation: cand.orientation,
        sprite: sprites[Math.floor(Math.random() * sprites.length)],
      });
      placed++;
    }
  }
  return beds;
}

function placeLightSources(rooms: Room[], corridorRows: number[]): { col: number; row: number; radius: number; intensity: number }[] {
  // Assign brightness to rooms: ~50% lit, ~50% dark
  const lights: { col: number; row: number; radius: number; intensity: number }[] = [];
  for (const room of rooms) {
    if (Math.random() > 0.5) {
      // Lit room
      const rc = roomCenter(room);
      const radius = Math.max(room.w, room.h) * 0.6;
      lights.push({ col: rc.col, row: rc.row, radius, intensity: 0.8 });
    }
  }
  // Some corridor sections lit (40%), others dark
  for (const cr of corridorRows) {
    for (let c = 3; c < MAP_W - 3; c += randInt(6, 12)) {
      if (Math.random() > 0.4) continue;
      lights.push({ col: c, row: cr, radius: 4, intensity: 0.6 });
    }
  }
  return lights;
}

function findDoorTiles(grid: string[][], rooms: Room[]): Tile[] {
  const doors: Tile[] = [];
  for (const room of rooms) {
    for (let c = room.x; c < room.x + room.w; c++) {
      const r = room.y;
      if (r >= 1 && grid[r][c] === "." && grid[r - 1] && grid[r - 1][c] === ".") doors.push({ col: c, row: r });
    }
    for (let c = room.x; c < room.x + room.w; c++) {
      const r = room.y + room.h - 1;
      if (r < MAP_H - 1 && grid[r][c] === "." && grid[r + 1] && grid[r + 1][c] === ".") doors.push({ col: c, row: r });
    }
    for (let r = room.y; r < room.y + room.h; r++) {
      const c = room.x;
      if (c >= 1 && grid[r][c] === "." && grid[r][c - 1] === ".") doors.push({ col: c, row: r });
    }
    for (let r = room.y; r < room.y + room.h; r++) {
      const c = room.x + room.w - 1;
      if (c < MAP_W - 1 && grid[r][c] === "." && grid[r][c + 1] === ".") doors.push({ col: c, row: r });
    }
  }
  const seen = new Set<string>();
  return doors.filter(d => {
    const k = tileKey(d.col, d.row);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function findRoomEntryTiles(grid: string[][], room: Room): Tile[] {
  const entries: Tile[] = [];
  for (let c = room.x + 1; c < room.x + room.w - 1; c++) {
    if (grid[room.y][c] !== '#' && room.y > 0 && grid[room.y - 1][c] !== '#')
      entries.push({ col: c, row: room.y });
  }
  const botY = room.y + room.h - 1;
  for (let c = room.x + 1; c < room.x + room.w - 1; c++) {
    if (botY < MAP_H && grid[botY][c] !== '#' && botY + 1 < MAP_H && grid[botY + 1][c] !== '#')
      entries.push({ col: c, row: botY });
  }
  for (let r = room.y + 1; r < room.y + room.h - 1; r++) {
    if (grid[r][room.x] !== '#' && room.x > 0 && grid[r][room.x - 1] !== '#')
      entries.push({ col: room.x, row: r });
  }
  const rightX = room.x + room.w - 1;
  for (let r = room.y + 1; r < room.y + room.h - 1; r++) {
    if (rightX < MAP_W && grid[r][rightX] !== '#' && rightX + 1 < MAP_W && grid[r][rightX + 1] !== '#')
      entries.push({ col: rightX, row: r });
  }
  return entries;
}

function pickLockedDoors(grid: string[][], keyRooms: Room[]): LockedDoor[] {
  const locked: LockedDoor[] = [];
  const count = Math.min(2, keyRooms.length);
  for (let i = 0; i < count; i++) {
    const room = keyRooms[i];
    const entries = findRoomEntryTiles(grid, room);
    if (entries.length === 0) continue;
    const entry = entries[0];
    let termTile: Tile | null = null;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const nr = entry.row + dr, nc = entry.col + dc;
      if (nr >= 0 && nr < MAP_H && nc >= 0 && nc < MAP_W &&
          grid[nr][nc] !== '#' &&
          !(nr >= room.y && nr < room.y + room.h && nc >= room.x && nc < room.x + room.w)) {
        termTile = { col: nc, row: nr };
        break;
      }
    }
    if (!termTile) continue;
    locked.push({ doorTiles: entries, terminalTile: termTile });
  }
  return locked;
}

// ── Main level generator ─────────────────────────────────────
export function generateLevelData(keyCount: number): LevelData {
  for (let attempt = 0; attempt < 30; attempt++) {
    const grid = makeEmptyGrid();
    const plan = buildHospitalPlan();
    const rawRooms = plan.rooms;
    if (rawRooms.length < 14) continue;

    rawRooms.forEach(r => carveRoomInterior(grid, r));

    const { corridorRow1, corridorRow2, corridorRow3 } = plan;
    for (let c = 2; c < MAP_W - 2; c++) {
      grid[corridorRow1][c] = "."; grid[corridorRow1 + 1][c] = ".";
      grid[corridorRow2][c] = "."; grid[corridorRow2 + 1][c] = ".";
      grid[corridorRow3][c] = "."; grid[corridorRow3 + 1][c] = ".";
    }

    const midC = Math.floor(MAP_W / 2);
    const vertCols = [randInt(10, 15), midC, randInt(MAP_W - 16, MAP_W - 11)];
    for (const vc of vertCols) {
      for (let r = corridorRow1; r <= corridorRow3 + 1; r++) {
        if (r >= 1 && r < MAP_H - 1 && vc >= 1 && vc + 1 < MAP_W - 1) {
          grid[r][vc] = "."; grid[r][vc + 1] = ".";
        }
      }
    }

    const corridorRows = [corridorRow1, corridorRow2, corridorRow3];
    for (const room of rawRooms) {
      const rc = roomCenter(room);
      let targetRow = corridorRow1;
      let bestDist = Infinity;
      for (const cr of corridorRows) {
        const d = Math.abs(rc.row - cr);
        if (d < bestDist) { bestDist = d; targetRow = cr; }
      }
      const rFrom = Math.min(rc.row, targetRow);
      const rTo = Math.max(rc.row, targetRow + 1);
      for (let r = rFrom; r <= rTo; r++) {
        if (r >= 1 && r < MAP_H - 1 && rc.col >= 1 && rc.col < MAP_W - 1) {
          grid[r][rc.col] = ".";
          if (rc.col + 1 < MAP_W - 1) grid[r][rc.col + 1] = ".";
        }
      }
    }

    const rooms = assignRoomTypes(rawRooms);
    const usedTiles = new Set<string>();
    const playerRoom = rooms[Math.floor(Math.random() * Math.min(rooms.length, 5))];
    const playerSpawn = pickRoomTile(playerRoom, usedTiles);
    const playerCenter = roomCenter(playerRoom);

    const foxRoom = rooms
      .filter(r => r !== playerRoom)
      .sort((a, b) => tileDist(roomCenter(b), playerCenter) - tileDist(roomCenter(a), playerCenter))[0];
    const foxSpawn = pickRoomTile(foxRoom, usedTiles);

    const otherRooms = shuffle(rooms.filter(r => r !== playerRoom && r !== foxRoom));
    if (otherRooms.length < keyCount + 5) continue;

    const npcRooms = otherRooms.slice(0, 4);
    const npcSpawns = npcRooms.map(r => pickRoomTile(r, usedTiles));

    const exitRoom = otherRooms
      .filter(r => !npcRooms.includes(r))
      .sort((a, b) => tileDist(roomCenter(b), playerCenter) - tileDist(roomCenter(a), playerCenter))[0];
    const exitTile = pickRoomTile(exitRoom, usedTiles);

    const bossRoomCandidates = rooms.filter(r =>
      r !== playerRoom && r !== foxRoom && r !== exitRoom && !npcRooms.includes(r));
    const bossRoom = bossRoomCandidates
      .sort((a, b) => tileDist(roomCenter(b), roomCenter(exitRoom)) - tileDist(roomCenter(a), roomCenter(exitRoom)))[0]
      || foxRoom;
    const bossSpawn = pickRoomTile(bossRoom, usedTiles);

    const keyRoomCandidates = shuffle(
      otherRooms.filter(r => r !== exitRoom && !npcRooms.includes(r))
    ).slice(0, keyCount);
    if (keyRoomCandidates.length < keyCount) continue;
    const keyTiles = keyRoomCandidates.map(r => pickRoomTile(r, usedTiles));

    const lockedDoors = pickLockedDoors(grid, keyRoomCandidates);
    const decorations = buildRoomDecorations(rooms, usedTiles);
    const hidingSpots = placeHidingSpots(rooms, usedTiles);
    const bedSpots = placeBedSpots(rooms, usedTiles, grid);
    const doors = findDoorTiles(grid, rooms);
    const lightSources = placeLightSources(rooms, corridorRows);
    paintBlood(grid, rooms, usedTiles);

    return {
      rows: grid.map(r => r.join("")),
      rooms, playerSpawn, foxSpawn, npcSpawns, exitTile, bossSpawn,
      keyTiles, decorations, hidingSpots, bedSpots, doors, lockedDoors, lightSources,
      startRoomLabel: ROOM_LABELS[playerRoom.type] || "Палата",
    };
  }

  return generateFallbackLevel();
}

// ── Fallback ─────────────────────────────────────────────────
function generateFallbackLevel(): LevelData {
  const grid = makeEmptyGrid();
  const rooms: Room[] = [
    { x: 3,  y: 3,  w: 8,  h: 7, type: "ward" },
    { x: 13, y: 3,  w: 8,  h: 7, type: "procedure" },
    { x: 23, y: 3,  w: 8,  h: 7, type: "canteen" },
    { x: 33, y: 3,  w: 8,  h: 7, type: "isolation" },
    { x: 43, y: 3,  w: 8,  h: 7, type: "storage" },
    { x: 53, y: 3,  w: 8,  h: 7, type: "morgue" },
    { x: 63, y: 3,  w: 8,  h: 7, type: "ward" },
    { x: 3,  y: 15, w: 8,  h: 7, type: "procedure" },
    { x: 13, y: 15, w: 8,  h: 7, type: "canteen" },
    { x: 23, y: 15, w: 8,  h: 7, type: "isolation" },
    { x: 33, y: 15, w: 8,  h: 7, type: "storage" },
    { x: 43, y: 15, w: 8,  h: 7, type: "morgue" },
    { x: 53, y: 15, w: 8,  h: 7, type: "ward" },
    { x: 63, y: 15, w: 8,  h: 7, type: "procedure" },
    { x: 3,  y: 27, w: 8,  h: 7, type: "canteen" },
    { x: 13, y: 27, w: 8,  h: 7, type: "isolation" },
    { x: 23, y: 27, w: 8,  h: 7, type: "ward" },
    { x: 33, y: 27, w: 8,  h: 7, type: "storage" },
    { x: 43, y: 27, w: 8,  h: 7, type: "morgue" },
    { x: 3,  y: 39, w: 8,  h: 7, type: "ward" },
    { x: 13, y: 39, w: 8,  h: 7, type: "procedure" },
    { x: 23, y: 39, w: 8,  h: 7, type: "canteen" },
    { x: 33, y: 39, w: 8,  h: 7, type: "isolation" },
  ];

  rooms.forEach(r => carveRoomInterior(grid, r));
  for (let c = 2; c < MAP_W - 2; c++) {
    grid[12][c] = "."; grid[13][c] = ".";
    grid[36][c] = "."; grid[37][c] = ".";
  }
  const midC = Math.floor(MAP_W / 2);
  for (let r = 12; r <= 37; r++) { grid[r][midC] = "."; grid[r][midC + 1] = "."; }
  for (let r = 12; r <= 37; r++) { grid[r][12] = "."; grid[r][13] = "."; }
  for (let r = 12; r <= 37; r++) { grid[r][MAP_W - 14] = "."; grid[r][MAP_W - 13] = "."; }

  for (const room of rooms) {
    const rc = roomCenter(room);
    const targetRow = Math.abs(rc.row - 12) < Math.abs(rc.row - 36) ? 12 : 36;
    const rFrom = Math.min(rc.row, targetRow);
    const rTo = Math.max(rc.row, targetRow + 1);
    for (let r = rFrom; r <= rTo; r++) {
      if (r >= 1 && r < MAP_H - 1) {
        grid[r][rc.col] = ".";
        if (rc.col + 1 < MAP_W - 1) grid[r][rc.col + 1] = ".";
      }
    }
  }

  const usedTiles = new Set<string>();
  const playerSpawn = pickRoomTile(rooms[0], usedTiles);
  const foxSpawn    = pickRoomTile(rooms[rooms.length - 1], usedTiles);
  const npcSpawns   = [rooms[2], rooms[5], rooms[9], rooms[16]].map(r => pickRoomTile(r, usedTiles));
  const exitTile    = pickRoomTile(rooms[18], usedTiles);
  const bossSpawn   = pickRoomTile(rooms[14], usedTiles);
  const keyTiles    = [rooms[3], rooms[7], rooms[11], rooms[15], rooms[20]].map(r => pickRoomTile(r, usedTiles));
  const lockedDoors = pickLockedDoors(grid, [rooms[3], rooms[7]]);
  const decorations = buildRoomDecorations(rooms, usedTiles);
  const hidingSpots = placeHidingSpots(rooms, usedTiles);
  const bedSpots    = placeBedSpots(rooms, usedTiles, grid);
  const doors       = findDoorTiles(grid, rooms);
  const lightSources = placeLightSources(rooms, [12, 36]);
  paintBlood(grid, rooms, usedTiles);

  return {
    rows: grid.map(r => r.join("")),
    rooms, playerSpawn, foxSpawn, npcSpawns, exitTile, bossSpawn,
    keyTiles, decorations, hidingSpots, bedSpots, doors, lockedDoors, lightSources,
    startRoomLabel: ROOM_LABELS[rooms[0].type] || "Палата",
  };
}
