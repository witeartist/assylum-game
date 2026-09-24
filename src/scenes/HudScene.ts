// Heads-up display, drawn by its own scene on top of the game so world effects (lighting,
// camera shake, zoom) never touch it. It only reads the world and listens to its events.
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import { settings } from "../core/settings";
import { ROOMS } from "../data/rooms";
import type { World } from "../game/World";
import { CONTROLS_HINT } from "../systems/input";
import { IconText, ToastStack, banner, hstack, label, listen, panel, screenFlash, uiCamera } from "../ui/components";
import { INK, LAYOUT, SURFACE, TONES } from "../ui/theme";
import { TerminalModal } from "../ui/terminalModal";
import { WorldOverlay } from "../ui/worldOverlay";

export class HudScene extends Phaser.Scene {
  private world!: World;
  private keys!: IconText;
  private runners!: IconText;
  private boss!: IconText;
  private room!: Phaser.GameObjects.Text;
  private name!: Phaser.GameObjects.Text;
  private prompt!: IconText;
  private spectate!: Phaser.GameObjects.Text;
  private fps!: Phaser.GameObjects.Text;
  private modal: TerminalModal | null = null;
  private overlay!: WorldOverlay;

  constructor() { super("Hud"); }

  init(data: { world: World }): void { this.world = data.world; this.modal = null; }

  create(): void {
    uiCamera(this);
    const w = this.world, local = w.local, m = LAYOUT.margin;
    this.overlay = new WorldOverlay(this, w);
    panel(this, CANVAS_W / 2, LAYOUT.hudBarHeight / 2, CANVAS_W, LAYOUT.hudBarHeight, { fill: SURFACE.bar, alpha: 0.85 });
    const barY = LAYOUT.hudBarHeight / 2;
    this.keys = new IconText(this, m, barY, "ui/icon_key", "", "hud", TONES.key.ink);
    this.runners = new IconText(this, 0, barY, local.role === "hunter" ? "ui/icon_skull" : "ui/icon_runner", "", "hud", INK.goodSoft);
    this.boss = new IconText(this, 0, barY, "ui/icon_boss", "", "hud", TONES.warn.ink);
    this.name = label(this, CANVAS_W - m, 10, "▶ " + local.def.name, "hud", local.def.color, { origin: [1, 0] });
    this.room = label(this, 0, 11, "", "small", TONES.info.ink, { origin: [1, 0] });
    this.prompt = new IconText(this, CANVAS_W / 2, CANVAS_H - 44, null, "", "small", INK.prompt, 16);
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
    this.overlay.update();

    this.keys.setText(w.objectives.collected + "/" + w.objectives.total);
    this.runners.setText(hunter
      ? "Поймано " + c.caught + "/" + c.total + " · ушли " + c.escaped
      : c.alive + "/" + c.total + "  Спасены: " + c.escaped);
    this.runners.setColor(!hunter && c.alive <= Math.floor(c.total / 2) ? TONES.bad.ink : INK.goodSoft);
    if (w.director.bossSpawned) {
      this.boss.setText("ЖЕЛОЧЬ ЗДЕСЬ").setColor(TONES.bad.ink);
    } else {
      const s = w.director.bossCountdown;
      this.boss.setText("БОСС через " + s + "с").setColor(s < 15 ? TONES.bad.ink : TONES.warn.ink);
    }
    hstack([this.keys, this.runners, this.boss], LAYOUT.margin, LAYOUT.gap);

    const room = w.roomAt(w.vision.viewer);
    this.room.setText(room ? ROOMS[room.type].label : "").setX(this.name.x - this.name.width - LAYOUT.gap);

    const prompt = this.promptText();
    this.prompt.setIcon(prompt.icon).setText(prompt.text);
    this.prompt.setX(CANVAS_W / 2 - this.prompt.width / 2);
    this.spectate.setText(w.round.spectateText ?? "");
    if (this.fps.visible) this.fps.setText(Math.round(this.game.loop.actualFps) + " FPS");

    const mg = w.doors.minigame;
    if (mg.active && !this.modal) this.modal = new TerminalModal(this, mg.code);
    if (!mg.active && this.modal) { this.modal.destroy(); this.modal = null; }
    this.modal?.update(mg);
  }

  /** Context hint: what the player can do right here. */
  private promptText(): { icon: string | null; text: string } {
    const w = this.world, a = w.local;
    if (a.role === "hunter") {
      return { icon: "ui/icon_flashlight", text: w.foxFlash.ready ? "[R] Вспышка — готово!" : "Вспышка: " + Math.ceil(w.foxFlash.cooldown) + "с" };
    }
    const none = { icon: null, text: "" };
    if (!w.round.canAct()) return none;
    if (a.hiding) return { icon: "ui/icon_hide", text: "УКРЫТИЕ [E — выйти]" };
    if (!w.doors.minigame.active && w.doors.nearestTerminal(a) >= 0) return { icon: null, text: "Нажми F — терминал" };
    const spot = w.hiding.nearest(a);
    if (!spot) return none;
    return { icon: "ui/icon_hide", text: spot.kind === "bed" ? "Нажми E — спрятаться под кровать" : "Нажми E — спрятаться в шкафчик" };
  }
}
