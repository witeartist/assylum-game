// The E key. One place decides what "act here" means for the local player right now — hide,
// come out, hack a terminal, plug a fuse in, search a hiding spot — and the HUD shows the same
// answer as the prompt.
import { dist } from "../core/geom";
import type { World } from "../game/World";

export interface Interaction { icon: string | null; text: string; run(): void; }

export class Interact {
  constructor(private world: World) {}

  /** What E would do for the local player right now, or null. */
  current(): Interaction | null {
    const w = this.world, a = w.local;
    if (!w.round.canAct() || w.doors.minigame.active) return null;
    const gate = w.gates.nearest(a);
    const door = gate >= 0 ? { icon: null, text: w.gates.gates[gate].open ? "E — закрыть дверь" : "E — открыть дверь", run: () => w.gates.toggle(gate, a) } : null;
    if (a.role === "hunter") {
      const spot = w.hiding.nearest(a, false);
      if (door && (!spot || dist(a, w.gates.gates[gate]) <= dist(a, spot))) return door;
      if (spot && !w.hiding.checking(spot)) {
        return { icon: "ui/icon_hide", text: spot.kind === "bed" ? "E — заглянуть под кровать" : "E — открыть шкафчик", run: () => w.hiding.requestCheck(spot, a) };
      }
      return null;
    }
    if (a.hiding) return { icon: "ui/icon_hide", text: "E — выйти  ·  Пробел — не дышать", run: () => w.hiding.toggleLocal() };
    if (w.power.busy(a)) return { icon: null, text: "Вставляю предохранитель…", run: () => {} };
    if (w.power.carried(a) >= 0 && w.power.nearBox(a)) {
      return { icon: null, text: "E — вставить предохранитель", run: () => { w.power.startInsert(a); } };
    }
    if (w.doors.nearestTerminal(a) >= 0) return { icon: null, text: "E — взломать терминал", run: () => w.doors.interactLocal() };
    if (door) return door;
    const spot = w.hiding.nearest(a);
    if (spot) {
      return { icon: "ui/icon_hide", text: spot.kind === "bed" ? "E — спрятаться под кровать" : "E — спрятаться в шкафчик", run: () => w.hiding.toggleLocal() };
    }
    return null;
  }

  run(): void { this.current()?.run(); }
}
