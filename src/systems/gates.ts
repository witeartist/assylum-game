// Doors in doorways. Anyone can open or close one (E); monsters open them on their way — the
// hunter with a pause, the boss by smashing through. A closed door blocks sight, light and
// sound (and slows whoever chases you); opening or shutting one creaks. Shutting a door while
// standing in it steps you out to your side first. The leaf swings on its hinge.
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
/** How long the leaf takes to swing, ms. */
const SWING_MS = 170;
/** A door slammed on the run is louder. */
const SLAM = 1.5;
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

  /** E next to a door. Shutting it from the doorway steps `by` out to its side first. */
  toggle(i: number, by: Actor): void {
    const g = this.gates[i];
    if (!g) return;
    if (g.open) {
      const inside = this.inDoorway(g);
      const out = inside.includes(by) ? this.stepOut(g, by) : null;
      if (inside.some(a => a !== by) || (inside.includes(by) && !out)) {
        if (by === this.world.local) this.world.toast("Дверь не закрыть — кто-то в проходе", "neutral");
        return;
      }
      if (out) by.stepTo(out);
    }
    this.set(i, !g.open, by);
  }

  /** The single place a door opens or shuts (players, AI, network). */
  set(i: number, open: boolean, by: Actor | null, remote = false): void {
    const g = this.gates[i], w = this.world;
    if (!g || g.open === open) return;
    g.open = open;
    this.apply(g);
    this.swing(g);
    const loud = by?.role === "boss" ? 10 : by?.gait === "sneak" ? 2.5 : by?.gait === "run" && !open ? NOISE.door * SLAM : NOISE.door;
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

  /** Who stands in the doorway. */
  private inDoorway(g: Gate): Actor[] {
    return this.world.actors.filter(a => a.inPlay && !a.hiding && g.tiles.some(t => dist(a.authPos, tileCenter(t)) < TILE * 0.8));
  }

  /**
   * Where `a` steps to so the door can shut: the tile past the door on the side of the wall it
   * stands on (inside stays inside); dead in the middle, the way it faces, so the door shuts
   * behind it. The other side if that one is taken; null if neither is free.
   */
  private stepOut(g: Gate, a: Actor): Vec2 | null {
    const w = this.world;
    const t = g.tiles.reduce((best, t) => dist(a, tileCenter(t)) < dist(a, tileCenter(best)) ? t : best);
    const c = tileCenter(t);
    // The wall line: a thin wall running west–east lies along the bottom of its tile.
    const off = g.horizontal ? a.y - (g.thin ? t.row * TILE + TILE - THIN_WALL / 2 : c.y) : a.x - c.x;
    const facing = g.horizontal ? Math.sin(a.facing) : Math.cos(a.facing);
    const side = Math.abs(off) > 2 ? Math.sign(off) : facing >= 0 ? 1 : -1;
    for (const s of [side, -side]) {
      const to = g.horizontal ? { col: t.col, row: t.row + s } : { col: t.col + s, row: t.row };
      const p = tileCenter(to);
      if (w.grid.isSolid(to.col, to.row) || w.actors.some(o => o !== a && o.inPlay && !o.hiding && dist(o.authPos, p) < TILE * 0.7)) continue;
      return p;
    }
    return null;
  }

  /** The leaf swings on its hinge: a shutting door grows out of it, an opening one folds into it. */
  private swing(g: Gate): void {
    const s = g.sprite, tweens = this.world.scene.tweens;
    tweens.killTweensOf(s);
    const first = g.tiles[0], n = g.tiles.length;
    if (g.horizontal) {
      // The hinge is on the left, where the open leaf stands.
      const hinge = first.col * TILE, base = (first.row + 1) * TILE;
      if (!g.open) {
        const full = s.scaleX;
        s.setOrigin(0, 1).setPosition(hinge, base).setScale(full * 0.1, s.scaleY);
        tweens.add({ targets: s, scaleX: full, duration: SWING_MS, ease: "Quad.easeOut", onComplete: () => this.apply(g) });
      } else {
        s.setTexture(n > 1 ? GATE_ART.h2 : GATE_ART.h).setOrigin(0, 1).setPosition(hinge, base).setDisplaySize(n * TILE, THIN_WALL + WALL_HEIGHT);
        tweens.add({ targets: s, scaleX: s.scaleX * 0.1, duration: SWING_MS * 0.7, ease: "Quad.easeIn", onComplete: () => this.apply(g) });
      }
    } else if (g.open) {
      // The open leaf turns from edge-on to face-on.
      const full = s.scaleX;
      s.setScale(full * 0.05, s.scaleY);
      tweens.add({ targets: s, scaleX: full, duration: SWING_MS, ease: "Quad.easeOut" });
    } else {
      const last = g.tiles[n - 1], foot = (last.row + 1) * TILE - 3;
      const hinge = first.col * TILE + (g.thin ? TILE / 2 + THIN_WALL / 2 : TILE);
      s.setTexture(GATE_ART.vOpen).setOrigin(0, 1).setPosition(hinge, foot).setDisplaySize(TILE * 0.9, THIN_WALL + WALL_HEIGHT).setDepth(foot);
      tweens.add({ targets: s, scaleX: s.scaleX * 0.05, duration: SWING_MS * 0.8, ease: "Quad.easeIn", onComplete: () => this.apply(g) });
    }
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
