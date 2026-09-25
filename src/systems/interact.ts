// The E key. One place decides what "act here" means for the local player right now — hide,
// come out, hack a terminal, plug a fuse in, search a hiding spot, smash a door — and the HUD
// shows the same answer as the prompt.
import type Phaser from "phaser";
import { dist } from "../core/geom";
import type { World } from "../game/World";

/** What E does; `target`: the thing it works on (outlined in the world). */
export interface Interaction { icon: string | null; text: string; run(): void; target?: Phaser.GameObjects.Image | null; }

export class Interact {
  constructor(private world: World) {}

  /** What E would do for the local player right now, or null. */
  current(): Interaction | null {
    const w = this.world, a = w.local;
    if (!w.round.canAct() || w.doors.minigame.active) return null;
    const gate = w.gates.nearest(a), brute = a.kit === "brute";
    const doorText = (open: boolean) => open ? "E — закрыть дверь" : brute ? "E — выбить дверь" : "E — открыть дверь";
    const door = gate >= 0 ? { icon: null, text: doorText(w.gates.gates[gate].open), run: () => w.gates.toggle(gate, a), target: w.gates.gates[gate].sprite } : null;
    if (a.role === "hunter") {
      const spot = w.hiding.nearest(a, false);
      if (door && (!spot || dist(a, w.gates.gates[gate]) <= dist(a, spot))) return door;
      if (spot && !w.hiding.checking(spot)) {
        const text = spot.kind === "bed" ? (brute ? "E — отшвырнуть кровать" : "E — заглянуть под кровать") : brute ? "E — сорвать дверцу" : "E — открыть шкафчик";
        return { icon: "ui/icon_hide", text, run: () => w.hiding.requestCheck(spot, a), target: spot.sprite };
      }
      return null;
    }
    if (a.hiding) return { icon: "ui/icon_hide", text: "E — выйти  ·  Пробел — не дышать", run: () => w.hiding.toggleLocal() };
    if (w.power.busy(a)) return { icon: null, text: "Вставляю предохранитель…", run: () => {} };
    if (w.power.carried(a) >= 0 && w.power.nearBox(a)) {
      return { icon: null, text: "E — вставить предохранитель", run: () => { w.power.startInsert(a); }, target: w.power.box?.sprite };
    }
    const terminal = w.doors.nearestTerminal(a);
    if (terminal >= 0) return { icon: null, text: "E — взломать терминал", run: () => w.doors.interactLocal(), target: w.doors.doors[terminal].terminal };
    if (door) return door;
    const spot = w.hiding.nearest(a);
    if (spot) {
      return { icon: "ui/icon_hide", text: spot.kind === "bed" ? "E — спрятаться под кровать" : "E — спрятаться в шкафчик", run: () => w.hiding.toggleLocal(), target: spot.sprite };
    }
    return null;
  }

  run(): void { this.current()?.run(); }
}
