// Runner bot. Splits the work with the other bots (each goes for a goal nobody else claimed):
// keys, fuses to the fuse box, terminals, then the exit. It walks — quietly — and keeps away from
// where it saw or heard a monster; when one comes for it, it runs, and when it is out of breath
// it hides and holds its breath. A brute follows the scent to the locker, so from a brute it
// never hides: it keeps walking away, as soon as it hears the heavy steps. It lights the
// flashlight only when nothing is around.
import { TILE } from "../core/constants";
import { dist, manhattan, tileIndex, worldToTile } from "../core/geom";
import type { Tile, Vec2 } from "../core/types";
import { BOT_DANGER_RANGE, LOCKER_RANGE } from "../data/balance";
import type { Actor, Brain } from "../entities/Actor";
import type { World } from "../game/World";
import { findPath, findPathWeighted, hasLineOfSight } from "../world/grid";
import { MAP_W, MAP_H } from "../core/constants";
import { chooseEscapeTile, choosePatrolTile, chooseRunnerGoal, goalKey, type RunnerGoal } from "./goals";
import { inBeam } from "./senses";
import type { HideSpot } from "../systems/hiding";

type State = "goal" | "flee" | "hide" | "hack" | "insert" | "explore";

/** A monster the bot saw or heard: where and when, and whether it is a brute. */
interface Sighting extends Vec2 { t: number; seen: boolean; brute: boolean; }
/** How close a monster it only heard makes it run, tiles (a brute: as soon as it is this close). */
const HEARD_FLEE = { other: 3.5, brute: 8 };

interface Danger { d: number; seen: boolean; brute: boolean; at: Vec2; }

const SEPARATION_DIST = 18;
const SEPARATION_PUSH = 40;
/** Bots keep this far from where a monster was, tiles. */
const AVOID_RADIUS = 6;
const REMEMBER = 20;

export class RunnerBot implements Brain {
  state: State = "goal";
  goal: RunnerGoal | null = null;
  private sightings: Sighting[] = [];
  private lastNoise: number;
  private t = 0;
  private hideSpot: HideSpot | null = null;
  private hideLeft = 0;
  private dest: Tile | null = null;
  /** Where it runs to while fleeing: kept while it still leads away, so it doesn't dither. */
  private escape: Tile | null = null;
  /** When a monster was last noticed (seen or heard). */
  private lastScare = -999;

  constructor(private world: World, private actor: Actor) {
    actor.pathTimer = world.rng.range(0, 0.4);
    this.lastNoise = world.noise.lastId;
  }

  update(dt: number): void {
    const w = this.world, a = this.actor;
    if (!a.inPlay) return;
    this.t += dt;
    this.perceive();
    const danger = this.danger();
    if (a.hiding) { this.stayHidden(dt, danger); return; }
    this.useItems(danger);

    const scared = danger && (danger.seen ? danger.d < TILE * 7 : danger.d < TILE * (danger.brute ? HEARD_FLEE.brute : HEARD_FLEE.other));
    if (scared && this.state !== "hide") {
      if (this.state !== "flee") this.escape = null;
      this.state = "flee";
    } else if (this.state === "flee" && !scared) this.replanSoon();

    switch (this.state) {
      case "flee": this.flee(dt, danger!); break;
      case "hide": this.goHide(dt); break;
      case "hack":
        if (this.goal && w.doors.hackStep(this.goal.index, a, dt)) return;
        this.state = "goal";
        break;
      case "insert":
        if (w.power.busy(a)) return;
        this.state = "goal";
        break;
      default: this.pursueGoal(dt, danger);
    }
    this.separate();
  }

  // ── Senses ──

  private perceive(): void {
    const w = this.world, a = this.actor;
    for (const m of w.threats()) {
      const p = m.authPos, d = dist(a, p);
      if (d > BOT_DANGER_RANGE || !hasLineOfSight(w.sight, a, p)) continue;
      if (d < TILE * 3 || w.lighting.isLit(p) || inBeam(a, p)) this.remember(p, true, m.kit === "brute");
    }
    for (const e of w.noise.since(this.lastNoise)) {
      if (e.kind === "monster" && w.noise.hears(a, e)) this.remember(e, false, e.source?.kit === "brute");
    }
    this.lastNoise = w.noise.lastId;
    this.sightings = this.sightings.filter(s => this.t - s.t < REMEMBER);
  }

  private remember(p: Vec2, seen: boolean, brute: boolean): void {
    this.lastScare = this.t;
    const near = this.sightings.find(s => dist(s, p) < TILE * 2);
    if (near) { near.x = p.x; near.y = p.y; near.t = this.t; near.seen = near.seen || seen; near.brute = near.brute || brute; }
    else this.sightings.push({ x: p.x, y: p.y, t: this.t, seen, brute });
  }

  /** The closest recent sighting: how far, whether it was seen just now, whether it is a brute. */
  private danger(): Danger | null {
    let best: Danger | null = null;
    for (const s of this.sightings) {
      if (this.t - s.t > 4) continue;
      const d = dist(this.actor, s);
      if (!best || d < best.d) best = { d, seen: s.seen && this.t - s.t < 1, brute: s.brute, at: s };
    }
    return best;
  }

  // ── Behaviour ──

  private pursueGoal(dt: number, danger: Danger | null): void {
    const w = this.world, a = this.actor;
    a.pathTimer -= dt;
    if (a.pathTimer <= 0 || a.path.length === 0) this.replan();
    // Sneaking hides your steps — useless against a nose.
    a.gait = danger && danger.d < TILE * 9 && !danger.brute ? "sneak" : "walk";
    if (!w.gates.aiPass(a, dt)) a.followPath(a.gaitSpeed(), dt);
    // Arrived at a terminal or at the fuse box?
    const g = this.goal;
    if (g?.kind === "terminal" && w.doors.hackStep(g.index, a, 0)) this.state = "hack";
    if (g?.kind === "box" && w.power.startInsert(a)) this.state = "insert";
  }

  private replan(): void {
    const w = this.world, a = this.actor, here = worldToTile(a);
    this.releaseClaim();
    const o = w.objectives;
    const carrying = w.power.carried(a) >= 0;
    this.goal = chooseRunnerGoal(w.grid, here, {
      exit: o.exit.open ? o.exit.tile : null,
      keys: o.keyGoals(),
      terminals: w.doors.terminalGoals(),
      fuses: w.power.fuses.flatMap((f, index) => f.state === "ground" ? [{ tile: worldToTile(f), index }] : []),
      box: carrying && w.level.fuseBox ? w.level.fuseBox : null,
    }, this.claimedByOthers());
    let dest: Tile;
    if (this.goal) {
      this.state = "goal";
      w.claims.set(goalKey(this.goal), a);
      dest = this.goal.tile;
      a.pathTimer = this.goal.kind === "exit" ? 0.8 : w.rng.range(1.2, 1.8);
    } else {
      this.state = "explore";
      dest = choosePatrolTile(w.rng, w.level, here);
      a.pathTimer = w.rng.range(2, 3);
    }
    a.path = this.route(here, dest);
    if (a.path.length === 0 && this.goal?.kind !== "terminal" && this.goal?.kind !== "box") {
      // Already there or unreachable: head somewhere else for a moment.
      a.path = findPath(w.grid, here, choosePatrolTile(w.rng, w.level, here));
      a.pathTimer = Math.max(a.pathTimer, w.rng.range(0.8, 1.3));
    }
  }

  private replanSoon(): void { this.state = "goal"; this.actor.pathTimer = 0; }

  /**
   * Run away from the monster. Out of its sight (or out of breath) with a hiding spot close by —
   * slip in: a monster that didn't see you get in has to guess.
   */
  private flee(dt: number, danger: Danger): void {
    const w = this.world, a = this.actor;
    const tired = a.exhausted || a.stamina < a.staminaMax * 0.25;
    if ((tired || !danger.seen) && !danger.brute && danger.d > TILE * 2.5 && a.pathTimer <= 0.05) {
      const spot = this.freeSpotNear(TILE * (tired ? 5 : 4));
      if (spot && (tired || w.rng.chance(0.7))) { this.hideSpot = spot; this.state = "hide"; this.dest = null; return; }
    }
    a.pathTimer -= dt;
    if (a.pathTimer <= 0 || a.path.length === 0) {
      const here = worldToTile(a);
      const threats = this.sightings.filter(s => this.t - s.t < 4).map(s => worldToTile(s));
      // A new place to run to only when there, or when the monster is as close to it as we are.
      const e = this.escape;
      if (!e || a.path.length === 0 || threats.some(t => manhattan(t, e) <= manhattan(here, e))) {
        this.escape = chooseEscapeTile(w.rng, w.level, here, threats);
      }
      a.path = this.route(here, this.escape!);
      a.pathTimer = 0.6;
    }
    a.gait = a.canRun ? "run" : "walk";
    if (!w.gates.aiPass(a, dt)) a.followPath(a.gaitSpeed(), dt);
  }

  private goHide(dt: number): void {
    const w = this.world, a = this.actor, spot = this.hideSpot;
    if (!spot || spot.occupant) { this.state = "flee"; return; }
    if (dist(a, spot) < LOCKER_RANGE * 0.8) {
      w.hiding.set(a, true, spot);
      this.hideLeft = w.rng.range(8, 15);
      return;
    }
    const tile = worldToTile(spot);
    if (!this.dest || this.dest.col !== tile.col || this.dest.row !== tile.row || a.path.length === 0) {
      this.dest = tile;
      a.path = findPath(w.grid, worldToTile(a), tile);
    }
    a.gait = a.canRun ? "run" : "walk";
    if (!w.gates.aiPass(a, dt)) a.followPath(a.gaitSpeed(), dt);
  }

  /**
   * In a hiding spot: wait until the monster has been gone for a while. A brute coming along the
   * scent makes the spot a trap: get out while it is still some way off.
   */
  private stayHidden(dt: number, danger: Danger | null): void {
    this.hideLeft -= dt;
    if (danger?.brute && danger.d > TILE * 2.5) this.hideLeft = 0;
    else if (danger && danger.d < TILE * 10) this.hideLeft = Math.max(this.hideLeft, 4);
    if (this.hideLeft > 0) return;
    this.world.hiding.set(this.actor, false);
    this.hideSpot = null;
    this.replanSoon();
  }

  /** Batteries when the light dies, adrenaline when out of breath and chased; the torch only in peace. */
  private useItems(danger: { d: number } | null): void {
    const w = this.world, a = this.actor, bag = w.items.bag(a);
    const slot = (k: string) => bag.findIndex(i => i === k);
    if (a.flashlight.charge < 0.2 && slot("battery") >= 0) w.items.use(a, slot("battery"));
    if (this.state === "flee" && a.stamina < a.staminaMax * 0.3 && slot("adrenaline") >= 0) w.items.use(a, slot("adrenaline"));
    // A beam gives you away: only after a long quiet spell, never with a monster about.
    const calm = !danger && this.t - this.lastScare > 15;
    a.flashlight.on = calm && a.flashlight.charge > 0.25 && !w.lighting.isLit(a) && (a.flashlight.on || w.rng.chance(0.01));
  }

  // ── Helpers ──

  /** A path that keeps away from where monsters were. */
  private route(from: Tile, to: Tile): Tile[] {
    const w = this.world;
    const recent = this.sightings.filter(s => this.t - s.t < REMEMBER);
    if (recent.length === 0) return findPath(w.grid, from, to);
    const extra = new Float32Array(MAP_W * MAP_H);
    for (const s of recent) {
      const c = worldToTile(s), fade = 1 - (this.t - s.t) / REMEMBER;
      for (let dr = -AVOID_RADIUS; dr <= AVOID_RADIUS; dr++) for (let dc = -AVOID_RADIUS; dc <= AVOID_RADIUS; dc++) {
        const col = c.col + dc, row = c.row + dr;
        if (col < 0 || row < 0 || col >= MAP_W || row >= MAP_H) continue;
        const d = Math.hypot(dc, dr);
        if (d <= AVOID_RADIUS) extra[tileIndex(col, row)] += 25 * (1 - d / AVOID_RADIUS) * fade;
      }
    }
    return findPathWeighted(w.grid, from, to, extra);
  }

  private freeSpotNear(range: number): HideSpot | null {
    let best: HideSpot | null = null, bestD = range;
    for (const s of this.world.hiding.spots) {
      const d = dist(this.actor, s);
      if (!s.occupant && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  private claimedByOthers(): Set<string> {
    const out = new Set<string>();
    for (const [k, who] of this.world.claims) if (who !== this.actor && who.inPlay) out.add(k);
    return out;
  }

  private releaseClaim(): void {
    for (const [k, who] of this.world.claims) if (who === this.actor) this.world.claims.delete(k);
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
