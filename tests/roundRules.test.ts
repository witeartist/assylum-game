import { describe, expect, it } from "vitest";
import { RoundTally, decideRoundEnd, outcomeFor } from "../src/game/roundRules";

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
