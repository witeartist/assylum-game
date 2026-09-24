// Camera post-process that lights the world: pass 1 renders a light map (lamps, flashlights,
// wall shadows, line of sight, explored memory) at reduced resolution, pass 2 composites it
// with the scene and grades the picture.
import Phaser from "phaser";
import { MAP_W, MAP_H, TILE, WALL_HEIGHT } from "../../core/constants";
import { dist } from "../../core/geom";
import type { World } from "../../game/World";
import { quality, RES, VIEW_ZOOM } from "../display";
import type { CameraRig } from "../cameraRig";
import { COMPOSITE_FRAG, LIGHT_FRAG, MAX_LIGHTS } from "./shaders";

export const LIGHTING_PIPELINE = "AssylumLighting";

/** Render targets put row 0 at the bottom; flip when mapping uv → world. */
const FLIP_Y = 1;
const SOFT_SHADOW = 7;
const DANGER_RANGE = TILE * 8;
const HAZE: [number, number, number] = [1.0, 0.9, 0.7];

export class LightingPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  world: World | null = null;
  rig: CameraRig | null = null;
  /** Brightness of remembered (explored, out of sight) floor. */
  memory = 0.13;
  /** Brightness of wall tops. */
  topLight = 0.35;
  private occ: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null = null;
  private vis: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null = null;
  private occPixels = new Uint8Array(MAP_W * MAP_H * 4);
  private visPixels = new Uint8Array(MAP_W * MAP_H * 4);
  private occVersion = -1;
  private visVersion = -1;
  private lightA = new Float32Array(MAX_LIGHTS * 4);
  private lightB = new Float32Array(MAX_LIGHTS * 4);
  private lightC = new Float32Array(MAX_LIGHTS * 4);
  private danger = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: LIGHTING_PIPELINE,
      shaders: [
        { name: "light", fragShader: LIGHT_FRAG },
        { name: "composite", fragShader: COMPOSITE_FRAG },
      ],
      // Target 0 captures the scene; target 1 is the light map.
      renderTarget: [{ scale: 1 }, { scale: quality.lightScale / RES }],
    });
  }

  private ensureTextures(): void {
    const gl = this.gl, r = this.renderer;
    if (!this.occ) this.occ = r.createTexture2D(0, gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.RGBA, this.occPixels, MAP_W, MAP_H);
    if (!this.vis) this.vis = r.createTexture2D(0, gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.RGBA, this.visPixels, MAP_W, MAP_H);
  }

  private upload(w: World): void {
    const gl = this.gl;
    if (w.grid.version !== this.occVersion) {
      const s = w.grid.solid;
      for (let i = 0; i < s.length; i++) { this.occPixels[i * 4] = s[i] * 255; this.occPixels[i * 4 + 3] = 255; }
      this.occ!.update(this.occPixels, MAP_W, MAP_H, false, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST, gl.RGBA);
      this.occVersion = w.grid.version;
    }
    const v = w.vision;
    if (v.version !== this.visVersion) {
      for (let i = 0; i < v.mask.length; i++) {
        this.visPixels[i * 4] = v.mask[i] * 255;
        this.visPixels[i * 4 + 1] = v.explored[i] * 255;
        this.visPixels[i * 4 + 3] = 255;
      }
      this.vis!.update(this.visPixels, MAP_W, MAP_H, false, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.LINEAR, gl.LINEAR, gl.RGBA);
      this.visVersion = v.version;
    }
  }

  onDraw(target: Phaser.Renderer.WebGL.RenderTarget): void {
    const w = this.world, rig = this.rig;
    if (!w || !rig) { this.bindAndDraw(target); return; }
    this.ensureTextures();
    this.upload(w);
    const gl = this.gl;
    const [lightShader, compShader] = this.shaders;
    const lightMap = this.renderTargets[1];

    // Visible world rect, including the camera shake offset (screen px).
    const shake = this.cameraShake();
    const zoom = RES * VIEW_ZOOM;
    const view = { x: rig.viewX - shake.x / zoom, y: rig.viewY - shake.y / zoom, width: rig.viewW, height: rig.viewH };
    const viewer = w.vision.viewer;

    // ── Pass 1: light map ──
    const lights = w.lighting.frameLights(view, viewer, MAX_LIGHTS);
    lights.forEach((l, i) => {
      this.lightA.set([l.x, l.y, l.radius, l.intensity], i * 4);
      this.lightB.set([l.color[0], l.color[1], l.color[2], l.kind], i * 4);
      this.lightC.set([l.dirX, l.dirY, l.cosOuter, l.cosInner], i * 4);
    });
    this.set1i("uOcc", 1, lightShader);
    this.set1i("uVis", 2, lightShader);
    this.set2f("uMapSize", MAP_W, MAP_H, lightShader);
    this.set1f("uTile", TILE, lightShader);
    this.set1f("uWallH", WALL_HEIGHT, lightShader);
    this.set4f("uView", view.x, view.y, view.width, view.height, lightShader);
    this.set1f("uFlipY", FLIP_Y, lightShader);
    this.set2f("uViewer", viewer.x, viewer.y, lightShader);
    this.set1f("uSight", w.vision.radius * TILE, lightShader);
    this.set1f("uMemory", this.memory, lightShader);
    this.set1f("uTopLight", this.topLight, lightShader);
    this.set1f("uSoft", quality.softShadows ? SOFT_SHADOW : 0, lightShader);
    this.set1i("uLightCount", lights.length, lightShader);
    this.set4fv("uLightA", this.lightA, lightShader);
    this.set4fv("uLightB", this.lightB, lightShader);
    this.set4fv("uLightC", this.lightC, lightShader);
    this.bindTexture(this.occ!, 1);
    this.bindTexture(this.vis!, 2);
    gl.activeTexture(gl.TEXTURE0);
    // Write rgb + alpha (beam haze) as is.
    gl.disable(gl.BLEND);
    this.bindAndDraw(target, lightMap, true, true, lightShader);
    gl.enable(gl.BLEND);

    // ── Pass 2: composite ──
    this.danger += (this.dangerLevel(w) - this.danger) * 0.08;
    const vs = rig.toScreen(viewer);
    this.set1i("uLight", 1, compShader);
    this.set2f("uTexel", 1.5 / target.width, 1.5 / target.height, compShader);
    this.set2f("uLightTexel", 1 / lightMap.width, 1 / lightMap.height, compShader);
    this.set1f("uTime", w.scene.time.now / 1000, compShader);
    this.set1f("uDanger", this.danger, compShader);
    this.set1f("uPost", quality.post ? 1 : 0, compShader);
    this.set2f("uViewerUv", vs.x / (rig.viewW * VIEW_ZOOM), FLIP_Y ? 1 - vs.y / (rig.viewH * VIEW_ZOOM) : vs.y / (rig.viewH * VIEW_ZOOM), compShader);
    this.set1f("uAspect", target.width / target.height, compShader);
    this.set1f("uFlipY", FLIP_Y, compShader);
    this.set3f("uHaze", HAZE[0], HAZE[1], HAZE[2], compShader);
    this.bindTexture(lightMap.texture, 1);
    gl.activeTexture(gl.TEXTURE0);
    this.bindAndDraw(target, undefined, true, true, compShader);
  }

  /** How close the nearest hunter is to the local runner, 0..1. */
  private dangerLevel(w: World): number {
    const me = w.local;
    if (me.role !== "runner" || !me.inPlay) return 0;
    let best = 0;
    for (const t of w.threats()) best = Math.max(best, 1 - dist(me, t.authPos) / DANGER_RANGE);
    return Math.max(0, best);
  }

  private cameraShake(): { x: number; y: number } {
    const shake = this.rig!.cam.shakeEffect as unknown as { isRunning: boolean; _offsetX: number; _offsetY: number };
    return shake.isRunning ? { x: shake._offsetX, y: shake._offsetY } : { x: 0, y: 0 };
  }
}
