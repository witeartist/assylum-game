// Darkness overlay drawn on a small canvas every frame: black everywhere except what the
// viewer can see, lit by lamps, the flashlight cone and the hunter's flash; footstep ripples
// show through. (Stage 2 replaces this with a GPU lighting shader.)
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H, MAP_W, MAP_H, TILE } from "../core/constants";
import { angleDiff, tileIndex, worldToTile } from "../core/geom";
import { FLASHLIGHT_MODES, FOX_FLASH } from "../data/balance";
import type { World } from "../game/World";
import { DEPTH } from "../ui/theme";

const SCALE = 2;
const TEXTURE = "__fog";
const MARGIN = 48;
const AMBIENT_RADIUS = 2.5;
/** Hunters see as if carrying the widest flashlight. */
const HUNTER_VIEW = { on: true, mode: 3 };

export class FogOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: Phaser.Textures.CanvasTexture;

  constructor(private world: World) {
    const scene = world.scene;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.ceil(CANVAS_W / SCALE);
    this.canvas.height = Math.ceil(CANVAS_H / SCALE);
    this.ctx = this.canvas.getContext("2d")!;
    if (scene.textures.exists(TEXTURE)) scene.textures.remove(TEXTURE);
    this.texture = scene.textures.addCanvas(TEXTURE, this.canvas)!;
    scene.add.image(CANVAS_W / 2, CANVAS_H / 2, TEXTURE).setScrollFactor(0).setDepth(DEPTH.fog).setDisplaySize(CANVAS_W, CANVAS_H);
    // Camera shake also moves this screen-fixed overlay; black margins keep the edges covered.
    const m = MARGIN;
    for (const [x, y, w, h] of [
      [CANVAS_W / 2, -m / 2, CANVAS_W + 2 * m, m], [CANVAS_W / 2, CANVAS_H + m / 2, CANVAS_W + 2 * m, m],
      [-m / 2, CANVAS_H / 2, m, CANVAS_H], [CANVAS_W + m / 2, CANVAS_H / 2, m, CANVAS_H],
    ]) scene.add.rectangle(x, y, w, h, 0x000000).setScrollFactor(0).setDepth(DEPTH.fog);
    scene.events.once("shutdown", () => { if (scene.textures.exists(TEXTURE)) scene.textures.remove(TEXTURE); });
  }

  render(): void {
    const w = this.world, ctx = this.ctx;
    const cam = w.scene.cameras.main;
    const viewer = w.vision.viewer;
    const vt = worldToTile(viewer);
    const mask = w.vision.mask, lamps = w.lighting.lampLevel;
    const sight = w.vision.radius;
    const flicker = w.lighting.flicker;
    const light = w.local.role === "hunter" ? HUNTER_VIEW : viewer.flashlight;
    const beam = light.on ? FLASHLIGHT_MODES[light.mode - 1] : null;

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const tileS = TILE / SCALE;
    const offX = cam.scrollX / SCALE, offY = cam.scrollY / SCALE;
    const c0 = Math.max(0, Math.floor(cam.scrollX / TILE) - 1), c1 = Math.min(MAP_W - 1, Math.ceil((cam.scrollX + CANVAS_W) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.scrollY / TILE) - 1), r1 = Math.min(MAP_H - 1, Math.ceil((cam.scrollY + CANVAS_H) / TILE) + 1);

    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = tileIndex(col, row);
        if (!mask[i]) continue;
        const dx = col - vt.col, dy = row - vt.row;
        const d = Math.hypot(dx, dy);
        let alpha = d < AMBIENT_RADIUS ? 1 - d / AMBIENT_RADIUS : 0;
        if (lamps[i] > 0) {
          // Lamp light fades out towards the edge of the view distance.
          const fade = Math.max(0, (d - sight * 0.35) / (sight * 0.65));
          alpha = Math.max(alpha, lamps[i] * (1 - Math.min(1, fade * 0.9)));
        }
        if (beam && d > 0.5 && d <= beam.rangeTiles) {
          const off = angleDiff(Math.atan2(dy, dx), viewer.facing);
          if (off <= beam.halfAngle) alpha = Math.max(alpha, (1 - d / beam.rangeTiles) * (1 - off / beam.halfAngle) * 0.95);
        }
        alpha -= flicker;
        if (alpha < 0.01) continue;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillRect(col * tileS - offX, row * tileS - offY, tileS + 0.5, tileS + 0.5);
      }
    }

    const flash = w.foxFlash;
    if (flash.active) {
      const ft = worldToTile(flash), R = FOX_FLASH.radiusTiles;
      for (let row = Math.max(0, ft.row - R); row <= Math.min(MAP_H - 1, ft.row + R); row++) {
        for (let col = Math.max(0, ft.col - R); col <= Math.min(MAP_W - 1, ft.col + R); col++) {
          if (!mask[tileIndex(col, row)]) continue;
          const fd = Math.hypot(col - ft.col, row - ft.row);
          if (fd > R) continue;
          ctx.globalAlpha = Math.max(0, 0.95 - fd / R * 0.5);
          ctx.fillRect(col * tileS - offX, row * tileS - offY, tileS + 0.5, tileS + 0.5);
        }
      }
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#6478a0";
    for (const r of w.noise.ripples) {
      const progress = r.age / r.life;
      const radius = r.radius * progress / SCALE;
      const a = 0.3 * (1 - progress);
      if (a < 0.01 || radius < 1) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(r.x / SCALE - offX, r.y / SCALE - offY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.texture.refresh();
  }
}
