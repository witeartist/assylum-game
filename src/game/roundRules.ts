// Round bookkeeping and end-of-round rules, free of Phaser so they can be unit-tested.
import type { Role, RunnerStatus } from "../core/types";
import { HERO_IDS, KIT_IDS } from "../data/characters";
import type { PlayerInfo, StartInfo } from "../net/protocol";
import type { NetMode } from "./World";

/** With this many players, two of them may be the villain (if two asked to). */
const TWO_VILLAINS_FROM = 5;

/**
 * Who is the villain in a multiplayer round: those who asked to be (one; two in a full room),
 * picked at random among them, or someone at random when nobody asked. A villain keeps the kit
 * they asked for; a drafted one gets a random kit. A lone player runs from the AI.
 */
export function pickVillains(players: Record<string, PlayerInfo>, random: () => number): Pick<StartInfo, "villains" | "aiVillain"> {
  const ids = Object.keys(players);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  if (ids.length < 2) {
    const taken = new Set(ids.map(id => players[id].character));
    return { villains: {}, aiVillain: { character: pick(HERO_IDS.filter(c => !taken.has(c))), kit: pick(KIT_IDS) } };
  }
  const volunteers = ids.filter(id => players[id].villain);
  // Shuffle, so who gets the part among volunteers is a coin toss.
  for (let i = volunteers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [volunteers[i], volunteers[j]] = [volunteers[j], volunteers[i]];
  }
  const chosen = volunteers.slice(0, ids.length >= TWO_VILLAINS_FROM ? 2 : 1);
  if (chosen.length === 0) chosen.push(pick(ids));
  const villains: StartInfo["villains"] = {};
  for (const id of chosen) villains[id] = players[id].villain ?? pick(KIT_IDS);
  return { villains, aiVillain: null };
}

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
