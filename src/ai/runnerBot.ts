// Runner bot: collects keys, hacks terminals, runs for the exit, flees from threats it sees.
import { dist, worldToTile } from "../core/geom";
import type { Tile } from "../core/types";
import { BOT_DANGER_RANGE, SNEAK_MULT, SPRINT_MULT } from "../data/balance";
import type { Actor, Brain } from "../entities/Actor";
import type { World } from "../game/World";
import { findPath } from "../world/grid";
import { chooseEscapeTile, choosePatrolTile, chooseRunnerGoal, type RunnerGoal } from "./goals";
import { canSee } from "./perception";

type State = "patrol" | "flee" | "seek-key" | "hack" | "escape";

const SEPARATION_DIST = 18;
const SEPARATION_PUSH = 40;

export class RunnerBot implements Brain {
  state: State = "patrol";
  goal: RunnerGoal | null = null;

  constructor(private world: World, private actor: Actor) {
    actor.pathTimer = world.rng.range(0, 0.4);
  }

  update(dt: number): void {
    const w = this.world, a = this.actor;
    if (!a.inPlay) return;
    const tile = worldToTile(a);
    const threats: Tile[] = [];
    let danger = false;
    for (const t of w.threats()) {
      threats.push(worldToTile(t.authPos));
      if (canSee(w, a, t.authPos, BOT_DANGER_RANGE)) danger = true;
    }

    // Hacking a terminal: stay put until the door opens, unless a threat shows up.
    if (this.state === "hack" && !danger && this.goal && w.doors.hackStep(this.goal.index, a, dt)) return;

    a.pathTimer -= dt;
    if (a.pathTimer <= 0 || a.path.length === 0) this.replan(tile, threats, danger);

    const mult = this.state === "flee" ? SPRINT_MULT : danger && this.state === "patrol" ? SNEAK_MULT : 1;
    a.followPath(a.speed * mult, dt);
    this.separate();
  }

  private replan(tile: Tile, threats: Tile[], danger: boolean): void {
    const w = this.world, a = this.actor;
    let dest: Tile;
    if (danger) {
      this.state = "flee";
      dest = chooseEscapeTile(w.rng, w.level, tile, threats);
      a.pathTimer = 0.5;
    } else {
      const exit = w.objectives.exit.open ? w.objectives.exit.tile : null;
      this.goal = chooseRunnerGoal(w.grid, tile, exit, w.objectives.keyGoals(), w.doors.terminalGoals());
      if (this.goal) {
        this.state = this.goal.kind === "exit" ? "escape" : this.goal.kind === "key" ? "seek-key" : "hack";
        dest = this.goal.tile;
        a.pathTimer = this.goal.kind === "exit" ? 0.8 : w.rng.range(1.2, 1.7);
      } else {
        this.state = "patrol";
        dest = choosePatrolTile(w.rng, w.level, tile);
        a.pathTimer = w.rng.range(2, 3);
      }
    }
    a.path = findPath(w.grid, tile, dest);
    if (a.path.length === 0 && this.state !== "hack") {
      // Already there or unreachable: head somewhere far instead.
      a.path = findPath(w.grid, tile, choosePatrolTile(w.rng, w.level, tile));
      a.pathTimer = Math.max(a.pathTimer, w.rng.range(0.8, 1.3));
    }
  }

  /** Nudge away from other bots so they don't stack on the same tile. */
  private separate(): void {
    const a = this.actor, b = a.arcadeBody;
    if (!b) return;
    for (const other of this.world.actors) {
      if (other === a || other.control !== "bot" || !other.inPlay) continue;
      const d = dist(a, other);
      if (d < SEPARATION_DIST && d > 0.5) {
        const push = SEPARATION_PUSH / d;
        b.velocity.x += (a.x - other.x) * push;
        b.velocity.y += (a.y - other.y) * push;
      }
    }
  }
}
