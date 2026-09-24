// Dust motes drifting around the viewer. They are part of the lit world, so they only show
// where light falls — most visibly in a flashlight beam.
import type Phaser from "phaser";
import type { World } from "../game/World";
import { DEPTH } from "../ui/theme";
import { quality } from "./display";

export function addDust(world: World): Phaser.GameObjects.Particles.ParticleEmitter | null {
  if (quality.dust === 0) return null;
  const rig = world.camera;
  return world.scene.add.particles(0, 0, "fx/dust", {
    x: { onEmit: () => rig.viewX + Math.random() * rig.viewW },
    y: { onEmit: () => rig.viewY + Math.random() * rig.viewH },
    lifespan: { min: 3000, max: 7000 },
    speedX: { min: -6, max: 6 },
    speedY: { min: -4, max: 6 },
    scale: { start: 0.18, end: 0.35 },
    alpha: { start: 0, end: 0.55, ease: (t: number) => Math.sin(t * Math.PI) },
    blendMode: "ADD",
    frequency: 7000 / quality.dust,
    maxAliveParticles: quality.dust,
  }).setDepth(DEPTH.dust);
}
