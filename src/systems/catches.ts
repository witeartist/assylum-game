// Contact catches, decided by the authority (solo game or host) for every hunter–runner pair.
import { dist } from "../core/geom";
import { CATCH_RADIUS, NET_CATCH_RADIUS } from "../data/balance";
import type { World } from "../game/World";

export function updateCatches(world: World): void {
  if (!world.isAuthority) return;
  for (const hunter of world.threats()) {
    for (const runner of world.runners()) {
      if (!runner.inPlay || runner.hiding) continue;
      // Remote positions lag behind, so allow a larger distance when one side is remote.
      const radius = hunter.control === "remote" || runner.control === "remote" ? NET_CATCH_RADIUS : CATCH_RADIUS;
      if (dist(hunter.authPos, runner.authPos) < radius) world.round.catchRunner(runner, hunter.def.name);
    }
  }
}
