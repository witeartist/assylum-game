// Every character on the map — the local player, runner bots, the villain and remote players —
// is an Actor. Behaviour comes from outside: input, a brain or the network. The villain is an
// infected hero: the hero's `def`, the villain's `role` and `kit`, and an infected look.
import Phaser from "phaser";
import { TILE } from "../core/constants";
import type { RunnerStatus, Role, Tile, Vec2 } from "../core/types";
import { KITS, type CharacterDef, type KitId } from "../data/characters";
import { BATTERY, DEFAULT_FLASHLIGHT_MODE, EXHAUSTED_MULT, SNEAK_MULT } from "../data/balance";
import { DEPTH } from "../ui/theme";
import { GAITS, NET_FLAG, type Gait, type NetState } from "./state";

export type { Gait, NetState } from "./state";

/** Who drives the actor: this peer's input, a bot/AI brain here, or another peer. */
export type Control = "local" | "bot" | "ai" | "remote";

export interface Brain {
  readonly state: string;
  update(dt: number): void;
}

export interface ActorOptions {
  id: string;
  def: CharacterDef;
  role: Role;
  /** The villain's skill set (null for runners). */
  kit: KitId | null;
  control: Control;
  pos: Vec2;
  /** Walking and running speed, px/s. */
  walk: number;
  run: number;
  /** Seconds of running before exhaustion (runners by their ability). */
  stamina: number;
}

const REMOTE_LERP = 0.3;
const WAYPOINT_REACHED = 4;
const STUCK_TIME = 0.2;
const BOB_HEIGHT = 2.2;
const BOB_TILT = 0.05;
/** How fast the picture catches up after a step (stepTo), per second. */
const SLIDE_RATE = 14;

/**
 * The Actor itself is an invisible physics body centred on its position; what you see is
 * `view` (drawn standing on `feetY`, sorted by depth with walls and furniture) plus a soft
 * shadow on the floor.
 */
export class Actor extends Phaser.Physics.Arcade.Sprite {
  readonly id: string;
  readonly def: CharacterDef;
  readonly role: Role;
  readonly kit: KitId | null;
  readonly control: Control;
  readonly view: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  /** On-screen height of the figure, px (infected heroes stand taller). Not `height`: Phaser's own. */
  readonly figureHeight: number;
  status: RunnerStatus = "alive";
  hiding = false;
  walkSpeed: number;
  runSpeed: number;
  /** Temporary multiplier on every gait (villains speed up when the building wakes). */
  speedMul = 1;
  gait: Gait = "walk";
  /** Stamina in seconds of running; see STAMINA. */
  stamina: number;
  readonly staminaMax: number;
  /** Out of breath: no running until stamina recovers. */
  exhausted = false;
  /** Seconds left of adrenaline (running costs nothing). */
  adrenaline = 0;
  /** Direction the actor looks, radians (0 = right, π/2 = down). */
  facing = Math.PI / 2;
  /** Flashlight; `charge` 0..1 drains while it is on. */
  readonly flashlight = { on: false, mode: DEFAULT_FLASHLIGHT_MODE, charge: BATTERY.start };
  /** Grabs this runner can still break free from (ability + sedatives). */
  breakFree = 0;
  /** Seconds the flashlight won't light (a roar made it die). */
  lightJam = 0;
  /** Seconds the actor is stunned (a runner broke free from it). */
  stunned = 0;
  /** Remote actors: flags from the network (NET_FLAG). */
  netFlags = 0;
  /** Whether the local viewer can see this actor (set by the vision system). */
  seen = true;
  /** Drawn opacity, eased towards `seen`. */
  fade = 1;
  /** Where the picture still is relative to the body after a step (stepTo), px; shrinks to 0. */
  private slide = { x: 0, y: 0 };
  brain: Brain | null = null;
  path: Tile[] = [];
  pathTimer = 0;
  /** Remote actors: last state received and the extrapolated point we glide towards. */
  net: NetState | null = null;
  private netTarget: Vec2 | null = null;
  private stuckT = 0;
  private prevX: number;
  private prevY: number;
  private bobT = 0;
  private readonly footOffset: number;

  constructor(scene: Phaser.Scene, o: ActorOptions) {
    const kit = o.kit ? KITS[o.kit] : null;
    const look = kit ? { texture: o.def.infected, height: o.def.height * kit.heightMul, body: kit.body } : o.def;
    super(scene, o.pos.x, o.pos.y, look.texture);
    this.id = o.id;
    this.def = o.def;
    this.role = o.role;
    this.kit = o.kit;
    this.control = o.control;
    this.figureHeight = look.height;
    this.walkSpeed = o.walk;
    this.runSpeed = o.run;
    this.staminaMax = o.stamina;
    this.stamina = this.staminaMax;
    this.breakFree = o.role === "runner" ? o.def.ability?.breakFree ?? 0 : 0;
    this.prevX = o.pos.x;
    this.prevY = o.pos.y;
    scene.add.existing(this);
    const scale = look.height / this.frame.height;
    this.setScale(scale).setVisible(false);
    this.footOffset = look.body * 0.3;
    this.view = scene.add.sprite(o.pos.x, o.pos.y, look.texture).setOrigin(0.5, 1).setScale(scale);
    this.shadow = scene.add.image(o.pos.x, o.pos.y, "fx/shadow").setDepth(DEPTH.shadows).setAlpha(0.8);
    this.shadow.setDisplaySize(look.body * 1.6, look.body * 0.7);
    if (o.control === "remote") {
      this.net = { x: o.pos.x, y: o.pos.y, vx: 0, vy: 0, a: this.facing, fl: 0, g: 1, k: 0 };
      this.netTarget = { x: o.pos.x, y: o.pos.y };
    } else {
      scene.physics.add.existing(this);
      // The arcade body multiplies its size by the sprite scale, so compensate.
      this.arcadeBody!.setSize(look.body / scale, look.body / scale);
      this.setCollideWorldBounds(true);
    }
    this.syncView(0);
  }

  /** Name over the head and in messages: the hero, or the infected hero and its kit. */
  get displayName(): string { return this.kit ? this.def.name + " · " + KITS[this.kit].name : this.def.name; }
  /** Signature color: the hero's, or the kit's for the villain. */
  get nameColor(): string { return this.kit ? KITS[this.kit].color : this.def.color; }
  /** Where the character stands (bottom of the sprite, its depth-sort line). */
  get feetY(): number { return this.y + this.footOffset; }
  /** Drawn on screen right now. */
  get shown(): boolean { return this.view.visible; }
  get inPlay(): boolean { return this.status === "alive"; }
  get arcadeBody(): Phaser.Physics.Arcade.Body | null { return this.body as Phaser.Physics.Arcade.Body | null; }

  /** Position the authority uses for contact checks: the latest network state for remote actors. */
  get authPos(): Vec2 { return this.net ?? this; }

  get velocity(): Vec2 {
    if (this.net) return { x: this.net.vx, y: this.net.vy };
    const b = this.arcadeBody;
    return b ? { x: b.velocity.x, y: b.velocity.y } : { x: 0, y: 0 };
  }

  /** Speed of a gait right now, px/s (exhaustion and boosts included). */
  gaitSpeed(g: Gait = this.gait): number {
    const walk = this.walkSpeed * (this.exhausted ? EXHAUSTED_MULT : 1);
    const v = g === "sneak" ? this.walkSpeed * SNEAK_MULT : g === "run" && !this.exhausted ? this.runSpeed : walk;
    return this.stunned > 0 ? 0 : v * this.speedMul;
  }

  /** The flashlight is switched on and shining (a roar makes it die for a moment). */
  get beamOn(): boolean { return this.flashlight.on && this.lightJam <= 0; }

  /** Can start or keep running. */
  get canRun(): boolean { return !this.exhausted && (this.stamina > 0 || this.adrenaline > 0); }

  /** Walk in direction (dx, dy) — any length — at `speed` px/s. `face` turns the actor that way. */
  move(dx: number, dy: number, speed: number, face = true): void {
    const len = Math.hypot(dx, dy);
    const b = this.arcadeBody;
    if (!b || len === 0) { this.halt(); return; }
    b.setVelocity(dx / len * speed, dy / len * speed);
    if (face) this.facing = Math.atan2(dy, dx);
  }

  halt(): void { this.arcadeBody?.setVelocity(0, 0); }

  teleport(p: Vec2): void {
    const b = this.arcadeBody;
    if (b) b.reset(p.x, p.y); else this.setPosition(p.x, p.y);
    if (this.net) { this.net.x = p.x; this.net.y = p.y; this.netTarget = { ...p }; }
  }

  /** Jump to `p` at once, while the picture glides there over a moment (stepping out of a doorway). */
  stepTo(p: Vec2): void {
    this.slide.x += this.x - p.x;
    this.slide.y += this.y - p.y;
    this.halt();
    this.teleport(p);
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
    this.facing = turnTowards(this.facing, Math.atan2(dy, dx), dt * 10);
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
    const visible = this.inPlay && !this.hiding && this.fade > 0.02;
    this.view.setVisible(visible);
    this.shadow.setVisible(visible);
    if (visible) {
      this.view.setAlpha(this.fade);
      this.shadow.setAlpha(0.8 * this.fade);
    }
  }

  /** Ease the drawn opacity towards whether the viewer sees us. */
  updateFade(dt: number): void {
    const target = this.seen ? 1 : 0;
    this.fade += (target - this.fade) * Math.min(1, dt * (this.seen ? 12 : 6));
    if (Math.abs(this.fade - target) < 0.02) this.fade = target;
    this.refreshVisibility();
  }

  /** Remote actors: take a network update. */
  applyNet(s: NetState): void {
    if (!this.net) return;
    this.net = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, a: s.a, fl: s.fl, g: s.g, k: s.k };
    this.netTarget = { x: s.x, y: s.y };
    this.facing = s.a;
    this.flashlight.on = s.fl > 0;
    if (s.fl > 0) this.flashlight.mode = s.fl;
    this.gait = GAITS[s.g] ?? "walk";
    this.netFlags = s.k;
    this.exhausted = (s.k & NET_FLAG.exhausted) !== 0;
  }

  /** NET_FLAG bits describing this actor; `extra` adds bits known to other systems. */
  flags(extra = 0): number {
    if (this.net) return this.netFlags;
    let k = extra;
    if (this.exhausted) k |= NET_FLAG.exhausted;
    if (this.breakFree > 0) k |= NET_FLAG.canBreakFree;
    if (this.flashlight.charge < BATTERY.low) k |= NET_FLAG.batteryLow;
    return k;
  }

  toNet(extraFlags = 0): NetState {
    const v = this.velocity;
    const p = this.authPos;
    return {
      x: p.x, y: p.y, vx: v.x, vy: v.y, a: this.facing, fl: this.beamOn ? this.flashlight.mode : 0,
      g: GAITS.indexOf(this.gait), k: this.flags(extraFlags),
    };
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
    this.syncView(delta / 1000);
  }

  /** Place the visible sprite: stand on the feet line, bob and lean while walking, face the way we go. */
  private syncView(dt: number): void {
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed > 20) this.bobT += dt * speed / 38;
    else this.bobT = 0;
    const phase = Math.sin(this.bobT * Math.PI);
    // Look where we face (the flashlight direction), keeping the last side when facing up/down.
    const cx = Math.cos(this.facing);
    if (cx < -0.25) this.view.setFlipX(true);
    else if (cx > 0.25) this.view.setFlipX(false);
    const k = Math.min(1, dt * SLIDE_RATE);
    this.slide.x -= this.slide.x * k;
    this.slide.y -= this.slide.y * k;
    const x = this.x + this.slide.x, feet = this.feetY + this.slide.y;
    this.view.setPosition(x, feet - Math.abs(phase) * BOB_HEIGHT)
      .setRotation(speed > 20 ? phase * BOB_TILT : 0)
      .setDepth(feet);
    this.shadow.setPosition(x, feet - 1);
  }

  override destroy(fromScene?: boolean): void {
    this.view.destroy();
    this.shadow.destroy();
    super.destroy(fromScene);
  }
}

/** Rotate angle `from` towards `to` by at most `step` radians. */
export function turnTowards(from: number, to: number, step: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step;
}
