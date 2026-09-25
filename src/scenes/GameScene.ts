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
import { WorldView } from "../render/worldView";
import { CameraRig } from "../render/cameraRig";
import { addDust } from "../render/dust";
import { LIGHTING_PIPELINE, LightingPipeline } from "../render/lighting/LightingPipeline";
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
import { Vitals } from "../systems/vitals";
import { Items } from "../systems/items";
import { Power } from "../systems/power";
import { Interact } from "../systems/interact";
import { Gates } from "../systems/gates";
import { Scent } from "../ai/scent";
import { updateCatches } from "../systems/catches";
import { bindEffects } from "../systems/effects";

export interface GameSceneData {
  character: CharacterId;
  difficulty: DifficultyId;
  /** Replay a particular level (solo); random otherwise. */
  seed?: number;
}

export class GameScene extends Phaser.Scene {
  world: World | null = null;
  private params!: GameSceneData;
  private controls!: InputSystem;
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
    const seed = start ? start.seed : this.params.seed ?? randomSeed();
    const level = generateLevel(seed, { keys: diff.keyCount, fuses: diff.fuseCount, items: diff.itemCount });
    const net: NetMode = !start ? "solo" : session.isHost ? "host" : "client";
    const w = new World(this, level, diff, net);

    playMusic();
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    w.camera = new CameraRig(this.cameras.main);

    w.lighting = new Lighting(w);
    new WorldView(w);
    w.collision = new CollisionLayer(this, w.grid, w.walls, w.level.rows);
    w.gates = new Gates(w);
    w.hiding = new Hiding(w);
    w.doors = new Doors(w);
    w.objectives = new Objectives(w);
    w.power = new Power(w);
    w.items = new Items(w);
    w.noise = new Noise(w);
    w.scent = new Scent(w);

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
    w.vitals = new Vitals(w);
    w.interact = new Interact(w);
    w.vision = new Vision(w);
    bindEffects(w);
    this.controls = new InputSystem(w);
    if (net !== "solo") this.netsync = new NetSync(w);

    w.camera.follow(w.local, true);
    this.setupLighting(w);
    addDust(w);
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
    w.lighting.update(dt);
    this.controls.update();
    w.hiding.holding = this.controls.holdingBreath;
    if (w.isAuthority) for (const a of w.actors) if (a.brain && a.inPlay) a.brain.update(dt);
    w.vitals.update(dt);
    w.items.update(dt);
    w.power.update(dt);
    w.hiding.update(dt);
    w.doors.update(dt);
    w.objectives.update(dt);
    updateCatches(w);
    w.director.update(dt);
    w.foxFlash.update(dt);
    w.noise.update(dt);
    w.scent.update(dt);
    w.vision.update(dt);
    w.camera.update(dt);
    this.netsync?.update(time);
  }

  private setupLighting(w: World): void {
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.pipelines.addPostPipeline(LIGHTING_PIPELINE, LightingPipeline); // no-op if already registered
    const cam = this.cameras.main;
    cam.setPostPipeline(LIGHTING_PIPELINE);
    const lighting = cam.getPostPipeline(LIGHTING_PIPELINE) as LightingPipeline;
    lighting.world = w;
    lighting.rig = w.camera;
  }

  private dispose(): void {
    this.netsync?.dispose();
    this.world?.events.clear();
    this.scene.stop("Hud");
  }
}
