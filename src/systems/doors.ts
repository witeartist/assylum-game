// Locked doors and their terminals. A player opens a door with the code minigame — digits flash
// one by one, then you type them back; a mistake sounds the alarm. A bot hacks by standing at the
// terminal. Either way `open` is the single implementation.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Vec2 } from "../core/types";
import { BOT_HACK_RANGE, BOT_HACK_TIME, NOISE, TERMINAL, TERMINAL_RANGE } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { GoalCandidate } from "../ai/goals";
import type { LockedDoor } from "../world/level";
import { placeStanding } from "../render/worldView";

interface DoorState {
  data: LockedDoor;
  open: boolean;
  terminal: Phaser.GameObjects.Image;
  /** Bot hacking progress, 0..1. */
  hack: number;
}

export interface Minigame {
  active: boolean;
  door: number;
  code: number[];
  input: number[];
  /** "show": digits flash one by one (index `shown`, -1 = gap); "input": type them back. */
  phase: "show" | "input";
  shown: number;
  /** Colour flash after a digit: right, wrong, or none. */
  feedback: "ok" | "bad" | null;
}

/** Bots trip the alarm on this share of hacks. */
const BOT_ALARM_CHANCE = 0.2;

const TERMINAL_WIDTH = TILE * 0.62;

export class Doors {
  readonly doors: DoorState[];
  readonly minigame: Minigame = { active: false, door: -1, code: [], input: [], phase: "show", shown: -1, feedback: null };
  private showT = 0;

  constructor(private world: World) {
    const scene = world.scene;
    this.doors = world.level.lockedDoors.map(data => {
      const t = data.terminalTile, p = tileCenter(t);
      // Hung on the wall above its tile when there is one, otherwise standing on the floor.
      const onWall = world.sight.isSolid(t.col, t.row - 1);
      const terminal = placeStanding(scene, "interactive/terminal", p.x, onWall ? t.row * TILE + 3 : p.y + TILE * 0.3, TERMINAL_WIDTH);
      return { data, open: false, terminal, hack: 0 };
    });
  }

  /** Text above terminal `i`, shown by the HUD. */
  label(i: number): { text: string; tone: "terminal" | "neutral" } {
    const d = this.doors[i];
    if (d.open) return { text: "ОТКРЫТО", tone: "neutral" };
    return { text: d.hack > 0 ? "ВЗЛОМ " + Math.floor(d.hack * 100) + "%" : "ТЕРМИНАЛ", tone: "terminal" };
  }

  /** Index of an unsolved terminal within reach of `p`, or -1. */
  nearestTerminal(p: Vec2): number {
    return this.doors.findIndex(d => !d.open && dist(p, d.terminal) < TERMINAL_RANGE);
  }

  /** E at a terminal: start the code minigame. */
  interactLocal(): void {
    const w = this.world, a = w.local;
    if (a.role !== "runner" || !w.round.canAct() || this.minigame.active || a.hiding) return;
    const i = this.nearestTerminal(a);
    if (i < 0) return;
    this.minigame.active = true;
    this.minigame.door = i;
    this.newCode();
  }

  /** A fresh code, shown digit by digit (a hacker's code is shorter). */
  private newCode(): void {
    const w = this.world, mg = this.minigame;
    const length = TERMINAL.length - ((w.local.def.ability?.hackSpeed ?? 1) > 1 ? 1 : 0);
    mg.code = Array.from({ length }, () => w.rng.int(1, 9));
    mg.input = [];
    mg.feedback = null;
    mg.phase = "show";
    mg.shown = -1;
    this.showT = -TERMINAL.gapMs * 2;
  }

  update(dt: number): void {
    const mg = this.minigame;
    if (!mg.active || mg.phase !== "show") return;
    this.showT += dt * 1000;
    const slot = TERMINAL.showMs + TERMINAL.gapMs;
    const i = Math.floor(this.showT / slot);
    if (this.showT < 0) { mg.shown = -1; return; }
    if (i >= mg.code.length) { mg.phase = "input"; mg.shown = -1; return; }
    mg.shown = this.showT - i * slot < TERMINAL.showMs ? i : -1;
  }

  digit(d: number): void {
    const mg = this.minigame;
    if (!mg.active || mg.phase !== "input" || mg.input.length >= mg.code.length) return;
    const w = this.world, time = w.scene.time;
    mg.input.push(d);
    if (mg.input[mg.input.length - 1] !== mg.code[mg.input.length - 1]) {
      mg.feedback = "bad";
      this.alarm(mg.door);
      time.delayedCall(450, () => { if (mg.active) this.newCode(); });
      return;
    }
    mg.feedback = "ok";
    time.delayedCall(150, () => { if (mg.feedback === "ok") mg.feedback = null; });
    if (mg.input.length >= mg.code.length) time.delayedCall(300, () => this.closeMinigame(true));
  }

  closeMinigame(success: boolean): void {
    const mg = this.minigame;
    if (!mg.active) return;
    if (success) this.open(mg.door, null);
    mg.active = false;
    mg.door = -1;
    mg.input = [];
    mg.feedback = null;
  }

  /** A wrong code: the terminal wails — everyone around hears it. */
  alarm(i: number): void {
    const d = this.doors[i], w = this.world;
    if (!d) return;
    w.noise.emit(d.terminal.x, d.terminal.y, NOISE.alarm, "alarm", null, true);
    if (w.local.inPlay && dist(w.local, d.terminal) < TILE * 12) w.toast("ТРЕВОГА! Терминал поднял шум", "bad");
  }

  /** A bot standing at door `i`'s terminal hacks it. Returns true while it is busy hacking. */
  hackStep(i: number, a: Actor, dt: number): boolean {
    const d = this.doors[i];
    if (!d || d.open || dist(a, d.terminal) > BOT_HACK_RANGE) return false;
    a.path = [];
    a.halt();
    const before = d.hack;
    d.hack = Math.min(1, d.hack + dt * (a.def.ability?.hackSpeed ?? 1) / BOT_HACK_TIME);
    // Half way through, a clumsy bot may trip the alarm.
    if (before < 0.5 && d.hack >= 0.5 && this.world.rng.chance(BOT_ALARM_CHANCE)) this.alarm(i);
    if (d.hack >= 1) this.open(i, a.def.name);
    return true;
  }

  /** The single place a locked door opens: player minigame, bot hack or network event. */
  open(i: number, by: string | null, remote = false): boolean {
    const d = this.doors[i];
    const w = this.world;
    if (!d || d.open) return false;
    d.open = true;
    for (const t of d.data.doorTiles) {
      w.grid.setSolid(t, false);
      w.sight.setSolid(t, false);
      w.collision.open(t);
    }
    // The terminal has done its job: it flickers out and is gone.
    w.scene.tweens.add({ targets: d.terminal, alpha: 0, duration: 900, ease: "Stepped", easeParams: [5], onComplete: () => d.terminal.setVisible(false) });
    w.toast("ДВЕРЬ ОТКРЫТА!" + (by ? " — " + by : ""), "terminal");
    w.shake(200, 0.008);
    w.events.emit("doorOpened", { index: i, by, remote });
    return true;
  }

  /** Terminals worth hacking: their door still guards a key nobody has picked up. */
  terminalGoals(): GoalCandidate[] {
    return this.doors.flatMap((d, index) =>
      !d.open && !this.world.objectives.isKeyTaken(d.data.keyIndex) ? [{ tile: d.data.terminalTile, index }] : []);
  }
}
