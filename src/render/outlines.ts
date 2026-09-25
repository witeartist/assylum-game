// Outlines of what you can pick up or use: a thin light rim around pickups on the floor — keys,
// items, fuses — pulsing softly, and a bright rim around whatever E works on right now (a door,
// a locker, a bed, a terminal, the fuse box). Rims are lit like the rest of the world, so the
// dark still hides everything.
import Phaser from "phaser";
import type { World } from "../game/World";
import { OUTLINE } from "../ui/theme";
import { RES, VIEW_ZOOM } from "./display";

interface RimArt { key: string; pad: number; w: number; h: number; }

/** Rim pictures made so far (the textures outlive a round, so does this). */
const ART = new Map<string, RimArt>();

export class Outlines {
  private rims = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.Image>();
  private focus: Phaser.GameObjects.Image;
  private t = 0;

  constructor(private world: World) {
    this.focus = world.scene.add.image(0, 0, "__WHITE").setVisible(false);
  }

  update(dt: number): void {
    const w = this.world;
    this.t += dt;
    const pickups: Phaser.GameObjects.Image[] = [];
    if (w.local.role === "runner") {
      for (const it of w.items.ground) if (!it.taken) pickups.push(it.sprite);
      for (const k of w.objectives.keys) if (!k.taken) pickups.push(k.sprite);
      for (const f of w.power.fuses) if (f.state === "ground") pickups.push(f.sprite);
    }
    const current = new Set(pickups);
    for (const [s, rim] of this.rims) if (!current.has(s)) { rim.destroy(); this.rims.delete(s); }
    pickups.forEach((s, i) => {
      let rim = this.rims.get(s);
      if (!rim) { rim = w.scene.add.image(0, 0, "__WHITE"); this.rims.set(s, rim); }
      this.follow(rim, s, OUTLINE.pickup * (0.7 + 0.3 * Math.sin(this.t * 3.2 + i * 1.7)));
    });
    const target = w.interact.current()?.target;
    if (target && target.active && target.visible) this.follow(this.focus, target, OUTLINE.focus);
    else this.focus.setVisible(false);
  }

  /** Put `rim` around `s`, exactly over it. */
  private follow(rim: Phaser.GameObjects.Image, s: Phaser.GameObjects.Image, alpha: number): void {
    const dw = Math.abs(s.displayWidth), dh = Math.abs(s.displayHeight);
    const art = this.rimArt(s.texture.key, s.frame, Math.max(dw, dh));
    const cw = art.w + art.pad * 2, ch = art.h + art.pad * 2;
    if (rim.texture.key !== art.key) rim.setTexture(art.key);
    rim.setOrigin((art.pad + s.originX * art.w) / cw, (art.pad + s.originY * art.h) / ch)
      .setPosition(s.x, s.y).setRotation(s.rotation).setScale(dw / art.w, dh / art.h).setFlip(s.flipX, s.flipY)
      .setDepth(s.depth - 0.01).setTint(OUTLINE.color).setAlpha(alpha * s.alpha).setVisible(s.visible);
  }

  /** A white ring around the picture `key`, drawn at about the size it takes on screen. */
  private rimArt(key: string, f: Phaser.Textures.Frame, size: number): RimArt {
    const px = Math.max(16, Math.min(320, Math.round(size * VIEW_ZOOM * RES / 4) * 4));
    const name = `outline:${key}:${px}`;
    const known = ART.get(name);
    if (known) return known;
    const k = px / Math.max(f.cutWidth, f.cutHeight);
    const w = Math.max(1, Math.round(f.cutWidth * k)), h = Math.max(1, Math.round(f.cutHeight * k));
    const r = Math.max(1, Math.round(OUTLINE.width * RES)), pad = r + 1;
    const cw = w + pad * 2, ch = h + pad * 2;
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, pad, pad, w, h);
    const img = ctx.getImageData(0, 0, cw, ch);
    const a = new Float32Array(cw * ch);
    for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3] / 255;
    // The ring: the picture grown by r, minus the picture itself.
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let grown = 0;
      for (let dy = -r; dy <= r && grown < 1; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || dx * dx + dy * dy > r * r + r) continue;
        grown = Math.max(grown, a[ny * cw + nx]);
      }
      const i = y * cw + x;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(grown * (1 - a[i]) * 255);
    }
    ctx.putImageData(img, 0, 0);
    this.world.scene.textures.addCanvas(name, canvas);
    const art = { key: name, pad, w, h };
    ART.set(name, art);
    return art;
  }
}
