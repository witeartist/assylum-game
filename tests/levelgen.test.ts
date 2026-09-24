import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "../src/data/difficulty";
import { WalkGrid, distanceMap, distanceTo } from "../src/world/grid";
import { generateLevel, generateFallbackLevel } from "../src/world/levelgen";
import { blockingFurnitureTiles, type LevelData } from "../src/world/level";

/** Every rule a level must satisfy to be winnable; returns the violations. */
function problems(L: LevelData, keyCount: number): string[] {
  const errs: string[] = [];
  if (L.keyTiles.length !== keyCount) errs.push(`keys ${L.keyTiles.length} != ${keyCount}`);
  if (L.lockedDoors.length !== Math.min(2, keyCount)) errs.push(`lockedDoors=${L.lockedDoors.length}`);
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
  const must = [L.foxSpawn, L.bossSpawn, L.exitTile, ...L.npcSpawns, ...L.lockedDoors.map(l => l.terminalTile)];
  if (!must.every(t => distanceTo(d, t) >= 0)) errs.push("spawn/exit/terminal unreachable with doors closed");
  const open = distanceMap(walk, L.playerSpawn);
  if (![L.exitTile, ...L.keyTiles].every(t => distanceTo(open, t) >= 0)) errs.push("unwinnable with doors open");
  // No pockets: every free floor tile is reachable, and nothing important sits under furniture.
  for (let r = 0; r < L.rows.length; r++) for (let c = 0; c < L.rows[r].length; c++) {
    if (!walk.isSolid(c, r) && distanceTo(open, { col: c, row: r }) < 0) { errs.push(`pocket at ${c},${r}`); break; }
  }
  const important = [L.playerSpawn, L.exitTile, ...L.keyTiles, ...L.hidingSpots, ...L.bedSpots.flatMap(b => [b.tile, b.tile2])];
  if (important.some(t => walk.isSolid(t.col, t.row))) errs.push("furniture on an important tile");
  return errs;
}

describe("level generator", () => {
  for (const diff of Object.values(DIFFICULTIES)) {
    it(`always produces winnable levels (${diff.id})`, () => {
      for (let seed = 1; seed <= 60; seed++) expect(problems(generateLevel(seed * 7919, diff.keyCount), diff.keyCount), `seed ${seed * 7919}`).toEqual([]);
    }, 60_000);
    it(`fallback level is winnable (${diff.id})`, () => {
      for (let seed = 1; seed <= 10; seed++) expect(problems(generateFallbackLevel(seed, diff.keyCount), diff.keyCount)).toEqual([]);
    }, 60_000);
  }

  it("furnishes rooms", () => {
    const counts = [1, 2, 3, 4, 5].map(seed => generateLevel(seed, 5).furniture.length);
    expect(Math.min(...counts)).toBeGreaterThan(20);
  });

  it("is deterministic: the same seed gives the same level", () => {
    const a = generateLevel(123456789, 5), b = generateLevel(123456789, 5);
    expect(b).toEqual(a);
    expect(generateLevel(987654321, 5).rows).not.toEqual(a.rows);
  });
});
