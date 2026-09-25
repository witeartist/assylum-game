// Keyboard and mouse. Keys are read by physical position (event.code), so WASD works in any
// keyboard layout. The flashlight follows the mouse while it moves, otherwise the walking direction.
import { FLASHLIGHT_MODES } from "../data/balance";
import type { World } from "../game/World";
import { ABILITY } from "./abilities";

const HELD = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  run: ["ShiftLeft", "ShiftRight"],
  sneak: ["KeyC", "ControlLeft"],
  breath: ["Space"],
};

/** After the mouse stops, it keeps steering the light this long, ms. */
const MOUSE_AIM_MS = 2500;

function digitOf(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

/** The key line at the bottom of the screen: a runner's, or the villain's by kit. */
export const CONTROLS_HINT = {
  runner: "WASD — шаг  |  Shift — бег  |  C — тихо  |  мышь — свет  |  R — фонарик, V — луч  |  E — действие  |  1/2/3 — предметы",
  fox: "WASD — шаг  |  Shift — бег  |  C — тихо  |  мышь — взгляд  |  R — вспышка  |  E — обыскать укрытие",
  brute: "WASD — шаг  |  Shift — рывок  |  мышь — взгляд  |  R — рёв (гасит фонарики)  |  E — выбить дверь, вскрыть укрытие",
};

export class InputSystem {
  private down = new Set<string>();
  private mouseAt = -Infinity;
  private readonly onBlur = () => this.down.clear();

  constructor(private world: World) {
    const scene = world.scene;
    const kb = scene.input.keyboard!;
    kb.addCapture("TAB,UP,DOWN,LEFT,RIGHT,SPACE");
    kb.on("keydown", (ev: KeyboardEvent) => this.onKeyDown(ev));
    kb.on("keyup", (ev: KeyboardEvent) => this.down.delete(ev.code));
    scene.input.on("pointermove", () => { this.mouseAt = scene.time.now; });
    window.addEventListener("blur", this.onBlur);
    scene.events.once("shutdown", () => window.removeEventListener("blur", this.onBlur));
  }

  private held(action: keyof typeof HELD): boolean {
    return HELD[action].some(code => this.down.has(code));
  }

  /** Space is held: a hidden runner holds their breath. */
  get holdingBreath(): boolean { return this.held("breath"); }

  /** Move the local player. */
  update(): void {
    const w = this.world, a = w.local;
    if (!w.round.canAct() || a.hiding || w.doors.minigame.active || w.power.busy(a)) { a.halt(); return; }
    const dx = (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0);
    const dy = (this.held("down") ? 1 : 0) - (this.held("up") ? 1 : 0);
    a.gait = this.held("run") && a.canRun ? "run" : this.held("sneak") ? "sneak" : "walk";
    const aiming = w.scene.time.now - this.mouseAt < MOUSE_AIM_MS;
    a.move(dx, dy, a.gaitSpeed(), !aiming);
    if (aiming) {
      const p = w.camera.toWorld(w.scene.input.activePointer);
      a.facing = Math.atan2(p.y - a.y, p.x - a.x);
    }
  }

  private onKeyDown(ev: KeyboardEvent): void {
    this.down.add(ev.code);
    if (ev.repeat) return;
    const w = this.world;
    const digit = digitOf(ev.code);
    if (digit !== null) {
      if (w.doors.minigame.active) w.doors.digit(digit);
      else if (w.round.canAct() && digit <= 3) w.items.useLocal(digit - 1);
      return;
    }
    switch (ev.code) {
      case "KeyE":
      case "KeyF": w.interact.run(); break;
      case "KeyR": this.useLight(); break;
      case "KeyV": this.cycleBeam(); break;
      case "KeyQ": w.items.abilityLocal(); break;
      case "Tab": ev.preventDefault(); w.round.cycleSpectate(); break;
      case "Escape":
        if (w.doors.minigame.active) w.doors.closeMinigame(false);
        else if (w.items.noteOpen) w.items.closeNote();
        else w.round.requestExit();
        break;
    }
  }

  /** R: runners toggle the flashlight, the villain uses its kit's ability. */
  private useLight(): void {
    const w = this.world, a = w.local;
    if (!w.round.canAct()) return;
    if (a.kit) {
      const ab = ABILITY[a.kit];
      if (w.abilities.use(a)) w.toast(ab.shout, a.kit === "brute" ? "blood" : "key");
      else w.toast(ab.name + ": перезарядка " + Math.ceil(w.abilities.cooldown(a)) + "с", "neutral");
      return;
    }
    if (!a.flashlight.on && a.flashlight.charge <= 0) { w.toast("Батарейка села — найди новую", "bad"); return; }
    a.flashlight.on = !a.flashlight.on;
    w.toast(a.flashlight.on ? "Фонарик включён" : "Фонарик выключен", a.flashlight.on ? "warn" : "neutral");
  }

  /** V: next beam mode. */
  private cycleBeam(): void {
    const w = this.world, a = w.local;
    if (a.role !== "runner" || !w.round.canAct()) return;
    a.flashlight.mode = a.flashlight.mode % FLASHLIGHT_MODES.length + 1;
    w.toast("Луч: " + FLASHLIGHT_MODES[a.flashlight.mode - 1].label, "warn");
  }
}
