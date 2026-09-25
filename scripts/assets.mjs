// Prepares generated art for the game: every image under art/ (any folder layout) becomes
// public/assets/<category>/<name>.webp — transparent margins trimmed, downscaled to what the game
// needs — and public/assets/manifest.json lists them for the game. Texture key = "<category>/<name>".
// The category comes from the file name (see docs/ASSETS.md), so misplaced files still land right.
//
//   npm run assets            process everything in art/
//   npm run assets -- --force re-encode files that are already up to date
import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
import { join, parse, relative } from "node:path";
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

/** File name → category, for names from docs/ASSETS.md. */
const BY_NAME = [
  [/^(floor_|wall_top|wall_face)/, "surfaces"],
  [/^(blood_|bloody_|cracks_|dirt_|puddle_|papers|glass_shards|pills|rubble|rust_stain|breach_)/, "decals"],
  [/^(locker_|terminal$|door_metal|door_wood|fuse_box|exit_door|key$|corpse$)/, "interactive"],
  [/^(battery|adrenaline|bottle|sedative|glowstick|note|map_piece|fuse)$/, "items"],
  [/^(panel|button|icon_)/, "ui"],
  [/^(naumi|kuruna|wite|sumrak|yoko|foxmind|jeloch)_/, "characters"],
];

function categoryOf(name, folder) {
  for (const [re, cat] of BY_NAME) if (re.test(name)) return cat;
  return folder in RULES && folder !== "items" ? folder : "props";
}

async function exists(p) { try { return await stat(p); } catch { return null; } }

/** All images under dir, skipping "_…" folders and "-vN" alternative versions. */
async function listImages(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await listImages(p));
    else if (/\.(png|jpe?g|webp)$/i.test(e.name) && !/-v\d+\./.test(e.name)) out.push(p);
  }
  return out;
}

function keyOf(src) {
  const name = parse(src).name.toLowerCase();
  const folder = relative(SRC, src).split(/[\\/]/).slice(-2, -1)[0] ?? "";
  return { cat: categoryOf(name, folder), name };
}

async function processFile(src) {
  const { cat, name } = keyOf(src);
  const rule = RULES[cat] ?? DEFAULT_RULE;
  const dstDir = join(OUT, cat);
  const dst = join(dstDir, name + ".webp");
  await mkdir(dstDir, { recursive: true });
  const [s, d] = await Promise.all([exists(src), exists(dst)]);
  if (!force && d && d.mtimeMs >= s.mtimeMs) {
    const meta = await sharp(dst).metadata();
    return { key: `${cat}/${name}`, url: `assets/${cat}/${name}.webp`, w: meta.width, h: meta.height, skipped: true };
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
  return { key: `${cat}/${name}`, url: `assets/${cat}/${name}.webp`, w: out.width, h: out.height };
}

const images = {};
let made = 0, kept = 0;
const files = (await exists(SRC)) ? (await listImages(SRC)).sort() : [];
const seen = new Set();
for (const f of files) {
  const { cat, name } = keyOf(f);
  if (seen.has(cat + "/" + name)) { console.warn(`  duplicate ${cat}/${name}: skipped ${f}`); continue; }
  seen.add(cat + "/" + name);
  const r = await processFile(f);
  images[r.key] = { url: r.url, w: r.w, h: r.h };
  if (r.skipped) kept++; else { made++; console.log(`  ${r.key}  ${r.w}×${r.h}`); }
}
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "manifest.json"), JSON.stringify({ images }, null, 1) + "\n");
console.log(`assets: ${made} converted, ${kept} up to date, ${Object.keys(images).length} in manifest`);
