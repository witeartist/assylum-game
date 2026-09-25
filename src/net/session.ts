// PeerJS session: hosting/joining a room, the lobby (heroes, who wants to be the villain, ready
// flags) and message transport during the round. Scenes subscribe to `session.events`.
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { EventBus } from "../core/events";
import { randomSeed } from "../core/rng";
import { HERO_IDS, isCharacterId, isKitId, type CharacterId, type KitId } from "../data/characters";
import type { DifficultyId } from "../data/difficulty";
import { pickVillains } from "../game/roundRules";
import { isGameMessage, type GameMessage, type Message, type PlayerInfo, type StartInfo } from "./protocol";

export interface SessionEvents {
  players: Record<string, PlayerInfo>;
  charAssigned: CharacterId;
  start: StartInfo;
  /** Round-phase message from a peer (for clients, always from the host). */
  game: { from: string; msg: GameMessage };
  /** Host side: a client disconnected. */
  peerLeft: string;
  /** Client side: the host closed the room or the connection dropped. */
  hostLost: Record<string, never>;
}

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PING_INTERVAL = 1000;
/** A peer silent for this long is treated as gone (WebRTC doesn't always report a closed tab). */
const PEER_TIMEOUT = 6000;
export const ROOM_CODE_LENGTH = 5;

/**
 * Optional self-hosted PeerJS signalling server, e.g. VITE_PEER_SERVER="localhost:9000"
 * or "https://peer.example.com/myapp". Without it the public PeerJS cloud is used.
 */
function peerOptions(): ConstructorParameters<typeof Peer>[1] | undefined {
  const server = import.meta.env.VITE_PEER_SERVER as string | undefined;
  if (!server) return undefined;
  const url = new URL(server.includes("://") ? server : "http://" + server);
  const secure = url.protocol === "https:";
  return { host: url.hostname, port: Number(url.port) || (secure ? 443 : 80), path: url.pathname || "/", secure };
}

function roomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return code;
}

class Session {
  readonly events = new EventBus<SessionEvents>();
  isHost = false;
  roomId: string | null = null;
  localId: string | null = null;
  players: Record<string, PlayerInfo> = {};
  /** Set once the host started the round. */
  start: StartInfo | null = null;
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  /** Last time we heard from each peer (the host is "host" on clients). */
  private lastSeen = new Map<string, number>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Closing the tab: close connections properly so the others notice at once.
    window.addEventListener("pagehide", () => this.leave());
  }

  get inRoom(): boolean { return this.peer !== null; }
  /** A multiplayer round is running (or about to). */
  get active(): boolean { return this.start !== null; }

  host(character: CharacterId, villain: KitId | null): Promise<string> {
    return new Promise((resolve, reject) => {
      const code = roomCode();
      const peer = new Peer("assylum-host-" + code, peerOptions());
      peer.on("open", (id) => {
        this.peer = peer;
        this.isHost = true;
        this.roomId = code;
        this.localId = id;
        this.players = { [id]: { character, ready: true, isHost: true, villain } };
        peer.on("connection", (conn) => this.acceptClient(peer, conn));
        this.startHeartbeat();
        resolve(code);
      });
      peer.on("error", reject);
    });
  }

  join(code: string, character: CharacterId, villain: KitId | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer("assylum-player-" + code + "-" + Math.random().toString(36).slice(2, 7), peerOptions());
      peer.on("open", (id) => {
        this.peer = peer;
        this.isHost = false;
        this.roomId = code;
        this.localId = id;
        const conn = peer.connect("assylum-host-" + code, { reliable: true });
        conn.on("open", () => {
          this.hostConn = conn;
          this.lastSeen.set("host", Date.now());
          conn.send({ type: "join", character, villain } satisfies Message);
          conn.on("data", (data) => {
            if (this.peer !== peer) return;
            this.lastSeen.set("host", Date.now());
            this.onClientMessage(data as Message);
          });
          conn.on("close", () => { if (this.peer === peer) this.events.emit("hostLost", {}); });
          this.startHeartbeat();
          resolve();
        });
        conn.on("error", reject);
      });
      peer.on("error", reject);
    });
  }

  private acceptClient(peer: Peer, conn: DataConnection): void {
    conn.on("open", () => {
      if (this.peer !== peer) { conn.close(); return; }
      this.conns.set(conn.peer, conn);
      this.lastSeen.set(conn.peer, Date.now());
      conn.on("data", (data) => {
        if (this.peer !== peer) return;
        this.lastSeen.set(conn.peer, Date.now());
        this.onHostMessage(conn.peer, data as Message);
      });
      const drop = () => { if (this.peer === peer) this.dropClient(conn.peer); };
      conn.on("close", drop);
      conn.on("error", drop);
    });
  }

  private dropClient(id: string): void {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.conns.delete(id);
    this.lastSeen.delete(id);
    delete this.players[id];
    try { conn.close(); } catch { /* already closed */ }
    this.broadcastPlayers();
    this.events.emit("peerLeft", id);
  }

  private startHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const now = Date.now(), ping: Message = { type: "ping" };
      if (this.isHost) {
        this.broadcast(ping);
        for (const id of [...this.conns.keys()]) if (now - (this.lastSeen.get(id) ?? now) > PEER_TIMEOUT) this.dropClient(id);
      } else if (this.hostConn) {
        try { this.hostConn.send(ping); } catch { /* connection closing */ }
        if (now - (this.lastSeen.get("host") ?? now) > PEER_TIMEOUT) {
          this.lastSeen.set("host", now);
          this.events.emit("hostLost", {});
        }
      }
    }, PING_INTERVAL);
  }

  usedCharacters(exceptId?: string): Set<CharacterId> {
    return new Set(Object.entries(this.players).filter(([id]) => id !== exceptId).map(([, p]) => p.character));
  }

  allReady(): boolean {
    const list = Object.values(this.players);
    return list.length >= 2 && list.every(p => p.ready);
  }

  changeCharacter(character: CharacterId): void {
    if (!this.localId) return;
    if (this.isHost) {
      if (this.usedCharacters(this.localId).has(character)) return;
      this.players[this.localId].character = character;
      this.broadcastPlayers();
    } else {
      this.hostConn?.send({ type: "changeChar", character } satisfies Message);
    }
  }

  /** Ask to be the villain with this kit, or to run (null). */
  changeWish(villain: KitId | null): void {
    if (!this.localId) return;
    if (this.isHost) {
      this.players[this.localId].villain = villain;
      this.broadcastPlayers();
    } else {
      this.hostConn?.send({ type: "wish", villain } satisfies Message);
    }
  }

  setReady(ready: boolean): void {
    this.hostConn?.send({ type: "ready", ready } satisfies Message);
  }

  /** Host: start the round for everyone (and decide who is the villain). */
  startGame(difficulty: DifficultyId): StartInfo {
    const info: StartInfo = { seed: randomSeed(), difficulty, players: this.players, ...pickVillains(this.players, Math.random) };
    this.start = info;
    this.broadcast({ type: "start", ...info });
    return info;
  }

  /** Client → host, or host → every client. */
  send(msg: GameMessage): void {
    if (this.isHost) this.broadcast(msg);
    else this.hostConn?.send(msg);
  }

  /** Host → every client except `exceptId`. */
  broadcast(msg: Message, exceptId?: string): void {
    this.conns.forEach((c, id) => {
      if (id === exceptId) return;
      try { c.send(msg); } catch { /* connection closing */ }
    });
  }

  /**
   * Leave the room. State resets immediately; the peer is destroyed after `lingerMs` so
   * messages still in flight (e.g. the host's round results) get delivered.
   */
  leave(lingerMs = 0): void {
    const peer = this.peer;
    this.peer = null;
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    this.lastSeen.clear();
    this.conns.clear();
    this.hostConn = null;
    this.isHost = false;
    this.roomId = null;
    this.localId = null;
    this.players = {};
    this.start = null;
    if (peer) {
      if (lingerMs > 0) setTimeout(() => peer.destroy(), lingerMs);
      else peer.destroy();
    }
  }

  private broadcastPlayers(): void {
    this.broadcast({ type: "players", players: this.players });
    this.events.emit("players", this.players);
  }

  private onHostMessage(from: string, msg: Message): void {
    if (msg.type === "ping") return;
    if (isGameMessage(msg)) { this.events.emit("game", { from, msg }); return; }
    const conn = this.conns.get(from);
    switch (msg.type) {
      case "join": {
        const used = this.usedCharacters(from);
        const wanted = isCharacterId(msg.character) ? msg.character : HERO_IDS[0];
        const character = used.has(wanted) ? HERO_IDS.find(c => !used.has(c)) ?? wanted : wanted;
        this.players[from] = { character, ready: false, villain: isKitId(msg.villain) ? msg.villain : null };
        conn?.send({ type: "charAssigned", character } satisfies Message);
        this.broadcastPlayers();
        break;
      }
      case "changeChar": {
        const p = this.players[from];
        if (!p) break;
        if (isCharacterId(msg.character) && !this.usedCharacters(from).has(msg.character)) {
          p.character = msg.character;
        }
        conn?.send({ type: "charAssigned", character: p.character } satisfies Message);
        this.broadcastPlayers();
        break;
      }
      case "wish":
        if (this.players[from]) this.players[from].villain = isKitId(msg.villain) ? msg.villain : null;
        this.broadcastPlayers();
        break;
      case "ready":
        if (this.players[from]) this.players[from].ready = !!msg.ready;
        this.broadcastPlayers();
        break;
    }
  }

  private onClientMessage(msg: Message): void {
    if (msg.type === "ping") return;
    if (isGameMessage(msg)) { this.events.emit("game", { from: "host", msg }); return; }
    switch (msg.type) {
      case "players":
        this.players = msg.players;
        this.events.emit("players", msg.players);
        break;
      case "charAssigned":
        this.events.emit("charAssigned", msg.character);
        break;
      case "start": {
        const { type: _type, ...info } = msg;
        this.start = info;
        this.players = info.players;
        this.events.emit("start", info);
        break;
      }
    }
  }
}

export const session = new Session();
