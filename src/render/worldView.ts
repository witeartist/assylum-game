// Static map visuals in 3/4 view, baked once into a few large textures:
//   floor layer (under everything): floor surfaces with a world-anchored pattern (no tile grid),
//     decals, soft ambient occlusion along walls, and the front faces of walls;
//   caps layer (over characters): wall tops, raised WALL_HEIGHT above their footprint, so
//     anyone standing behind a wall is partly hidden by it.
// Locked doors, lamp fixtures and furniture are separate objects on top.
import Phaser from "phaser";
import { MAP_W, MAP_H, TILE, WALL_HEIGHT } from "../core/constants";
import { tileCenter, tileIndex } from "../core/geom";
import { Rng } from "../core/rng";
import { GENERATED_SURFACE_TILES, GENERATED_SURFACE_TILES_BY_KEY } from "../data/assets";
import { CORRIDOR_FLOOR, DECAL_DENSITY, DECAL_KEYS, DECAL_TILES, ROOMS, WALL_FACE, WALL_TOP, type DecalKind } from "../data/rooms";
import { LAMP_ART, WALL_DECOR, WALL_DECOR_SHARE } from "../data/furniture";
import type { World } from "../game/World";
import { buildRoomLookup } from "../world/level";
import { ARM_N, ARM_S, THIN, THIN_WALL, bands, faceRuns, wallMask, type WallMask } from "../world/walls";
import { DEPTH } from "../ui/theme";
import { SURFACES, WALL_FACE_ART } from "./surfaces";
import { furnitureLayout } from "./propLayout";
import { isPlaceholder } from "./textures";

/** Chunk side in world px: few draw calls, a texture size every GPU supports. */
const CHUNK = 1024;
const H = WALL_HEIGHT;
const AO_RES = 8;      // AO texels per tile
const AO_RADIUS = 3;   // blur radius, AO texels
const AO_STRENGTH = 0.55;
/** Resolution of the wall outline used for faces, edges and AO, world px (divides every band edge). */
const MASK_RES = 2;
const CAP_TINT = 0x6a6a6a;
/** Tops of thin walls are lighter: a partition should read as a line even in a dim room. */
const THIN_CAP_TINT = 0xd0d4d2;
/** Door frames and broken wall edges. */
const FRAME = 0x4a4f4c;
const FRAME_DARK = 0x16191a;
const BROKEN = 0x2c2d2c;

interface Stamp {
  key: string;
  frame?: string;
  x: number; y: number;
  sx: number; sy: number;
  rotation?: number;
  alpha?: number;
  tint?: number;
  originX?: number; originY?: number;
  /** Axis-aligned bounds in world px, to pick the chunks it touches. */
  bounds: [number, number, number, number];
}

/** Repetition period of a surface texture in world px. */
function surfacePeriod(key: string): number {
  if (!isPlaceholder(key)) return (GENERATED_SURFACE_TILES_BY_KEY[key] ?? GENERATED_SURFACE_TILES) * TILE;
  return (SURFACES[key]?.tilesAcross ?? WALL_FACE_ART.tilesAcross) * TILE;
}

/** A frame of `key` covering one tile at world (x, y), so the pattern is continuous across tiles. */
function surfaceStamp(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number, phaseY = y): Stamp {
  const tex = scene.textures.get(key);
  const src = tex.getSourceImage();
  const period = surfacePeriod(key);
  const s = period / src.width;               // world px per texel (x)
  const sy = key === WALL_FACE ? h / src.height : s;
  const fx = Math.round(((x % period) + period) % period / s);
  const fy = key === WALL_FACE ? 0 : Math.round(((phaseY % period) + period) % period / s);
  const fw = Math.round(w / s), fh = key === WALL_FACE ? src.height : Math.round(h / sy);
  const name = `${fx},${fy},${fw},${fh}`;
  if (!tex.has(name)) tex.add(name, 0, fx, fy, Math.min(fw, src.width - fx), Math.min(fh, src.height - fy));
  return { key, frame: name, x, y, sx: s, sy, originX: 0, originY: 0, bounds: [x, y, x + w, y + h] };
}

function stampImage(key: string, x: number, y: number, scale: number, rotation: number, alpha: number, radius: number): Stamp {
  return { key, x, y, sx: scale, sy: scale, rotation, alpha, originX: 0.5, originY: 0.5, bounds: [x - radius, y - radius, x + radius, y + radius] };
}

/** Bake the stamps that touch the rect (x, y, w, h) into render textures at `depth`, CHUNK wide at most. */
function bakeRect(scene: Phaser.Scene, stamps: Stamp[], x: number, y: number, w: number, h: number, depth: number): Phaser.GameObjects.RenderTexture[] {
  const img = scene.make.image({ key: stamps[0]?.key ?? "__DEFAULT" }, false);
  const out: Phaser.GameObjects.RenderTexture[] = [];
  for (let cx = x; cx < x + w; cx += CHUNK) {
    const cw = Math.min(CHUNK, x + w - cx);
    const mine = stamps.filter(s => s.bounds[2] > cx && s.bounds[0] < cx + cw && s.bounds[3] > y && s.bounds[1] < y + h);
    if (mine.length === 0) continue;
    const rt = scene.add.renderTexture(cx, y, cw, h).setOrigin(0).setDepth(depth);
    rt.beginDraw();
    for (const s of mine) {
      img.setTexture(s.key, s.frame).setOrigin(s.originX ?? 0, s.originY ?? 0).setScale(s.sx, s.sy)
        .setRotation(s.rotation ?? 0).setAlpha(s.alpha ?? 1).setTint(s.tint ?? 0xffffff);
      rt.batchDraw(img, s.x - cx, s.y - y);
    }
    rt.endDraw();
    out.push(rt);
  }
  img.destroy();
  return out;
}

/** Bake stamps over the whole map into CHUNK-sized render textures at `depth`. */
function bake(scene: Phaser.Scene, stamps: Stamp[], depth: number): Phaser.GameObjects.RenderTexture[] {
  const out: Phaser.GameObjects.RenderTexture[] = [];
  // Rows start WALL_HEIGHT above the map: the tops of row-0 walls are drawn there.
  for (let top = -H; top < MAP_H * TILE; top += CHUNK) {
    out.push(...bakeRect(scene, stamps, 0, top, MAP_W * TILE, Math.min(CHUNK, MAP_H * TILE - top), depth));
  }
  return out;
}

/**
 * Depth of the tops of wall row `r`: just under anything standing on that row's floor line, so
 * whoever is behind (north of) the wall is hidden by its top and whoever is in front covers it.
 */
export function capDepth(r: number): number {
  return (r + 1) * TILE - 0.5;
}

/** Soft darkening of the floor near walls (thin ones too), as a black texture with alpha. */
function ambientOcclusion(scene: Phaser.Scene, mask: WallMask): string {
  const w = MAP_W * AO_RES, h = MAP_H * AO_RES;
  const per = TILE / AO_RES / mask.res;   // mask cells across one AO texel
  let open = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let wall = 0;
    for (let dy = 0; dy < per; dy++) for (let dx = 0; dx < per; dx++) wall += mask.cells[(y * per + dy) * mask.w + x * per + dx];
    open[y * w + x] = 1 - wall / (per * per);
  }
  const floorMask = open.slice();
  // Three box blurs ≈ gaussian.
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -AO_RADIUS; x <= AO_RADIUS; x++) acc += open[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (AO_RADIUS * 2 + 1);
        acc += open[y * w + Math.min(w - 1, x + AO_RADIUS + 1)] - open[y * w + Math.max(0, x - AO_RADIUS)];
      }
    }
    const res = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -AO_RADIUS; y <= AO_RADIUS; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        res[y * w + x] = acc / (AO_RADIUS * 2 + 1);
        acc += tmp[Math.min(h - 1, y + AO_RADIUS + 1) * w + x] - tmp[Math.max(0, y - AO_RADIUS) * w + x];
      }
    }
    open = res;
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const dark = floorMask[i] * Math.max(0, 1 - open[i]) * 2 * AO_STRENGTH;
    img.data[i * 4 + 3] = Math.min(255, dark * 255);
  }
  ctx.putImageData(img, 0, 0);
  const key = "__ao";
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
  return key;
}

export class WorldView {
  /** Visuals of each locked door, removed when it opens. */
  private doorParts: Phaser.GameObjects.Image[][] = [];

  constructor(private world: World) {
    const { scene, level } = world;
    const solid = (c: number, r: number) => c < 0 || r < 0 || c >= MAP_W || r >= MAP_H || level.rows[r][c] === "#";
    const lookup = buildRoomLookup(level.rooms);
    const vrng = new Rng(level.seed ^ 0xdeca1);

    const shapes = world.walls;
    const mask = wallMask(level.rows, shapes, MASK_RES);

    // ── Floor layer ──
    const floor: Stamp[] = [];
    const floorKey = (c: number, r: number): string | null => {
      if (solid(c, r)) return null;
      const i = lookup[tileIndex(c, r)];
      const room = i >= 0 ? level.rooms[i] : null;
      const inside = room && c > room.x && c < room.x + room.w - 1 && r > room.y && r < room.y + room.h - 1;
      return inside ? ROOMS[room.type].floor : CORRIDOR_FLOOR;
    };
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      const key = floorKey(c, r);
      if (key) { floor.push(surfaceStamp(scene, key, c * TILE, r * TILE, TILE, TILE)); continue; }
      if (shapes[tileIndex(c, r)] < THIN) continue;
      // Beside a thin wall each quarter of the tile shows the floor next to it.
      for (const qy of [-1, 1]) for (const qx of [-1, 1]) {
        const key = floorKey(c + qx, r) ?? floorKey(c, r + qy) ?? floorKey(c + qx, r + qy) ?? floorKey(c - qx, r) ?? floorKey(c, r - qy) ?? CORRIDOR_FLOOR;
        floor.push(surfaceStamp(scene, key, c * TILE + (qx > 0 ? TILE / 2 : 0), r * TILE + (qy > 0 ? TILE / 2 : 0), TILE / 2, TILE / 2));
      }
    }
    const decal = (kind: DecalKind, c: number, r: number, scaleMul = 1) => {
      const key = vrng.pick(DECAL_KEYS[kind]);
      const tex = scene.textures.get(key).getSourceImage();
      const tiles = DECAL_TILES[key] ?? 1.5;
      const s = tiles * TILE / Math.max(tex.width, tex.height) * vrng.range(0.75, 1.2) * scaleMul;
      const p = tileCenter({ col: c, row: r });
      floor.push(stampImage(key, p.x + vrng.range(-10, 10), p.y + vrng.range(-10, 10), s, vrng.range(0, Math.PI * 2), vrng.range(0.75, 1), tex.width * s * 0.75));
    };
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      if (solid(c, r)) continue;
      if (level.rows[r][c] === "B") { decal("blood", c, r, 1.2); continue; }
      const i = lookup[tileIndex(c, r)];
      const density = DECAL_DENSITY[i >= 0 ? level.rooms[i].type : "corridor"];
      for (const [kind, p] of Object.entries(density) as [DecalKind, number][]) {
        if (vrng.chance(p)) { decal(kind, c, r); break; }
      }
    }
    const ao = ambientOcclusion(scene, mask);
    const aoScale = TILE / AO_RES;
    floor.push({ key: ao, x: 0, y: 0, sx: aoScale, sy: aoScale, originX: 0, originY: 0, bounds: [0, 0, MAP_W * TILE, MAP_H * TILE] });
    // Front faces wherever a wall (or a thin wall's band) stands on open floor, a tile at a time
    // so each piece is one frame of the texture.
    for (const run of faceRuns(mask)) {
      for (let x = run.x0; x < run.x1;) {
        const end = Math.min(run.x1, (Math.floor(x / TILE) + 1) * TILE);
        floor.push(surfaceStamp(scene, WALL_FACE, x, run.y - H, end - x, H));
        x = end;
      }
    }
    bake(scene, floor, DEPTH.floor);

    // ── Caps: wall tops near walkable space (deep inside wall masses stays black), a strip per
    // row of walls, each sorted with the characters and furniture at its floor line ──
    const nearFloor = (c: number, r: number) => {
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (!solid(c + dc, r + dr)) return true;
      return false;
    };
    for (let r = 0; r < MAP_H; r++) {
      const caps: Stamp[] = [];
      for (let c = 0; c < MAP_W; c++) {
        if (!solid(c, r) || !nearFloor(c, r)) continue;
        // Wall tops are darker than any floor, so walls read as solid masses.
        const code = shapes[tileIndex(c, r)], tint = code >= THIN ? THIN_CAP_TINT : CAP_TINT;
        for (const b of bands(code)) {
          const x = c * TILE + b.x0, y = r * TILE + b.y0;
          caps.push({ ...surfaceStamp(scene, WALL_TOP, x, y - H, b.x1 - b.x0, b.y1 - b.y0, y), tint });
        }
      }
      bakeRect(scene, caps, 0, r * TILE - H, MAP_W * TILE, TILE, capDepth(r));
    }
    this.drawCapEdges(mask);

    for (const f of level.furniture) {
      const b = furnitureLayout(world, f);
      const img = placeStanding(scene, f.key, b.x, b.base, b.w);
      world.addProp(img, [{ x: b.x, y: b.base - 1 }, { x: b.foot.x0 + 1, y: b.base - 1 }, { x: b.foot.x1 - 1, y: b.base - 1 }, { x: b.x, y: b.foot.y0 + 1 }], f.solid);
    }
    this.buildDoors();
    this.buildLamps();
    this.buildFrames(solid);
    this.buildBreaches(vrng);
    this.buildDecor(solid, vrng);
    world.events.on("doorOpened", ({ index }) => { this.doorParts[index]?.forEach(p => p.destroy()); });
  }

  /**
   * Thin lines that make wall tops read as solid: a lit rim above front faces, dark outlines
   * elsewhere, and down the sides of the faces. Traced on the wall mask, so thin walls get them;
   * the lines on a wall top belong to its row of caps.
   */
  private drawCapEdges(m: WallMask): void {
    const scene = this.world.scene;
    const rows = Array.from({ length: MAP_H }, (_, r) => scene.add.graphics().setDepth(capDepth(r) + 0.1));
    const faces = scene.add.graphics().setDepth(DEPTH.floor + 1);
    const wall = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.cells[y * m.w + x] === 1;
    const R = m.res, per = TILE / R;
    const DARK = 0x050606, RIM = 0xa3aca8;
    for (let y = 0; y < m.h; y++) {
      const g = rows[Math.floor(y / per)];
      let top = -1, rim = -1;
      for (let x = 0; x <= m.w; x++) {
        const on = x < m.w && m.cells[y * m.w + x] === 1;
        const isTop = on && !wall(x, y - 1), isRim = on && !wall(x, y + 1);
        if (isTop && top < 0) top = x;
        if (!isTop && top >= 0) { g.fillStyle(DARK, 0.9).fillRect(top * R, y * R - H, (x - top) * R, 1); top = -1; }
        if (isRim && rim < 0) rim = x;
        if (!isRim && rim >= 0) { g.fillStyle(RIM, 0.7).fillRect(rim * R, (y + 1) * R - H - 2, (x - rim) * R, 2); rim = -1; }
      }
    }
    for (let x = 0; x < m.w; x++) for (const side of [-1, 1]) {
      const lx = side < 0 ? x * R : (x + 1) * R - 1;
      let start = -1;
      for (let y = 0; y <= m.h; y++) {
        const on = y < m.h && m.cells[y * m.w + x] === 1 && !wall(x + side, y) && (start < 0 || Math.floor(y / per) === Math.floor(start / per));
        if (on && start < 0) start = y;
        if (on || start < 0) continue;
        rows[Math.floor(start / per)].fillStyle(DARK, 0.9).fillRect(lx, start * R - H, 1, (y - start) * R);
        // The wall ends here: the outline goes on down the side of its front face.
        if (!wall(x, y)) faces.fillStyle(DARK, 0.9).fillRect(lx, y * R - H, 1, H);
        start = -1;
        // A run cut at a row boundary goes on in the next row's strip.
        if (y < m.h && m.cells[y * m.w + x] === 1 && !wall(x + side, y)) start = y;
      }
    }
  }

  /** Locked doors: a metal door standing in the doorway (front view in horizontal walls, edge-on in vertical ones). */
  private buildDoors(): void {
    const { scene, level } = this.world;
    const isDoor = new Set(level.lockedDoors.flatMap(d => d.doorTiles.map(t => tileIndex(t.col, t.row))));
    const walkable = (c: number, r: number) => r >= 0 && r < MAP_H && level.rows[r][c] !== "#" && !isDoor.has(tileIndex(c, r));
    this.doorParts = level.lockedDoors.map(d => d.doorTiles.flatMap(t => {
      const x = t.col * TILE, base = (t.row + 1) * TILE;
      const inHorizontalWall = walkable(t.col, t.row - 1) || walkable(t.col, t.row + 1);
      const backing = scene.add.image(x, t.row * TILE - H, WALL_TOP).setOrigin(0).setDepth(base - 1).setTint(0x444444);
      backing.setDisplaySize(TILE, TILE + H);
      const door = placeStanding(scene, inHorizontalWall ? "interactive/door_metal_h" : "interactive/door_metal_v", x + TILE / 2, base, TILE * (inHorizontalWall ? 1.15 : 0.8));
      return [backing, door];
    }));
  }

  /**
   * Door frames: posts at the sides of every doorway that has (or had) a door, and a header beam
   * across the top — the wall goes on above the door, so it hides the head of whoever walks under.
   */
  private buildFrames(solid: (c: number, r: number) => boolean): void {
    const { scene, level } = this.world;
    const runs = [...level.gates.map(d => ({ tiles: d.tiles, horizontal: d.horizontal })),
      ...level.lockedDoors.map(d => ({ tiles: d.doorTiles, horizontal: d.doorTiles.every(t => !solid(t.col, t.row - 1) || !solid(t.col, t.row + 1)) }))];
    for (const { tiles, horizontal } of runs) {
      const xs = tiles.map(t => t.col), ys = tiles.map(t => t.row);
      const c0 = Math.min(...xs), c1 = Math.max(...xs) + 1, r0 = Math.min(...ys), r1 = Math.max(...ys) + 1;
      // Over the door and anyone in the doorway; under whoever has stepped out in front of it.
      const g = scene.add.graphics().setDepth(r1 * TILE + 0.5);
      // In a thin wall the frame is as thin as the wall (see walls.ts for where its band lies).
      const thin = this.world.walls[tileIndex(c0, r0)] >= THIN;
      if (horizontal) {
        const top = thin ? r1 * TILE - H - THIN_WALL : r0 * TILE - H, x0 = c0 * TILE, x1 = c1 * TILE;
        const beam = thin ? 4 : 5, post = thin ? 3 : 4;
        g.fillStyle(FRAME, 1).fillRect(x0, top, x1 - x0, beam);                          // header beam
        g.fillStyle(FRAME_DARK, 1).fillRect(x0, top + beam, x1 - x0, 2);
        g.fillStyle(FRAME, 1).fillRect(x0, top, post, r1 * TILE - top).fillRect(x1 - post, top, post, r1 * TILE - top); // posts
      } else {
        const x0 = c0 * TILE + (thin ? TILE / 2 - THIN_WALL / 2 : 0), x1 = thin ? x0 + THIN_WALL : c1 * TILE;
        const top = r0 * TILE - H, bottom = r1 * TILE - H;
        g.fillStyle(FRAME, 1).fillRect(x0, top, x1 - x0, 4).fillRect(x0, bottom - 4, x1 - x0, 4); // posts, seen from above
        g.fillStyle(FRAME_DARK, 0.9).fillRect(x0, top, 2, bottom - top).fillRect(x1 - 2, top, 2, bottom - top);
      }
    }
  }

  /** Holes knocked through walls: jagged edges and rubble on both sides. */
  private buildBreaches(rng: Rng): void {
    const { scene, level } = this.world;
    for (const t of level.breaches) {
      const x = t.col * TILE, top = t.row * TILE - H, bottom = top + TILE;
      // Broken chunks sticking into the gap from the wall ends above and below (as wide as the wall).
      const thin = [t.row - 1, t.row + 1].some(r => r >= 0 && r < MAP_H && this.world.walls[tileIndex(t.col, r)] >= THIN);
      const x0 = thin ? x + TILE / 2 - THIN_WALL / 2 : x, w = thin ? THIN_WALL : TILE;
      for (const [y, dir] of [[top, 1], [bottom, -1]] as [number, number][]) {
        // Each chunk is part of the top of the wall it breaks off.
        const g = scene.add.graphics().setDepth(capDepth(t.row - dir) + 0.2);
        g.fillStyle(BROKEN, 1).beginPath();
        g.moveTo(x0, y);
        for (let i = 0; i <= 4; i++) g.lineTo(x0 + (w * i) / 4, y + dir * rng.range(2, thin ? 7 : 9));
        g.lineTo(x0 + w, y);
        g.closePath().fillPath();
      }
      for (let i = 0; i < 2; i++) {
        const d = scene.add.image(x + rng.range(0, TILE), t.row * TILE + rng.range(4, TILE - 4), "decals/rubble").setDepth(DEPTH.floorObjects);
        d.setScale(TILE * rng.range(0.6, 0.9) / Math.max(d.width, d.height)).setRotation(rng.range(0, 6.28));
      }
    }
  }

  /** Wall decor on the front of north walls: windows, boards, pipes… (only art that exists). */
  private buildDecor(solid: (c: number, r: number) => boolean, rng: Rng): void {
    const { scene, level } = this.world;
    const keys = WALL_DECOR.filter(k => scene.textures.exists(k) && !isPlaceholder(k));
    if (keys.length === 0) return;
    const busy = new Set([...level.lights.map(l => tileIndex(l.col, l.row)), tileIndex(level.exitTile.col, level.exitTile.row),
      tileIndex(level.exitTile.col + 1, level.exitTile.row), ...level.lockedDoors.map(d => tileIndex(d.terminalTile.col, d.terminalTile.row)),
      ...(level.fuseBox ? [tileIndex(level.fuseBox.col, level.fuseBox.row)] : []), ...level.hidingSpots.map(t => tileIndex(t.col, t.row))]);
    for (const room of level.rooms) {
      if (!rng.chance(WALL_DECOR_SHARE)) continue;
      const row = room.y + 1;
      const cols = Array.from({ length: room.w - 2 }, (_, i) => room.x + 1 + i)
        .filter(c => solid(c, row - 1) && !solid(c, row) && !busy.has(tileIndex(c, row)));
      if (cols.length === 0) continue;
      const c = rng.pick(cols), key = rng.pick(keys);
      busy.add(tileIndex(c, row));
      // Fits the front of the wall: as tall as it, keeping the picture's proportions.
      const src = scene.textures.get(key).getSourceImage();
      const h = H - 3, w = Math.min(TILE * 0.95, h * src.width / src.height);
      placeStanding(scene, key, (c + 0.5) * TILE, row * TILE - 2, w).setDepth(DEPTH.floor + 1);
    }
  }

  /** Lamp fixtures on the wall above each lamp. */
  private buildLamps(): void {
    const { scene, level } = this.world;
    for (const lamp of this.world.lighting.lampsInfo()) {
      const key = lamp.emergency ? LAMP_ART.emergency : lamp.flicker ? LAMP_ART.broken : LAMP_ART.normal;
      const width = lamp.emergency ? TILE * 0.55 : TILE * 1.3;
      const col = Math.floor(lamp.x / TILE), row = Math.floor(lamp.y / TILE);
      if (row > 0 && level.rows[row - 1][col] === "#") this.world.addProp(placeStanding(scene, key, lamp.x, row * TILE - 1, width), [{ x: lamp.x, y: row * TILE + 2 }]);
    }
  }
}

/**
 * How far to move a piece standing against a thin wall on its left or right so that it touches
 * the wall (a partition stands in the middle of its tile), world px. 0 elsewhere.
 */
export function sideHug(world: World, col: number, row: number, w: number, h: number): number {
  const thinSide = (c: number) => Array.from({ length: h }, (_, i) => row + i).every(r => {
    const code = c >= 0 && c < MAP_W && r >= 0 && r < MAP_H && world.level.rows[r][c] === "#" ? world.walls[tileIndex(c, r)] : 0;
    return code >= THIN && (code & (ARM_N | ARM_S)) !== 0;
  });
  const gap = TILE / 2 - THIN_WALL / 2;
  return thinSide(col - 1) ? -gap : thinSide(col + w) ? gap : 0;
}

/**
 * An object standing on the floor: its bottom edge sits on `baseY` and it is depth-sorted there,
 * so characters walk in front of or behind it. `width` is in world px.
 */
export function placeStanding(scene: Phaser.Scene, key: string, x: number, baseY: number, width: number): Phaser.GameObjects.Image {
  const img = scene.add.image(x, baseY, key).setOrigin(0.5, 1);
  img.setScale(width / img.width).setDepth(baseY);
  return img;
}
