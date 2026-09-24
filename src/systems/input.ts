// Keyboard controls. Keys are read by physical position (event.code), so WASD works in any
// keyboard layout.
import { FLASHLIGHT_MODES, SNEAK_MULT, SPRINT_MULT } from "../data/balance";
import type { World } from "../game/World";

const HELD = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  sneak: ["KeyC"],
};

function digitOf(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

export const CONTROLS_HINT = {
  runner: "WASD — движение  |  Shift — бег  |  C — тихий шаг  |  R — фонарик  |  1/2/3 — режим  |  E — спрятаться  |  F — терминал",
  hunter: "WASD — движение  |  Shift — бег  |  C — тихий шаг  |  R — вспышка  |  Лови бегущих!",
};

export class InputSystem {
  private down = new Set<string>();
  private readonly onBlur = () => this.down.clear();

  constructor(private world: World) {
    const kb = world.scene.input.keyboard!;
    kb.addCapture("TAB,UP,DOWN,LEFT,RIGHT,SPACE");
    kb.on("keydown", (ev: KeyboardEvent) => this.onKeyDown(ev));
    kb.on("keyup", (ev: KeyboardEvent) => this.down.delete(ev.code));
    window.addEventListener("blur", this.onBlur);
    world.scene.events.once("shutdown", () => window.removeEventListener("blur", this.onBlur));
  }

  private held(action: keyof typeof HELD): boolean {
    return HELD[action].some(code => this.down.has(code));
  }

  /** Move the local player. */
  update(): void {
    const w = this.world, a = w.local;
    if (!w.round.canAct() || a.hiding || w.doors.minigame.active) { a.halt(); return; }
    const dx = (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0);
    const dy = (this.held("down") ? 1 : 0) - (this.held("up") ? 1 : 0);
    const mult = this.held("sprint") ? SPRINT_MULT : this.held("sneak") ? SNEAK_MULT : 1;
    a.move(dx, dy, a.speed * mult);
  }

  private onKeyDown(ev: KeyboardEvent): void {
    this.down.add(ev.code);
    if (ev.repeat) return;
    const w = this.world, a = w.local;
    const digit = digitOf(ev.code);
    if (digit !== null) {
      if (w.doors.minigame.active) w.doors.digit(digit);
      else if (a.role === "runner" && a.flashlight.on && digit <= FLASHLIGHT_MODES.length && w.round.canAct()) {
        a.flashlight.mode = digit;
        w.toast("🔦 Режим " + digit + ": " + FLASHLIGHT_MODES[digit - 1].label, "warn");
      }
      return;
    }
    switch (ev.code) {
      case "KeyE": w.hiding.toggleLocal(); break;
      case "KeyF": w.doors.interactLocal(); break;
      case "KeyR": this.useLight(); break;
      case "Tab": ev.preventDefault(); w.round.cycleSpectate(); break;
      case "Escape":
        if (w.doors.minigame.active) w.doors.closeMinigame(false);
        else w.round.requestExit();
        break;
    }
  }

  /** R: runners toggle the flashlight, the hunter uses its flash. */
  private useLight(): void {
    const w = this.world, a = w.local;
    if (!w.round.canAct()) return;
    if (a.role === "hunter") {
      if (w.foxFlash.trigger(a)) w.toast("⚡ ВСПЫШКА!", "key");
      else w.toast("⚡ Перезарядка: " + Math.ceil(w.foxFlash.cooldown) + "с", "neutral");
      return;
    }
    a.flashlight.on = !a.flashlight.on;
    w.toast(a.flashlight.on ? "🔦 Фонарик ВКЛ (режим " + a.flashlight.mode + ")" : "🔦 Фонарик ВЫКЛ", a.flashlight.on ? "warn" : "neutral");
  }
}
