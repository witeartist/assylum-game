// AI hunter (Foxmind). It sees what is in front of it and lit (or close in the dark), hears
// footsteps, alarms and breathing, and remembers: it chases what it sees, runs to where you
// were headed when you vanished, searches the area and the hiding spots around it, goes to look
// at every suspicious sound, checks the locker it saw you climb into, patrols the places where
// runners were noticed and guards the exit when the escape is near.
import { TILE } from "../core/constants";
import { dist, tileCenter, tileIndex, worldToTile } from "../core/geom";
import type { Tile } from "../core/types";
import { DARK_SIGHT, HUNTER_AI } from "../data/balance";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { HideSpot } from "../systems/hiding";
import { roomCenter, roomInteriorTiles, type Room } from "../world/level";
import { MonsterBrain, NOISE_INTEREST } from "./monster";
import { sees, type SightSpec } from "./senses";

type State = "patrol" | "investigate" | "chase" | "pursue" | "search" | "check" | "guard" | "stunned";

export class HunterAI extends MonsterBrain {
  state: State = "patrol";
  private target: Actor | null = null;
  private lastSeen: { x: number; y: number; vx: number; vy: number; t: number } | null = null;
  private suspicion = new Map<Actor, number>();
  private checkSpot: HideSpot | null = null;
  private checked = new Map<HideSpot, number>();
  private visited = new Map<Room, number>();
  private guardCooldown = HUNTER_AI.guardCooldown;
  private waypoint: Tile | null = null;
  private readonly guardTile: Tile;

  constructor(world: World, actor: Actor) {
    super(world, actor);
    const e = world.level.exitTile;
    this.guardTile = [2, 3, 1].map(d => ({ col: e.col, row: e.row + d })).find(t => !world.grid.isSolid(t.col, t.row)) ?? e;
    // Saw someone climb into a locker: that's the first place to look.
    world.events.on("hidingChanged", ({ actor: r }) => {
      if (r.role === "runner" && r.hiding && sees(world, actor, r, this.spec(), true)) this.checkSpot = world.hiding.spotOf(r);
    });
  }

  private spec(): SightSpec {
    const d = this.world.diff;
    return { fovHalf: HUNTER_AI.fovHalf, range: d.foxSight * TILE, dark: DARK_SIGHT.hunter * TILE * 0.8, near: HUNTER_AI.nearSense * TILE };
  }

  update(dt: number): void {
    const a = this.actor;
    this.tick(dt);
    this.guardCooldown -= dt;
    if (a.stunned > 0) { a.halt(); this.enter("stunned"); return; }
    if (this.state === "stunned") this.enter(this.lastSeen ? "pursue" : "search");
    const saw = this.look(dt);
    this.listen();
    this.decide(saw);
    this.act(dt);
  }

  /** Eyes: runners in view build up suspicion; past the reaction time it's a chase. */
  private look(dt: number): boolean {
    const w = this.world, a = this.actor, spec = this.spec();
    let best: Actor | null = null, bestD = Infinity;
    for (const r of w.runners()) {
      const s0 = this.suspicion.get(r) ?? 0;
      if (!sees(w, a, r, spec)) { if (s0 > 0) this.suspicion.set(r, Math.max(0, s0 - dt * 0.5)); continue; }
      const p = r.authPos, d = dist(a, p);
      const s = s0 + dt * (d < TILE * 4 ? 3 : 1);
      this.suspicion.set(r, s);
      this.warm(p, dt * 3);
      if (s >= w.diff.reaction || r === this.target) { if (d < bestD) { bestD = d; best = r; } }
      else this.notice(p.x, p.y, 2.4, null); // a glimpse: turn and look
    }
    if (!best) return false;
    const p = best.authPos, v = best.velocity;
    this.target = best;
    this.lastSeen = { x: p.x, y: p.y, vx: v.x, vy: v.y, t: this.t };
    return true;
  }

  /** Ears: footsteps, alarms, breathing behind a locker door. */
  private listen(): void {
    for (const e of this.heard(this.world.diff.hearing)) {
      this.warm(e, 0.8);
      const spot = e.kind === "breath" || e.kind === "gasp" || e.kind === "locker" ? this.spotAt(e) : null;
      this.notice(e.x, e.y, NOISE_INTEREST[e.kind] ?? 1, spot);
      if (spot && (e.kind === "breath" || e.kind === "gasp")) this.checkSpot = spot;
    }
  }

  private decide(saw: boolean): void {
    if (saw) { this.enter("chase"); return; }
    switch (this.state) {
      case "chase": this.enter("pursue"); return;
      case "pursue": if (this.t - (this.lastSeen?.t ?? 0) > HUNTER_AI.pursue) this.enter("search"); return;
      case "check": return;
      case "search": if (this.stateT > HUNTER_AI.search) { this.lastSeen = null; this.enter("patrol"); } break;
      case "investigate": if (this.stateT > 14) this.enter("search"); break;
      case "guard": if (this.stateT > HUNTER_AI.guardTime) { this.guardCooldown = HUNTER_AI.guardCooldown; this.enter("patrol"); } break;
    }
    if (this.checkSpot && !this.recentlyChecked(this.checkSpot)) { this.enter("check"); return; }
    this.checkSpot = null;
    const c = this.clue;
    if (c && this.t - c.t < 0.05) {
      if (this.state !== "investigate") { this.enter("investigate"); return; }
      this.phase = 0; // a new sound while looking around: go there
    }
    if (this.state === "patrol" && this.shouldGuard()) this.enter("guard");
  }

  private act(dt: number): void {
    const w = this.world, a = this.actor;
    switch (this.state) {
      case "chase": {
        const p = this.target!.authPos;
        if (dist(a, p) < TILE * 1.2) { a.gait = "run"; a.move(p.x - a.x, p.y - a.y, a.gaitSpeed()); }
        else this.goTo(worldToTile(p), "run", dt, 0.25);
        this.face(p, dt);
        break;
      }
      case "pursue": {
        // Run to where the runner was heading when it vanished; flash to catch it in the dark.
        const ls = this.lastSeen!;
        if (this.phase === 0) {
          this.phase = 1;
          if (w.foxFlash.ready && dist(a, ls) < TILE * 9) w.foxFlash.trigger(a);
        }
        const guess = this.walkableNear({ x: ls.x + ls.vx * 1.2, y: ls.y + ls.vy * 1.2 });
        if (this.goTo(guess, "run", dt, 0.4)) this.enter("search");
        break;
      }
      case "investigate": {
        const c = this.clue!;
        if (this.phase === 0) {
          const far = dist(a, c) > TILE * 6;
          if (this.goTo(this.walkableNear(c), c.strength >= 2 && far ? "run" : "walk", dt)) {
            this.phase = 1;
            this.waitT = 1.8;
            if (c.strength >= 2 && w.foxFlash.ready && !w.lighting.isLit(a)) w.foxFlash.trigger(a);
          }
        } else {
          this.lookAround(dt);
          if ((this.waitT -= dt) > 0) break;
          const spot = c.spot ?? this.unchecked(c, TILE * 2.5);
          if (spot && w.rng.chance(c.spot ? 1 : Math.min(0.9, c.strength / 3))) { this.checkSpot = spot; this.enter("check"); }
          else { this.lastSeen = { x: c.x, y: c.y, vx: 0, vy: 0, t: this.t }; this.enter("search"); }
        }
        break;
      }
      case "search": this.search(dt); break;
      case "check": this.check(dt); break;
      case "guard":
        if (this.phase === 0) { if (this.goTo(this.guardTile, "walk", dt)) this.phase = 1; }
        else this.lookAround(dt, 0.9);
        break;
      case "patrol": this.patrol(dt); break;
      default: a.halt();
    }
  }

  /** Walk around where the runner was lost; look into hiding spots nearby. */
  private search(dt: number): void {
    const w = this.world, a = this.actor;
    const center = this.lastSeen ?? this.clue ?? a;
    if (this.phase === 0) {
      if (!this.waypoint) this.waypoint = this.wanderNear(center, 5);
      if (this.goTo(this.waypoint, "walk", dt)) { this.phase = 1; this.waitT = 1.3; }
      return;
    }
    this.lookAround(dt);
    if ((this.waitT -= dt) > 0) return;
    this.phase = 0;
    this.waypoint = null;
    const spot = this.unchecked(a, TILE * 3);
    if (spot && w.rng.chance(0.4)) { this.checkSpot = spot; this.enter("check"); }
  }

  /** Walk up to a hiding spot and open it. */
  private check(dt: number): void {
    const w = this.world, a = this.actor, s = this.checkSpot;
    if (!s) { this.enter("search"); return; }
    if (this.phase === 0) {
      if (dist(a, s) > TILE * 1.1) { if (!this.goTo(this.walkableNear(s), "walk", dt, 0.4) || dist(a, s) > TILE * 1.6) return; }
      a.halt();
      this.face(s, dt * 10);
      w.hiding.check(s, a);
      this.checked.set(s, this.t);
      this.phase = 1;
      this.waitT = HUNTER_AI.checkTime + 0.4;
      return;
    }
    a.halt();
    if ((this.waitT -= dt) > 0) return;
    this.checkSpot = null;
    this.lastSeen = { x: s.x, y: s.y, vx: 0, vy: 0, t: this.t };
    this.enter("search");
  }

  /** Patrol: rooms where runners were noticed, rooms with what runners need, not the ones just seen. */
  private patrol(dt: number): void {
    if (this.phase === 0) {
      if (!this.waypoint) this.waypoint = this.choosePatrol();
      if (this.goTo(this.waypoint, "walk", dt, 1)) { this.phase = 1; this.waitT = 1.2; }
      return;
    }
    this.lookAround(dt, 1.6);
    if ((this.waitT -= dt) > 0) return;
    const room = this.world.roomAt(this.actor);
    if (room) this.visited.set(room, this.t);
    this.phase = 0;
    this.waypoint = null;
  }

  private choosePatrol(): Tile {
    const w = this.world, a = this.actor, here = worldToTile(a);
    const wanted = new Set<Room>();
    for (const k of w.objectives.keys) if (!k.taken) { const r = w.roomAt(k.sprite); if (r) wanted.add(r); }
    for (const f of w.power.groundFuses()) { const r = w.roomAt(f); if (r) wanted.add(r); }
    const box = w.power.box ? w.roomAt(w.power.box) : null;
    let best: Room | null = null, bestScore = -Infinity;
    for (const room of w.rng.shuffle(w.level.rooms).slice(0, 10)) {
      const c = roomCenter(room);
      let heat = 0;
      for (const t of roomInteriorTiles(room)) heat += this.heat[tileIndex(t.col, t.row)];
      const since = this.t - (this.visited.get(room) ?? -999);
      let score = 1 + Math.min(4, heat) * 1.5 + (wanted.has(room) ? 0.8 : 0) + (room === box && !w.power.on ? 0.8 : 0);
      score *= Math.min(1, 0.15 + since / 60);
      score *= 1 / (1 + (Math.abs(c.col - here.col) + Math.abs(c.row - here.row)) / 30);
      score *= w.rng.range(0.7, 1.3);
      if (score > bestScore) { bestScore = score; best = room; }
    }
    return best ? this.walkableNear(tileCenter(roomCenter(best))) : this.wanderNear(a, 8);
  }

  /** The escape is near: watch the exit for a while. */
  private shouldGuard(): boolean {
    const w = this.world, o = w.objectives;
    if (this.guardCooldown > 0) return false;
    const near = o.exit.open || (o.collected >= o.total - 1 && w.power.inserted >= w.power.total - 1);
    this.guardCooldown = 6; // decide again in a few seconds
    return near && w.rng.chance(0.55);
  }

  private recentlyChecked(s: HideSpot): boolean { return this.t - (this.checked.get(s) ?? -999) < 20; }

  /** The nearest hiding spot within `range` of `p` it hasn't opened lately. */
  private unchecked(p: { x: number; y: number }, range: number): HideSpot | null {
    let best: HideSpot | null = null, bestD = range;
    for (const s of this.world.hiding.spots) {
      const d = dist(s, p);
      if (d < bestD && !this.recentlyChecked(s)) { bestD = d; best = s; }
    }
    return best;
  }
}
