// Every character on the map — the local player, runner bots, the hunter, the boss and
// remote players — is an Actor. Behaviour comes from outside: input, a brain or the network.
import Phaser from "phaser";
import { TILE } from "../core/constants";
import type { RunnerStatus, Role, Tile, Vec2 } from "../core/types";
import type { CharacterDef } from "../data/characters";
import { DEFAULT_FLASHLIGHT_MODE } from "../data/balance";
import { DEPTH, textStyle } from "../ui/theme";

/** Who drives the actor: this peer's input, a bot/AI brain here, or another peer. */
export type Control = "local" | "bot" | "ai" | "remote";

/** Network state of an actor (positions in world px, velocities in px/s). */
export interface NetState {
  x: number; y: number; vx: number; vy: number;
  /** Facing angle, radians. */
  a: number;
  /** Flashlight: 0 = off, otherwise the mode (1..3). */
  fl: number;
}

export interface Brain {
  readonly state: string;
  update(dt: number): void;
}

export interface ActorOptions {
  id: string;
  def: CharacterDef;
  control: Control;
  pos: Vec2;
  speed: number;
}

const REMOTE_ALPHA = 0.8;
const REMOTE_LERP = 0.3;
const WAYPOINT_REACHED = 4;
const STUCK_TIME = 0.2;

export class Actor extends Phaser.Physics.Arcade.Sprite {
  readonly id: string;
  readonly def: CharacterDef;
  readonly control: Control;
  readonly tag: Phaser.GameObjects.Text;
  status: RunnerStatus = "alive";
  hiding = false;
  speed: number;
  /** Direction the actor looks, radians (0 = right, π/2 = down). */
  facing = Math.PI / 2;
  readonly flashlight = { on: false, mode: DEFAULT_FLASHLIGHT_MODE };
  /** Whether the local viewer can see this actor (set by the vision system). */
  seen = true;
  brain: Brain | null = null;
  path: Tile[] = [];
  pathTimer = 0;
  /** Remote actors: last state received and the extrapolated point we glide towards. */
  net: NetState | null = null;
  private netTarget: Vec2 | null = null;
  private stuckT = 0;
  private prevX: number;
  private prevY: number;

  constructor(scene: Phaser.Scene, o: ActorOptions) {
    super(scene, o.pos.x, o.pos.y, o.def.texture);
    this.id = o.id;
    this.def = o.def;
    this.control = o.control;
    this.speed = o.speed;
    this.prevX = o.pos.x;
    this.prevY = o.pos.y;
    scene.add.existing(this);
    const scale = o.def.height / this.frame.height;
    this.setScale(scale).setDepth(DEPTH.actors);
    if (o.control === "remote") {
      this.setAlpha(REMOTE_ALPHA);
      this.net = { x: o.pos.x, y: o.pos.y, vx: 0, vy: 0, a: this.facing, fl: 0 };
      this.netTarget = { x: o.pos.x, y: o.pos.y };
    } else {
      scene.physics.add.existing(this);
      // The arcade body multiplies its size by the sprite scale, so compensate.
      this.arcadeBody!.setSize(o.def.body / scale, o.def.body / scale);
      this.setCollideWorldBounds(true);
    }
    this.tag = scene.add.text(o.pos.x, this.tagY(), o.def.name, textStyle("tag", o.def.color))
      .setOrigin(0.5).setDepth(DEPTH.tags);
  }

  get role(): Role { return this.def.role; }
  get inPlay(): boolean { return this.status === "alive"; }
  get arcadeBody(): Phaser.Physics.Arcade.Body | null { return this.body as Phaser.Physics.Arcade.Body | null; }

  /** Position the authority uses for contact checks: the latest network state for remote actors. */
  get authPos(): Vec2 { return this.net ?? this; }

  get velocity(): Vec2 {
    if (this.net) return { x: this.net.vx, y: this.net.vy };
    const b = this.arcadeBody;
    return b ? { x: b.velocity.x, y: b.velocity.y } : { x: 0, y: 0 };
  }

  /** Walk in direction (dx, dy) — any length — at `speed` px/s. */
  move(dx: number, dy: number, speed: number): void {
    const len = Math.hypot(dx, dy);
    const b = this.arcadeBody;
    if (!b || len === 0) { this.halt(); return; }
    b.setVelocity(dx / len * speed, dy / len * speed);
    this.facing = Math.atan2(dy, dx);
  }

  halt(): void { this.arcadeBody?.setVelocity(0, 0); }

  teleport(p: Vec2): void {
    const b = this.arcadeBody;
    if (b) b.reset(p.x, p.y); else this.setPosition(p.x, p.y);
    if (this.net) { this.net.x = p.x; this.net.y = p.y; this.netTarget = { ...p }; }
  }

  /** Walk along `path`, skipping reached waypoints; gives up on a waypoint it is stuck on. */
  followPath(speed: number, dt: number): void {
    const b = this.arcadeBody;
    if (!b) return;
    const moved = Math.abs(this.x - this.prevX) + Math.abs(this.y - this.prevY);
    this.prevX = this.x; this.prevY = this.y;
    let dx = 0, dy = 0, len = 0;
    while (this.path.length > 0) {
      const next = this.path[0];
      dx = next.col * TILE + TILE / 2 - this.x;
      dy = next.row * TILE + TILE / 2 - this.y;
      len = Math.hypot(dx, dy);
      if (len >= WAYPOINT_REACHED) break;
      this.path.shift();
      this.stuckT = 0;
    }
    if (this.path.length === 0) { b.setVelocity(0, 0); return; }

    this.stuckT = moved < 0.15 ? this.stuckT + dt : 0;
    if (this.stuckT > STUCK_TIME) {
      this.stuckT = 0;
      if (this.path.length > 1) {
        // Skip the blocked waypoint and nudge off the corner.
        this.path.shift();
        b.x += (Math.random() - 0.5) * 3;
        b.y += (Math.random() - 0.5) * 3;
      } else {
        this.path = [];
        this.pathTimer = 0;
        b.setVelocity(0, 0);
      }
      return;
    }
    b.setVelocity(dx / len * speed, dy / len * speed);
    this.facing = Math.atan2(dy, dx);
  }

  setHiding(on: boolean, spot?: Vec2): void {
    this.hiding = on;
    this.halt();
    const b = this.arcadeBody;
    if (b) b.enable = !on;
    if (on && spot) this.teleport(spot);
    this.refreshVisibility();
  }

  /** Take the actor out of the round (caught, escaped or disconnected). */
  retire(status: Exclude<RunnerStatus, "alive">): void {
    this.status = status;
    this.hiding = false;
    this.path = [];
    this.halt();
    const b = this.arcadeBody;
    if (b) b.enable = false;
    this.refreshVisibility();
  }

  refreshVisibility(): void {
    const visible = this.inPlay && !this.hiding && this.seen;
    this.setVisible(visible);
    this.tag.setVisible(visible);
  }

  /** Remote actors: take a network update. */
  applyNet(s: NetState): void {
    if (!this.net) return;
    this.net = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, a: s.a, fl: s.fl };
    this.netTarget = { x: s.x, y: s.y };
    this.facing = s.a;
    this.flashlight.on = s.fl > 0;
    if (s.fl > 0) this.flashlight.mode = s.fl;
  }

  toNet(): NetState {
    const v = this.velocity;
    const p = this.authPos;
    return { x: p.x, y: p.y, vx: v.x, vy: v.y, a: this.facing, fl: this.flashlight.on ? this.flashlight.mode : 0 };
  }

  protected override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.net && this.netTarget) {
      // Extrapolate with the last known velocity and glide towards it.
      const dt = delta / 1000;
      this.netTarget.x += this.net.vx * dt;
      this.netTarget.y += this.net.vy * dt;
      this.x += (this.netTarget.x - this.x) * REMOTE_LERP;
      this.y += (this.netTarget.y - this.y) * REMOTE_LERP;
    }
    this.tag.setPosition(this.x, this.tagY());
  }

  private tagY(): number { return this.y - this.def.height / 2; }

  override destroy(fromScene?: boolean): void {
    this.tag.destroy();
    super.destroy(fromScene);
  }
}
