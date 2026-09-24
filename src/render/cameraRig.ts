// World camera: follows its target smoothly, stays inside the map and converts world
// positions to screen positions for the HUD. The follow is done here (not by Phaser) so the
// scroll is final during update and HUD labels line up exactly with the world.
import type Phaser from "phaser";
import { CANVAS_W, CANVAS_H, WORLD_W, WORLD_H } from "../core/constants";
import type { Vec2 } from "../core/types";
import { RES, VIEW_ZOOM } from "./display";

const LERP = 0.08; // per 1/60 s

export class CameraRig {
  private target: Vec2 | null = null;
  private cx = 0;
  private cy = 0;
  /** Visible world size (world px). */
  readonly viewW = CANVAS_W / VIEW_ZOOM;
  readonly viewH = CANVAS_H / VIEW_ZOOM;

  constructor(readonly cam: Phaser.Cameras.Scene2D.Camera) {
    cam.setZoom(RES * VIEW_ZOOM);
  }

  follow(target: Vec2, snap = false): void {
    this.target = target;
    if (snap) { this.cx = target.x; this.cy = target.y; this.apply(); }
  }

  update(dt: number): void {
    if (!this.target) return;
    const k = 1 - Math.pow(1 - LERP, dt * 60);
    this.cx += (this.target.x - this.cx) * k;
    this.cy += (this.target.y - this.cy) * k;
    this.apply();
  }

  /** Top-left of the visible world rect. */
  get viewX(): number { return this.cx - this.viewW / 2; }
  get viewY(): number { return this.cy - this.viewH / 2; }

  /** World position → logical screen position (960×600 space). */
  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.viewX) * VIEW_ZOOM, y: (p.y - this.viewY) * VIEW_ZOOM };
  }

  private apply(): void {
    this.cx = Math.min(Math.max(this.cx, this.viewW / 2), WORLD_W - this.viewW / 2);
    this.cy = Math.min(Math.max(this.cy, this.viewH / 2 - 16), WORLD_H - this.viewH / 2);
    this.cam.centerOn(this.cx, this.cy);
  }
}
