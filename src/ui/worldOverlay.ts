// Things drawn over the lit world without being lit themselves: name tags, terminal labels,
// ripples of sounds you can hear (you hear steps even in total darkness), marks from a map piece
// and what some characters sense through the dark. Lives in the HUD scene and tracks world
// positions through the camera rig.
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H, TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import { RIPPLE_LIFE } from "../data/balance";
import { VIEW_ZOOM } from "../render/display";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { NoiseEvent } from "../systems/noise";
import { label } from "./components";
import { TONES, UI_DEPTH } from "./theme";

const TAG_GAP = 3;
/** Ripple colours: runners, monsters, everything else (glass, alarms…). */
const RIPPLE = { runner: 0x6478a0, monster: 0xc0302a, thing: 0xb8a060 };
const EDGE = 26;

export class WorldOverlay {
  private tags = new Map<Actor, Phaser.GameObjects.Text>();
  private terminals: Phaser.GameObjects.Text[];
  private g: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene, private world: World) {
    this.g = scene.add.graphics().setDepth(UI_DEPTH.bar - 1);
    this.terminals = world.doors.doors.map(() => label(scene, 0, 0, "", "tag", TONES.terminal.ink));
  }

  update(): void {
    const w = this.world, rig = w.camera;
    this.t += this.scene.game.loop.delta / 1000;
    for (const a of w.actors) {
      let tag = this.tags.get(a);
      if (!tag) { tag = label(this.scene, 0, 0, a.def.name, "tag", a.def.color); this.tags.set(a, tag); }
      tag.setVisible(a.shown).setAlpha(a.fade);
      if (!a.shown) continue;
      const p = rig.toScreen({ x: a.x, y: a.feetY - a.def.height - TAG_GAP });
      tag.setPosition(Math.round(p.x), Math.round(p.y));
    }
    w.doors.doors.forEach((d, i) => {
      const t = this.terminals[i];
      const visible = !d.open && w.vision.canSeePoint(d.terminal, true);
      t.setVisible(visible);
      if (!visible) return;
      const { text, tone } = w.doors.label(i);
      const p = rig.toScreen({ x: d.terminal.x, y: d.terminal.y - d.terminal.displayHeight - TAG_GAP });
      t.setText(text).setColor(TONES[tone].ink).setPosition(Math.round(p.x), Math.round(p.y));
    });

    const g = this.g;
    g.clear();
    const viewer = w.vision.viewer;
    for (const e of w.noise.events) this.ripple(e, viewer);
    let icon = 0;
    const mark = (p: Vec2, key: string, alpha: number, edge = false) => { icon = this.mark(icon, p, key, alpha, edge); };
    for (const m of w.items.markers) mark(m, m.icon, Math.min(1, m.left / 3) * (0.7 + 0.3 * Math.sin(this.t * 5)), true);
    const sense = w.local.def.ability;
    if (w.local.inPlay && sense?.objectSense) {
      const r = sense.objectSense * TILE;
      for (const k of w.objectives.keys) if (!k.taken && dist(w.local, k.sprite) < r) mark(k.sprite, "ui/icon_key", 0.55);
      for (const s of w.hiding.spots) if (dist(w.local, s) < r * 0.7) mark(s, "ui/icon_hide", 0.35);
    }
    if (w.local.inPlay && sense?.itemSense) {
      const r = sense.itemSense * TILE;
      for (const it of w.items.ground) {
        if (it.taken || dist(w.local, it) > r) continue;
        const p = rig.toScreen(it), k = 0.5 + 0.5 * Math.sin(this.t * 4 + it.x);
        g.fillStyle(0xfff2c0, 0.25 + 0.35 * k).fillCircle(p.x, p.y, 1.5 + k * 1.5);
      }
    }
    for (let i = icon; i < this.icons.length; i++) this.icons[i].setVisible(false);
  }

  /** A sound's ring, if the viewer could hear it (your own steps show faintly). */
  private ripple(e: NoiseEvent, viewer: Actor): void {
    const w = this.world, own = e.source === viewer;
    if (!own && !w.noise.hears(viewer, e)) return;
    const progress = e.age / RIPPLE_LIFE;
    const alpha = (own ? 0.12 : 0.4) * (1 - progress);
    if (alpha < 0.01) return;
    const who = e.source?.role;
    const color = who === "runner" ? RIPPLE.runner : who ? RIPPLE.monster : RIPPLE.thing;
    const p = this.world.camera.toScreen(e);
    const r = Math.min(e.radius, TILE * 4) * (0.25 + progress * 0.75) * VIEW_ZOOM;
    this.g.lineStyle(who && who !== "runner" ? 2 : 1.5, color, alpha).strokeCircle(p.x, p.y, r);
  }

  /** An icon over a world point; `edge`: if it's off screen, pin it to the border. */
  private mark(i: number, at: Vec2, key: string, alpha: number, edge: boolean): number {
    let p = this.world.camera.toScreen(at);
    const off = p.x < 0 || p.y < 0 || p.x > CANVAS_W || p.y > CANVAS_H;
    if (off && !edge) return i;
    if (off) p = { x: Phaser.Math.Clamp(p.x, EDGE, CANVAS_W - EDGE), y: Phaser.Math.Clamp(p.y, EDGE + 30, CANVAS_H - EDGE) };
    let img = this.icons[i];
    if (!img) { img = this.scene.add.image(0, 0, key).setDepth(UI_DEPTH.bar - 1); this.icons.push(img); }
    img.setTexture(key).setVisible(true).setAlpha(alpha).setPosition(p.x, p.y);
    img.setScale(18 / Math.max(img.width, img.height));
    return i + 1;
  }
}
