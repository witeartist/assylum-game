// Every message peers exchange. Clients talk only to the host; the host relays.
import type { RunnerStatus } from "../core/types";
import type { CharacterId } from "../data/characters";
import type { DifficultyId } from "../data/difficulty";
import type { ItemKind } from "../data/items";
import type { NetState } from "../entities/state";
import type { NoiseKind } from "../systems/noise";

export interface PlayerInfo {
  character: CharacterId;
  ready: boolean;
  isHost?: boolean;
}

export interface StartInfo {
  seed: number;
  difficulty: DifficultyId;
  /** Peer playing the hunter, or null (then the host runs an AI hunter). */
  foxPlayerId: string | null;
  players: Record<string, PlayerInfo>;
}

/** Lobby phase. */
export type LobbyMessage =
  | { type: "join"; character: CharacterId }
  | { type: "changeChar"; character: CharacterId }
  | { type: "ready"; ready: boolean }
  | { type: "players"; players: Record<string, PlayerInfo> }
  | { type: "charAssigned"; character: CharacterId }
  | ({ type: "start" } & StartInfo);

/** Round phase. `id` is an actor id: a peer id, "ai:fox" or "ai:boss". */
export type GameMessage =
  | ({ type: "pos" } & NetState)                              // client → host: own position
  | { type: "snap"; actors: ({ id: string } & NetState)[] }   // host → clients: everyone's position
  | { type: "key"; index: number; by: string }
  | { type: "door"; index: number; by: string }
  | { type: "hide"; id: string; on: boolean }
  | { type: "item"; index: number; by: string }
  | { type: "gate"; index: number; open: boolean; by: string }
  | { type: "throw"; kind: ItemKind | "whistle"; by: string; x: number; y: number; tx: number; ty: number }
  | { type: "fuse"; op: "pick" | "insert"; index: number; by: string }
  | { type: "fuseDrop"; index: number; x: number; y: number }       // host → clients
  | { type: "noise"; x: number; y: number; r: number; kind: NoiseKind; by: string }
  | { type: "check"; index: number; by: string }                   // client → host: search a spot; host → clients: it's open
  | { type: "freed"; id: string; by: string }                      // host → clients: a runner broke free
  | { type: "escaped"; id: string }
  | { type: "caught"; id: string; by: string }                // host → clients
  | { type: "boss" }                                          // host → clients
  | { type: "left"; id: string }                              // host → clients
  | { type: "end"; results: Record<string, RunnerStatus> };   // host → clients

/** Heartbeat: both sides send it every second so a silent peer (closed tab, lost network) is noticed. */
export type PingMessage = { type: "ping" };

export type Message = LobbyMessage | GameMessage | PingMessage;

const GAME_TYPES = new Set<string>(["pos", "snap", "key", "door", "hide", "item", "gate", "throw", "fuse", "fuseDrop", "noise", "check", "freed", "escaped", "caught", "boss", "left", "end"]);

export function isGameMessage(m: Message): m is GameMessage {
  return GAME_TYPES.has(m.type);
}
