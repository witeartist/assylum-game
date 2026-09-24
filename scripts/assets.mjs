// Prepares generated art for the game: art/<folder>/<name>.png → public/assets/<folder>/<name>.webp
// (transparent margins trimmed, downscaled to what the game needs) and writes
// public/assets/manifest.json, which the game loads at start. Texture key = "<folder>/<name>".
//
//   npm run assets            process everything in art/
//   npm run assets -- --force re-encode files that are already up to date
import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const SRC = "art";
const OUT = "public/assets";
const force = process.argv.includes("--force");

/** Per folder: longest side after processing, whether to trim transparent margins. */
const RULES = {
  surfaces:    { max: 512, trim: false, opaque: true },
  decals:      { max: 256, trim: true },
  props:       { max: 384, trim: true },
  interactive: { max: 384, trim: true },
  items:       { max: 160, trim: true },
  characters:  { max: 320, trim: true },
  ui:          { max: 512, trim: true },
};
const DEFAULT_RULE = { max: 512, trim: true };

async function exists(p) { try { return await stat(p); } catch { return null; } }

async function processFile(folder, file) {
  const rule = RULES[folder] ?? DEFAULT_RULE;
  const { name } = parse(file);
  const src = join(SRC, folder, file);
  const dstDir = join(OUT, folder);
  const dst = join(dstDir, name + ".webp");
  await mkdir(dstDir, { recursive: true });
  const [s, d] = await Promise.all([exists(src), exists(dst)]);
  if (!force && d && d.mtimeMs >= s.mtimeMs) {
    const meta = await sharp(dst).metadata();
    return { key: `${folder}/${name}`, url: `assets/${folder}/${name}.webp`, w: meta.width, h: meta.height, skipped: true };
  }
  let img = sharp(src).ensureAlpha();
  if (rule.trim) {
    // Generators leave near-invisible pixels (alpha 1/255) in corners; drop them before trimming.
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= 3) data[i] = 0;
    img = sharp(data, { raw: info }).trim({ threshold: 0 });
    const trimmed = await img.png().toBuffer();
    img = sharp(trimmed);
  }
  img = img.resize({ width: rule.max, height: rule.max, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" });
  if (rule.opaque) img = img.removeAlpha();
  const out = await img.webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(dst);
  return { key: `${folder}/${name}`, url: `assets/${folder}/${name}.webp`, w: out.width, h: out.height };
}

const images = {};
let made = 0, kept = 0;
const folders = (await exists(SRC)) ? (await readdir(SRC, { withFileTypes: true })).filter(d => d.isDirectory() && !d.name.startsWith("_")) : [];
for (const dir of folders) {
  const files = (await readdir(join(SRC, dir.name))).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  for (const f of files) {
    const r = await processFile(dir.name, f);
    images[r.key] = { url: r.url, w: r.w, h: r.h };
    if (r.skipped) kept++; else { made++; console.log(`  ${r.key}  ${r.w}×${r.h}`); }
  }
}
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "manifest.json"), JSON.stringify({ images }, null, 1) + "\n");
console.log(`assets: ${made} converted, ${kept} up to date, ${Object.keys(images).length} in manifest`);
