// Heads-up display, drawn by its own scene on top of the game so world effects (lighting,
// camera shake, zoom) never touch it. It only reads the world and listens to its events.
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import { settings } from "../core/settings";
import { BATTERY, BREATH } from "../data/balance";
import { FUSE_ICON, ITEMS_DEF } from "../data/items";
import { ROOMS } from "../data/rooms";
import type { World } from "../game/World";
import { ABILITY } from "../systems/abilities";
import { CONTROLS_HINT } from "../systems/input";
import { IconText, Meter, NotePanel, Slot, ToastStack, banner, hstack, label, listen, panel, screenFlash, uiCamera } from "../ui/components";
import { INK, LAYOUT, SURFACE, TONES } from "../ui/theme";
import { TerminalModal } from "../ui/terminalModal";
import { WorldOverlay } from "../ui/worldOverlay";

const SLOT = 34;

export class HudScene extends Phaser.Scene {
  private world!: World;
  private keys!: IconText;
  private fuses!: IconText;
  private runners!: IconText;
  private wake!: IconText;
  private room!: Phaser.GameObjects.Text;
  private name!: Phaser.GameObjects.Text;
  private prompt!: IconText;
  private spectate!: Phaser.GameObjects.Text;
  private fps!: Phaser.GameObjects.Text;
  private stamina!: Meter;
  private battery!: Meter;
  private breath!: Meter;
  private progress!: Meter;
  private slots: Slot[] = [];
  private note!: NotePanel;
  private modal: TerminalModal | null = null;
  private overlay!: WorldOverlay;

  constructor() { super("Hud"); }

  init(data: { world: World }): void { this.world = data.world; this.modal = null; this.slots = []; }

  create(): void {
    uiCamera(this);
    const w = this.world, local = w.local, m = LAYOUT.margin, runner = local.role === "runner";
    // The brute has a short lunge, so it watches its stamina too.
    const winded = runner || local.kit === "brute";
    this.overlay = new WorldOverlay(this, w);
    panel(this, CANVAS_W / 2, LAYOUT.hudBarHeight / 2, CANVAS_W, LAYOUT.hudBarHeight, { fill: SURFACE.bar, alpha: 0.85 });
    const barY = LAYOUT.hudBarHeight / 2;
    this.keys = new IconText(this, m, barY, "ui/icon_key", "", "hud", TONES.key.ink);
    this.fuses = new IconText(this, 0, barY, FUSE_ICON, "", "hud", TONES.terminal.ink);
    this.runners = new IconText(this, 0, barY, runner ? "ui/icon_runner" : "ui/icon_skull", "", "hud", INK.goodSoft);
    this.wake = new IconText(this, 0, barY, "ui/icon_boss", "", "hud", TONES.warn.ink);
    this.name = label(this, CANVAS_W - m, 10, "▶ " + local.displayName, "hud", local.nameColor, { origin: [1, 0] });
    this.room = label(this, 0, 11, "", "small", TONES.info.ink, { origin: [1, 0] });
    this.prompt = new IconText(this, CANVAS_W / 2, CANVAS_H - 58, null, "", "small", INK.prompt, 16);
    this.spectate = label(this, CANVAS_W / 2, CANVAS_H - 80, "", "small", TONES.spectate.ink);
    label(this, m, CANVAS_H - 8, CONTROLS_HINT[local.kit ?? "runner"], "tiny", INK.hint, { origin: [0, 1] });
    this.fps = label(this, CANVAS_W - 10, CANVAS_H - 8, "", "tiny", INK.fps, { origin: [1, 1] }).setVisible(settings.showFps);

    // Body: stamina and battery on the left, the inventory next to them.
    this.stamina = new Meter(this, m, CANVAS_H - 50, "ui/icon_stamina", 110, "good").setVisible(winded);
    this.battery = new Meter(this, m, CANVAS_H - 30, "ui/icon_battery", 110, "warn").setVisible(runner);
    for (let i = 0; i < 3; i++) this.slots.push(new Slot(this, m + 150 + i * (SLOT + 6) + SLOT / 2, CANVAS_H - 40, SLOT, String(i + 1)).setVisible(runner));
    this.breath = new Meter(this, CANVAS_W / 2 - 80, CANVAS_H - 36, null, 160, "info").setVisible(false);
    this.progress = new Meter(this, CANVAS_W / 2 - 80, CANVAS_H - 36, null, 160, "terminal").setVisible(false);
    this.note = new NotePanel(this);

    const toasts = new ToastStack(this, CANVAS_W / 2, CANVAS_H / 2 - 60);
    listen(this, w.events, "toast", ({ text, tone }) => toasts.push(text, tone));
    listen(this, w.events, "banner", ({ text, tone }) => banner(this, text, tone));
    listen(this, w.events, "screenFlash", ({ color, alpha, ms }) => screenFlash(this, color, alpha, ms));
  }

  update(): void {
    const w = this.world;
    if (w.round.finished) return;
    const a = w.local, hunter = a.role === "hunter";
    const c = w.round.counts();
    this.overlay.update();

    this.keys.setText(w.objectives.collected + "/" + w.objectives.total);
    this.fuses.setText(w.power.total ? w.power.inserted + "/" + w.power.total : "");
    this.runners.setText(hunter
      ? "Поймано " + c.caught + "/" + c.total + " · ушли " + c.escaped
      : c.alive + "/" + c.total + "  Спасены: " + c.escaped);
    this.runners.setColor(!hunter && c.alive <= Math.floor(c.total / 2) ? TONES.bad.ink : INK.goodSoft);
    if (w.director.awake) {
      this.wake.setText("ЗДАНИЕ ПРОСНУЛОСЬ").setColor(TONES.bad.ink);
    } else {
      const s = w.director.countdown;
      this.wake.setText("Здание проснётся через " + s + "с").setColor(s < 30 ? TONES.bad.ink : TONES.warn.ink);
    }
    hstack([this.keys, this.fuses, this.runners, this.wake], LAYOUT.margin, LAYOUT.gap);

    const room = w.roomAt(w.vision.viewer);
    this.room.setText(room ? ROOMS[room.type].label : "").setX(this.name.x - this.name.width - LAYOUT.gap);

    const body = !hunter && a.inPlay;
    const winded = a.inPlay && (!hunter || a.kit === "brute");
    this.stamina.setVisible(winded);
    this.battery.setVisible(body);
    this.slots.forEach(sl => sl.setVisible(body));
    if (winded) this.stamina.set(a.stamina / a.staminaMax, a.exhausted ? "bad" : a.adrenaline > 0 ? "key" : "good");
    if (body) {
      const charge = a.flashlight.charge;
      this.battery.set(charge, charge < BATTERY.low ? "bad" : "warn");
      const bag = w.items.bag(a);
      this.slots.forEach((s, i) => s.set(bag[i] ? ITEMS_DEF[bag[i]!].icon : null));
      const carrying = w.power.carried(a) >= 0;
      this.name.setText("▶ " + a.displayName + (carrying ? "  [предохранитель]" : ""));
    }
    const holding = a.hiding && w.hiding.breath < BREATH.max;
    this.breath.setVisible(holding).set(Math.max(0, w.hiding.breath) / BREATH.max, w.hiding.breath < 1.5 ? "bad" : "info");
    const inserting = w.power.busy(a);
    this.progress.setVisible(inserting).set(w.power.insertProgress(a));

    const act = w.interact.current();
    const ab = a.kit ? ABILITY[a.kit] : null;
    const power = ab ? (w.abilities.ready(a) ? ab.ready : ab.name.toLowerCase() + " " + Math.ceil(w.abilities.cooldown(a)) + "с") : "";
    this.prompt.setIcon(act?.icon ?? (hunter ? "ui/icon_flashlight" : null)).setText([act?.text, power].filter(Boolean).join("  ·  "));
    this.prompt.setX(CANVAS_W / 2 - this.prompt.width / 2);
    this.spectate.setText(w.round.spectateText ?? "");
    if (this.fps.visible) this.fps.setText(Math.round(this.game.loop.actualFps) + " FPS");
    this.note.show(w.items.noteOpen);

    const mg = w.doors.minigame;
    if (mg.active && !this.modal) this.modal = new TerminalModal(this);
    if (!mg.active && this.modal) { this.modal.destroy(); this.modal = null; }
    this.modal?.update(mg);
  }
}
