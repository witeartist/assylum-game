// Every message peers exchange. Clients talk only to the host; the host relays.
import type { RunnerStatus } from "../core/types";
import type { CharacterId } from "../data/characters";
import type { DifficultyId } from "../data/difficulty";
import type { NetState } from "../entities/Actor";

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
  | { type: "escaped"; id: string }
  | { type: "caught"; id: string; by: string }                // host → clients
  | { type: "boss" }                                          // host → clients
  | { type: "left"; id: string }                              // host → clients
  | { type: "end"; results: Record<string, RunnerStatus> };   // host → clients

/** Heartbeat: both sides send it every second so a silent peer (closed tab, lost network) is noticed. */
export type PingMessage = { type: "ping" };

export type Message = LobbyMessage | GameMessage | PingMessage;

const GAME_TYPES = new Set<string>(["pos", "snap", "key", "door", "hide", "escaped", "caught", "boss", "left", "end"]);

export function isGameMessage(m: Message): m is GameMessage {
  return GAME_TYPES.has(m.type);
}
