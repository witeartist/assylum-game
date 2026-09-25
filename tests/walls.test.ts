import { describe, expect, it } from "vitest";
import { MAP_W, MAP_H, TILE } from "../src/core/constants";
import { WalkGrid, hasLineOfSight } from "../src/world/grid";
import { ARM_E, ARM_N, ARM_S, ARM_W, THIN, THIN_WALL, bands, faceRuns, wallMask, wallShapes } from "../src/world/walls";

/**
 * Solid rock with two rooms side by side (interiors cols 2–5 and 7–10, rows 3–6) sharing the wall
 * at col 6, a one-tile wall (row 7) down to a corridor (row 8), and a pillar in room B at (9, 4).
 */
function twoRooms(doorway?: { col: number; row: number }): string[] {
  const g = Array.from({ length: MAP_H }, () => Array<string>(MAP_W).fill("#"));
  for (let r = 3; r <= 6; r++) for (let c = 2; c <= 10; c++) if (c !== 6) g[r][c] = ".";
  for (let c = 2; c <= 10; c++) g[8][c] = ".";
  g[4][9] = "#";
  if (doorway) g[doorway.row][doorway.col] = ".";
  return g.map(r => r.join(""));
}

const at = (codes: Uint8Array, col: number, row: number) => codes[row * MAP_W + col];

describe("thin walls", () => {
  it("a wall one tile thick between spaces is thin, masses and pillars stay whole", () => {
    const codes = wallShapes(twoRooms());
    expect(at(codes, 6, 4)).toBe(THIN + ARM_N + ARM_S);            // between the rooms
    expect(at(codes, 3, 7)).toBe(THIN + ARM_E + ARM_W);            // room above the corridor
    expect(at(codes, 6, 7)).toBe(THIN + ARM_N + ARM_E + ARM_W);    // where they meet
    expect(at(codes, 3, 2)).toBe(0);                               // the mass above the rooms
    expect(at(codes, 3, 9)).toBe(0);                               // the mass below the corridor
    expect(at(codes, 9, 4)).toBe(0);                               // a lone pillar
  });

  it("doors in a thin wall are thin, walls reach out to them, kept ones stay whole", () => {
    const door = { col: 6, row: 5 };
    const rows = twoRooms(door);
    const codes = wallShapes(rows, [{ tile: door, horizontal: false }]);
    expect(at(codes, 6, 5)).toBe(THIN + ARM_N + ARM_S);
    expect(at(codes, 6, 4)).toBe(THIN + ARM_N + ARM_S);
    expect(at(codes, 6, 6)).toBe(THIN + ARM_N + ARM_S);
    const kept = wallShapes(rows, [{ tile: door, horizontal: false }], [door]);
    expect(at(kept, 6, 5)).toBe(0);
    expect(at(kept, 6, 4)).toBe(THIN + ARM_N + ARM_S);
  });

  it("bands: north–south in the middle, west–east along the bottom, joined at corners", () => {
    const m0 = TILE / 2 - THIN_WALL / 2, m1 = TILE / 2 + THIN_WALL / 2, top = TILE - THIN_WALL;
    expect(bands(THIN + ARM_N + ARM_S)).toEqual([{ x0: m0, y0: 0, x1: m1, y1: TILE }]);
    expect(bands(THIN + ARM_E + ARM_W)).toEqual([{ x0: 0, y0: top, x1: TILE, y1: TILE }]);
    expect(bands(THIN + ARM_N + ARM_E)).toEqual([{ x0: m0, y0: top, x1: TILE, y1: TILE }, { x0: m0, y0: 0, x1: m1, y1: TILE }]);
    expect(bands(THIN + ARM_E)).toEqual([{ x0: 0, y0: top, x1: TILE, y1: TILE }]);   // ends flush at a doorway
    expect(bands(0)).toEqual([{ x0: 0, y0: 0, x1: TILE, y1: TILE }]);
  });

  it("line of sight: a thin wall blocks only where its band is", () => {
    const rows = twoRooms();
    const g = WalkGrid.fromRows(rows);
    g.shape = wallShapes(rows);
    const p = (x: number, y: number) => ({ x: x * TILE, y: y * TILE });
    expect(hasLineOfSight(g, p(5.5, 4.5), p(7.5, 4.5))).toBe(false);                 // room to room through the wall
    expect(hasLineOfSight(g, p(6.1, 4.5), p(6.9, 4.5))).toBe(false);                 // both sides of the band, one tile
    expect(hasLineOfSight(g, p(6.1, 4.5), p(4.5, 4.5))).toBe(true);                  // beside the wall, from the room
    expect(hasLineOfSight(g, p(3.5, 5.5), p(3.5, 8.5))).toBe(false);                 // room to corridor
    // Grazing the floor in front of the room's south wall: open with thin walls, blocked with blocks.
    expect(hasLineOfSight(g, p(2.5, 6.9), p(5.5, 7.2))).toBe(true);
    expect(hasLineOfSight(WalkGrid.fromRows(rows), p(2.5, 6.9), p(5.5, 7.2))).toBe(false);
  });

  it("front faces run along the bottom of walls standing on floor, the margins of thin walls included", () => {
    const rows = twoRooms();
    const runs = faceRuns(wallMask(rows, wallShapes(rows), 2));
    const m0 = 6 * TILE + TILE / 2 - THIN_WALL / 2, m1 = 6 * TILE + TILE / 2 + THIN_WALL / 2;
    expect(runs).toContainEqual({ x0: 2 * TILE, x1: 11 * TILE, y: 8 * TILE });     // over the corridor
    expect(runs).toContainEqual({ x0: 2 * TILE, x1: m0, y: 3 * TILE });            // room A, up to the partition
    expect(runs).toContainEqual({ x0: m1, x1: 11 * TILE, y: 3 * TILE });           // room B, from the partition
    expect(runs).toContainEqual({ x0: 9 * TILE, x1: 10 * TILE, y: 5 * TILE });     // the pillar
  });
});
