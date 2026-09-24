// Heads-up display, drawn by its own scene on top of the game so world effects (lighting,
// camera shake, zoom) never touch it. It only reads the world and listens to its events.
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import { settings } from "../core/settings";
import { ROOMS } from "../data/rooms";
import type { World } from "../game/World";
import { CONTROLS_HINT } from "../systems/input";
import { ToastStack, banner, hstack, label, listen, panel, screenFlash } from "../ui/components";
import { INK, LAYOUT, SURFACE, TONES } from "../ui/theme";
import { TerminalModal } from "../ui/terminalModal";

export class HudScene extends Phaser.Scene {
  private world!: World;
  private keys!: Phaser.GameObjects.Text;
  private runners!: Phaser.GameObjects.Text;
  private boss!: Phaser.GameObjects.Text;
  private room!: Phaser.GameObjects.Text;
  private name!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private spectate!: Phaser.GameObjects.Text;
  private fps!: Phaser.GameObjects.Text;
  private modal: TerminalModal | null = null;

  constructor() { super("Hud"); }

  init(data: { world: World }): void { this.world = data.world; this.modal = null; }

  create(): void {
    const w = this.world, local = w.local, m = LAYOUT.margin;
    panel(this, CANVAS_W / 2, LAYOUT.hudBarHeight / 2, CANVAS_W, LAYOUT.hudBarHeight, { fill: SURFACE.bar, alpha: 0.85 });
    this.keys = label(this, m, 10, "", "hud", TONES.key.ink, { origin: 0 });
    this.runners = label(this, 0, 10, "", "hud", INK.goodSoft, { origin: 0 });
    this.boss = label(this, 0, 10, "", "hud", TONES.warn.ink, { origin: 0 });
    this.name = label(this, CANVAS_W - m, 10, "▶ " + local.def.name, "hud", local.def.color, { origin: [1, 0] });
    this.room = label(this, 0, 11, "", "small", TONES.info.ink, { origin: [1, 0] });
    this.prompt = label(this, CANVAS_W / 2, CANVAS_H - 44, "", "small", INK.prompt);
    this.spectate = label(this, CANVAS_W / 2, CANVAS_H - 66, "", "small", TONES.spectate.ink);
    label(this, m, CANVAS_H - 20, CONTROLS_HINT[local.role === "hunter" ? "hunter" : "runner"], "tiny", INK.hint, { origin: [0, 1] });
    this.fps = label(this, CANVAS_W - 10, CANVAS_H - 10, "", "tiny", INK.fps, { origin: [1, 1] }).setVisible(settings.showFps);

    const toasts = new ToastStack(this, CANVAS_W / 2, CANVAS_H / 2 - 60);
    listen(this, w.events, "toast", ({ text, tone }) => toasts.push(text, tone));
    listen(this, w.events, "banner", ({ text, tone }) => banner(this, text, tone));
    listen(this, w.events, "screenFlash", ({ color, alpha, ms }) => screenFlash(this, color, alpha, ms));
  }

  update(): void {
    const w = this.world;
    if (w.round.finished) return;
    const hunter = w.local.role === "hunter";
    const c = w.round.counts();

    this.keys.setText("🔑 " + w.objectives.collected + "/" + w.objectives.total);
    this.runners.setText(hunter
      ? "🎯 Поймано " + c.caught + "/" + c.total + " · ушли " + c.escaped
      : "👤 " + c.alive + "/" + c.total + "  Спасены: " + c.escaped);
    this.runners.setColor(!hunter && c.alive <= Math.floor(c.total / 2) ? TONES.bad.ink : INK.goodSoft);
    if (w.director.bossSpawned) {
      this.boss.setText("⚠ ЖЕЛОЧЬ ЗДЕСЬ").setColor(TONES.bad.ink);
    } else {
      const s = w.director.bossCountdown;
      this.boss.setText("⚠ БОСС через " + s + "с").setColor(s < 15 ? TONES.bad.ink : TONES.warn.ink);
    }
    hstack([this.keys, this.runners, this.boss], LAYOUT.margin, LAYOUT.gap);

    const room = w.roomAt(w.vision.viewer);
    this.room.setText(room ? ROOMS[room.type].label : "").setX(this.name.x - this.name.width - LAYOUT.gap);

    this.prompt.setText(this.promptText());
    this.spectate.setText(w.round.spectateText ?? "");
    if (this.fps.visible) this.fps.setText(Math.round(this.game.loop.actualFps) + " FPS");

    const mg = w.doors.minigame;
    if (mg.active && !this.modal) this.modal = new TerminalModal(this, mg.code);
    if (!mg.active && this.modal) { this.modal.destroy(); this.modal = null; }
    this.modal?.update(mg);
  }

  /** Context hint: what the player can do right here. */
  private promptText(): string {
    const w = this.world, a = w.local;
    if (a.role === "hunter") {
      return w.foxFlash.ready ? "⚡ [R] Вспышка — готово!" : "⚡ Вспышка: " + Math.ceil(w.foxFlash.cooldown) + "с";
    }
    if (!w.round.canAct()) return "";
    if (a.hiding) return "🚪 УКРЫТИЕ [E — выйти]";
    if (!w.doors.minigame.active && w.doors.nearestTerminal(a) >= 0) return "💻 Нажми F — терминал";
    const spot = w.hiding.nearest(a);
    if (!spot) return "";
    return spot.kind === "bed" ? "🛏 Нажми E — спрятаться под кровать" : "🚪 Нажми E чтобы спрятаться";
  }
}
