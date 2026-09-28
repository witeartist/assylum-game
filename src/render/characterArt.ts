// Character pictures: one standing sprite per hero (and its infected copy) — or, for heroes whose
// turnaround has arrived, four views picked by where the character faces. Each view stands on
// its feet: the pictures are trimmed to their outline, and hair or a tail sticking out to one
// side would otherwise push the body off the spot the character stands on.
import type Phaser from "phaser";
import type { CharacterDef } from "../data/characters";

export type Facing = "down" | "up" | "left" | "right";
export type Views = Record<Facing, string>;

const FACINGS: Facing[] = ["down", "up", "left", "right"];
/** Keys of view sets that are fully loaded (checked once at boot). */
const loaded = new Set<string>();
/** Where the feet stand in each view, as a share of the picture's width. */
const feet = new Map<string, number>();
/** Rows at the bottom of a picture that count as its feet. */
const FEET_ROWS = 0.1;
/** Past a diagonal by this much (radians) before the view turns: no flicker walking at 45°. */
const TURN_SLACK = 0.18;

function setKey(v: Views): string { return v.down; }

/** Boot: note which heroes have all four views and where their feet are in each. */
export function prepareViews(scene: Phaser.Scene, defs: CharacterDef[], isPlaceholder: (key: string) => boolean): void {
  for (const def of defs) for (const v of [def.views, def.infectedViews]) {
    if (!v || !FACINGS.every(f => scene.textures.exists(v[f]) && !isPlaceholder(v[f]))) continue;
    loaded.add(setKey(v));
    for (const f of FACINGS) feet.set(v[f], measureFeet(scene, v[f]));
  }
}

/** The four views of `def` (infected or not) if they are all there. */
export function viewsOf(def: CharacterDef, infected: boolean): Views | null {
  const v = infected ? def.infectedViews : def.views;
  return v && loaded.has(setKey(v)) ? v : null;
}

/** The picture for menus: the front view if there is a turnaround, else the single sprite. */
export function heroTexture(def: CharacterDef, infected: boolean): string {
  return viewsOf(def, infected)?.down ?? (infected ? def.infected : def.texture);
}

/** Horizontal origin that puts the feet of `key` on the character's spot. */
export function footAnchor(key: string): number {
  return feet.get(key) ?? 0.5;
}

/** The view for an actor facing `angle` (0 = right, π/2 = down); keeps `current` near a diagonal. */
export function facingOf(angle: number, current: Facing): Facing {
  const c = Math.cos(angle), s = Math.sin(angle);
  const want: Facing = Math.abs(c) > Math.abs(s) ? (c > 0 ? "right" : "left") : (s > 0 ? "down" : "up");
  if (want === current) return current;
  // Distance past the diagonal towards the new side: only turn once clearly there.
  const past = Math.abs(Math.atan2(Math.abs(s), Math.abs(c)) - Math.PI / 4);
  return past > TURN_SLACK ? want : current;
}

/** Mean x of the opaque pixels in the bottom rows of the picture, as a share of its width. */
function measureFeet(scene: Phaser.Scene, key: string): number {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width, h = src.height, rows = Math.max(1, Math.round(h * FEET_ROWS));
  const c = document.createElement("canvas");
  c.width = w; c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx || w === 0) return 0.5;
  ctx.drawImage(src, 0, h - rows, w, rows, 0, 0, w, rows);
  const data = ctx.getImageData(0, 0, w, rows).data;
  let sum = 0, n = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * 4 + 3];
    if (a > 128) { sum += x; n++; }
  }
  return n > 0 ? (sum / n + 0.5) / w : 0.5;
}
