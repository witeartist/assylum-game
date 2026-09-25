// The round: who is still in play, catches and escapes (single implementations), spectating
// after you're out, and the end of the round.
import type { KitId } from "../data/characters";
import { BREAK_FREE } from "../data/balance";
import { session } from "../net/session";
import type { Actor } from "../entities/Actor";
import { NET_FLAG } from "../entities/state";
import type { World } from "../game/World";
import { decideRoundEnd, outcomeFor, RoundTally, type LocalDone, type RunnerCounts } from "../game/roundRules";
import type { Role, RunnerStatus } from "../core/types";

const END_DELAY = 600;
const HOST_LINGER = 1500;

export interface ResultData extends RunnerCounts {
  outcome: ReturnType<typeof outcomeFor>;
  multiplayer: boolean;
  character: string;
  role: Role;
  /** The local villain's kit; for a runner, the villain's kit they asked for (null: random). */
  kit: KitId | null;
  difficulty: string;
  catcherName: string;
  keysCollected: number;
  keysTotal: number;
  elapsed: number;
}

export class Round {
  readonly tally = new RoundTally();
  localDone: LocalDone = null;
  finishScheduled = false;
  finished = false;
  /** Who caught the local runner (the villain until someone actually does). */
  catcherName: string;
  /** Text for the spectator line, or null when not spectating. */
  spectateText: string | null = null;
  private spectateIdx = 0;
  private readonly startTime: number;

  /** `wanted`: the villain's kit a runner asked for (null: random), kept for "again". */
  constructor(private world: World, private wanted: KitId | null = null) {
    for (const r of world.runners()) this.tally.add(r.id);
    this.catcherName = world.threats()[0]?.displayName ?? "?";
    this.startTime = world.scene.time.now;
  }

  /** The local player can still move and interact. */
  canAct(): boolean { return !this.finishScheduled && this.world.local.inPlay; }
  counts(): RunnerCounts { return this.tally.counts(); }

  /** A monster got its hands on a runner (authority only): they break free if they can, else caught. */
  grab(a: Actor, by: Actor): void {
    const w = this.world;
    if (!a.inPlay || a.role !== "runner" || this.finishScheduled || by.stunned > 0) return;
    const canFree = a.control === "remote" ? (a.netFlags & NET_FLAG.canBreakFree) !== 0 : a.breakFree > 0 || w.items.has(a, "sedative");
    if (canFree) this.breakFree(a, by);
    else this.catchRunner(a, by.displayName);
  }

  /** The runner slips out of the monster's hands: it is stunned, the runner gets a head start. */
  breakFree(a: Actor, by: Actor | null, remote = false): void {
    const w = this.world;
    if (a.control === "remote") {
      a.netFlags &= ~NET_FLAG.canBreakFree; // until its peer reports again
    } else {
      if (a.breakFree > 0) a.breakFree--;
      else w.items.useSedative(a);
      a.stamina = Math.max(a.stamina, a.staminaMax * BREAK_FREE.stamina);
      a.exhausted = false;
    }
    if (by && by.control !== "remote") { by.stunned = BREAK_FREE.stun; by.halt(); }
    w.toast(a === w.local ? "УДАЛОСЬ ВЫРВАТЬСЯ! БЕГИ!" : a.displayName + " вырывается из лап!", "warn");
    w.shake(250, 0.012);
    w.events.emit("brokeFree", { actor: a, by: by?.id ?? "", remote });
  }

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
      w.toast("Поймали: " + a.displayName, "bad");
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
      w.toast("На свободе: " + a.displayName, "good");
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
    w.toast("Игрок отключился: " + a.displayName, "neutral");
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
      this.spectateText = "👁 НАБЛЮДЕНИЕ: " + target.displayName + "  [Tab — переключить | ESC — выход]";
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
      role: w.local.role,
      kit: w.local.kit ?? this.wanted,
      difficulty: w.diff.id,
      catcherName: this.catcherName,
      keysCollected: w.objectives.collected,
      keysTotal: w.objectives.total,
      elapsed: Math.floor((w.scene.time.now - this.startTime) / 1000),
    };
    // The host lingers a moment so the round results reach everyone.
    if (w.multiplayer) session.leave(session.isHost ? HOST_LINGER : 0);
    w.scene.scene.start("Result", data);
  }
}
