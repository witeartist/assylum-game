// The terminal window: digits flash one by one, then you type them back.
import type Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import type { Minigame } from "../systems/doors";
import { label, panel } from "./components";
import { INK, TONES, UI_DEPTH } from "./theme";

const CODE_INK = "#00ffa0";

export class TerminalModal {
  private objects: Phaser.GameObjects.GameObject[];
  private title!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Text;
  private input!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
    const t = TONES.terminal;
    this.objects = [
      panel(scene, cx, cy, 364, 224, { fill: t.strong, alpha: 0.35 }),
      panel(scene, cx, cy, 356, 216, { fill: t.soft, alpha: 0.97 }),
      label(scene, cx, cy - 84, "ТЕРМИНАЛ ДОСТУПА", "body", t.ink),
      (this.title = label(scene, cx, cy - 56, "", "small", INK.dim)),
      (this.flash = label(scene, cx, cy - 16, "", "display", CODE_INK)),
      (this.input = label(scene, cx, cy + 34, "", "h2", INK.text)),
      label(scene, cx, cy + 66, "Ошибка — тревога и новый код", "tiny", "#506450"),
      label(scene, cx, cy + 86, "ESC — отмена", "tiny", "#3c4641"),
    ];
    for (const o of this.objects) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(UI_DEPTH.modal);
  }

  update(mg: Minigame): void {
    const showing = mg.phase === "show";
    this.title.setText(showing ? "ЗАПОМНИ КОД" : "ВВЕДИ КОД: цифры 1–9");
    this.flash.setText(showing && mg.shown >= 0 ? String(mg.code[mg.shown]) : "");
    const slots = mg.code.map((_, i) => i < mg.input.length ? String(mg.input[i]) : "_");
    this.input.setText(showing ? mg.code.map(() => "·").join("  ") : slots.join("  "));
    this.input.setColor(mg.feedback === "bad" ? TONES.bad.ink : mg.feedback === "ok" ? TONES.good.ink : INK.text);
  }

  destroy(): void { this.objects.forEach(o => o.destroy()); }
}
