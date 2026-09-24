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
import { LAMP_ART } from "../data/furniture";
import type { World } from "../game/World";
import { buildRoomLookup } from "../world/level";
import { DEPTH } from "../ui/theme";
import { SURFACES, WALL_FACE_ART } from "./surfaces";
import { isPlaceholder } from "./textures";

/** Chunk side in world px: few draw calls, a texture size every GPU supports. */
const CHUNK = 1024;
const H = WALL_HEIGHT;
const AO_RES = 8;      // AO texels per tile
const AO_RADIUS = 3;   // blur radius, AO texels
const AO_STRENGTH = 0.55;
const CAP_TINT = 0x6a6a6a;

interface Stamp {
  key: string;
  frame?: string;
  x: number; y: number;
  sx: number; sy: number;
  rotation?: number;
  alpha?: number;
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

/** Bake stamps into chunked render textures at `depth`. */
function bake(scene: Phaser.Scene, stamps: Stamp[], depth: number): Phaser.GameObjects.RenderTexture[] {
  const img = scene.make.image({ key: stamps[0]?.key ?? "__DEFAULT" }, false);
  const out: Phaser.GameObjects.RenderTexture[] = [];
  const worldW = MAP_W * TILE, worldH = MAP_H * TILE;
  // Rows start WALL_HEIGHT above the map: the tops of row-0 walls are drawn there.
  for (let top = -H; top < worldH; top += CHUNK) {
    const bottom = Math.min(top + CHUNK, worldH);
    for (let cx = 0; cx < worldW; cx += CHUNK) {
      const w = Math.min(CHUNK, worldW - cx), h = bottom - top;
      const mine = stamps.filter(s => s.bounds[2] > cx && s.bounds[0] < cx + w && s.bounds[3] > top && s.bounds[1] < bottom);
      if (mine.length === 0) continue;
      const rt = scene.add.renderTexture(cx, top, w, h).setOrigin(0).setDepth(depth);
      rt.beginDraw();
      for (const s of mine) {
        img.setTexture(s.key, s.frame).setOrigin(s.originX ?? 0, s.originY ?? 0).setScale(s.sx, s.sy)
          .setRotation(s.rotation ?? 0).setAlpha(s.alpha ?? 1);
        rt.batchDraw(img, s.x - cx, s.y - top);
      }
      rt.endDraw();
      out.push(rt);
    }
  }
  img.destroy();
  return out;
}

/** Soft darkening of the floor near walls, as a black texture with alpha. */
function ambientOcclusion(scene: Phaser.Scene, solidAt: (c: number, r: number) => boolean): string {
  const w = MAP_W * AO_RES, h = MAP_H * AO_RES;
  let open = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) open[y * w + x] = solidAt(Math.floor(x / AO_RES), Math.floor(y / AO_RES)) ? 0 : 1;
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

    // ── Floor layer ──
    const floor: Stamp[] = [];
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      if (solid(c, r)) continue;
      const i = lookup[tileIndex(c, r)];
      const room = i >= 0 ? level.rooms[i] : null;
      const inside = room && c > room.x && c < room.x + room.w - 1 && r > room.y && r < room.y + room.h - 1;
      floor.push(surfaceStamp(scene, inside ? ROOMS[room.type].floor : CORRIDOR_FLOOR, c * TILE, r * TILE, TILE, TILE));
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
    const ao = ambientOcclusion(scene, solid);
    const aoScale = TILE / AO_RES;
    floor.push({ key: ao, x: 0, y: 0, sx: aoScale, sy: aoScale, originX: 0, originY: 0, bounds: [0, 0, MAP_W * TILE, MAP_H * TILE] });
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      if (solid(c, r) && !solid(c, r + 1)) floor.push(surfaceStamp(scene, WALL_FACE, c * TILE, (r + 1) * TILE - H, TILE, H));
    }
    bake(scene, floor, DEPTH.floor);

    // ── Caps layer: wall tops near walkable space (deep inside wall masses stays black) ──
    const caps: Stamp[] = [];
    const nearFloor = (c: number, r: number) => {
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (!solid(c + dc, r + dr)) return true;
      return false;
    };
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      if (solid(c, r) && nearFloor(c, r)) caps.push(surfaceStamp(scene, WALL_TOP, c * TILE, r * TILE - H, TILE, TILE, r * TILE));
    }
    // Wall tops are darker than any floor, so walls read as solid masses.
    bake(scene, caps, DEPTH.caps).forEach(rt => rt.setTint(CAP_TINT));
    this.drawCapEdges(solid);

    for (const f of level.furniture) {
      placeStanding(scene, f.key, (f.col + f.w / 2) * TILE, (f.row + f.h) * TILE - 1, f.w * TILE * 0.96);
    }
    this.buildDoors();
    this.buildLamps();
    world.events.on("doorOpened", ({ index }) => { this.doorParts[index]?.forEach(p => p.destroy()); });
  }

  /** Thin lines that make wall tops read as solid blocks: a lit rim above faces, dark outlines elsewhere. */
  private drawCapEdges(solid: (c: number, r: number) => boolean): void {
    const g = this.world.scene.add.graphics().setDepth(DEPTH.caps + 1);
    for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
      if (!solid(c, r)) continue;
      const x = c * TILE, y = r * TILE - H;
      if (!solid(c, r + 1)) { g.fillStyle(0xa3aca8, 0.7); g.fillRect(x, y + TILE - 2, TILE, 2); }
      g.fillStyle(0x050606, 0.9);
      if (!solid(c, r - 1)) g.fillRect(x, y, TILE, 1);
      if (!solid(c - 1, r)) g.fillRect(x, y, 1, TILE + (solid(c, r + 1) ? 0 : H));
      if (!solid(c + 1, r)) g.fillRect(x + TILE - 1, y, 1, TILE + (solid(c, r + 1) ? 0 : H));
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

  /** Lamp fixtures on the wall above each lamp. */
  private buildLamps(): void {
    const { scene, level } = this.world;
    for (const lamp of this.world.lighting.lampsInfo()) {
      const key = lamp.emergency ? LAMP_ART.emergency : lamp.flicker ? LAMP_ART.broken : LAMP_ART.normal;
      const width = lamp.emergency ? TILE * 0.55 : TILE * 1.3;
      const col = Math.floor(lamp.x / TILE), row = Math.floor(lamp.y / TILE);
      if (row > 0 && level.rows[row - 1][col] === "#") placeStanding(scene, key, lamp.x, row * TILE - 1, width);
    }
  }
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
