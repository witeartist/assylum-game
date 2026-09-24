import { describe, expect, it } from "vitest";
import { MAP_W, MAP_H, TILE } from "../src/core/constants";
import { WalkGrid, computeVisibility, distanceMap, distanceTo, findPath, hasLineOfSight } from "../src/world/grid";

/** Open field with a vertical wall at column 10 (rows 0..20) — a gap below row 20. */
function fieldWithWall(): WalkGrid {
  const rows = Array.from({ length: MAP_H }, (_, r) =>
    Array.from({ length: MAP_W }, (_, c) =>
      c === 0 || r === 0 || c === MAP_W - 1 || r === MAP_H - 1 || (c === 10 && r <= 20) ? "#" : ".").join(""));
  return WalkGrid.fromRows(rows);
}

const center = (col: number, row: number) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 });

describe("grid", () => {
  it("findPath returns a shortest 4-way path around walls", () => {
    const g = fieldWithWall();
    const path = findPath(g, { col: 5, row: 5 }, { col: 15, row: 5 });
    const d = distanceMap(g, { col: 5, row: 5 });
    expect(path.length).toBe(distanceTo(d, { col: 15, row: 5 }));
    expect(path[path.length - 1]).toEqual({ col: 15, row: 5 });
    let prev = { col: 5, row: 5 };
    for (const t of path) {
      expect(Math.abs(t.col - prev.col) + Math.abs(t.row - prev.row)).toBe(1);
      expect(g.isSolid(t.col, t.row)).toBe(false);
      prev = t;
    }
  });

  it("findPath is empty for unreachable or identical tiles", () => {
    const g = fieldWithWall();
    expect(findPath(g, { col: 5, row: 5 }, { col: 5, row: 5 })).toEqual([]);
    expect(findPath(g, { col: 5, row: 5 }, { col: 10, row: 5 })).toEqual([]);
    const sealed = g.withSolid([{ col: 10, row: 21 }, { col: 10, row: 22 }].concat(
      Array.from({ length: MAP_H - 23 }, (_, i) => ({ col: 10, row: 23 + i }))));
    expect(findPath(sealed, { col: 5, row: 5 }, { col: 15, row: 5 })).toEqual([]);
    expect(distanceTo(distanceMap(sealed, { col: 5, row: 5 }), { col: 15, row: 5 })).toBe(-1);
  });

  it("line of sight is blocked by walls only", () => {
    const g = fieldWithWall();
    expect(hasLineOfSight(g, center(5, 5), center(8, 9))).toBe(true);
    expect(hasLineOfSight(g, center(5, 5), center(15, 5))).toBe(false);
    expect(hasLineOfSight(g, center(5, 30), center(15, 30))).toBe(true);
    expect(hasLineOfSight(g, center(15, 5), center(5, 5))).toBe(false);
  });

  it("visibility stops at the first wall but includes it", () => {
    const g = fieldWithWall();
    const vis = computeVisibility(g, 5, 5, 10);
    const at = (c: number, r: number) => vis[r * MAP_W + c];
    expect(at(5, 5)).toBe(1);
    expect(at(9, 5)).toBe(1);
    expect(at(10, 5)).toBe(1);
    expect(at(12, 5)).toBe(0);
  });
});
