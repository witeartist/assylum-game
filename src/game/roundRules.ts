// Round bookkeeping and end-of-round rules, free of Phaser so they can be unit-tested.
import type { Role, RunnerStatus } from "../core/types";
import type { NetMode } from "./World";

export interface RunnerCounts { total: number; alive: number; caught: number; escaped: number; }

/** Status of every runner in the round, keyed by actor id. */
export class RoundTally {
  private statuses = new Map<string, RunnerStatus>();

  add(id: string): void { this.statuses.set(id, "alive"); }
  get(id: string): RunnerStatus | undefined { return this.statuses.get(id); }

  /**
   * Record that a runner is out. Only an alive runner changes: a final result (caught /
   * escaped) is never overwritten — players disconnect right after the round ends.
   */
  set(id: string, status: Exclude<RunnerStatus, "alive">): boolean {
    if (this.statuses.get(id) !== "alive") return false;
    this.statuses.set(id, status);
    return true;
  }

  replaceAll(results: Record<string, RunnerStatus>): void {
    this.statuses = new Map(Object.entries(results));
  }

  toObject(): Record<string, RunnerStatus> { return Object.fromEntries(this.statuses); }

  /** Disconnected players don't count. */
  counts(): RunnerCounts {
    const c: RunnerCounts = { total: 0, alive: 0, caught: 0, escaped: 0 };
    for (const s of this.statuses.values()) {
      if (s === "left") continue;
      c.total++;
      c[s]++;
    }
    return c;
  }
}

export type Outcome = "escaped" | "caught" | "hunt-won" | "hunt-lost";
export type LocalDone = "caught" | "escaped" | null;

export function outcomeFor(role: Role, localDone: LocalDone, counts: RunnerCounts): Outcome {
  if (role === "hunter") return counts.caught > counts.escaped ? "hunt-won" : "hunt-lost";
  return localDone === "escaped" ? "escaped" : "caught";
}

/**
 * What happens after a runner was caught, escaped or left:
 * - `announce`: (host) the round is over — tell everyone and finish;
 * - `finish` / `finish-now`: end the round shortly / immediately;
 * - `spectate`: the local player is out but others play on;
 * - `continue`: nothing changes.
 */
export type EndDecision = "announce" | "finish" | "finish-now" | "spectate" | "continue";

export function decideRoundEnd(o: {
  net: NetMode; localRole: Role; localDone: LocalDone; alive: number; othersAlive: number;
}): EndDecision {
  if (o.net !== "solo") return o.net === "host" && o.alive === 0 ? "announce" : "spectate";
  if (o.localRole === "hunter") return o.alive === 0 ? "finish" : "continue";
  if (o.localDone === "escaped") return "finish-now";
  if (o.localDone === "caught") return o.othersAlive === 0 ? "finish" : "spectate";
  return "continue";
}
