// Shadows of standing things. Every piece of furniture and every character lays a soft copy of
// its silhouette on the floor, stretched away from the strongest lights on it: long and swinging
// from a flashlight held low, short from a lamp up on the wall. A shadow stops at the first wall
// (it may climb the wall's front a little; the wall top hides the rest). Furniture also gets a
// soft contact shadow underneath. A shadow shows wherever its floor is lit and in sight, even if
// whatever casts it is not — a monster by a lamp round the corner throws its shadow into your
// corridor before you see it.
import Phaser from "phaser";
import { TILE } from "../core/constants";
import { dist, tileIndex } from "../core/geom";
import type { Vec2 } from "../core/types";
import type { World } from "../game/World";
import type { FrameLight } from "../systems/lighting";
import { DEPTH } from "../ui/theme";
import { THIN, insideShape } from "../world/walls";
import { quality } from "./display";

/** Silhouette textures are this tall (plus padding for the blur). */
const SIL_H = 64;
const SIL_PAD = 4;
const BLUR = 2;
/** Height above the floor of each kind of light, world px (a runner is 30): sets shadow length. */
const LIGHT_HEIGHT = { lamp: 46, beam: 20, glow: 6 };
/** Share of a picture's height that stands up from the floor (the rest is its top, seen from above). */
const UPRIGHT = 0.7;
const MAX_ALPHA = 0.85;
/** How much a silhouette fades towards its far end (1 = to nothing). */
const FAR_FADE = 0.6;
/** Lights weaker than this at the base cast no shadow. */
const MIN_STRENGTH = 0.06;

interface Caster { key: string; x: number; y: number; w: number; h: number; flip: boolean; /** Light at the caster itself (its own flashlight). */ own: Vec2 | null; }

/** Where the foot line is in each silhouette (the textures outlive a round, so does this). */
const ORIGIN = new Map<string, number>();

export class Shadows {
  private pool: Phaser.GameObjects.Image[] = [];

  constructor(private world: World) {
    for (const p of world.props) {
      if (!p.casts) continue;
      const s = p.sprite, w = s.displayWidth;
      world.scene.add.image(s.x, s.y - 2, "fx/shadow").setDepth(DEPTH.shadows).setAlpha(0.7)
        .setDisplaySize(w * 1.35, Math.max(6, Math.min(14, w * 0.45)));
    }
  }

  update(): void {
    const w = this.world, rig = w.camera, level = quality.objectShadows;
    let used = 0;
    if (level > 0) {
      const margin = TILE * 3;
      const inView = (x: number, y: number) => x > rig.viewX - margin && x < rig.viewX + rig.viewW + margin && y > rig.viewY - margin && y < rig.viewY + rig.viewH + margin;
      const beams = w.lighting.lights.filter(l => l.kind === 2);
      const spill = (l: FrameLight) => l.kind === 1 && beams.some(b => b.x === l.x && b.y === l.y);
      const lights = w.lighting.lights.filter(l => l.kind === 2 || (level > 1 && (l.kind === 0 || l.radius >= TILE * 3) && !spill(l)));
      const casters: Caster[] = [];
      for (const p of w.props) {
        const s = p.sprite;
        if (p.casts && s.visible && inView(s.x, s.y)) casters.push({ key: s.texture.key, x: s.x, y: s.y, w: s.displayWidth, h: s.displayHeight, flip: s.flipX, own: null });
      }
      for (const a of w.actors) {
        if (!a.inPlay || a.hiding || !inView(a.x, a.feetY)) continue;
        const v = a.view;
        casters.push({ key: v.texture.key, x: a.x, y: a.feetY, w: v.displayWidth, h: v.displayHeight, flip: v.flipX, own: a });
      }
      for (const c of casters) used = this.cast(c, lights, level, used);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }

  /** Shadows of one caster from its strongest lights; returns the next free pool slot. */
  private cast(c: Caster, lights: FrameLight[], level: number, used: number): number {
    const w = this.world, base = { x: c.x, y: c.y - 1 };
    let total = 0;
    const lit: { l: FrameLight; k: number }[] = [];
    for (const l of lights) {
      if (c.own && dist(l, c.own) < 14) continue;
      if (dist(l, base) < 6) continue;
      const k = w.lighting.strengthAt(l, base);
      if (k < MIN_STRENGTH) continue;
      total += k;
      lit.push({ l, k });
    }
    lit.sort((a, b) => b.k - a.k);
    for (const { l, k } of lit.slice(0, level)) {
      const d = dist(l, base), dx = (base.x - l.x) / d, dy = (base.y - l.y) / d;
      const lightH = l.kind === 0 ? LIGHT_HEIGHT.lamp : l.kind === 2 ? LIGHT_HEIGHT.beam : LIGHT_HEIGHT.glow;
      const up = c.h * UPRIGHT;
      let len = Math.min(c.h * 3, Math.max(c.h * 0.4, d * up / Math.max(lightH - up, lightH * 0.3)));
      len = Math.min(len, this.freeRun(base, dx, dy, len));
      if (len < 3) continue;
      const img = this.image(used++, c.key);
      const sil = img.frame;
      const spread = 1 + 0.25 * Math.min(1, len / c.h);
      img.setPosition(base.x, base.y).setRotation(Math.atan2(dx, -dy)).setFlipX(c.flip)
        .setScale(c.w / (sil.width - SIL_PAD * 2) * spread, len / (sil.height - SIL_PAD * 2))
        .setAlpha(MAX_ALPHA * (k / total) * Math.min(1, k * 4));
    }
    return used;
  }

  /** How far a shadow runs from `p` along (dx, dy) before a wall, up to `max` (plus a little up its front). */
  private freeRun(p: Vec2, dx: number, dy: number, max: number): number {
    const w = this.world;
    for (let s = 4; s < max; s += 3) {
      const x = p.x + dx * s, y = p.y + dy * s, c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      if (!w.sight.isSolid(c, r)) continue;
      const code = w.walls[tileIndex(c, r)];
      if (code < THIN || insideShape(code, x - c * TILE, y - r * TILE)) return s + 6;
    }
    return max;
  }

  private image(i: number, key: string): Phaser.GameObjects.Image {
    const tex = this.silhouette(key);
    let img = this.pool[i];
    if (!img) { img = this.world.scene.add.image(0, 0, tex).setDepth(DEPTH.shadows); this.pool.push(img); }
    if (img.texture.key !== tex) img.setTexture(tex);
    return img.setOrigin(0.5, ORIGIN.get(tex) ?? 1).setVisible(true);
  }

  /** A soft black copy of the picture `key`, made once. */
  private silhouette(key: string): string {
    const out = "shadow:" + key;
    const textures = this.world.scene.textures;
    if (textures.exists(out)) return out;
    const f = textures.getFrame(key);
    const h = SIL_H, w = Math.max(4, Math.round(h * f.cutWidth / Math.max(1, f.cutHeight)));
    const cw = w + SIL_PAD * 2, ch = h + SIL_PAD * 2;
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, SIL_PAD, SIL_PAD, w, h);
    const img = ctx.getImageData(0, 0, cw, ch);
    let a: Float32Array = new Float32Array(cw * ch);
    for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3] / 255;
    for (let pass = 0; pass < 2; pass++) a = blur(a, cw, ch, BLUR);
    // Darkest at the foot, fading towards the far end.
    for (let i = 0; i < a.length; i++) {
      const far = 1 - Math.min(1, Math.max(0, (Math.floor(i / cw) - SIL_PAD) / h));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0;
      img.data[i * 4 + 3] = Math.round(a[i] * (1 - FAR_FADE * far) * 255);
    }
    ctx.putImageData(img, 0, 0);
    textures.addCanvas(out, canvas);
    ORIGIN.set(out, (SIL_PAD + h) / ch);
    return out;
  }
}

/** Box blur of an alpha map, horizontal then vertical. */
function blur(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length), n = r * 2 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))];
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
    out[y * w + x] = s / n;
  }
  return out;
}
