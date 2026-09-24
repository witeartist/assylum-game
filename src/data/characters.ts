import type { Role } from "../core/types";

export type CharacterId = "Naumi" | "Kuruna" | "Wite" | "Sumrak" | "Yoko" | "Foxmind" | "Jeloch";

/** What makes a runner different. Every field is optional; 1 / absent means "as usual". */
export interface Ability {
  /** One line for the character select screen. */
  text: string;
  /** Multiplier on every gait. */
  speed?: number;
  /** Multiplier on how far running footsteps carry. */
  runNoise?: number;
  /** Multiplier on how close a hunter must be to notice him in the dark. */
  darkStealth?: number;
  /** Grabs the runner breaks free from per round. */
  breakFree?: number;
  /** Sees items glint through the dark this far, tiles. */
  itemSense?: number;
  /** Sees keys and hiding spots through the dark this far, tiles. */
  objectSense?: number;
  /** Multiplier on terminal hacking speed (a shorter code for players). */
  hackSpeed?: number;
  /** Multiplier on stamina. */
  stamina?: number;
  /** Q: a loud whistle that lures the hunter. */
  whistle?: boolean;
}

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
  ability?: Ability;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  Naumi:   { id: "Naumi",   name: "Naumi",   role: "runner", color: "#e879a0", texture: "char.Naumi",   height: 30, body: 22, desc: "Быстрая. Осторожная.",
    ability: { text: "На 10% быстрее, бегает тише", speed: 1.1, runNoise: 0.7 } },
  Kuruna:  { id: "Kuruna",  name: "Kuruna",  role: "runner", color: "#5baef7", texture: "char.Kuruna",  height: 30, body: 22, desc: "Тихий. Невидимый в тени.",
    ability: { text: "В темноте охотник замечает его вдвое ближе", darkStealth: 0.5 } },
  Wite:    { id: "Wite",    name: "Wite",    role: "runner", color: "#e8e8e8", texture: "char.Wite",    height: 30, body: 22, desc: "Слабая, но везучая.",
    ability: { text: "Чуть медленнее, но раз за раунд вырывается из лап; видит предметы в темноте", speed: 0.95, breakFree: 1, itemSense: 7 } },
  Sumrak:  { id: "Sumrak",  name: "Sumrak",  role: "runner", color: "#7a7a9a", texture: "char.Sumrak",  height: 30, body: 22, desc: "Знает все тёмные углы.",
    ability: { text: "Видит ключи и укрытия сквозь тьму, взламывает быстрее", objectSense: 9, hackSpeed: 1.6 } },
  Yoko:    { id: "Yoko",    name: "Yoko",    role: "runner", color: "#f1a127", texture: "char.Yoko",    height: 30, body: 22, desc: "Дерзкая. Не сдаётся.",
    ability: { text: "Больше выносливости; свист [Q] уводит охотника за собой", stamina: 1.4, whistle: true } },
  Foxmind: { id: "Foxmind", name: "Foxmind", role: "hunter", color: "#e84040", texture: "char.Foxmind", height: 36, body: 14, desc: "ЗЛОДЕЙ. Лови бегущих!",
    ability: { text: "Видит в темноте, слышит шаги; вспышка [R], обыск укрытий [E]" } },
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
