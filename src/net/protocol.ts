// Every message peers exchange. Clients talk only to the host; the host relays.
import type { RunnerStatus } from "../core/types";
import type { CharacterId, KitId } from "../data/characters";
import type { DifficultyId } from "../data/difficulty";
import type { ItemKind } from "../data/items";
import type { NetState } from "../entities/state";
import type { NoiseKind } from "../systems/noise";

export interface PlayerInfo {
  character: CharacterId;
  ready: boolean;
  isHost?: boolean;
  /** Wants to be the villain, with this kit (null: wants to run). */
  villain: KitId | null;
}

export interface StartInfo {
  seed: number;
  difficulty: DifficultyId;
  players: Record<string, PlayerInfo>;
  /** Players who are the villain this round (peer id → kit); the rest run. */
  villains: Record<string, KitId>;
  /** The villain the host's AI plays when no player is one, or null. */
  aiVillain: { character: CharacterId; kit: KitId } | null;
}

/** Lobby phase. */
export type LobbyMessage =
  | { type: "join"; character: CharacterId; villain: KitId | null }
  | { type: "changeChar"; character: CharacterId }
  | { type: "wish"; villain: KitId | null }
  | { type: "ready"; ready: boolean }
  | { type: "players"; players: Record<string, PlayerInfo> }
  | { type: "charAssigned"; character: CharacterId }
  | ({ type: "start" } & StartInfo);

/** Round phase. `id` is an actor id: a peer id, a bot's or the AI villain's ("ai:villain"). */
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
  | { type: "wake" }                                          // host → clients: the building woke up
  | { type: "ability"; by: string; x: number; y: number }     // a villain used its R (flash or roar) here
  | { type: "ai"; character: CharacterId; kit: KitId; x: number; y: number } // host → clients: the AI took over a villain who left
  | { type: "left"; id: string }                              // host → clients
  | { type: "end"; results: Record<string, RunnerStatus> };   // host → clients

/** Heartbeat: both sides send it every second so a silent peer (closed tab, lost network) is noticed. */
export type PingMessage = { type: "ping" };

export type Message = LobbyMessage | GameMessage | PingMessage;

const GAME_TYPES = new Set<string>(["pos", "snap", "key", "door", "hide", "item", "gate", "throw", "fuse", "fuseDrop", "noise", "check", "freed", "escaped", "caught", "wake", "ability", "ai", "left", "end"]);

export function isGameMessage(m: Message): m is GameMessage {
  return GAME_TYPES.has(m.type);
}
