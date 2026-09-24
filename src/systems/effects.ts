// World-space effects triggered by events: corpses and camera shake.
import type { World } from "../game/World";
import { TILE } from "../core/constants";
import { DEPTH } from "../ui/theme";

export function bindEffects(world: World): void {
  const scene = world.scene;
  world.events.on("shake", ({ ms, intensity }) => scene.cameras.main.shake(ms, intensity));
  world.events.on("runnerCaught", ({ actor }) => {
    const pool = scene.add.image(actor.x, actor.feetY, "decals/blood_pool_1").setDepth(DEPTH.floorObjects).setRotation(Math.random() * 6.28);
    pool.setDisplaySize(TILE * 1.8, TILE * 1.8);
    const body = scene.add.image(actor.x, actor.feetY - 6, "interactive/corpse").setDepth(actor.feetY - 8);
    body.setDisplaySize(TILE * 1.1, TILE * 1.1);
    const strong = actor === world.local;
    world.shake(strong ? 400 : 200, strong ? 0.02 : 0.01);
  });
}
