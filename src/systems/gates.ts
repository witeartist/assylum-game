// Doors in doorways. Anyone can open or close one (E); monsters open them on their way — the
// hunter with a pause, the boss by smashing through. A closed door blocks sight, light and
// sound (and slows whoever chases you); opening or shutting one creaks.
import type Phaser from "phaser";
import { TILE, WALL_HEIGHT } from "../core/constants";
import { dist, tileCenter, tileIndex } from "../core/geom";
import type { Tile, Vec2 } from "../core/types";
import { INTERACT_RANGE, NOISE } from "../data/balance";
import { WALL_TOP } from "../data/rooms";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { THIN, THIN_WALL } from "../world/walls";

export interface Gate {
  tiles: Tile[];
  /** In a wall running left–right (you pass up/down through it). */
  horizontal: boolean;
  /** Stands in a thin wall (walls.ts): the door is as low as the wall. */
  thin: boolean;
  open: boolean;
  x: number; y: number;
  sprite: Phaser.GameObjects.Image;
  /** In a thick wall: the wall going on above the (low) closed door. */
  lintel: Phaser.GameObjects.Image | null;
}

/** Seconds a door holds each kind of actor up. */
const OPEN_TIME = { runner: 0.35, hunter: 0.7, boss: 1.1 };
export const GATE_ART = {
  h: "interactive/door_wood_h", h2: "interactive/door_wood_h2", hOpen: "interactive/door_wood_h_open",
  v: "interactive/door_wood_v", vOpen: "interactive/door_wood_v_open",
};

export class Gates {
  readonly gates: Gate[];
  private byTile = new Map<number, number>();
  private opening = new Map<Actor, number>();

  constructor(private world: World) {
    this.gates = world.level.gates.map((g, i) => {
      for (const t of g.tiles) { this.byTile.set(tileIndex(t.col, t.row), i); world.doorish.add(tileIndex(t.col, t.row)); }
      const a = tileCenter(g.tiles[0]), b = tileCenter(g.tiles[g.tiles.length - 1]);
      const thin = world.walls[tileIndex(g.tiles[0].col, g.tiles[0].row)] >= THIN;
      const lintel = g.horizontal && !thin ? world.scene.add.image(0, 0, WALL_TOP).setOrigin(0).setTint(0x444444) : null;
      const gate: Gate = {
        tiles: g.tiles, horizontal: g.horizontal, thin, open: g.open, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        sprite: world.scene.add.image(0, 0, GATE_ART.h), lintel,
      };
      this.apply(gate);
      return gate;
    });
  }

  /** Index of the closed door on tile `t`, or -1. */
  closedAt(t: Tile): number {
    const i = this.byTile.get(tileIndex(t.col, t.row));
    return i !== undefined && !this.gates[i].open ? i : -1;
  }

  /** The door within reach of `p`, or -1. */
  nearest(p: Vec2, range = INTERACT_RANGE): number {
    let best = -1, bestD = range;
    this.gates.forEach((g, i) => { const d = dist(p, g); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }

  /** E next to a door. */
  toggle(i: number, by: Actor): void {
    const g = this.gates[i];
    if (!g) return;
    if (g.open && this.blocked(g)) { if (by === this.world.local) this.world.toast("Дверь не закрыть — кто-то в проходе", "neutral"); return; }
    this.set(i, !g.open, by);
  }

  /** The single place a door opens or shuts (players, AI, network). */
  set(i: number, open: boolean, by: Actor | null, remote = false): void {
    const g = this.gates[i], w = this.world;
    if (!g || g.open === open) return;
    g.open = open;
    this.apply(g);
    const loud = by?.role === "boss" ? 10 : by?.gait === "sneak" ? 2.5 : NOISE.door;
    w.noise.emit(g.x, g.y, loud, "door", by);
    if (by?.role === "boss" && w.local.inPlay && dist(w.local, g) < TILE * 10) w.shake(250, 0.01);
    w.events.emit("gateChanged", { index: i, open, by: by?.id ?? "", remote });
  }

  /**
   * An AI actor about to walk into a closed door stops and opens it first. Returns true while it
   * is busy with the door (the caller skips moving this frame).
   */
  aiPass(a: Actor, dt: number): boolean {
    const next = a.path[0];
    const i = next ? this.closedAt(next) : -1;
    if (i < 0 || dist(a, tileCenter(next)) > TILE * 1.4) { this.opening.delete(a); return false; }
    a.halt();
    const t = (this.opening.get(a) ?? 0) + dt;
    if (t >= OPEN_TIME[a.role]) { this.opening.delete(a); this.set(i, true, a); }
    else this.opening.set(a, t);
    return true;
  }

  /** Someone stands in the doorway. */
  private blocked(g: Gate): boolean {
    return this.world.actors.some(a => a.inPlay && !a.hiding && g.tiles.some(t => dist(a.authPos, tileCenter(t)) < TILE * 0.8));
  }

  /** Walls, sight and the picture follow the door's state. */
  private apply(g: Gate): void {
    const w = this.world;
    for (const t of g.tiles) {
      w.sight.setSolid(t, !g.open);
      if (w.collision) { if (g.open) w.collision.open(t); else w.collision.close(t); }
    }
    const n = g.tiles.length, first = g.tiles[0], last = g.tiles[n - 1];
    const s = g.sprite.setOrigin(0.5, 1);
    if (g.horizontal) {
      // A closed door is as tall as a thin wall: its front plus the top edge. In a thick wall the
      // wall goes on above it.
      const base = (first.row + 1) * TILE, low = THIN_WALL + WALL_HEIGHT;
      if (g.open) s.setTexture(GATE_ART.hOpen).setPosition(first.col * TILE + 4, base).setDisplaySize(7, TILE + WALL_HEIGHT);
      else s.setTexture(n > 1 ? GATE_ART.h2 : GATE_ART.h).setPosition(g.x, base).setDisplaySize(n * TILE, low);
      s.setDepth(base);
      g.lintel?.setPosition(first.col * TILE, first.row * TILE - WALL_HEIGHT).setDisplaySize(n * TILE, TILE + WALL_HEIGHT - low)
        .setDepth(base - 1).setVisible(!g.open);
    } else {
      const base = (last.row + 1) * TILE;
      if (g.open) {
        // Swung into the room on the right: the leaf stands across the floor from its hinge at
        // the bottom of the doorway, and we see its face.
        const hinge = first.col * TILE + (g.thin ? TILE / 2 + THIN_WALL / 2 : TILE), foot = base - 3;
        s.setTexture(GATE_ART.vOpen).setOrigin(0, 1).setPosition(hinge, foot).setDisplaySize(TILE * 0.9, THIN_WALL + WALL_HEIGHT);
        s.setDepth(foot);
      } else {
        s.setTexture(GATE_ART.v).setPosition(g.x, base).setDisplaySize(9, n * TILE + WALL_HEIGHT);
        s.setDepth(base);
      }
    }
  }
}
