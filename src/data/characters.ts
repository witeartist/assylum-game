// The heroes and the villain's skill sets. Any hero can be the villain: an infected version of
// them, with one of the kits below (shared for now; later every hero gets their own).

/** The five heroes. */
export type CharacterId = "Naumi" | "Kuruna" | "Wite" | "Sumrak" | "Yoko";
/** The villain's skill set: named after the monsters the game had before. */
export type KitId = "fox" | "brute";

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
  /** Signature color (name tags, UI accents). */
  color: string;
  /** Texture key from the asset manifest. */
  texture: string;
  /** The infected skin (a tinted copy of `texture` until its art arrives). */
  infected: string;
  /** On-screen sprite height, px. */
  height: number;
  /** Collision box side, px. */
  body: number;
  /** One-line description for the character select screen. */
  desc: string;
  ability?: Ability;
}

export interface KitDef {
  id: KitId;
  /** Name of the kit (the monster it comes from). */
  name: string;
  color: string;
  /** Collision box side of an infected hero with this kit, px. */
  body: number;
  /** Infected heroes stand this much taller. */
  heightMul: number;
  /** How far a villain player makes out unlit things, tiles. */
  darkSight: number;
  /** One line for the menus: what you get playing it. */
  text: string;
  /** One line for the menus: what a runner is up against. */
  threat: string;
}

const infectedKey = (id: string) => "characters/" + id.toLowerCase() + "_infected";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  Naumi:   { id: "Naumi",   name: "Naumi",   color: "#e879a0", texture: "char.Naumi",   infected: infectedKey("Naumi"),  height: 30, body: 22, desc: "Быстрая. Осторожная.",
    ability: { text: "На 10% быстрее, бегает тише", speed: 1.1, runNoise: 0.7 } },
  Kuruna:  { id: "Kuruna",  name: "Kuruna",  color: "#5baef7", texture: "char.Kuruna",  infected: infectedKey("Kuruna"), height: 30, body: 22, desc: "Тихий. Невидимый в тени.",
    ability: { text: "В темноте злодей замечает его вдвое ближе", darkStealth: 0.5 } },
  Wite:    { id: "Wite",    name: "Wite",    color: "#e8e8e8", texture: "char.Wite",    infected: infectedKey("Wite"),   height: 30, body: 22, desc: "Слабая, но везучая.",
    ability: { text: "Чуть медленнее, но раз за раунд вырывается из лап; видит предметы в темноте", speed: 0.95, breakFree: 1, itemSense: 7 } },
  Sumrak:  { id: "Sumrak",  name: "Sumrak",  color: "#7a7a9a", texture: "char.Sumrak",  infected: infectedKey("Sumrak"), height: 30, body: 22, desc: "Знает все тёмные углы.",
    ability: { text: "Видит ключи и укрытия сквозь тьму, взламывает быстрее", objectSense: 9, hackSpeed: 1.6 } },
  Yoko:    { id: "Yoko",    name: "Yoko",    color: "#f1a127", texture: "char.Yoko",    infected: infectedKey("Yoko"),   height: 30, body: 22, desc: "Дерзкая. Не сдаётся.",
    ability: { text: "Больше выносливости; свист [Q] уводит злодея за собой", stamina: 1.4, whistle: true } },
};

export const KITS: Record<KitId, KitDef> = {
  fox: {
    id: "fox", name: "Лиса", color: "#e84040", body: 14, heightMul: 1.15, darkSight: 4.5,
    text: "Скорость и зрение в темноте. [R] вспышка, [E] обыскать укрытие",
    threat: "быстрый, видит в темноте, вспышкой находит спрятавшихся",
  },
  brute: {
    id: "brute", name: "Желочь", color: "#5ec45e", body: 12, heightMul: 1.25, darkSight: 2.6,
    text: "Чует след беглецов, лампы рядом гаснут. [Shift] рывок, [E] выбить дверь, [R] рёв",
    threat: "медленный, но идёт по следу; лампы рядом гаснут, рёв глушит фонарики",
  },
};

export const HERO_IDS: CharacterId[] = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
export const KIT_IDS: KitId[] = ["fox", "brute"];

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === "string" && v in CHARACTERS;
}

export function isKitId(v: unknown): v is KitId {
  return typeof v === "string" && v in KITS;
}

/** How the villain is called: the hero it was and its kit. */
export function villainName(character: CharacterId, kit: KitId): string {
  return CHARACTERS[character].name + " · " + KITS[kit].name;
}
