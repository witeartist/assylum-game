import Phaser from "phaser";
import { CANVAS_W } from "../core/constants";
import { settings, updateSettings } from "../core/settings";
import { CHARACTERS, PLAYABLE_IDS } from "../data/characters";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "../data/difficulty";
import { ToggleRow, backLink, button, label, panel, portrait, uiCamera } from "../ui/components";
import { INK, SURFACE, TONES } from "../ui/theme";
import type { GameSceneData } from "./GameScene";

export function difficultyToggles(scene: Phaser.Scene, y: number, h: number): void {
  new ToggleRow<DifficultyId>(scene, CANVAS_W / 2, y,
    DIFFICULTY_ORDER.map(id => ({ id, label: DIFFICULTIES[id].label, tone: DIFFICULTIES[id].tone })),
    settings.difficulty, id => updateSettings({ difficulty: id }), { h });
}

export class SelectScene extends Phaser.Scene {
  constructor() { super("Select"); }

  create(): void {
    uiCamera(this);
    label(this, CANVAS_W / 2, 60, "ВЫБЕРИ ПЕРСОНАЖА", "h1", INK.title);
    label(this, CANVAS_W / 2, 100, "Собери ключи, почини питание и выберись. Тьма прячет всех — и тебя, и их.", "small", "#785a5a");
    difficultyToggles(this, 138, 30);

    const cardW = 124, cardH = 270, gap = 12, cy = 330;
    const x0 = CANVAS_W / 2 - ((PLAYABLE_IDS.length - 1) * (cardW + gap)) / 2;
    PLAYABLE_IDS.forEach((id, i) => {
      const def = CHARACTERS[id], cx = x0 + i * (cardW + gap);
      const villain = def.role === "hunter";
      const fill = villain ? SURFACE.cardVillain : SURFACE.card;
      const card = panel(this, cx, cy, cardW, cardH, { fill, edge: villain ? SURFACE.edgeVillain : undefined }).setInteractive();
      card.on("pointerover", () => card.setFillStyle(SURFACE.cardHover));
      card.on("pointerout", () => card.setFillStyle(fill));
      portrait(this, cx, cy - 88, def.texture, 64);
      label(this, cx, cy - 22, def.name, "h3", def.color);
      label(this, cx, cy + 4, def.desc, "tiny", INK.dim, { wrap: cardW - 10 });
      if (def.ability) label(this, cx, cy + 50, def.ability.text, "tiny", TONES.warn.ink, { wrap: cardW - 12 });
      button(this, {
        x: cx, y: cy + 108, w: 104, h: 34, kind: "small", tone: villain ? "hunter" : "blood",
        text: villain ? "ИГРАТЬ ЗА" : "ВЫБРАТЬ",
        onClick: () => this.scene.start("Game", { character: id, difficulty: settings.difficulty } satisfies GameSceneData),
      });
    });

    backLink(this, () => this.scene.start("Menu"));
  }
}
