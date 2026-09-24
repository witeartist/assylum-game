// Procedural placeholder art for the 2.5D look: seamless floor and wall surfaces, floor decals,
// soft shadows and dust. Keys match the files listed in docs/ASSETS.md, so generated art
// replaces them one by one without code changes.
import { Rng } from "../core/rng";

type RGB = [number, number, number];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

function hex(h: string): RGB {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Tileable value noise: a lattice of random values with period `cells`, smoothly interpolated. */
function noiseField(rng: Rng, size: number, cells: number): Float32Array {
  const lattice = Array.from({ length: cells * cells }, () => rng.next());
  const out = new Float32Array(size * size);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells, y0 = Math.floor(fy), ty = s(fy - y0), y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, x0 = Math.floor(fx), tx = s(fx - x0), x1 = (x0 + 1) % cells;
      const a = lattice[y0 * cells + x0], b = lattice[y0 * cells + x1];
      const c = lattice[y1 * cells + x0], d = lattice[y1 * cells + x1];
      out[y * size + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
  return out;
}

/** Fractal noise, 0..1, seamless. */
function fbm(rng: Rng, size: number, base: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noiseField(rng, size, base << o);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Fill a square with `base` modulated by noise (grime, wear). */
function grimyBase(ctx: CanvasRenderingContext2D, size: number, rng: Rng, base: RGB, grime: number, detail = 0.08): void {
  const img = ctx.createImageData(size, size);
  const big = fbm(rng, size, 4, 4), fine = fbm(rng, size, 32, 2);
  for (let i = 0; i < size * size; i++) {
    const k = 1 - grime * (big[i] - 0.5) * 2 - detail * (fine[i] - 0.5) * 2;
    img.data[i * 4] = base[0] * k; img.data[i * 4 + 1] = base[1] * k; img.data[i * 4 + 2] = base[2] * k; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Draw into a seamless texture: anything crossing an edge is repeated on the other side. */
function wrapDraw(size: number, x: number, y: number, r: number, draw: (ox: number, oy: number) => void): void {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
    draw(ox, oy);
  }
}

function stains(ctx: CanvasRenderingContext2D, size: number, rng: Rng, count: number, color: string, rMin: number, rMax: number): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(rMin, rMax);
    wrapDraw(size, x, y, r, (ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
}

function scratches(ctx: CanvasRenderingContext2D, size: number, rng: Rng, count: number, color: string, len: number): void {
  ctx.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, Math.PI * 2), l = rng.range(len * 0.3, len);
    ctx.lineWidth = rng.range(0.5, 1.5);
    wrapDraw(size, x, y, l, (ox, oy) => {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); ctx.stroke();
    });
  }
}

function cracks(ctx: CanvasRenderingContext2D, size: number, rng: Rng, count: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    let x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, Math.PI * 2);
    const segs = rng.int(4, 9);
    ctx.lineWidth = rng.range(0.6, 1.4);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < segs; s++) {
      a += rng.range(-0.8, 0.8);
      x += Math.cos(a) * rng.range(4, 12); y += Math.sin(a) * rng.range(4, 12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Ceramic tiles: `n` tiles across, grout lines, per-tile shade, chipped and cracked tiles. */
function ceramic(ctx: CanvasRenderingContext2D, size: number, rng: Rng, n: number, tile: RGB, grout: string, variance: number): void {
  const step = size / n;
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    const k = 1 + rng.range(-variance, variance);
    ctx.fillStyle = `rgba(${tile[0] * k | 0},${tile[1] * k | 0},${tile[2] * k | 0},0.55)`;
    ctx.fillRect(tx * step, ty * step, step, step);
  }
  ctx.fillStyle = grout;
  for (let i = 0; i < n; i++) {
    ctx.fillRect(Math.round(i * step) - 1, 0, 2, size);
    ctx.fillRect(0, Math.round(i * step) - 1, size, 2);
  }
  // A few broken tiles.
  for (let i = 0; i < n; i++) {
    if (!rng.chance(0.25)) continue;
    const tx = rng.int(0, n - 1) * step, ty = rng.int(0, n - 1) * step;
    ctx.strokeStyle = grout;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx + rng.range(0, step), ty); ctx.lineTo(tx + rng.range(0, step), ty + step); ctx.stroke();
  }
}

export interface SurfaceSpec {
  /** How many tiles one repetition of the texture covers. */
  tilesAcross: number;
  draw: () => HTMLCanvasElement;
}

const SIZE = 256;

function floor(seed: number, base: string, extra: (ctx: CanvasRenderingContext2D, rng: Rng) => void, grime = 0.35): () => HTMLCanvasElement {
  return () => {
    const [c, ctx] = canvas(SIZE, SIZE);
    const rng = new Rng(seed);
    grimyBase(ctx, SIZE, rng, hex(base), grime);
    extra(ctx, rng);
    return c;
  };
}

/** Placeholder surfaces, keyed like the files in public/assets/surfaces/. */
export const SURFACES: Record<string, SurfaceSpec> = {
  "surfaces/floor_corridor": { tilesAcross: 4, draw: floor(11, "#56625c", (ctx, rng) => {
    // Worn linoleum sheets with seams that don't follow the tile grid.
    ctx.fillStyle = "rgba(20,26,24,0.5)";
    for (const x of [0, 97, 181]) ctx.fillRect(x, 0, 1.5, SIZE);
    stains(ctx, SIZE, rng, 10, "rgba(30,26,18,0.25)", 10, 40);
    scratches(ctx, SIZE, rng, 40, "rgba(25,30,28,0.35)", 30);
    scratches(ctx, SIZE, rng, 20, "rgba(160,170,160,0.12)", 20);
  }) },
  "surfaces/floor_ward": { tilesAcross: 4, draw: floor(12, "#8c9aa3", (ctx, rng) => {
    ceramic(ctx, SIZE, rng, 10, [190, 204, 212], "rgba(60,64,62,0.55)", 0.06);
    stains(ctx, SIZE, rng, 8, "rgba(90,80,50,0.18)", 8, 30);
  }, 0.25) },
  "surfaces/floor_procedure": { tilesAcross: 4, draw: floor(13, "#7fa0a0", (ctx, rng) => {
    ceramic(ctx, SIZE, rng, 7, [150, 190, 186], "rgba(45,60,58,0.55)", 0.05);
    stains(ctx, SIZE, rng, 6, "rgba(90,40,30,0.25)", 6, 24);
  }, 0.25) },
  "surfaces/floor_canteen": { tilesAcross: 4, draw: floor(14, "#8a7f6c", (ctx, rng) => {
    const n = 6, step = SIZE / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if ((x + y) % 2) continue;
      ctx.fillStyle = "rgba(70,48,32,0.45)";
      ctx.fillRect(x * step, y * step, step, step);
    }
    stains(ctx, SIZE, rng, 12, "rgba(40,30,20,0.25)", 8, 30);
    scratches(ctx, SIZE, rng, 30, "rgba(30,25,20,0.3)", 25);
  }) },
  "surfaces/floor_isolation": { tilesAcross: 4, draw: floor(15, "#6b6c6a", (ctx, rng) => {
    stains(ctx, SIZE, rng, 10, "rgba(20,24,26,0.35)", 12, 45);
    cracks(ctx, SIZE, rng, 6, "rgba(20,20,20,0.55)");
    scratches(ctx, SIZE, rng, 50, "rgba(25,25,25,0.3)", 18);
  }, 0.45) },
  "surfaces/floor_storage": { tilesAcross: 4, draw: floor(16, "#5f5e59", (ctx, rng) => {
    stains(ctx, SIZE, rng, 8, "rgba(10,10,8,0.4)", 10, 36);
    cracks(ctx, SIZE, rng, 4, "rgba(20,20,20,0.5)");
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(30,28,24,${rng.range(0.2, 0.5)})`;
      ctx.fillRect(rng.range(0, SIZE), rng.range(0, SIZE), rng.range(1, 3), rng.range(1, 3));
    }
  }, 0.5) },
  "surfaces/floor_morgue": { tilesAcross: 4, draw: floor(17, "#8ea3b0", (ctx, rng) => {
    ceramic(ctx, SIZE, rng, 9, [175, 196, 212], "rgba(50,58,66,0.55)", 0.05);
    stains(ctx, SIZE, rng, 7, "rgba(30,40,50,0.3)", 10, 34);
  }, 0.25) },
  "surfaces/wall_top": { tilesAcross: 4, draw: floor(18, "#202426", (ctx, rng) => {
    cracks(ctx, SIZE, rng, 6, "rgba(0,0,0,0.5)");
    stains(ctx, SIZE, rng, 8, "rgba(0,0,0,0.3)", 10, 40);
  }, 0.5) },
};

/** Front of a wall: horizontally seamless strip, bottom = floor line. */
export const WALL_FACE_ART = { key: "surfaces/wall_face", tilesAcross: 4, draw: (): HTMLCanvasElement => {
  const w = SIZE, h = 64;
  const [c, ctx] = canvas(w, h);
  const rng = new Rng(19);
  const noise = fbm(rng, w, 8, 3);
  const img = ctx.createImageData(w, h);
  const paint = hex("#3f5c58"), plaster = hex("#8b8a80"), skirting = hex("#262625");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = noise[(y * 4 % w) * w + x];
    const col = y > h - 7 ? skirting : y > h * 0.35 ? paint : plaster;
    const k = 0.8 + (n - 0.5) * 0.5 - (y < 3 ? 0.25 : 0);
    const i = (y * w + x) * 4;
    img.data[i] = col[0] * k; img.data[i + 1] = col[1] * k; img.data[i + 2] = col[2] * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Paint line, rust streaks and peeling.
  ctx.fillStyle = "rgba(20,30,28,0.6)"; ctx.fillRect(0, Math.round(h * 0.35), w, 1);
  for (let i = 0; i < 7; i++) {
    const x = rng.range(0, w), g = ctx.createLinearGradient(x, h * 0.3, x, h);
    g.addColorStop(0, "rgba(90,50,20,0.45)"); g.addColorStop(1, "rgba(90,50,20,0)");
    ctx.fillStyle = g; ctx.fillRect(x, h * 0.3, rng.range(1, 3), h * 0.6);
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(160,158,146,${rng.range(0.2, 0.5)})`;
    ctx.beginPath(); ctx.ellipse(rng.range(0, w), rng.range(h * 0.35, h - 8), rng.range(2, 6), rng.range(1, 3), 0, 0, Math.PI * 2); ctx.fill();
  }
  return c;
} };

/** Irregular blob: radial falloff broken up by noise. */
function blob(size: number, rng: Rng, color: RGB, alpha: number, roughness: number, spots = 0): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const n = fbm(rng, size, 4, 4);
  const img = ctx.createImageData(size, size);
  const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - cx, y - cy) / (size / 2);
    const v = 1 - d - (n[y * size + x] - 0.5) * roughness;
    const a = Math.max(0, Math.min(1, v * 3)) * alpha;
    const i = (y * size + x) * 4;
    const k = 0.75 + n[y * size + x] * 0.5 - Math.max(0, v - 0.3) * 0.4;
    img.data[i] = color[0] * k; img.data[i + 1] = color[1] * k; img.data[i + 2] = color[2] * k; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < spots; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(size * 0.3, size * 0.48), s = rng.range(1, size * 0.04);
    ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

export interface DecalSpec {
  draw: () => HTMLCanvasElement;
}

const BLOOD: RGB = [92, 10, 8];

export const DECALS: Record<string, DecalSpec> = {
  "decals/blood_pool_1":     { draw: () => blob(128, new Rng(31), BLOOD, 0.92, 0.9, 6) },
  "decals/blood_pool_2":     { draw: () => blob(128, new Rng(32), BLOOD, 0.9, 1.2, 10) },
  "decals/blood_splatter_1": { draw: () => blob(128, new Rng(33), BLOOD, 0.85, 2.2, 24) },
  "decals/blood_splatter_2": { draw: () => blob(128, new Rng(34), BLOOD, 0.8, 2.6, 30) },
  "decals/dirt_1":           { draw: () => blob(128, new Rng(35), [38, 32, 24], 0.45, 1.4) },
  "decals/dirt_2":           { draw: () => blob(128, new Rng(36), [30, 30, 26], 0.4, 1.8) },
  "decals/puddle_1":         { draw: () => blob(128, new Rng(37), [16, 22, 26], 0.7, 0.8) },
  "decals/cracks_1": { draw: () => {
    const [c, ctx] = canvas(128, 128);
    cracks(ctx, 128, new Rng(38), 5, "rgba(8,8,8,0.8)");
    return c;
  } },
  "decals/papers": { draw: () => {
    const [c, ctx] = canvas(128, 128);
    const rng = new Rng(39);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(rng.range(30, 98), rng.range(30, 98));
      ctx.rotate(rng.range(0, Math.PI));
      ctx.fillStyle = `rgb(${rng.int(170, 200)},${rng.int(165, 190)},${rng.int(130, 160)})`;
      ctx.fillRect(-14, -19, 28, 38);
      ctx.fillStyle = "rgba(40,40,40,0.35)";
      for (let l = -13; l < 15; l += 5) ctx.fillRect(-10, l, rng.range(10, 20), 1);
      ctx.restore();
    }
    return c;
  } },
};

/** Soft round shadow under characters and objects. */
export function drawShadow(): HTMLCanvasElement {
  const [c, ctx] = canvas(64, 32);
  const g = ctx.createRadialGradient(32, 16, 0, 32, 16, 32);
  g.addColorStop(0, "rgba(0,0,0,0.75)"); g.addColorStop(0.6, "rgba(0,0,0,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.scale(1, 0.5);
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

/** Dust mote: tiny soft dot. */
export function drawDust(): HTMLCanvasElement {
  const [c, ctx] = canvas(16, 16);
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, "rgba(255,245,225,0.9)"); g.addColorStop(1, "rgba(255,245,225,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  return c;
}
