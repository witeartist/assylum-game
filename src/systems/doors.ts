// Locked doors and their terminals. A player opens a door with the code minigame, a bot by
// standing at the terminal and hacking it; either way `open` is the single implementation.
import type Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileCenter } from "../core/geom";
import type { Vec2 } from "../core/types";
import { BOT_HACK_RANGE, BOT_HACK_TIME, TERMINAL_CODE_LENGTH, TERMINAL_RANGE } from "../data/balance";
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
  /** Colour flash after a digit: right, wrong, or none. */
  feedback: "ok" | "bad" | null;
}

const TERMINAL_WIDTH = TILE * 0.75;

export class Doors {
  readonly doors: DoorState[];
  readonly minigame: Minigame = { active: false, door: -1, code: [], input: [], feedback: null };

  constructor(private world: World) {
    const scene = world.scene;
    this.doors = world.level.lockedDoors.map(data => {
      const p = tileCenter(data.terminalTile);
      const terminal = placeStanding(scene, "interactive/terminal", p.x, p.y + TILE * 0.3, TERMINAL_WIDTH);
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

  /** F key: open the code minigame at a nearby terminal. */
  interactLocal(): void {
    const w = this.world, a = w.local;
    if (a.role !== "runner" || !w.round.canAct() || this.minigame.active || a.hiding) return;
    const i = this.nearestTerminal(a);
    if (i < 0) return;
    const mg = this.minigame;
    mg.active = true;
    mg.door = i;
    mg.code = Array.from({ length: TERMINAL_CODE_LENGTH }, () => w.rng.int(1, 9));
    mg.input = [];
    mg.feedback = null;
  }

  digit(d: number): void {
    const mg = this.minigame;
    if (!mg.active || mg.input.length >= mg.code.length) return;
    const time = this.world.scene.time;
    mg.input.push(d);
    if (mg.input[mg.input.length - 1] !== mg.code[mg.input.length - 1]) {
      mg.feedback = "bad";
      time.delayedCall(300, () => { mg.input = []; mg.feedback = null; });
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

  /** A bot standing at door `i`'s terminal hacks it. Returns true while it is busy hacking. */
  hackStep(i: number, a: Actor, dt: number): boolean {
    const d = this.doors[i];
    if (!d || d.open || dist(a, d.terminal) > BOT_HACK_RANGE) return false;
    a.path = [];
    a.halt();
    d.hack = Math.min(1, d.hack + dt / BOT_HACK_TIME);
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
      w.collision.open(t);
    }
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
