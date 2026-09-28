import Phaser from "phaser";
import { audio } from "../core/audio";
import { CANVAS_W } from "../core/constants";
import { settings, updateSettings } from "../core/settings";
import type { Role } from "../core/types";
import { CHARACTERS, HERO_IDS, KIT_IDS, KITS, kitsFor, type KitId } from "../data/characters";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "../data/difficulty";
import { ToggleRow, backLink, button, label, panel, portrait, uiCamera } from "../ui/components";
import { INK, SURFACE, TONES } from "../ui/theme";
import type { GameSceneData } from "./GameScene";
import { heroTexture } from "../render/characterArt";

export function difficultyToggles(scene: Phaser.Scene, y: number, h: number): void {
  new ToggleRow<DifficultyId>(scene, CANVAS_W / 2, y,
    DIFFICULTY_ORDER.map(id => ({ id, label: DIFFICULTIES[id].label, tone: DIFFICULTIES[id].tone })),
    settings.difficulty, id => updateSettings({ difficulty: id }), { h });
}

type KitPick = KitId | "random";

/**
 * Solo: pick a hero, then run (against one of the others, infected) or be the infected one
 * yourself; the villain's kit is picked here too. The choice is remembered.
 */
export class SelectScene extends Phaser.Scene {
  constructor() { super("Select"); }

  create(): void {
    uiCamera(this);
    audio.playMusic("menuMusic");
    const CX = CANVAS_W / 2, role = settings.role, kit = settings.kit, villain = role === "hunter";
    label(this, CX, 44, "ВЫБЕРИ ПЕРСОНАЖА", "h1", INK.title);
    label(this, CX, 78, "Собери ключи, почини питание и выберись. Тьма прячет всех — и тебя, и их.", "small", "#785a5a");
    difficultyToggles(this, 110, 26);

    new ToggleRow<Role>(this, CX, 148, [
      { id: "runner", label: "БЕГЛЕЦ", tone: "blood" },
      { id: "hunter", label: "ЗАРАЖЁННЫЙ", tone: "hunter" },
    ], role, r => { updateSettings({ role: r }); this.scene.restart(); }, { w: 160, h: 28 });

    const kitY = 186, owner = kit ? KITS[kit].owner : undefined;
    label(this, CX - 190, kitY, villain ? "Твой набор:" : "Злодей:", "small", "#786464", { origin: [1, 0.5] });
    new ToggleRow<KitPick>(this, CX + 40, kitY, [
      ...KIT_IDS.map(id => ({ id, label: KITS[id].name.toUpperCase(), tone: "hunter" as const })),
      { id: "random", label: "СЛУЧАЙНО", tone: "neutral" },
    ], kit ?? "random", k => { updateSettings({ kit: k === "random" ? null : k }); this.scene.restart(); }, { w: 104, h: 26, gap: 12 });
    const whose = owner ? " Свой набор " + CHARACTERS[owner].name + (villain ? " — только за неё." : " — злодеем будет она.") : "";
    const about = kit
      ? (villain ? KITS[kit].text + "." : "Против тебя — один из героев, заражённый: " + KITS[kit].threat + ".") + whose
      : villain ? "Набор выпадет случайно." : "Злодеем станет один из героев; кто и с каким набором — случайно.";
    label(this, CX, 214, about, "tiny", TONES.warn.ink, { wrap: CANVAS_W * 0.8 });

    const cardW = 124, cardH = 262, gap = 12, cy = 388;
    const x0 = CX - ((HERO_IDS.length - 1) * (cardW + gap)) / 2;
    HERO_IDS.forEach((id, i) => {
      const def = CHARACTERS[id], cx = x0 + i * (cardW + gap);
      const fill = villain ? SURFACE.cardVillain : SURFACE.card;
      const card = panel(this, cx, cy, cardW, cardH, { fill, edge: villain ? SURFACE.edgeVillain : undefined }).setInteractive();
      card.on("pointerover", () => card.setFillStyle(SURFACE.cardHover));
      card.on("pointerout", () => card.setFillStyle(fill));
      // A hero's own kit: only that hero can take it — and a runner can't be the one it infects.
      const barred = !!owner && (villain ? owner !== id : owner === id);
      portrait(this, cx, cy - 84, heroTexture(def, villain), 64).setAlpha(barred ? 0.4 : 1);
      label(this, cx, cy - 20, def.name, "h3", villain && kit ? KITS[kit].color : def.color);
      if (villain) {
        const own = kitsFor(id).find(k => KITS[k].owner === id);
        const line = barred ? "это набор " + CHARACTERS[owner!].name : "набор: " + (kit ? KITS[kit].name : "случайный");
        label(this, cx, cy + 6, line, "tiny", INK.dim, { wrap: cardW - 10 });
        if (own && !barred && kit !== own) label(this, cx, cy + 40, "свой набор: " + KITS[own].name, "tiny", KITS[own].color, { wrap: cardW - 10 });
      } else {
        label(this, cx, cy + 6, def.desc, "tiny", INK.dim, { wrap: cardW - 10 });
        if (def.ability) label(this, cx, cy + 50, def.ability.text, "tiny", TONES.warn.ink, { wrap: cardW - 12 });
      }
      button(this, {
        x: cx, y: cy + 104, w: 104, h: 34, kind: "small", tone: villain ? "hunter" : "blood",
        text: barred ? (villain ? "НЕ ЕЁ НАБОР" : "ОНА — ЗЛОДЕЙ") : villain ? "ИГРАТЬ ЗА" : "ВЫБРАТЬ", enabled: !barred,
        onClick: () => this.scene.start("Game", { character: id, role, kit, difficulty: settings.difficulty } satisfies GameSceneData),
      });
    });

    backLink(this, () => this.scene.start("Menu"));
  }
}
