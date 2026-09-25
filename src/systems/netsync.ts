// Multiplayer glue: turns local events into messages and incoming messages into the same
// system calls (flagged `remote`, so they are not sent back). Clients report to the host,
// the host applies, relays and decides catches, searches and the end of the round. When the
// villain's player leaves, the host's AI takes the villain over.
import type { GameMessage } from "../net/protocol";
import { session } from "../net/session";
import { WAKE } from "../data/balance";
import type { Actor } from "../entities/Actor";
import { NET_FLAG } from "../entities/state";
import { VILLAIN_AI_ID, spawnVillainAI } from "../game/spawn";
import type { World } from "../game/World";

const SEND_INTERVAL = 33;

export class NetSync {
  private offs: (() => void)[] = [];
  private lastSend = 0;

  constructor(private world: World) {
    const ev = world.events;
    const host = world.net === "host";
    const on = (off: () => void) => { this.offs.push(off); };

    on(ev.on("keyCollected", e => { if (!e.remote) this.send({ type: "key", index: e.index, by: e.by ?? "" }); }));
    on(ev.on("doorOpened", e => { if (!e.remote) this.send({ type: "door", index: e.index, by: e.by ?? "" }); }));
    on(ev.on("hidingChanged", e => { if (!e.remote) this.send({ type: "hide", id: e.actor.id, on: e.actor.hiding }); }));
    on(ev.on("runnerEscaped", e => { if (!e.remote) this.send({ type: "escaped", id: e.actor.id }); }));
    on(ev.on("gateChanged", e => { if (!e.remote) this.send({ type: "gate", index: e.index, open: e.open, by: e.by }); }));
    on(ev.on("itemPicked", e => { if (!e.remote) this.send({ type: "item", index: e.index, by: e.by }); }));
    on(ev.on("itemThrown", e => { if (!e.remote) this.send({ type: "throw", kind: e.kind, by: e.by, x: e.x, y: e.y, tx: e.tx, ty: e.ty }); }));
    on(ev.on("fusePicked", e => { if (!e.remote) this.send({ type: "fuse", op: "pick", index: e.index, by: e.by }); }));
    on(ev.on("fuseInserted", e => { if (!e.remote) this.send({ type: "fuse", op: "insert", index: e.index, by: e.by }); }));
    on(ev.on("noiseMade", e => this.send({ type: "noise", x: e.x, y: e.y, r: e.radius, kind: e.kind, by: e.by })));
    on(ev.on("abilityUsed", e => { if (!e.remote) this.send({ type: "ability", by: e.by, x: e.x, y: e.y }); }));
    if (host) {
      on(ev.on("runnerCaught", e => this.send({ type: "caught", id: e.actor.id, by: e.by })));
      on(ev.on("brokeFree", e => { if (!e.remote) this.send({ type: "freed", id: e.actor.id, by: e.by }); }));
      on(ev.on("fuseDropped", e => this.send({ type: "fuseDrop", index: e.index, x: e.x, y: e.y })));
      on(ev.on("spotChecked", e => this.send({ type: "check", index: e.index, by: e.by })));
      on(ev.on("buildingAwake", () => this.send({ type: "wake" })));
      on(ev.on("runnerLeft", e => this.send({ type: "left", id: e.actor.id })));
      on(ev.on("roundResults", e => this.send({ type: "end", results: e.results })));
      on(session.events.on("peerLeft", id => { const a = world.byId(id); if (a) this.left(a); }));
    } else {
      on(ev.on("checkRequested", e => this.send({ type: "check", index: e.index, by: world.local.id })));
      on(session.events.on("hostLost", () => world.round.abort("Связь с хостом потеряна")));
    }
    on(session.events.on("game", ({ from, msg }) => this.receive(from, msg)));
  }

  private send(msg: GameMessage): void { session.send(msg); }

  /** Host: a player left. If it was the last villain, the AI carries on in its place. */
  private left(a: Actor): void {
    const w = this.world;
    w.round.leave(a);
    if (!a.kit || w.threats().length > 0 || w.byId(VILLAIN_AI_ID)) return;
    const ai = spawnVillainAI(w, a.def.id, a.kit);
    ai.teleport(a.authPos);
    if (w.director.awake) ai.speedMul = WAKE.boost;
    this.send({ type: "ai", character: a.def.id, kit: a.kit, x: ai.x, y: ai.y });
    w.toast("Злодея теперь ведёт компьютер", "warn");
  }

  /** Flags other peers need about an actor simulated here (sedative in the bag, a fuse in the hands). */
  private flags(a: Actor): number {
    const w = this.world;
    return (w.items.has(a, "sedative") ? NET_FLAG.canBreakFree : 0) | (w.power.carried(a) >= 0 ? NET_FLAG.carrying : 0);
  }

  /** Positions: clients send their own, the host sends everyone's. */
  update(now: number): void {
    if (now - this.lastSend < SEND_INTERVAL) return;
    this.lastSend = now;
    const w = this.world;
    if (w.net === "host") {
      session.send({ type: "snap", actors: w.actors.filter(a => a.inPlay).map(a => ({ id: a.id, ...a.toNet(this.flags(a)) })) });
    } else if (w.local.inPlay) {
      session.send({ type: "pos", ...w.local.toNet(this.flags(w.local)) });
    }
  }

  private receive(from: string, msg: GameMessage): void {
    const w = this.world;
    const host = w.net === "host";
    // A client may only speak for itself.
    const actorId = host ? from : "id" in msg ? msg.id : "";
    const relay = () => { if (host) session.broadcast({ ...msg, ...("id" in msg ? { id: from } : {}) } as GameMessage, from); };
    const actor = (id: string) => w.byId(host ? from : id) ?? null;
    switch (msg.type) {
      case "pos": {
        if (host) w.byId(from)?.applyNet(msg);
        break;
      }
      case "snap":
        if (host) break;
        for (const s of msg.actors) if (s.id !== session.localId) w.byId(s.id)?.applyNet(s);
        break;
      case "key":
        w.objectives.collectKey(msg.index, msg.by || null, true);
        relay();
        break;
      case "door":
        w.doors.open(msg.index, msg.by || null, true);
        relay();
        break;
      case "hide": {
        const a = w.byId(actorId);
        if (a) w.hiding.set(a, msg.on, undefined, true);
        relay();
        break;
      }
      case "item":
        w.items.pick(msg.index, msg.by, true);
        relay();
        break;
      case "gate":
        w.gates.set(msg.index, msg.open, actor(msg.by), true);
        relay();
        break;
      case "throw": {
        if (msg.kind === "whistle") w.items.whistle(msg.x, msg.y, actor(msg.by));
        else w.items.startThrow(msg.kind, { x: msg.x, y: msg.y }, { x: msg.tx, y: msg.ty });
        relay();
        break;
      }
      case "fuse": {
        const a = actor(msg.by);
        if (msg.op === "pick" && a) w.power.pick(msg.index, a, true);
        if (msg.op === "insert") w.power.insert(msg.index, a, true);
        relay();
        break;
      }
      case "fuseDrop":
        if (!host) w.power.placeDropped(msg.index, msg);
        break;
      case "noise":
        w.noise.emit(msg.x, msg.y, msg.r, msg.kind, actor(msg.by));
        relay();
        break;
      case "check": {
        const spot = w.hiding.spots[msg.index];
        const by = w.byId(host ? from : msg.by);
        if (spot && by) w.hiding.check(spot, by);
        break;
      }
      case "freed": {
        const a = !host ? w.byId(msg.id) : undefined;
        if (a) w.round.breakFree(a, w.byId(msg.by) ?? null, true);
        break;
      }
      case "escaped": {
        const a = w.byId(actorId);
        if (a) w.round.escape(a, true);
        relay();
        break;
      }
      case "caught": {
        const a = !host ? w.byId(msg.id) : undefined;
        if (a) w.round.catchRunner(a, msg.by, true);
        break;
      }
      case "wake":
        if (!host) w.director.wake(true);
        break;
      case "ability": {
        const a = actor(msg.by);
        if (a) w.abilities.use(a, true, { x: msg.x, y: msg.y });
        relay();
        break;
      }
      case "ai": {
        if (host || w.byId(VILLAIN_AI_ID)) break;
        spawnVillainAI(w, msg.character, msg.kit).teleport({ x: msg.x, y: msg.y });
        w.toast("Злодея теперь ведёт компьютер", "warn");
        break;
      }
      case "left": {
        const a = !host ? w.byId(msg.id) : undefined;
        if (a) w.round.leave(a);
        break;
      }
      case "end":
        if (!host) w.round.applyResults(msg.results);
        break;
    }
  }

  dispose(): void {
    this.offs.forEach(off => off());
    this.offs = [];
  }
}
