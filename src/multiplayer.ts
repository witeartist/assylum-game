// ============================================================
//  ASSYLUM — multiplayer.ts — PeerJS P2P multiplayer with sync
// ============================================================
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { generateLevelData, type LevelData } from "./level";

export interface PlayerInfo {
  name: string;
  character: string;
  ready: boolean;
  isHost?: boolean;
}

export const MP = {
  peer: null as Peer | null,
  connections: [] as DataConnection[],
  hostConn: null as DataConnection | null,
  isHost: false,
  roomId: null as string | null,
  players: {} as Record<string, PlayerInfo>,
  localPeerId: null as string | null,
  active: false,
  levelSeed: 0,
  levelData: null as LevelData | null,
  foxPlayerId: null as string | null,

  onPlayersUpdate: null as ((players: Record<string, PlayerInfo>) => void) | null,
  onGameStart: null as ((data: any) => void) | null,
  onPeerPos: null as ((peerId: string, x: number, y: number, vx?: number, vy?: number) => void) | null,
  onPeerCaught: null as ((peerId: string, catcherName: string) => void) | null,
  onKeyCollected: null as ((index: number, peerId?: string) => void) | null,
  onDoorOpened: null as ((index: number) => void) | null,
  onBossSpawned: null as (() => void) | null,
  onPeerEscaped: null as ((peerId: string) => void) | null,
  onNpcPositions: null as ((npcs: any[]) => void) | null,
  onCharAssigned: null as ((ch: string) => void) | null,
  onNpcCaught: null as ((npcName: string, catcherName: string) => void) | null,
  onHostCatch: null as ((catcherName: string) => void) | null,
};

// ── Host-side player state tracking (for authoritative catches) ──
const _hostPlayerStates = new Map<string, {x: number, y: number, vx: number, vy: number, hiding: boolean, alive: boolean}>();
export function getHostPlayerStates() { return _hostPlayerStates; }

// ── Throttled position sending ───────────────────────────────
let _lastPosSend = 0;
let _lastFoxPosSend = 0;
let _lastBossPosSend = 0;
const POS_SEND_INTERVAL = 33;

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function hostRoom(character: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const code = generateRoomCode();
    const peerId = "assylum-host-" + code;
    const peer = new Peer(peerId);
    peer.on("open", () => {
      MP.peer = peer;
      MP.isHost = true;
      MP.roomId = code;
      MP.localPeerId = peerId;
      MP.players[peerId] = { name: character, ready: true, character, isHost: true };

      peer.on("connection", (conn) => {
        conn.on("open", () => {
          MP.connections.push(conn);
          conn.on("data", (data: any) => handleHostMessage(conn, data));
          const removePeer = () => {
            MP.connections = MP.connections.filter(c => c !== conn);
            delete MP.players[conn.peer];
            _hostPlayerStates.delete(conn.peer);
            broadcastPlayers();
          };
          conn.on("close", removePeer);
          conn.on("error", removePeer);
        });
      });
      resolve(code);
    });
    peer.on("error", reject);
  });
}

export function joinRoom(code: string, character: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const localId = "assylum-player-" + code + "-" + Math.random().toString(36).slice(2, 7);
    const peer = new Peer(localId);
    peer.on("open", () => {
      MP.peer = peer;
      MP.isHost = false;
      MP.roomId = code;
      MP.localPeerId = localId;

      const hostId = "assylum-host-" + code;
      const conn = peer.connect(hostId, { reliable: true });
      conn.on("open", () => {
        MP.hostConn = conn;
        conn.send({ type: "join", character, peerId: localId });
        conn.on("data", (data: any) => handleClientMessage(data));
        resolve(code);
      });
      conn.on("error", reject);
    });
    peer.on("error", reject);
  });
}

export function mpSendReady(ready: boolean) {
  if (MP.hostConn) {
    MP.hostConn.send({ type: "ready", peerId: MP.localPeerId, ready });
  }
}

export function getUsedCharacters(): Set<string> {
  const used = new Set<string>();
  for (const p of Object.values(MP.players)) {
    if (p.character) used.add(p.character);
  }
  return used;
}

export function allPlayersReady(): boolean {
  const entries = Object.values(MP.players);
  if (entries.length < 2) return false;
  return entries.every(p => p.ready);
}

let _lastNpcPosSend = 0;
const NPC_POS_SEND_INTERVAL = 80;

export function mpSendNpcPositions(npcDataArray: { name: string; x: number; y: number }[]) {
  if (!MP.isHost) return;
  const now = performance.now();
  if (now - _lastNpcPosSend < NPC_POS_SEND_INTERVAL) return;
  _lastNpcPosSend = now;
  broadcastToAll({ type: "npcPositions", npcs: npcDataArray });
}

// ── Host message handler ─────────────────────────────────────
function handleHostMessage(conn: DataConnection, data: any) {
  switch (data.type) {
    case "join": {
      const used = getUsedCharacters();
      let char = data.character;
      if (used.has(char)) {
        const all = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
        char = all.find(c => !used.has(c)) || char;
      }
      MP.players[data.peerId] = { name: char, character: char, ready: false };
      try { conn.send({ type: "charAssigned", character: char }); } catch(e) {}
      broadcastPlayers();
      break;
    }
    case "changeChar": {
      const used = getUsedCharacters();
      const want = data.character;
      if (!used.has(want) || (MP.players[conn.peer] && MP.players[conn.peer].character === want)) {
        if (MP.players[conn.peer]) MP.players[conn.peer].character = want;
        if (MP.players[conn.peer]) MP.players[conn.peer].name = want;
        try { conn.send({ type: "charAssigned", character: want }); } catch(e) {}
      } else {
        const cur = MP.players[conn.peer] ? MP.players[conn.peer].character : "Naumi";
        try { conn.send({ type: "charAssigned", character: cur }); } catch(e) {}
      }
      broadcastPlayers();
      break;
    }
    case "ready":
      if (MP.players[data.peerId]) MP.players[data.peerId].ready = data.ready;
      broadcastPlayers();
      break;
    case "pos": {
      broadcastExcept(conn, { type: "peerPos", peerId: conn.peer, x: data.x, y: data.y, vx: data.vx || 0, vy: data.vy || 0 });
      if (MP.onPeerPos) MP.onPeerPos(conn.peer, data.x, data.y, data.vx, data.vy);
      let ps = _hostPlayerStates.get(conn.peer);
      if (!ps) { ps = {x: 0, y: 0, vx: 0, vy: 0, hiding: false, alive: true}; _hostPlayerStates.set(conn.peer, ps); }
      ps.x = data.x; ps.y = data.y; ps.vx = data.vx || 0; ps.vy = data.vy || 0;
      break;
    }
    case "hiding": {
      const hps = _hostPlayerStates.get(conn.peer);
      if (hps) hps.hiding = data.hiding;
      break;
    }
    case "keyCollected":
      broadcastExcept(conn, { type: "keyCollected", index: data.index, peerId: conn.peer });
      if (MP.onKeyCollected) MP.onKeyCollected(data.index, conn.peer);
      break;
    case "doorOpened":
      broadcastExcept(conn, { type: "doorOpened", index: data.index });
      if (MP.onDoorOpened) MP.onDoorOpened(data.index);
      break;
  }
}

// ── Client message handler ───────────────────────────────────
function handleClientMessage(data: any) {
  switch (data.type) {
    case "players":
      MP.players = data.players;
      if (MP.onPlayersUpdate) MP.onPlayersUpdate(data.players);
      break;
    case "startGame":
      MP.active = true;
      MP.levelSeed = data.seed;
      MP.levelData = data.levelData || null;
      MP.foxPlayerId = data.foxPlayerId || null;
      if (MP.onGameStart) MP.onGameStart(data);
      break;
    case "peerPos":
      if (MP.onPeerPos) MP.onPeerPos(data.peerId, data.x, data.y, data.vx, data.vy);
      break;
    case "hostPos":
      if (MP.onPeerPos) MP.onPeerPos(data.peerId, data.x, data.y, data.vx, data.vy);
      break;
    case "foxPos":
      if (MP.onPeerPos) MP.onPeerPos("__fox__", data.x, data.y, data.vx, data.vy);
      break;
    case "bossPos":
      if (MP.onPeerPos) MP.onPeerPos("__boss__", data.x, data.y, data.vx, data.vy);
      break;
    case "hostCatch":
      if (MP.onHostCatch) MP.onHostCatch(data.catcherName);
      break;
    case "keyCollected":
      if (MP.onKeyCollected) MP.onKeyCollected(data.index, data.peerId);
      break;
    case "doorOpened":
      if (MP.onDoorOpened) MP.onDoorOpened(data.index);
      break;
    case "peerCaught":
      if (MP.onPeerCaught) MP.onPeerCaught(data.peerId, data.catcherName);
      break;
    case "bossSpawned":
      if (MP.onBossSpawned) MP.onBossSpawned();
      break;
    case "peerEscaped":
      if (MP.onPeerEscaped) MP.onPeerEscaped(data.peerId);
      break;
    case "npcPositions":
      if (MP.onNpcPositions) MP.onNpcPositions(data.npcs);
      break;
    case "charAssigned":
      if (MP.onCharAssigned) MP.onCharAssigned(data.character);
      break;
    case "npcCaught":
      if (MP.onNpcCaught) MP.onNpcCaught(data.npcName, data.catcherName);
      break;
  }
}

// ── Broadcasting helpers ─────────────────────────────────────
function broadcastToAll(msg: any) {
  MP.connections.forEach(c => { try { c.send(msg); } catch(e) {} });
}

function broadcastExcept(excludeConn: DataConnection, msg: any) {
  MP.connections.forEach(c => {
    if (c !== excludeConn) { try { c.send(msg); } catch(e) {} }
  });
}

export function broadcastPlayers() {
  const msg = { type: "players", players: MP.players };
  broadcastToAll(msg);
  if (MP.onPlayersUpdate) MP.onPlayersUpdate(MP.players);
}

// ── Game actions ─────────────────────────────────────────────
export function mpSendPosition(x: number, y: number, vx: number = 0, vy: number = 0) {
  const now = performance.now();
  if (now - _lastPosSend < POS_SEND_INTERVAL) return;
  _lastPosSend = now;
  if (MP.isHost) {
    broadcastToAll({ type: "hostPos", peerId: MP.localPeerId, x, y, vx, vy });
  } else if (MP.hostConn) {
    MP.hostConn.send({ type: "pos", x, y, vx, vy });
  }
}

export function mpSendFoxPos(x: number, y: number, vx: number = 0, vy: number = 0) {
  if (!MP.isHost) return;
  const now = performance.now();
  if (now - _lastFoxPosSend < POS_SEND_INTERVAL) return;
  _lastFoxPosSend = now;
  broadcastToAll({ type: "foxPos", x, y, vx, vy });
}

export function mpSendBossPos(x: number, y: number, vx: number = 0, vy: number = 0) {
  if (!MP.isHost) return;
  const now = performance.now();
  if (now - _lastBossPosSend < POS_SEND_INTERVAL) return;
  _lastBossPosSend = now;
  broadcastToAll({ type: "bossPos", x, y, vx, vy });
}

export function mpSendKeyCollected(index: number) {
  if (MP.isHost) {
    broadcastToAll({ type: "keyCollected", index, peerId: MP.localPeerId });
  } else if (MP.hostConn) {
    MP.hostConn.send({ type: "keyCollected", index });
  }
}

export function mpSendDoorOpened(index: number) {
  if (MP.isHost) {
    broadcastToAll({ type: "doorOpened", index });
  } else if (MP.hostConn) {
    MP.hostConn.send({ type: "doorOpened", index });
  }
}

export function mpSendCaught(peerId: string, catcherName: string) {
  if (MP.isHost) broadcastToAll({ type: "peerCaught", peerId, catcherName });
}

export function mpSendBossSpawned() {
  if (MP.isHost) broadcastToAll({ type: "bossSpawned" });
}

export function mpSendEscaped(peerId: string) {
  if (MP.isHost) broadcastToAll({ type: "peerEscaped", peerId });
}

export function mpSendNpcCaught(npcName: string, catcherName: string) {
  if (MP.isHost) broadcastToAll({ type: "npcCaught", npcName, catcherName });
}

export function mpSendHidingState(hiding: boolean) {
  if (MP.hostConn) MP.hostConn.send({ type: "hiding", hiding });
}

export function mpSendHostCatch(peerId: string, catcherName: string) {
  if (!MP.isHost) return;
  const conn = MP.connections.find(c => c.peer === peerId);
  if (conn) try { conn.send({ type: "hostCatch", catcherName }); } catch(e) {}
  broadcastToAll({ type: "peerCaught", peerId, catcherName });
  const ps = _hostPlayerStates.get(peerId);
  if (ps) ps.alive = false;
}

export function isMultiplayer(): boolean {
  return MP.active;
}

export function hostStartGame(difficulty: string, levelData: LevelData) {
  const seed = Date.now();
  MP.levelSeed = seed;
  MP.active = true;
  MP.levelData = levelData || null;
  MP.foxPlayerId = null;
  for (const [pid, p] of Object.entries(MP.players)) {
    if (p.character === 'Foxmind') { MP.foxPlayerId = pid; break; }
  }
  const msg = { type: "startGame", seed, players: MP.players, difficulty, levelData: levelData || null, foxPlayerId: MP.foxPlayerId };
  broadcastToAll(msg);
}

export function cleanupMultiplayer() {
  if (MP.peer) { MP.peer.destroy(); MP.peer = null; }
  MP.connections = [];
  _hostPlayerStates.clear();
  MP.hostConn = null;
  MP.isHost = false;
  MP.roomId = null;
  MP.localPeerId = null;
  MP.players = {};
  MP.active = false;
  MP.levelSeed = 0;
  MP.levelData = null;
  MP.foxPlayerId = null;
  MP.onPlayersUpdate = null;
  MP.onGameStart = null;
  MP.onPeerPos = null;
  MP.onPeerCaught = null;
  MP.onKeyCollected = null;
  MP.onDoorOpened = null;
  MP.onBossSpawned = null;
  MP.onPeerEscaped = null;
  MP.onNpcPositions = null;
  MP.onCharAssigned = null;
  MP.onHostCatch = null;
  MP.onNpcCaught = null;
}
