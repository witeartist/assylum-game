// Actor factories: every character type is created in exactly one place.
import { tileCenter } from "../core/geom";
import type { Tile } from "../core/types";
import { CHARACTERS, BOSS_ID, HUNTER_ID, type CharacterId } from "../data/characters";
import { BOT_SPEED_RANGE, RUNNER_SPEED } from "../data/balance";
import { Actor, type Control } from "../entities/Actor";
import { RunnerBot } from "../ai/runnerBot";
import { HunterAI } from "../ai/hunter";
import { BossAI } from "../ai/boss";
import type { World } from "./World";

export const HUNTER_AI_ID = "ai:fox";
export const BOSS_AI_ID = "ai:boss";

function speedFor(world: World, id: CharacterId): number {
  const role = CHARACTERS[id].role;
  return role === "hunter" ? world.diff.foxSpeed : role === "boss" ? world.diff.bossSpeed : RUNNER_SPEED;
}

function spawn(world: World, id: string, character: CharacterId, control: Control, tile: Tile, speed?: number): Actor {
  const a = new Actor(world.scene, {
    id, def: CHARACTERS[character], control, pos: tileCenter(tile), speed: speed ?? speedFor(world, character),
  });
  if (control !== "remote") world.collision.collide(a);
  return world.addActor(a);
}

function spawnTile(world: World, character: CharacterId): Tile {
  return CHARACTERS[character].role === "hunter" ? world.level.foxSpawn : world.level.playerSpawn;
}

/** The player on this machine. */
export function spawnLocalPlayer(world: World, id: string, character: CharacterId): Actor {
  world.local = spawn(world, id, character, "local", spawnTile(world, character));
  return world.local;
}

/** Another player's character, driven by network updates. */
export function spawnRemotePlayer(world: World, id: string, character: CharacterId): Actor {
  return spawn(world, id, character, "remote", spawnTile(world, character));
}

export function spawnRunnerBot(world: World, character: CharacterId, tile: Tile): Actor {
  const [lo, hi] = BOT_SPEED_RANGE;
  const a = spawn(world, "bot:" + character, character, "bot", tile, RUNNER_SPEED * world.rng.range(lo, hi));
  a.brain = new RunnerBot(world, a);
  return a;
}

/** AI hunter: simulated by the authority, mirrored on clients. */
export function spawnHunterAI(world: World): Actor {
  const control: Control = world.isAuthority ? "ai" : "remote";
  const a = spawn(world, HUNTER_AI_ID, HUNTER_ID, control, world.level.foxSpawn);
  if (control === "ai") a.brain = new HunterAI(world, a);
  return a;
}

export function spawnBoss(world: World): Actor {
  const control: Control = world.isAuthority ? "ai" : "remote";
  const a = spawn(world, BOSS_AI_ID, BOSS_ID, control, world.level.bossSpawn);
  if (control === "ai") a.brain = new BossAI(world, a);
  return a;
}
