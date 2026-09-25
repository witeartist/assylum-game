import Phaser from "phaser";
import { audio } from "../core/audio";
import { CANVAS_W } from "../core/constants";
import { CHARACTERS, HERO_IDS } from "../data/characters";
import { backdrop, button, label, panel, portrait, reveal, scrim, uiCamera } from "../ui/components";
import { INK, SURFACE, TONES, toCss } from "../ui/theme";

export class MenuScene extends Phaser.Scene {
  constructor() { super("Menu"); }

  create(): void {
    uiCamera(this);
    audio.playMusic("menuMusic");
    const CX = CANVAS_W / 2;
    backdrop(this, "ui/menu_art");
    scrim(this, 0.72);

    reveal(this, label(this, CX, 56, "A S Y L U M", "display", INK.title), 0, { dy: 20, duration: 800 });
    reveal(this, label(this, CX, 104, "психиатрическая больница №6", "small", "#967878"), 300, { duration: 600 });
    reveal(this, label(this, CX, 126, "Дверь в палату 13 никогда не закрывалась...", "tiny", "#645050"), 500, { duration: 600 });

    // The heroes slide in from both sides.
    const spacing = 90, rowY = 185;
    HERO_IDS.forEach((id, i) => {
      const def = CHARACTERS[id];
      const px = CX + (i - (HERO_IDS.length - 1) / 2) * spacing;
      reveal(this, portrait(this, px, rowY, def.texture, 34), 400 + i * 100, { dx: i < HERO_IDS.length / 2 ? 60 : -60, duration: 500, ease: "Back.easeOut" });
      reveal(this, label(this, px, rowY + 25, def.name, "tiny", def.color), 600 + i * 100);
    });

    const vs = label(this, CX, 240, "VS", "h2", TONES.bad.ink);
    reveal(this, vs, 900);
    this.tweens.add({ targets: vs, scale: 1.2, yoyo: true, repeat: -1, duration: 1200, ease: "Sine.easeInOut" });
    // …and one of them, infected.
    const infected = CHARACTERS[HERO_IDS[Math.floor(Math.random() * HERO_IDS.length)]];
    reveal(this, portrait(this, CX, 280, infected.infected, 42), 1000, { duration: 500 });
    reveal(this, label(this, CX, 308, "[ ОДИН ИЗ НИХ ]", "body", toCss(TONES.hunter.strong)), 1100);

    reveal(this, panel(this, CX, 415, 280, 160, { alpha: 0, edge: SURFACE.edge }), 1200);
    const items = [
      { text: "ИГРАТЬ ОДНОМУ", onClick: () => this.scene.start("Select") },
      { text: "МУЛЬТИПЛЕЕР", onClick: () => this.scene.start("Lobby") },
      { text: "НАСТРОЙКИ", onClick: () => this.scene.start("Settings") },
    ];
    items.forEach((it, i) => {
      const b = button(this, { x: CX, y: 373 + i * 42, w: 240, h: 36, text: "[ " + it.text + " ]", onClick: it.onClick });
      reveal(this, b.objects, 1300 + i * 120, { duration: 350 });
    });

    const kb = this.input.keyboard!;
    kb.on("keydown-ENTER", () => this.scene.start("Select"));
    kb.on("keydown-SPACE", () => this.scene.start("Select"));
  }
}
