// Wall collision. Whole walls are an invisible tilemap layer mirroring the WalkGrid: arcade physics
// only tests the few tiles around each body, and walls have no seams to snag on. Thin walls
// (walls.ts) and furniture are static strips instead, one set per body size, each just big enough
// that the centre of that body never enters the tile: characters walk right up to a partition or
// a small barrel, and for paths, sight and sound every tile still means what it did.
import Phaser from "phaser";
import { MAP_W, MAP_H, TILE } from "../core/constants";
import type { Tile } from "../core/types";
import type { WalkGrid } from "./grid";
import { THIN, THIN_WALL, bands } from "./walls";

const TEXTURE = "__collision";
/** How far a body's centre stays out of a thin wall's tile, px. */
const CLEARANCE = 2;

interface Rect { x0: number; y0: number; x1: number; y1: number; }

/** A solid piece of furniture: the tiles it takes and the floor it really covers, world px. */
export interface PropFoot { tiles: Tile[]; foot: Rect; }

/** The strips of one body size: walls merged into long runs, doors one per tile (they open and shut). */
interface Strips { group: Phaser.Physics.Arcade.StaticGroup; doors: Map<number, Phaser.GameObjects.Zone[]>; }

export class CollisionLayer {
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  private strips = new Map<number, Strips>();
  /** Thin door tiles that are shut right now. */
  private shut = new Set<number>();

  constructor(private scene: Phaser.Scene, grid: WalkGrid, private shapes: Uint8Array, private rows: readonly string[],
    private props: readonly PropFoot[] = []) {
    const propTiles = new Set(props.flatMap(p => p.tiles.map(t => t.row * MAP_W + t.col)));
    if (!scene.textures.exists(TEXTURE)) {
      const c = document.createElement("canvas");
      c.width = TILE; c.height = TILE;
      scene.textures.addCanvas(TEXTURE, c);
    }
    const data: number[][] = [];
    for (let r = 0; r < MAP_H; r++) {
      const row: number[] = [];
      for (let c = 0; c < MAP_W; c++) {
        const i = r * MAP_W + c;
        if (grid.isSolid(c, r) && shapes[i] >= THIN && rows[r][c] !== "#") this.shut.add(i);
        row.push(grid.isSolid(c, r) && shapes[i] < THIN && !propTiles.has(i) ? 0 : -1);
      }
      data.push(row);
    }
    const map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage(TEXTURE)!;
    this.layer = map.createLayer(0, tiles, 0, 0)!;
    this.layer.setVisible(false);
    this.layer.setCollision(0);
  }

  /** Make `obj` bump into the walls. */
  collide(obj: Phaser.Physics.Arcade.Sprite): void {
    this.scene.physics.add.collider(obj, this.layer);
    if (obj.body) this.scene.physics.add.collider(obj, this.stripsFor(Math.round(obj.body.width)).group);
  }

  open(t: Tile): void {
    const i = t.row * MAP_W + t.col;
    if (this.shapes[i] >= THIN) this.setDoor(i, false);
    else this.layer.removeTileAt(t.col, t.row, true, true);
  }

  close(t: Tile): void {
    const i = t.row * MAP_W + t.col;
    if (this.shapes[i] >= THIN) this.setDoor(i, true);
    else this.layer.putTileAt(0, t.col, t.row).setCollision(true, true, true, true);
  }

  private setDoor(i: number, shut: boolean): void {
    if (shut) this.shut.add(i); else this.shut.delete(i);
    for (const s of this.strips.values()) for (const z of s.doors.get(i) ?? []) (z.body as Phaser.Physics.Arcade.StaticBody).enable = shut;
  }

  /** Thin walls and doors as strips for bodies `size` px across (built the first time it is needed). */
  private stripsFor(size: number): Strips {
    const known = this.strips.get(size);
    if (known) return known;
    const half = Math.max(THIN_WALL / 2, TILE / 2 - size / 2 + CLEARANCE);
    const top = Math.min(TILE - THIN_WALL, size / 2 - CLEARANCE);
    const group = this.scene.physics.add.staticGroup();
    const add = (b: Rect) => {
      const z = this.scene.add.zone((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.x1 - b.x0, b.y1 - b.y0);
      group.add(z);
      return z;
    };
    const walls: Rect[] = [];
    const doors = new Map<number, Phaser.GameObjects.Zone[]>();
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      const i = r * MAP_W + c, code = this.shapes[i];
      if (code < THIN) continue;
      const rects = bands(code, half, top).map(b => ({ x0: c * TILE + b.x0, y0: r * TILE + b.y0, x1: c * TILE + b.x1, y1: r * TILE + b.y1 }));
      if (this.rows[r][c] === "#") { walls.push(...rects); continue; }
      const zones = rects.map(add);
      for (const z of zones) (z.body as Phaser.Physics.Arcade.StaticBody).enable = this.shut.has(i);
      doors.set(i, zones);
    }
    mergeRuns(walls).forEach(add);
    // Furniture: its real floor, grown where needed so the body's centre stays off its tiles.
    const grow = Math.max(0, size / 2 - CLEARANCE);
    for (const p of this.props) {
      const cols = p.tiles.map(t => t.col), rows = p.tiles.map(t => t.row);
      const t: Rect = { x0: Math.min(...cols) * TILE, y0: Math.min(...rows) * TILE, x1: (Math.max(...cols) + 1) * TILE, y1: (Math.max(...rows) + 1) * TILE };
      add({
        x0: t.x0 + Math.min(grow, Math.max(0, p.foot.x0 - t.x0)), x1: t.x1 - Math.min(grow, Math.max(0, t.x1 - p.foot.x1)),
        y0: t.y0 + Math.min(grow, Math.max(0, p.foot.y0 - t.y0)), y1: t.y1 - Math.min(grow, Math.max(0, t.y1 - p.foot.y1)),
      });
    }
    const s = { group, doors };
    this.strips.set(size, s);
    return s;
  }
}

/** Join strips that continue each other (a long partition is one body, with no seams to snag on). */
function mergeRuns(rects: Rect[]): Rect[] {
  const join = (list: Rect[], along: "x" | "y"): Rect[] => {
    const key = (r: Rect) => along === "x" ? `${r.y0},${r.y1}` : `${r.x0},${r.x1}`;
    const lo = (r: Rect) => along === "x" ? r.x0 : r.y0;
    const groups = new Map<string, Rect[]>();
    for (const r of list) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    const out: Rect[] = [];
    for (const g of groups.values()) {
      g.sort((a, b) => lo(a) - lo(b));
      let cur = { ...g[0] };
      for (const r of g.slice(1)) {
        if (along === "x" && r.x0 <= cur.x1) cur.x1 = Math.max(cur.x1, r.x1);
        else if (along === "y" && r.y0 <= cur.y1) cur.y1 = Math.max(cur.y1, r.y1);
        else { out.push(cur); cur = { ...r }; }
      }
      out.push(cur);
    }
    return out;
  };
  return join(join(rects, "x"), "y");
}
