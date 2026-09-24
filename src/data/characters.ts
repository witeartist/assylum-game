import type { Role } from "../core/types";

export type CharacterId = "Naumi" | "Kuruna" | "Wite" | "Sumrak" | "Yoko" | "Foxmind" | "Jeloch";

export interface CharacterDef {
  id: CharacterId;
  /** Name shown in the game. */
  name: string;
  role: Role;
  /** Signature color (name tags, UI accents). */
  color: string;
  /** Texture key from the asset manifest. */
  texture: string;
  /** On-screen sprite height, px. */
  height: number;
  /** Collision box side, px. */
  body: number;
  /** One-line description for the character select screen. */
  desc: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  Naumi:   { id: "Naumi",   name: "Naumi",   role: "runner", color: "#e879a0", texture: "char.Naumi",   height: 30, body: 22, desc: "Быстрая. Осторожная." },
  Kuruna:  { id: "Kuruna",  name: "Kuruna",  role: "runner", color: "#5baef7", texture: "char.Kuruna",  height: 30, body: 22, desc: "Тихий. Невидимый в тени." },
  Wite:    { id: "Wite",    name: "Wite",    role: "runner", color: "#e8e8e8", texture: "char.Wite",    height: 30, body: 22, desc: "Слабая, но везучая." },
  Sumrak:  { id: "Sumrak",  name: "Sumrak",  role: "runner", color: "#7a7a9a", texture: "char.Sumrak",  height: 30, body: 22, desc: "Знает все тёмные углы." },
  Yoko:    { id: "Yoko",    name: "Yoko",    role: "runner", color: "#f1a127", texture: "char.Yoko",    height: 30, body: 22, desc: "Дерзкая. Не сдаётся." },
  Foxmind: { id: "Foxmind", name: "Foxmind", role: "hunter", color: "#e84040", texture: "char.Foxmind", height: 36, body: 14, desc: "ЗЛОДЕЙ. Лови бегущих!" },
  Jeloch:  { id: "Jeloch",  name: "Желочь",  role: "boss",   color: "#5ec45e", texture: "char.Jeloch",  height: 48, body: 10, desc: "" },
};

export const RUNNER_IDS: CharacterId[] = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
export const HUNTER_ID: CharacterId = "Foxmind";
export const BOSS_ID: CharacterId = "Jeloch";
/** Characters a player can pick. */
export const PLAYABLE_IDS: CharacterId[] = [...RUNNER_IDS, HUNTER_ID];

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === "string" && v in CHARACTERS;
}
