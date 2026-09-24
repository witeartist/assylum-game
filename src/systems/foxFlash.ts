// The hunter's flash: a short burst of light that exposes runners hiding in the dark.
import { FOX_FLASH } from "../data/balance";
import type { Actor } from "../entities/Actor";

export class FoxFlash {
  x = 0;
  y = 0;
  private activeT = 0;
  private owner: Actor | null = null;

  /** Seconds until the flash can be used again. */
  constructor(public cooldown: number) {}

  get active(): boolean { return this.activeT > 0; }
  get ready(): boolean { return this.cooldown <= 0; }

  trigger(owner: Actor): boolean {
    if (!this.ready) return false;
    this.owner = owner;
    this.activeT = FOX_FLASH.duration;
    this.cooldown = FOX_FLASH.cooldown;
    this.x = owner.x; this.y = owner.y;
    return true;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.activeT > 0) {
      this.activeT -= dt;
      if (this.owner) { this.x = this.owner.x; this.y = this.owner.y; }
    }
  }
}
