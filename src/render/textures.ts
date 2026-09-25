// Loading art into Phaser: hand-made files, generated files (assets/manifest.json) and
// procedural placeholders for everything that doesn't exist yet.
import Phaser from "phaser";
import { GENERATED_INDEX, IMAGES } from "../data/assets";
import { PLACEHOLDERS, drawPlaceholder, drawSolid } from "./placeholders";
import { DECALS, SURFACES, WALL_FACE_ART, drawClawprint, drawDust, drawFootprint, drawShadow } from "./surfaces";
import { PROP_ART, furnitureBox } from "./props";
import { FURNITURE } from "../data/furniture";
import { DECAL_KEYS } from "../data/rooms";

const MAX_TEXTURE = 2048;
const INDEX_KEY = "__assetIndex";

interface GeneratedIndex { images?: Record<string, { url: string }>; }

/** Keys still drawn by a placeholder (real files haven't arrived for them). */
const placeholderKeys = new Set<string>();

export function isPlaceholder(key: string): boolean { return placeholderKeys.has(key); }

/** Boot, step 1 (preload): the index of generated art. */
export function queueIndex(scene: Phaser.Scene): void {
  scene.load.json(INDEX_KEY, GENERATED_INDEX);
  scene.load.on("loaderror", (file: Phaser.Loader.File) => {
    if (file.key !== INDEX_KEY) console.warn("[assets] missing " + file.url + ", using a placeholder");
  });
}

/** Boot, step 2: load generated art, plus hand-made files for keys it doesn't cover. */
export function loadArt(scene: Phaser.Scene): Promise<void> {
  const index = scene.cache.json.get(INDEX_KEY) as GeneratedIndex | undefined;
  const generated = index?.images ?? {};
  for (const [key, e] of Object.entries(generated)) scene.load.image(key, e.url);
  for (const a of IMAGES) if (!(a.key in generated)) scene.load.image(a.key, a.url);
  return new Promise(resolve => { scene.load.once("complete", () => resolve()); scene.load.start(); });
}

/** Boot, step 3: fill every missing key with its placeholder, trim and size-cap hand-made art. */
export function finishImages(scene: Phaser.Scene): void {
  const tex = scene.textures;
  const add = (key: string, draw: () => HTMLCanvasElement, filter = Phaser.Textures.FilterMode.LINEAR) => {
    if (tex.exists(key)) return;
    tex.addCanvas(key, draw())!.setFilter(filter);
    placeholderKeys.add(key);
  };
  for (const key of Object.keys(PLACEHOLDERS)) add(key, () => drawPlaceholder(key)!, Phaser.Textures.FilterMode.NEAREST);
  for (const [key, spec] of Object.entries(SURFACES)) add(key, spec.draw);
  add(WALL_FACE_ART.key, WALL_FACE_ART.draw);
  for (const [key, spec] of Object.entries(DECALS)) add(key, spec.draw);
  // Decal keys without a placeholder of their own borrow one of the same kind.
  for (const keys of Object.values(DECAL_KEYS)) {
    const stand = keys.find(k => DECALS[k]);
    if (stand) for (const k of keys) add(k, DECALS[stand].draw);
  }
  for (const [key, draw] of Object.entries(PROP_ART)) add(key, draw);
  for (const f of FURNITURE) add(f.key, () => furnitureBox(f.key, f.w, f.h));
  add("fx/shadow", drawShadow);
  add("fx/dust", drawDust);
  add("fx/footprint", drawFootprint);
  add("fx/clawprint", drawClawprint);
  for (const a of IMAGES) {
    if (!tex.exists(a.key)) { tex.addCanvas(a.key, drawSolid(a.fallback ?? "#ff00ff")); continue; }
    if (!isGenerated(scene, a.key)) normalizeTexture(scene, a.key, !!a.trim);
  }
}

function isGenerated(scene: Phaser.Scene, key: string): boolean {
  const index = scene.cache.json.get(INDEX_KEY) as GeneratedIndex | undefined;
  return !!index?.images?.[key];
}

/** Optionally crop a texture to its non-transparent pixels, and cap its size for older GPUs. */
function normalizeTexture(scene: Phaser.Scene, key: string, trim: boolean): void {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width, h = src.height;
  if (!trim && w <= MAX_TEXTURE && h <= MAX_TEXTURE) return;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  let minX = 0, minY = 0, maxX = w - 1, maxY = h - 1;
  if (trim) [minX, minY, maxX, maxY] = opaqueBounds(ctx.getImageData(0, 0, w, h).data, w, h);
  if (maxX < 0) return;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const ratio = Math.min(1, MAX_TEXTURE / bw, MAX_TEXTURE / bh);
  if (bw === w && bh === h && ratio === 1) return;
  const out = document.createElement("canvas");
  out.width = Math.floor(bw * ratio); out.height = Math.floor(bh * ratio);
  out.getContext("2d")!.drawImage(c, minX, minY, bw, bh, 0, 0, out.width, out.height);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, out);
}

function opaqueBounds(data: Uint8ClampedArray, w: number, h: number): [number, number, number, number] {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}
