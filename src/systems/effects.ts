// World-space effects triggered by events: corpses, camera shake, being marked by blight.
import type { World } from "../game/World";
import { TILE } from "../core/constants";
import { DEPTH } from "../ui/theme";

export function bindEffects(world: World): void {
  const scene = world.scene;
  world.events.on("shake", ({ ms, intensity }) => scene.cameras.main.shake(ms, intensity));
  world.events.on("runnerCaught", ({ actor }) => {
    const pool = scene.add.image(actor.x, actor.feetY, "decals/blood_pool_1").setDepth(DEPTH.floorObjects).setRotation(Math.random() * 6.28);
    pool.setDisplaySize(TILE * 1.8, TILE * 1.8);
    const body = scene.add.image(actor.x, actor.feetY - 6, "interactive/corpse").setDepth(actor.feetY - 8).setRotation((Math.random() - 0.5) * 0.8);
    body.setScale(TILE * 0.9 / body.width);
    const strong = actor === world.local;
    world.shake(strong ? 400 : 200, strong ? 0.02 : 0.01);
  });
  world.events.on("blightHit", ({ id, by }) => {
    if (id === world.local.id) {
      world.toast("Скверна! Тебя видят сквозь стены", "hunter");
      world.events.emit("screenFlash", { color: 0x6a2cc0, alpha: 0.35, ms: 700 });
      world.shake(200, 0.008);
    } else if (by === world.local.id) {
      world.toast("Метка! " + (world.byId(id)?.def.name ?? "беглец") + " виден сквозь стены", "hunter");
    }
  });
}
