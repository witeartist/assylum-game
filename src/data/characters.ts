// The heroes and the villain's skill sets. Any hero can be the villain: an infected version of
// them, with one of the kits below — the shared ones, or a kit of the hero's own (`owner`).

/** The five heroes. */
export type CharacterId = "Naumi" | "Kuruna" | "Wite" | "Sumrak" | "Yoko";
/** The villain's skill set: the shared ones are named after the monsters the game had before. */
export type KitId = "fox" | "brute" | "blight";

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
  /** Four views (front, back, left, right) once the turnaround arrives; they replace `texture`. */
  views?: { down: string; up: string; left: string; right: string };
  /** The same for the infected hero; they replace `infected`. */
  infectedViews?: { down: string; up: string; left: string; right: string };
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
  /** Only this hero has it (their own kit); shared kits have none. */
  owner?: CharacterId;
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
const viewKeys = (name: string) => ({
  down: `characters/${name}_down`, up: `characters/${name}_up`, left: `characters/${name}_left`, right: `characters/${name}_right`,
});

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  Naumi:   { id: "Naumi",   name: "Naumi",   color: "#e879a0", texture: "char.Naumi",   infected: infectedKey("Naumi"),  height: 30, body: 22, desc: "Быстрая. Осторожная.",
    views: viewKeys("naumi"), infectedViews: viewKeys("naumi_infected"),
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
  // Naumi's own: the infection cracked her crystal horns and burns violet in her tail.
  blight: {
    id: "blight", name: "Скверна", owner: "Naumi", color: "#a878ff", body: 13, heightMul: 1.15, darkSight: 3.4,
    text: "Метит беглецов — меченых видит сквозь стены. [R] искра из рогов, [Q] ловушка скверны, [E] обыскать укрытие",
    threat: "метит искрой и ловушками скверны на полу; меченого видит сквозь стены",
  },
};

export const HERO_IDS: CharacterId[] = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
export const KIT_IDS: KitId[] = ["fox", "brute", "blight"];

/** Kits `character` can take as the villain: the shared ones and their own. */
export function kitsFor(character: CharacterId): KitId[] {
  return KIT_IDS.filter(k => kitAllowed(k, character));
}

export function kitAllowed(kit: KitId, character: CharacterId): boolean {
  const owner = KITS[kit].owner;
  return !owner || owner === character;
}

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
