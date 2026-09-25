import { describe, expect, it } from "vitest";
import { STAMINA } from "../src/data/balance";
import { staminaStep } from "../src/systems/vitals";
import { Noise } from "../src/systems/noise";
import { chooseRunnerGoal, goalKey } from "../src/ai/goals";
import { WalkGrid, findPath, findPathWeighted } from "../src/world/grid";
import { MAP_W, MAP_H, TILE } from "../src/core/constants";
import type { World } from "../src/game/World";

/** An open map with a wall across column 10 (a gap at row 5). */
function openGrid(): WalkGrid {
  const rows = Array.from({ length: MAP_H }, (_, r) => Array.from({ length: MAP_W }, (_, c) =>
    r === 0 || c === 0 || r === MAP_H - 1 || c === MAP_W - 1 || (c === 10 && r !== 5) ? "#" : ".").join(""));
  return WalkGrid.fromRows(rows);
}

describe("stamina", () => {
  it("running drains it, and at zero you are exhausted until it recovers", () => {
    const s = { stamina: STAMINA.max, staminaMax: STAMINA.max, exhausted: false, adrenaline: 0 };
    let t = 0;
    while (!s.exhausted && t < 20) { staminaStep(s, true, true, 0.1); t += 0.1; }
    expect(t).toBeCloseTo(STAMINA.max, 0);
    expect(s.stamina).toBe(0);
    staminaStep(s, false, false, 1);
    expect(s.exhausted).toBe(true);
    for (let t = 0; t < 5; t += 0.1) staminaStep(s, false, false, 0.1);
    expect(s.exhausted).toBe(false);
  });

  it("adrenaline makes running free", () => {
    const s = { stamina: 2, staminaMax: STAMINA.max, exhausted: false, adrenaline: 3 };
    staminaStep(s, true, true, 1);
    expect(s.stamina).toBe(2);
  });
});

describe("noise", () => {
  const world = { sight: openGrid(), events: { emit: () => {} }, actors: [] } as unknown as World;
  const noise = new Noise(world);

  it("carries its radius in the open, less through a wall", () => {
    const e = noise.emit(5 * TILE, 20 * TILE, 7, "run");
    expect(noise.hears({ x: 11 * TILE, y: 20 * TILE }, e)).toBe(false);   // 6 tiles, but through the wall
    expect(noise.hears({ x: 9.5 * TILE, y: 20 * TILE }, e)).toBe(true);   // 4.5 tiles, same side
    expect(noise.hears({ x: 5 * TILE, y: 26.5 * TILE }, e)).toBe(true);   // 6.5 tiles in the open
    expect(noise.hears({ x: 5 * TILE, y: 28 * TILE }, e)).toBe(false);    // too far
  });

  it("listeners get only what is new", () => {
    const last = noise.lastId;
    noise.emit(0, 0, 1, "glass");
    expect(noise.since(last).map(e => e.kind)).toEqual(["glass"]);
    expect(noise.since(noise.lastId)).toEqual([]);
  });
});

describe("bot goals", () => {
  const grid = openGrid();
  const keys = [{ tile: { col: 3, row: 3 }, index: 0 }, { tile: { col: 30, row: 30 }, index: 1 }];
  const base = { exit: null, keys, terminals: [], fuses: [], box: null };

  it("go for the nearest free goal, leaving claimed ones to others", () => {
    expect(chooseRunnerGoal(grid, { col: 4, row: 4 }, base)?.index).toBe(0);
    const taken = new Set([goalKey({ kind: "key", index: 0 })]);
    expect(chooseRunnerGoal(grid, { col: 4, row: 4 }, base, taken)?.index).toBe(1);
  });

  it("carry a fuse to the box first, run for the exit once it is open", () => {
    expect(chooseRunnerGoal(grid, { col: 4, row: 4 }, { ...base, box: { col: 20, row: 20 } })?.kind).toBe("box");
    expect(chooseRunnerGoal(grid, { col: 4, row: 4 }, { ...base, exit: { col: 40, row: 40 } })?.kind).toBe("exit");
  });
});

describe("paths around danger", () => {
  it("take a detour instead of walking past a monster", () => {
    const grid = new WalkGrid(new Uint8Array(MAP_W * MAP_H));
    const from = { col: 2, row: 20 }, to = { col: 30, row: 20 };
    const extra = new Float32Array(MAP_W * MAP_H);
    for (let r = 14; r <= 26; r++) for (let c = 13; c <= 19; c++) extra[r * MAP_W + c] = 50;
    const straight = findPath(grid, from, to);
    const around = findPathWeighted(grid, from, to, extra);
    expect(straight.some(t => t.col === 16 && t.row === 20)).toBe(true);
    expect(around[around.length - 1]).toEqual(to);
    expect(around.some(t => extra[t.row * MAP_W + t.col] > 0)).toBe(false);
  });
});
