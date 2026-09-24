// The round: who is still in play, catches and escapes (single implementations), spectating
// after you're out, and the end of the round.
import { HUNTER_ID, CHARACTERS } from "../data/characters";
import { session } from "../net/session";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { decideRoundEnd, outcomeFor, RoundTally, type LocalDone, type RunnerCounts } from "../game/roundRules";
import type { RunnerStatus } from "../core/types";

const END_DELAY = 600;
const HOST_LINGER = 1500;

export interface ResultData extends RunnerCounts {
  outcome: ReturnType<typeof outcomeFor>;
  multiplayer: boolean;
  character: string;
  difficulty: string;
  catcherName: string;
  keysCollected: number;
  keysTotal: number;
  elapsed: number;
  bossSpawned: boolean;
}

export class Round {
  readonly tally = new RoundTally();
  localDone: LocalDone = null;
  finishScheduled = false;
  finished = false;
  catcherName: string = CHARACTERS[HUNTER_ID].name;
  /** Text for the spectator line, or null when not spectating. */
  spectateText: string | null = null;
  private spectateIdx = 0;
  private readonly startTime: number;

  constructor(private world: World) {
    for (const r of world.runners()) this.tally.add(r.id);
    this.startTime = world.scene.time.now;
  }

  /** The local player can still move and interact. */
  canAct(): boolean { return !this.finishScheduled && this.world.local.inPlay; }
  counts(): RunnerCounts { return this.tally.counts(); }

  catchRunner(a: Actor, by: string, remote = false): void {
    const w = this.world;
    if (!a.inPlay || a.role !== "runner" || this.finishScheduled) return;
    this.tally.set(a.id, "caught");
    a.retire("caught");
    if (a === w.local) {
      this.localDone = "caught";
      this.catcherName = by;
      w.doors.closeMinigame(false);
      w.toast("ВАС ПОЙМАЛИ", "bad");
    } else {
      w.toast("Поймали: " + a.def.name, "bad");
    }
    w.events.emit("runnerCaught", { actor: a, by, remote });
    this.checkEnd();
  }

  escape(a: Actor, remote = false): void {
    const w = this.world;
    if (!a.inPlay || a.role !== "runner" || this.finishScheduled) return;
    this.tally.set(a.id, "escaped");
    a.retire("escaped");
    if (a === w.local) {
      this.localDone = "escaped";
      if (w.multiplayer) w.toast("ВЫ СБЕЖАЛИ! Ждём остальных…", "good");
    } else {
      w.toast("На свободе: " + a.def.name, "good");
    }
    w.events.emit("runnerEscaped", { actor: a, remote });
    this.checkEnd();
  }

  /** A remote player disconnected. */
  leave(a: Actor): void {
    const w = this.world;
    if (!a.inPlay) return;
    this.tally.set(a.id, "left");
    a.retire("left");
    w.toast("Игрок отключился: " + a.def.name, "neutral");
    w.events.emit("runnerLeft", { actor: a });
    this.checkEnd();
  }

  /** Client: the host announced the final results. */
  applyResults(results: Record<string, RunnerStatus>): void {
    this.tally.replaceAll(results);
    this.scheduleFinish(END_DELAY);
  }

  /** Client: the host is gone — back to the menu. */
  abort(message: string): void {
    if (this.finishScheduled) return;
    this.finishScheduled = true;
    this.world.toast(message, "bad");
    this.world.scene.time.delayedCall(2000, () => this.leaveToMenu());
  }

  /** ESC: leave the round (after it's over for you in solo, go to the results instead). */
  requestExit(): void {
    if (this.finishScheduled) return;
    if (this.localDone && !this.world.multiplayer) this.scheduleFinish(0);
    else this.leaveToMenu();
  }

  leaveToMenu(): void {
    this.finished = true;
    if (this.world.multiplayer) session.leave();
    this.world.scene.scene.start("Menu");
  }

  spectateTargets(): Actor[] {
    return this.world.runners().filter(r => r.inPlay && r !== this.world.local);
  }

  spectateTarget(): Actor | null {
    if (!this.localDone) return null;
    const t = this.spectateTargets();
    return t.length ? t[this.spectateIdx % t.length] : null;
  }

  cycleSpectate(): void {
    if (!this.spectateText) return;
    this.spectateIdx++;
    this.refreshSpectate();
  }

  private refreshSpectate(): void {
    if (!this.localDone) return;
    const target = this.spectateTarget();
    if (target) {
      this.world.camera.follow(target);
      this.spectateText = "👁 НАБЛЮДЕНИЕ: " + target.def.name + "  [Tab — переключить | ESC — выход]";
    } else {
      this.spectateText = this.world.multiplayer ? "Ожидание конца раунда…  [ESC — выход]" : null;
    }
  }

  private checkEnd(): void {
    if (this.finishScheduled) return;
    const w = this.world;
    const decision = decideRoundEnd({
      net: w.net, localRole: w.local.role, localDone: this.localDone,
      alive: this.counts().alive, othersAlive: this.spectateTargets().length,
    });
    switch (decision) {
      case "announce":
        w.events.emit("roundResults", { results: this.tally.toObject() });
        this.scheduleFinish(END_DELAY);
        break;
      case "finish": this.scheduleFinish(END_DELAY); break;
      case "finish-now": this.scheduleFinish(0); break;
      case "spectate": this.refreshSpectate(); break;
    }
  }

  private scheduleFinish(delayMs: number): void {
    if (this.finishScheduled) return;
    this.finishScheduled = true;
    this.world.scene.time.delayedCall(delayMs, () => this.finish());
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const w = this.world;
    const counts = this.counts();
    const data: ResultData = {
      ...counts,
      outcome: outcomeFor(w.local.role, this.localDone, counts),
      multiplayer: w.multiplayer,
      character: w.local.def.id,
      difficulty: w.diff.id,
      catcherName: this.catcherName,
      keysCollected: w.objectives.collected,
      keysTotal: w.objectives.total,
      elapsed: Math.floor((w.scene.time.now - this.startTime) / 1000),
      bossSpawned: w.director.bossSpawned,
    };
    // The host lingers a moment so the round results reach everyone.
    if (w.multiplayer) session.leave(session.isHost ? HOST_LINGER : 0);
    w.scene.scene.start("Result", data);
  }
}
