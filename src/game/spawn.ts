// Actor factories: every kind of character is created in exactly one place. A villain is an
// infected hero with a kit (data/characters.ts): its speeds, look and brain come from the kit.
import { tileCenter } from "../core/geom";
import type { Role, Tile } from "../core/types";
import { CHARACTERS, type CharacterId, type KitId } from "../data/characters";
import { BOSS_RUSH, BOT_SPEED_RANGE, BRUTE_LUNGE, HUNTER_WALK, RUNNER_RUN, RUNNER_WALK, STAMINA } from "../data/balance";
import { Actor, type Control } from "../entities/Actor";
import { RunnerBot } from "../ai/runnerBot";
import { HunterAI } from "../ai/hunter";
import { BossAI } from "../ai/boss";
import type { World } from "./World";

/** The villain the authority's AI plays (same id on every peer). */
export const VILLAIN_AI_ID = "ai:villain";

/** Who someone plays: a hero as a runner, or that hero infected, with a kit. */
export interface Part { character: CharacterId; role: Role; kit: KitId | null; }

export function runnerPart(character: CharacterId): Part { return { character, role: "runner", kit: null }; }
export function villainPart(character: CharacterId, kit: KitId): Part { return { character, role: "hunter", kit }; }

/** Walking and running speed (px/s) and seconds of running (`mul` = a bot's personal pace). */
function speedsFor(world: World, part: Part, control: Control, mul = 1): { walk: number; run: number; stamina: number } {
  const d = world.diff;
  if (part.kit === "fox") return { walk: d.foxSpeed * HUNTER_WALK, run: d.foxSpeed, stamina: Infinity };
  if (part.kit === "brute" && control === "ai") return { walk: d.bossSpeed, run: d.bossSpeed * BOSS_RUSH, stamina: Infinity };
  if (part.kit === "brute") return { walk: d.foxSpeed * HUNTER_WALK, run: RUNNER_RUN * BRUTE_LUNGE.speed, stamina: BRUTE_LUNGE.time };
  const ab = CHARACTERS[part.character].ability, k = (ab?.speed ?? 1) * mul;
  return { walk: RUNNER_WALK * k, run: RUNNER_RUN * k, stamina: STAMINA.max * (ab?.stamina ?? 1) };
}

/** Runners start together; villains in their lairs, far away (a second villain in the next one). */
function spawnTile(world: World, part: Part): Tile {
  if (!part.kit) return world.level.playerSpawn;
  const lairs = world.level.villainSpawns, before = world.actors.filter(a => a.kit).length;
  return lairs[before % lairs.length];
}

function spawn(world: World, id: string, part: Part, control: Control, tile: Tile, pace = 1): Actor {
  const a = new Actor(world.scene, {
    id, def: CHARACTERS[part.character], role: part.role, kit: part.kit, control, pos: tileCenter(tile), ...speedsFor(world, part, control, pace),
  });
  if (control !== "remote") world.collision.collide(a);
  return world.addActor(a);
}

/** The player on this machine. */
export function spawnLocalPlayer(world: World, id: string, part: Part): Actor {
  world.local = spawn(world, id, part, "local", spawnTile(world, part));
  return world.local;
}

/** Another player's character, driven by network updates. */
export function spawnRemotePlayer(world: World, id: string, part: Part): Actor {
  return spawn(world, id, part, "remote", spawnTile(world, part));
}

export function spawnRunnerBot(world: World, character: CharacterId, tile: Tile): Actor {
  const [lo, hi] = BOT_SPEED_RANGE;
  const a = spawn(world, "bot:" + character, runnerPart(character), "bot", tile, world.rng.range(lo, hi));
  a.brain = new RunnerBot(world, a);
  return a;
}

/** The AI villain: simulated by the authority, mirrored on clients. */
export function spawnVillainAI(world: World, character: CharacterId, kit: KitId): Actor {
  const control: Control = world.isAuthority ? "ai" : "remote";
  const part = villainPart(character, kit);
  const a = spawn(world, VILLAIN_AI_ID, part, control, spawnTile(world, part));
  if (control === "ai") a.brain = kit === "fox" ? new HunterAI(world, a) : new BossAI(world, a);
  return a;
}
