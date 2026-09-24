// World-space effects triggered by events: corpses and camera shake.
import type { World } from "../game/World";
import { DEPTH } from "../ui/theme";

export function bindEffects(world: World): void {
  const scene = world.scene;
  world.events.on("shake", ({ ms, intensity }) => scene.cameras.main.shake(ms, intensity));
  world.events.on("runnerCaught", ({ actor }) => {
    scene.add.image(actor.x, actor.y, "fx.blood").setScale(2.5).setDepth(DEPTH.decor);
    scene.add.image(actor.x, actor.y, "fx.corpse").setScale(2).setDepth(DEPTH.corpse);
    const strong = actor === world.local;
    world.shake(strong ? 400 : 200, strong ? 0.02 : 0.01);
  });
}
