import Phaser from "phaser";
import { CANVAS_W } from "../core/constants";
import { setMusicVolume } from "../core/audio";
import { settings, updateSettings } from "../core/settings";
import { ToggleRow, backLink, label, slider } from "../ui/components";
import { INK } from "../ui/theme";

export class SettingsScene extends Phaser.Scene {
  constructor() { super("Settings"); }

  create(): void {
    const CX = CANVAS_W / 2;
    label(this, CX, 80, "НАСТРОЙКИ", "h1", INK.title);

    label(this, CX, 170, "Музыка", "body", INK.body);
    const volume = label(this, CX + 130, 205, Math.round(settings.musicVolume * 100) + "%", "small", INK.dim, { origin: [0, 0.5] });
    slider(this, CX, 205, 220, settings.musicVolume, v => { setMusicVolume(v); volume.setText(Math.round(v * 100) + "%"); });

    label(this, CX, 270, "Счётчик FPS", "body", INK.body);
    new ToggleRow<"on" | "off">(this, CX, 305, [
      { id: "on", label: "ВКЛ", tone: "good" },
      { id: "off", label: "ВЫКЛ", tone: "neutral" },
    ], settings.showFps ? "on" : "off", v => updateSettings({ showFps: v === "on" }), { w: 90 });

    backLink(this, () => this.scene.start("Menu"));
  }
}
