// Things drawn over the lit world without being lit themselves: name tags, terminal labels and
// footstep ripples (you hear steps even in total darkness). Lives in the HUD scene and tracks
// world positions through the camera rig.
import Phaser from "phaser";
import { VIEW_ZOOM } from "../render/display";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { label } from "./components";
import { TONES } from "./theme";

const TAG_GAP = 3;

export class WorldOverlay {
  private tags = new Map<Actor, Phaser.GameObjects.Text>();
  private terminals: Phaser.GameObjects.Text[];
  private ripples: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, private world: World) {
    this.ripples = scene.add.graphics();
    this.terminals = world.doors.doors.map(() => label(scene, 0, 0, "", "tag", TONES.terminal.ink));
  }

  update(): void {
    const w = this.world, rig = w.camera;
    for (const a of w.actors) {
      let tag = this.tags.get(a);
      if (!tag) { tag = label(this.scene, 0, 0, a.def.name, "tag", a.def.color); this.tags.set(a, tag); }
      tag.setVisible(a.shown);
      if (!a.shown) continue;
      const p = rig.toScreen({ x: a.x, y: a.feetY - a.def.height - TAG_GAP });
      tag.setPosition(Math.round(p.x), Math.round(p.y));
    }
    w.doors.doors.forEach((d, i) => {
      const t = this.terminals[i];
      const visible = w.vision.isVisible(d.terminal);
      t.setVisible(visible);
      if (!visible) return;
      const { text, tone } = w.doors.label(i);
      const p = rig.toScreen({ x: d.terminal.x, y: d.terminal.y - d.terminal.displayHeight - TAG_GAP });
      t.setText(text).setColor(TONES[tone].ink).setPosition(Math.round(p.x), Math.round(p.y));
    });
    const g = this.ripples;
    g.clear();
    for (const r of w.noise.ripples) {
      const progress = r.age / r.life, alpha = 0.35 * (1 - progress);
      if (alpha < 0.01) continue;
      const p = rig.toScreen(r);
      g.lineStyle(1.5, 0x6478a0, alpha);
      g.strokeCircle(p.x, p.y, r.radius * progress * VIEW_ZOOM);
    }
  }
}
