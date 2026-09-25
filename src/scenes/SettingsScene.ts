import Phaser from "phaser";
import { CANVAS_W } from "../core/constants";
import { audio, setVolume } from "../core/audio";
import { settings, updateSettings, type Quality } from "../core/settings";
import { ToggleRow, backLink, label, slider, uiCamera } from "../ui/components";
import { INK } from "../ui/theme";

export class SettingsScene extends Phaser.Scene {
  constructor() { super("Settings"); }

  create(): void {
    uiCamera(this);
    audio.playMusic("menuMusic");
    const CX = CANVAS_W / 2;
    label(this, CX, 70, "НАСТРОЙКИ", "h1", INK.title);

    // Volumes: one row per channel, name on the left, slider, percent on the right.
    const rows: [string, "music" | "sfx" | "ambience", number][] = [
      ["Музыка", "music", settings.musicVolume],
      ["Эффекты", "sfx", settings.sfxVolume],
      ["Окружение", "ambience", settings.ambienceVolume],
    ];
    rows.forEach(([name, bus, value], i) => {
      const y = 150 + i * 46;
      label(this, CX - 150, y, name, "body", INK.body, { origin: [1, 0.5] });
      const pct = label(this, CX + 130, y, Math.round(value * 100) + "%", "small", INK.dim, { origin: [0, 0.5] });
      slider(this, CX, y, 220, value, v => { setVolume(bus, v); pct.setText(Math.round(v * 100) + "%"); });
    });

    label(this, CX, 310, "Счётчик FPS", "body", INK.body);
    new ToggleRow<"on" | "off">(this, CX, 345, [
      { id: "on", label: "ВКЛ", tone: "good" },
      { id: "off", label: "ВЫКЛ", tone: "neutral" },
    ], settings.showFps ? "on" : "off", v => updateSettings({ showFps: v === "on" }), { w: 90 });

    label(this, CX, 400, "Графика", "body", INK.body);
    new ToggleRow<Quality>(this, CX, 435, [
      { id: "low", label: "НИЗКАЯ", tone: "neutral" },
      { id: "medium", label: "СРЕДНЯЯ", tone: "warn" },
      { id: "high", label: "ВЫСОКАЯ", tone: "good" },
    ], settings.quality, v => updateSettings({ quality: v }));
    label(this, CX, 470, "Разрешение меняется после перезагрузки страницы", "tiny", INK.dim);

    backLink(this, () => this.scene.start("Menu"));
  }
}
