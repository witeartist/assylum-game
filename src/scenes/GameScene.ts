// The round. Builds the world (level, actors, systems) and runs the systems each frame.
import Phaser from "phaser";
import { WORLD_W, WORLD_H } from "../core/constants";
import { randomSeed } from "../core/rng";
import type { Role } from "../core/types";
import { HERO_IDS, KIT_IDS, type CharacterId, type KitId } from "../data/characters";
import { DIFFICULTIES, type DifficultyId } from "../data/difficulty";
import { session } from "../net/session";
import { World, type NetMode } from "../game/World";
import { runnerPart, spawnLocalPlayer, spawnRemotePlayer, spawnRunnerBot, spawnVillainAI, villainPart } from "../game/spawn";
import { generateLevel } from "../world/levelgen";
import { CollisionLayer } from "../world/collision";
import { furnitureTiles } from "../world/level";
import { WorldView } from "../render/worldView";
import { furnitureLayout } from "../render/propLayout";
import { CameraRig } from "../render/cameraRig";
import { addDust } from "../render/dust";
import { Shadows } from "../render/shadows";
import { Outlines } from "../render/outlines";
import { Footprints } from "../render/footprints";
import { Soundscape } from "../systems/sound";
import { LIGHTING_PIPELINE, LightingPipeline } from "../render/lighting/LightingPipeline";
import { Lighting } from "../systems/lighting";
import { Abilities } from "../systems/abilities";
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

/** A solo round: who you play, as whom, on which difficulty (multiplayer takes it from the session). */
export interface GameSceneData {
  character: CharacterId;
  role: Role;
  /** The villain's kit: yours, or the one a runner plays against; null — pick at random. */
  kit: KitId | null;
  difficulty: DifficultyId;
  /** Replay a particular level (solo); random otherwise. */
  seed?: number;
}

export class GameScene extends Phaser.Scene {
  world: World | null = null;
  private params!: GameSceneData;
  private controls!: InputSystem;
  private netsync: NetSync | null = null;
  private shadows: Shadows | null = null;
  private outlines: Outlines | null = null;
  private footprints: Footprints | null = null;
  private soundscape: Soundscape | null = null;
  private failed = false;

  constructor() { super("Game"); }

  init(data: GameSceneData): void {
    this.params = data;
    this.world = null;
    this.netsync = null;
    this.shadows = null;
    this.outlines = null;
    this.footprints = null;
    this.soundscape = null;
    this.failed = false;
  }

  create(): void {
    const start = session.active ? session.start : null;
    const diff = DIFFICULTIES[start ? start.difficulty : this.params.difficulty];
    const seed = start ? start.seed : this.params.seed ?? randomSeed();
    const level = generateLevel(seed, { keys: diff.keyCount, fuses: diff.fuseCount, items: diff.itemCount });
    const net: NetMode = !start ? "solo" : session.isHost ? "host" : "client";
    const w = new World(this, level, diff, net);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    w.camera = new CameraRig(this.cameras.main);

    w.lighting = new Lighting(w);
    new WorldView(w);
    const props = w.level.furniture.filter(f => f.solid).map(f => ({ tiles: furnitureTiles(f), foot: furnitureLayout(w, f).foot }));
    w.collision = new CollisionLayer(this, w.grid, w.walls, w.level.rows, props);
    w.gates = new Gates(w);
    w.hiding = new Hiding(w);
    w.doors = new Doors(w);
    w.objectives = new Objectives(w);
    w.power = new Power(w);
    w.items = new Items(w);
    w.noise = new Noise(w);
    w.scent = new Scent(w);
    this.shadows = new Shadows(w);
    this.footprints = new Footprints(w);

    if (start) {
      for (const [id, p] of Object.entries(start.players)) {
        const kit = start.villains[id];
        const part = kit ? villainPart(p.character, kit) : runnerPart(p.character);
        if (id === session.localId) spawnLocalPlayer(w, id, part);
        else spawnRemotePlayer(w, id, part);
      }
      if (start.aiVillain) spawnVillainAI(w, start.aiVillain.character, start.aiVillain.kit);
    } else {
      // Solo: the other heroes are bots; a runner meets one of them infected.
      const { character, role } = this.params;
      const kit = this.params.kit ?? w.rng.pick(KIT_IDS);
      spawnLocalPlayer(w, "local", role === "hunter" ? villainPart(character, kit) : runnerPart(character));
      let others = HERO_IDS.filter(id => id !== character);
      if (role === "runner") {
        const villain = w.rng.pick(others);
        spawnVillainAI(w, villain, kit);
        others = others.filter(id => id !== villain);
      }
      others.forEach((id, i) => spawnRunnerBot(w, id, level.npcSpawns[i % level.npcSpawns.length]));
    }
    w.abilities = new Abilities(w);

    w.round = new Round(w, this.params.kit);
    w.director = new Director(w);
    w.vitals = new Vitals(w);
    w.interact = new Interact(w);
    this.outlines = new Outlines(w);
    w.vision = new Vision(w);
    this.soundscape = new Soundscape(w);
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
    w.abilities.update(dt);
    w.noise.update(dt);
    w.scent.update(dt);
    w.vision.update(dt);
    w.camera.update(dt);
    this.shadows?.update();
    this.outlines?.update(dt);
    this.footprints?.update(dt);
    this.soundscape?.update(dt);
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
    this.soundscape?.dispose();
    this.world?.events.clear();
    this.scene.stop("Hud");
  }
}
