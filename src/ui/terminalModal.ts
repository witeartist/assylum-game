// The code-entry window of a terminal.
import type Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import type { Minigame } from "../systems/doors";
import { label, panel } from "./components";
import { INK, TONES, UI_DEPTH } from "./theme";

const CODE_INK = "#00ffa0";

export class TerminalModal {
  private objects: Phaser.GameObjects.GameObject[];
  private input!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, code: number[]) {
    const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
    const t = TONES.terminal;
    this.objects = [
      panel(scene, cx, cy, 364, 224, { fill: t.strong, alpha: 0.35 }),
      panel(scene, cx, cy, 356, 216, { fill: t.soft, alpha: 0.97 }),
      label(scene, cx, cy - 78, "ТЕРМИНАЛ ДОСТУПА", "body", t.ink),
      label(scene, cx, cy - 32, "КОД: " + code.join("  "), "code", CODE_INK),
      (this.input = label(scene, cx, cy + 14, "", "h2", INK.text)),
      label(scene, cx, cy + 55, "Нажимайте цифры 1-9", "tiny", "#506450"),
      label(scene, cx, cy + 80, "ESC — отмена", "tiny", "#3c4641"),
    ];
    for (const o of this.objects) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(UI_DEPTH.modal);
  }

  update(mg: Minigame): void {
    const shown = mg.code.map((_, i) => i < mg.input.length ? String(mg.input[i]) : "_");
    this.input.setText("ВВОД: " + shown.join("  "));
    this.input.setColor(mg.feedback === "bad" ? TONES.bad.ink : mg.feedback === "ok" ? TONES.good.ink : INK.text);
  }

  destroy(): void { this.objects.forEach(o => o.destroy()); }
}
