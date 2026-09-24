// Loading the asset manifest into Phaser, with placeholders for anything missing.
import type Phaser from "phaser";
import { IMAGES } from "../data/assets";
import { PLACEHOLDERS, drawPlaceholder, drawSolid } from "./placeholders";

const MAX_TEXTURE = 2048;

/** Queue every manifest image on the scene's loader; failed files get their fallback. */
export function queueImages(scene: Phaser.Scene): void {
  for (const a of IMAGES) scene.load.image(a.key, a.url);
  scene.load.on("loaderror", (file: Phaser.Loader.File) => {
    const a = IMAGES.find(i => i.key === file.key);
    console.warn("[assets] missing " + file.url + ", using a placeholder");
    scene.textures.addCanvas(file.key, drawPlaceholder(file.key) ?? drawSolid(a?.fallback ?? "#ff00ff"));
  });
}

/** After loading: register procedural textures that have no file, trim and size-cap loaded art. */
export function finishImages(scene: Phaser.Scene): void {
  for (const key of Object.keys(PLACEHOLDERS)) {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawPlaceholder(key)!);
  }
  for (const a of IMAGES) if (scene.textures.exists(a.key)) normalizeTexture(scene, a.key, !!a.trim);
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
