import { describe, expect, it } from "vitest";
import { RoundTally, decideRoundEnd, outcomeFor, pickVillains } from "../src/game/roundRules";
import type { PlayerInfo } from "../src/net/protocol";
import type { CharacterId, KitId } from "../src/data/characters";

describe("round tally", () => {
  it("never overwrites a final result", () => {
    const t = new RoundTally();
    t.add("a"); t.add("b");
    expect(t.set("a", "caught")).toBe(true);
    expect(t.set("a", "left")).toBe(false);   // disconnecting after being caught
    expect(t.set("a", "escaped")).toBe(false);
    expect(t.set("zzz", "caught")).toBe(false); // unknown runner
    expect(t.get("a")).toBe("caught");
  });

  it("does not count disconnected players", () => {
    const t = new RoundTally();
    ["a", "b", "c", "d"].forEach(id => t.add(id));
    t.set("a", "caught"); t.set("b", "escaped"); t.set("c", "left");
    expect(t.counts()).toEqual({ total: 3, alive: 1, caught: 1, escaped: 1 });
  });
});

describe("end of round", () => {
  const base = { localDone: null, alive: 3, othersAlive: 3 } as const;

  it("solo runner: escaping ends at once, being caught spectates until nobody is left", () => {
    expect(decideRoundEnd({ ...base, net: "solo", localRole: "runner" })).toBe("continue");
    expect(decideRoundEnd({ ...base, net: "solo", localRole: "runner", localDone: "escaped" })).toBe("finish-now");
    expect(decideRoundEnd({ ...base, net: "solo", localRole: "runner", localDone: "caught" })).toBe("spectate");
    expect(decideRoundEnd({ net: "solo", localRole: "runner", localDone: "caught", alive: 0, othersAlive: 0 })).toBe("finish");
  });

  it("solo hunter: ends when no runner is left", () => {
    expect(decideRoundEnd({ ...base, net: "solo", localRole: "hunter" })).toBe("continue");
    expect(decideRoundEnd({ ...base, net: "solo", localRole: "hunter", alive: 0 })).toBe("finish");
  });

  it("multiplayer: only the host announces the end", () => {
    expect(decideRoundEnd({ ...base, net: "host", localRole: "runner", alive: 0 })).toBe("announce");
    expect(decideRoundEnd({ ...base, net: "host", localRole: "hunter" })).toBe("spectate");
    expect(decideRoundEnd({ ...base, net: "client", localRole: "runner", alive: 0 })).toBe("spectate");
  });

  it("outcomes", () => {
    const c = { total: 5, alive: 0, caught: 3, escaped: 2 };
    expect(outcomeFor("hunter", null, c)).toBe("hunt-won");
    expect(outcomeFor("hunter", null, { ...c, caught: 2, escaped: 3 })).toBe("hunt-lost");
    expect(outcomeFor("runner", "escaped", c)).toBe("escaped");
    expect(outcomeFor("runner", "caught", c)).toBe("caught");
  });
});

describe("who is the villain", () => {
  const heroes: CharacterId[] = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
  const room = (wishes: (KitId | null)[]): Record<string, PlayerInfo> =>
    Object.fromEntries(wishes.map((villain, i) => ["p" + i, { character: heroes[i], ready: true, villain }]));
  /** A fixed sequence of "random" numbers. */
  const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

  it("a volunteer gets the part with the kit they asked for", () => {
    const r = pickVillains(room([null, "brute", null]), seq(0.3));
    expect(r.villains).toEqual({ p1: "brute" });
    expect(r.aiVillain).toBeNull();
  });

  it("among several volunteers only one is picked (two in a room of five)", () => {
    expect(Object.keys(pickVillains(room(["fox", "brute", null]), seq(0.9, 0.1)).villains)).toHaveLength(1);
    const full = pickVillains(room(["fox", "brute", null, "fox", null]), seq(0.5, 0.2, 0.8));
    expect(Object.keys(full.villains)).toHaveLength(2);
    for (const [id, kit] of Object.entries(full.villains)) expect(kit).toBe(room(["fox", "brute", null, "fox", null])[id].villain);
    // Five players, one volunteer: nobody is drafted as the second villain.
    expect(Object.keys(pickVillains(room([null, null, "fox", null, null]), seq(0.5)).villains)).toEqual(["p2"]);
  });

  it("nobody asked: someone is drafted, with a random kit", () => {
    const r = pickVillains(room([null, null, null]), seq(0.99, 0.2));
    expect(r.villains).toEqual({ p2: "fox" });
  });

  it("a lone player runs from the AI, played by another hero", () => {
    const r = pickVillains(room([null]), seq(0));
    expect(r.villains).toEqual({});
    expect(r.aiVillain?.character).not.toBe("Naumi");
  });
});
