import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "../src/data/difficulty";
import { WalkGrid, distanceMap, distanceTo } from "../src/world/grid";
import { generateLevel, generateFallbackLevel, type LevelOptions } from "../src/world/levelgen";
import { blockingFurnitureTiles, type LevelData } from "../src/world/level";
import { THIN, levelWallShapes } from "../src/world/walls";
import { MAP_W, MAP_H } from "../src/core/constants";

/** Every rule a level must satisfy to be winnable; returns the violations. */
function problems(L: LevelData, o: LevelOptions): string[] {
  const errs: string[] = [];
  const keyCount = o.keys;
  if (L.keyTiles.length !== keyCount) errs.push(`keys ${L.keyTiles.length} != ${keyCount}`);
  if (L.lockedDoors.length !== Math.min(2, keyCount)) errs.push(`lockedDoors=${L.lockedDoors.length}`);
  if (L.fuseTiles.length !== (o.fuses ?? 0)) errs.push(`fuses ${L.fuseTiles.length}`);
  if ((o.fuses ?? 0) > 0 && !L.fuseBox) errs.push("no fuse box");
  if (L.items.length !== (o.items ?? 0)) errs.push(`items ${L.items.length}`);
  // Solid furniture blocks movement like walls do.
  const walk = WalkGrid.fromRows(L.rows).withSolid(blockingFurnitureTiles(L));
  const closed = walk.withSolid(L.lockedDoors.flatMap(d => d.doorTiles));
  const d = distanceMap(closed, L.playerSpawn);
  const lockedKeys = new Set(L.lockedDoors.map(l => l.keyIndex));
  L.keyTiles.forEach((k, i) => {
    const reachable = distanceTo(d, k) >= 0;
    if (lockedKeys.has(i) && reachable) errs.push(`locked key ${i} reachable`);
    if (!lockedKeys.has(i) && !reachable) errs.push(`free key ${i} unreachable`);
  });
  const must = [L.foxSpawn, L.bossSpawn, L.exitTile, ...L.npcSpawns, ...L.lockedDoors.map(l => l.terminalTile), ...L.fuseTiles, ...(L.fuseBox ? [L.fuseBox] : [])];
  if (!must.every(t => distanceTo(d, t) >= 0)) errs.push("spawn/exit/terminal unreachable with doors closed");
  const open = distanceMap(walk, L.playerSpawn);
  if (![L.exitTile, ...L.keyTiles].every(t => distanceTo(open, t) >= 0)) errs.push("unwinnable with doors open");
  // No pockets: every free floor tile is reachable, and nothing important sits under furniture.
  for (let r = 0; r < L.rows.length; r++) for (let c = 0; c < L.rows[r].length; c++) {
    if (!walk.isSolid(c, r) && distanceTo(open, { col: c, row: r }) < 0) { errs.push(`pocket at ${c},${r}`); break; }
  }
  const gateTiles = L.gates.flatMap(g => g.tiles);
  if (gateTiles.some(t => walk.isSolid(t.col, t.row))) errs.push("door on a wall or furniture");
  const locked = new Set(L.lockedDoors.flatMap(d => d.doorTiles).map(t => t.col + "," + t.row));
  if (gateTiles.some(t => locked.has(t.col + "," + t.row))) errs.push("door on a locked door");
  const important = [L.playerSpawn, L.exitTile, ...L.keyTiles, ...L.fuseTiles, ...L.items.map(i => i.tile), ...L.hidingSpots, ...L.bedSpots.flatMap(b => [b.tile, b.tile2])];
  if (important.some(t => walk.isSolid(t.col, t.row))) errs.push("furniture on an important tile");
  return errs;
}

const NORMAL: LevelOptions = { keys: 4, fuses: 3, items: 14 };

describe("level generator", () => {
  for (const diff of Object.values(DIFFICULTIES)) {
    const o: LevelOptions = { keys: diff.keyCount, fuses: diff.fuseCount, items: diff.itemCount };
    it(`always produces winnable levels (${diff.id})`, () => {
      for (let seed = 1; seed <= 60; seed++) expect(problems(generateLevel(seed * 7919, o), o), `seed ${seed * 7919}`).toEqual([]);
    }, 60_000);
    it(`fallback level is winnable (${diff.id})`, () => {
      for (let seed = 1; seed <= 10; seed++) expect(problems(generateFallbackLevel(seed, o), o)).toEqual([]);
    }, 60_000);
  }

  it("furnishes rooms", () => {
    const counts = [1, 2, 3, 4, 5].map(seed => generateLevel(seed, NORMAL).furniture.length);
    expect(Math.min(...counts)).toBeGreaterThan(20);
  });

  it("puts doors in doorways and leaves broken holes open", () => {
    const L = generateLevel(4242, NORMAL);
    expect(L.gates.length).toBeGreaterThan(5);
    const floor = (c: number, r: number) => L.rows[r]?.[c] !== undefined && L.rows[r][c] !== "#";
    for (const g of L.gates) {
      expect(g.tiles.length).toBeLessThanOrEqual(2);
      for (const t of g.tiles) {
        // A doorway: open on both sides across the wall.
        expect(g.horizontal ? floor(t.col, t.row - 1) && floor(t.col, t.row + 1) : floor(t.col - 1, t.row) && floor(t.col + 1, t.row)).toBe(true);
      }
    }
    const breach = new Set(L.breaches.map(t => t.col + "," + t.row));
    expect(L.gates.some(g => g.tiles.some(t => breach.has(t.col + "," + t.row)))).toBe(false);
  });

  it("puts tables in the middle and cabinets against the north wall", () => {
    const L = generateLevel(4242, NORMAL);
    const wall = (c: number, r: number) => L.rows[r]?.[c] === "#";
    for (const p of L.furniture) {
      if (p.key === "props/canteen_table") expect(wall(p.col, p.row - 1) || wall(p.col - 1, p.row), p.key).toBe(false);
      if (p.key === "props/morgue_fridge" || p.key === "props/shelf_boxes") expect(wall(p.col, p.row - 1), p.key).toBe(true);
    }
  });

  it("stands rooms wall to wall: most walls between spaces are thin partitions", () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const L = generateLevel(seed * 7919, NORMAL);
      const codes = levelWallShapes(L);
      const floor = (c: number, r: number) => L.rows[r]?.[c] !== undefined && L.rows[r][c] !== "#";
      let byFloor = 0, thin = 0;
      for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
        if (L.rows[r][c] !== "#" || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => floor(c + dc, r + dr))) continue;
        byFloor++;
        if (codes[r * MAP_W + c] >= THIN) thin++;
      }
      expect(thin / byFloor, `seed ${seed * 7919}`).toBeGreaterThan(0.4);
      // Holes are knocked through the one wall two rooms share: floor on both sides.
      for (const t of L.breaches) expect(floor(t.col - 1, t.row) && floor(t.col + 1, t.row), `breach ${t.col},${t.row}`).toBe(true);
    }
  });

  it("is deterministic: the same seed gives the same level", () => {
    const a = generateLevel(123456789, NORMAL), b = generateLevel(123456789, NORMAL);
    expect(b).toEqual(a);
    expect(generateLevel(987654321, NORMAL).rows).not.toEqual(a.rows);
  });
});
