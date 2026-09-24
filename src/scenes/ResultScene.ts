import Phaser from "phaser";
import { CANVAS_W } from "../core/constants";
import { CHARACTERS, BOSS_ID, isCharacterId } from "../data/characters";
import { isDifficultyId } from "../data/difficulty";
import { settings } from "../core/settings";
import type { Outcome } from "../game/roundRules";
import type { ResultData } from "../systems/round";
import { button, label, portrait } from "../ui/components";
import { INK, TONES, type Tone } from "../ui/theme";

const VIEW: Record<Outcome, { title: string; tone: Tone; good: boolean }> = {
  "escaped":   { title: "ВЫ СБЕЖАЛИ!",   tone: "good",    good: true },
  "caught":    { title: "ВАС ПОЙМАЛИ",   tone: "blood",   good: false },
  "hunt-won":  { title: "ОХОТА УДАЛАСЬ", tone: "bad",     good: true },
  "hunt-lost": { title: "ДОБЫЧА УШЛА",   tone: "neutral", good: false },
};

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() { super("Result"); }

  init(data: ResultData): void { this.result = data; }

  create(): void {
    const d = this.result, CX = CANVAS_W / 2;
    const view = VIEW[d.outcome] ?? VIEW.caught;
    const hunter = d.outcome === "hunt-won" || d.outcome === "hunt-lost";
    const def = isCharacterId(d.character) ? CHARACTERS[d.character] : null;

    label(this, CX, 130, view.title, "display", view.tone === "blood" ? INK.title : TONES[view.tone].ink);
    if (def) {
      const img = portrait(this, CX, 222, def.texture, 72);
      if (!view.good) img.setTint(0x505050);
      label(this, CX, 272, def.name, "h2", def.color);
    }

    const lines: string[] = [];
    if (d.outcome === "caught") lines.push("Поймал: " + d.catcherName);
    if (!hunter) lines.push("Ключи: " + d.keysCollected + "/" + d.keysTotal);
    lines.push(hunter
      ? "Поймано: " + d.caught + "/" + d.total + "  ·  Сбежали: " + d.escaped
      : "Спасены: " + d.escaped + "/" + d.total);
    lines.push("Время: " + Math.floor(d.elapsed / 60) + "м " + (d.elapsed % 60) + "с");
    if (d.outcome === "escaped" && d.bossSpawned) lines.push("✓ " + CHARACTERS[BOSS_ID].name + " проснулась — и не догнала");
    const byBoss = d.outcome === "caught" && d.catcherName === CHARACTERS[BOSS_ID].name;
    label(this, CX, 345, lines.join("\n"), "h3", byBoss ? "#50c850" : view.good ? INK.goodSoft : INK.badSoft);

    // After a multiplayer round the session is closed; "again" means a fresh lobby.
    const again = d.multiplayer
      ? { text: "В ЛОББИ", onClick: () => this.scene.start("Lobby") }
      : { text: "СНОВА", onClick: () => this.scene.start("Game", {
          character: d.character, difficulty: isDifficultyId(d.difficulty) ? d.difficulty : settings.difficulty }) };
    button(this, { x: CX - 110, y: 450, w: 200, h: 44, ...again, tone: view.good ? "good" : "blood" });
    button(this, { x: CX + 110, y: 450, w: 200, h: 44, text: "В МЕНЮ", onClick: () => this.scene.start("Menu") });
    button(this, { x: CX, y: 520, w: 200, h: 44, text: "СМЕНА ПЕРСОНАЖА", onClick: () => this.scene.start("Select") });
    this.input.keyboard!.on("keydown-ESC", () => this.scene.start("Menu"));
  }
}
