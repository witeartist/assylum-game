// Shared context of one round: the level, the actors and every system. Systems read each
// other through it and announce state changes on `events`.
import type Phaser from "phaser";
import { EventBus } from "../core/events";
import { tileIndex, worldToTile } from "../core/geom";
import { Rng } from "../core/rng";
import type { RunnerStatus, Vec2 } from "../core/types";
import type { Difficulty } from "../data/difficulty";
import type { Tone } from "../ui/theme";
import { WalkGrid } from "../world/grid";
import { buildRoomLookup, type LevelData, type Room } from "../world/level";
import type { Actor } from "../entities/Actor";
import type { CollisionLayer } from "../world/collision";
import type { Objectives } from "../systems/objectives";
import type { Doors } from "../systems/doors";
import type { Hiding } from "../systems/hiding";
import type { Lighting } from "../systems/lighting";
import type { FoxFlash } from "../systems/foxFlash";
import type { Vision } from "../systems/vision";
import type { Noise } from "../systems/noise";
import type { Director } from "../systems/director";
import type { Round } from "../systems/round";
import type { CameraRig } from "../render/cameraRig";

/** solo = everything local; host = authoritative peer; client = follows the host. */
export type NetMode = "solo" | "host" | "client";

export interface GameEvents {
  keyCollected: { index: number; by: string | null; local: boolean; remote: boolean };
  exitOpened: Record<string, never>;
  doorOpened: { index: number; by: string | null; remote: boolean };
  runnerCaught: { actor: Actor; by: string; remote: boolean };
  runnerEscaped: { actor: Actor; remote: boolean };
  runnerLeft: { actor: Actor };
  hidingChanged: { actor: Actor; remote: boolean };
  bossSpawned: { remote: boolean };
  /** Host: the round is over; final status of every runner. */
  roundResults: { results: Record<string, RunnerStatus> };
  toast: { text: string; tone: Tone };
  banner: { text: string; tone: Tone };
  screenFlash: { color: number; alpha: number; ms: number };
  shake: { ms: number; intensity: number };
}

export class World {
  readonly events = new EventBus<GameEvents>();
  readonly grid: WalkGrid;
  readonly rng: Rng;
  readonly actors: Actor[] = [];
  private readonly roomLookup: Int16Array;

  local!: Actor;
  camera!: CameraRig;
  collision!: CollisionLayer;
  objectives!: Objectives;
  doors!: Doors;
  hiding!: Hiding;
  lighting!: Lighting;
  foxFlash!: FoxFlash;
  vision!: Vision;
  noise!: Noise;
  director!: Director;
  round!: Round;

  constructor(
    readonly scene: Phaser.Scene,
    readonly level: LevelData,
    readonly diff: Difficulty,
    readonly net: NetMode,
  ) {
    this.grid = WalkGrid.fromRows(level.rows);
    for (const d of level.lockedDoors) for (const t of d.doorTiles) this.grid.setSolid(t, true);
    this.roomLookup = buildRoomLookup(level.rooms);
    this.rng = new Rng(level.seed ^ 0x5bd1e995);
  }

  /** Solo and host simulate AI, catches and the round end; clients follow the host. */
  get isAuthority(): boolean { return this.net !== "client"; }
  get multiplayer(): boolean { return this.net !== "solo"; }

  addActor(a: Actor): Actor { this.actors.push(a); return a; }
  byId(id: string): Actor | undefined { return this.actors.find(a => a.id === id); }

  runners(): Actor[] { return this.actors.filter(a => a.role === "runner"); }
  /** Hunter and boss actors that are on the map. */
  threats(): Actor[] { return this.actors.filter(a => a.role !== "runner" && a.inPlay); }

  roomAt(p: Vec2): Room | null {
    const t = worldToTile(p);
    const i = this.roomLookup[tileIndex(t.col, t.row)];
    return i >= 0 ? this.level.rooms[i] : null;
  }

  toast(text: string, tone: Tone = "neutral"): void { this.events.emit("toast", { text, tone }); }
  shake(ms: number, intensity: number): void { this.events.emit("shake", { ms, intensity }); }
}
