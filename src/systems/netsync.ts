// Multiplayer glue: turns local events into messages and incoming messages into the same
// system calls (flagged `remote`, so they are not sent back). Clients report to the host,
// the host applies, relays and decides catches and the end of the round.
import type { GameMessage } from "../net/protocol";
import { session } from "../net/session";
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
    if (host) {
      on(ev.on("runnerCaught", e => this.send({ type: "caught", id: e.actor.id, by: e.by })));
      on(ev.on("bossSpawned", () => this.send({ type: "boss" })));
      on(ev.on("runnerLeft", e => this.send({ type: "left", id: e.actor.id })));
      on(ev.on("roundResults", e => this.send({ type: "end", results: e.results })));
      on(session.events.on("peerLeft", id => { const a = world.byId(id); if (a) world.round.leave(a); }));
    } else {
      on(session.events.on("hostLost", () => world.round.abort("Связь с хостом потеряна")));
    }
    on(session.events.on("game", ({ from, msg }) => this.receive(from, msg)));
  }

  private send(msg: GameMessage): void { session.send(msg); }

  /** Positions: clients send their own, the host sends everyone's. */
  update(now: number): void {
    if (now - this.lastSend < SEND_INTERVAL) return;
    this.lastSend = now;
    const w = this.world;
    if (w.net === "host") {
      session.send({ type: "snap", actors: w.actors.filter(a => a.inPlay).map(a => ({ id: a.id, ...a.toNet() })) });
    } else if (w.local.inPlay) {
      session.send({ type: "pos", ...w.local.toNet() });
    }
  }

  private receive(from: string, msg: GameMessage): void {
    const w = this.world;
    const host = w.net === "host";
    // A client may only speak for itself.
    const actorId = host ? from : "id" in msg ? msg.id : "";
    const relay = () => { if (host) session.broadcast({ ...msg, ...("id" in msg ? { id: from } : {}) } as GameMessage, from); };
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
      case "boss":
        if (!host) w.director.spawnBoss(true);
        break;
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
