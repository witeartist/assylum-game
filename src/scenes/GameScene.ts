// The round. Builds the world (level, actors, systems) and runs the systems each frame.
import Phaser from "phaser";
import { WORLD_W, WORLD_H } from "../core/constants";
import { playMusic } from "../core/audio";
import { randomSeed } from "../core/rng";
import { CHARACTERS, RUNNER_IDS, type CharacterId } from "../data/characters";
import { DIFFICULTIES, type DifficultyId } from "../data/difficulty";
import { FOX_FLASH } from "../data/balance";
import { session } from "../net/session";
import { World, type NetMode } from "../game/World";
import { spawnHunterAI, spawnLocalPlayer, spawnRemotePlayer, spawnRunnerBot } from "../game/spawn";
import { generateLevel } from "../world/levelgen";
import { CollisionLayer } from "../world/collision";
import { buildWorldView } from "../render/worldView";
import { FogOverlay } from "../render/fogOverlay";
import { Lighting } from "../systems/lighting";
import { FoxFlash } from "../systems/foxFlash";
import { Hiding } from "../systems/hiding";
import { Doors } from "../systems/doors";
import { Objectives } from "../systems/objectives";
import { Round } from "../systems/round";
import { Director } from "../systems/director";
import { Noise } from "../systems/noise";
import { Vision } from "../systems/vision";
import { InputSystem } from "../systems/input";
import { NetSync } from "../systems/netsync";
import { updateCatches } from "../systems/catches";
import { bindEffects } from "../systems/effects";

export interface GameSceneData {
  character: CharacterId;
  difficulty: DifficultyId;
}

const CAMERA_LERP = 0.08;

export class GameScene extends Phaser.Scene {
  world: World | null = null;
  private params!: GameSceneData;
  private controls!: InputSystem;
  private fog!: FogOverlay;
  private netsync: NetSync | null = null;
  private failed = false;

  constructor() { super("Game"); }

  init(data: GameSceneData): void {
    this.params = data;
    this.world = null;
    this.netsync = null;
    this.failed = false;
  }

  create(): void {
    const start = session.active ? session.start : null;
    const diff = DIFFICULTIES[start ? start.difficulty : this.params.difficulty];
    const level = generateLevel(start ? start.seed : randomSeed(), diff.keyCount);
    const net: NetMode = !start ? "solo" : session.isHost ? "host" : "client";
    const w = new World(this, level, diff, net);

    playMusic();
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    buildWorldView(w);
    w.collision = new CollisionLayer(this, w.grid);
    w.lighting = new Lighting(w);
    w.hiding = new Hiding(w);
    w.doors = new Doors(w);
    w.objectives = new Objectives(w);

    if (start) {
      for (const [id, p] of Object.entries(start.players)) {
        if (id === session.localId) spawnLocalPlayer(w, id, p.character);
        else spawnRemotePlayer(w, id, p.character);
      }
      if (!start.foxPlayerId) spawnHunterAI(w);
    } else {
      const character = this.params.character;
      spawnLocalPlayer(w, "local", character);
      RUNNER_IDS.filter(id => id !== character)
        .forEach((id, i) => spawnRunnerBot(w, id, level.npcSpawns[i % level.npcSpawns.length]));
      if (CHARACTERS[character].role !== "hunter") spawnHunterAI(w);
    }
    // A human hunter starts with the flash ready; the AI hunter waits a full cooldown.
    w.foxFlash = new FoxFlash(w.local.role === "hunter" ? 0 : FOX_FLASH.cooldown);

    w.round = new Round(w);
    w.director = new Director(w);
    w.noise = new Noise(w);
    w.vision = new Vision(w);
    bindEffects(w);
    this.controls = new InputSystem(w);
    this.fog = new FogOverlay(w);
    if (net !== "solo") this.netsync = new NetSync(w);

    this.cameras.main.startFollow(w.local, true, CAMERA_LERP, CAMERA_LERP);
    this.world = w;
    this.scene.launch("Hud", { world: w });
    this.events.once("shutdown", () => this.dispose());
  }

  update(time: number, delta: number): void {
    const w = this.world;
    if (!w || w.round.finished) return;
    try {
      this.tick(w, time, delta / 1000);
    } catch (err) {
      // Keep the game loop alive; report the first failure only.
      if (!this.failed) console.error("[ASSYLUM] frame failed:", err);
      this.failed = true;
    }
  }

  private tick(w: World, time: number, dt: number): void {
    this.controls.update();
    if (w.isAuthority) for (const a of w.actors) if (a.brain && a.inPlay) a.brain.update(dt);
    w.objectives.update(dt);
    updateCatches(w);
    w.director.update(dt);
    w.foxFlash.update(dt);
    w.lighting.update(dt);
    w.noise.update(dt);
    w.vision.update();
    this.fog.render();
    this.netsync?.update(time);
  }

  private dispose(): void {
    this.netsync?.dispose();
    this.world?.events.clear();
    this.scene.stop("Hud");
  }
}
