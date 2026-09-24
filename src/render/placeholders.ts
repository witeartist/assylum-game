// Procedural pixel-art textures. They stand in for every piece of art that isn't drawn yet;
// real files from the asset manifest replace them key by key.
type Draw = (ctx: CanvasRenderingContext2D) => void;

function rects(color: string, list: number[][]): Draw {
  return ctx => { ctx.fillStyle = color; for (const [x, y, w, h] of list) ctx.fillRect(x, y, w, h); };
}
function layers(...draws: Draw[]): Draw { return ctx => draws.forEach(d => d(ctx)); }

/** A 32×32 floor tile: base colour, tile seams, a few marks. */
function floorTile(base: string, seam: string, mark: string, marks: number[][]): Draw {
  return layers(rects(base, [[0, 0, 32, 32]]), rects(seam, [[0, 15, 32, 1], [15, 0, 1, 32]]), rects(mark, marks));
}

function wallTile(base: string, seam: string, skirt: string, patch: string, patches: number[][]): Draw {
  return layers(
    rects(base, [[0, 0, 32, 32]]),
    rects(seam, [[0, 10, 32, 1], [0, 21, 32, 1], [10, 0, 1, 32], [21, 0, 1, 32]]),
    rects(skirt, [[0, 26, 32, 6]]),
    rects(patch, patches),
  );
}

const drawKey = rects("#f1c40f", [[3, 6, 10, 4], [5, 3, 4, 4], [11, 7, 3, 2], [11, 10, 3, 2]]);
const drawExit = layers(rects("#27ae60", [[2, 1, 12, 14]]), rects("#1a8048", [[6, 5, 4, 10]]), rects("#f1c40f", [[12, 7, 2, 2]]));
const drawExitLocked: Draw = ctx => {
  layers(rects("#555", [[2, 1, 12, 14]]), rects("#888", [[6, 5, 4, 10]]), rects("#999", [[12, 7, 2, 2]]),
    rects("#f1c40f", [[5, 8, 6, 5]]))(ctx);
  ctx.strokeStyle = "#f1c40f"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(8, 8, 3, Math.PI, 0); ctx.stroke();
};
const drawBlood = layers(rects("#8b0000", [[3, 3, 10, 10], [1, 5, 4, 4], [11, 2, 4, 5], [5, 11, 6, 4]]), rects("#600000", [[5, 5, 6, 6]]));
const drawCorpse = layers(
  rects("#600000", [[1, 6, 14, 8], [3, 4, 10, 12]]), rects("#8b0000", [[2, 7, 12, 6]]),
  rects("#3a3a3a", [[4, 5, 8, 2], [3, 7, 10, 4], [5, 11, 3, 3], [9, 11, 3, 2], [2, 6, 2, 3], [12, 7, 2, 2]]),
  rects("#555", [[6, 4, 4, 3]]),
);

const drawBed = layers(rects("#5f6878", [[1, 3, 14, 10]]), rects("#aeb7c3", [[3, 5, 10, 6]]), rects("#d7dde8", [[11, 5, 2, 3]]), rects("#2f3440", [[1, 1, 2, 14], [13, 1, 2, 14]]));
const drawGurney = layers(rects("#7e878f", [[2, 4, 12, 8]]), rects("#93b7bf", [[3, 5, 10, 6]]), rects("#2b3136", [[3, 12, 2, 3], [11, 12, 2, 3], [1, 2, 1, 12], [14, 2, 1, 12]]));
const drawTable = layers(rects("#6e5442", [[2, 3, 12, 8]]), rects("#4e392d", [[3, 11, 2, 4], [11, 11, 2, 4]]), rects("#8a6b57", [[4, 4, 8, 2]]));
const drawBars = layers(rects("#414853", [[0, 0, 16, 16]]), rects("#8d97a4", [[2, 1, 1, 14], [6, 1, 1, 14], [10, 1, 1, 14], [14, 1, 1, 14], [1, 4, 14, 1], [1, 11, 14, 1]]));
const drawCabinet = layers(rects("#646d78", [[2, 1, 12, 14]]), rects("#9fb3c8", [[4, 3, 8, 4]]), rects("#2b3138", [[7, 8, 2, 5]]));
const drawLocker = layers(
  rects("#4a5560", [[2, 0, 12, 16]]), rects("#38424c", [[3, 1, 4, 14], [9, 1, 4, 14]]),
  rects("#aab4c0", [[6, 6, 1, 3], [8, 6, 1, 3]]), rects("#2a3038", [[4, 2, 2, 1], [10, 2, 2, 1], [4, 13, 2, 1], [10, 13, 2, 1]]),
);
const drawTerminal = layers(
  rects("#1a2a30", [[2, 1, 12, 14]]), rects("#0a3a28", [[3, 2, 10, 7]]), rects("#00ff80", [[4, 3, 8, 4]]),
  rects("#00cc66", [[5, 4, 3, 1], [9, 5, 2, 1]]), rects("#556060", [[4, 10, 2, 2], [7, 10, 2, 2], [10, 10, 2, 2], [4, 13, 2, 1], [7, 13, 2, 1], [10, 13, 2, 1]]),
);

export const PLACEHOLDERS: Record<string, { w: number; h: number; draw: Draw }> = {
  "item.key": { w: 16, h: 16, draw: drawKey },
  "item.exit": { w: 16, h: 16, draw: drawExit },
  "item.exitLocked": { w: 16, h: 16, draw: drawExitLocked },
  "fx.blood": { w: 16, h: 16, draw: drawBlood },
  "fx.corpse": { w: 16, h: 16, draw: drawCorpse },
  "prop.bed": { w: 16, h: 16, draw: drawBed },
  "prop.gurney": { w: 16, h: 16, draw: drawGurney },
  "prop.table": { w: 16, h: 16, draw: drawTable },
  "prop.bars": { w: 16, h: 16, draw: drawBars },
  "prop.cabinet": { w: 16, h: 16, draw: drawCabinet },
  "prop.locker": { w: 16, h: 16, draw: drawLocker },
  "prop.terminal": { w: 16, h: 16, draw: drawTerminal },
  "tile.floor": { w: 32, h: 32, draw: floorTile("#b8c8d4", "#a4b8c6", "#9db0be", [[5, 8, 3, 2], [20, 22, 4, 2], [12, 3, 2, 3]]) },
  "tile.floor.ward": { w: 32, h: 32, draw: floorTile("#afc4d8", "#9bb4ca", "#a4bcd0", [[3, 3, 4, 3], [24, 20, 3, 3]]) },
  "tile.floor.procedure": { w: 32, h: 32, draw: floorTile("#b0ccc0", "#9cbcae", "#a8c4b6", [[6, 8, 4, 3], [22, 4, 3, 4]]) },
  "tile.floor.canteen": { w: 32, h: 32, draw: floorTile("#c4c0b8", "#b0aba4", "#b8b4ac", [[10, 10, 6, 4]]) },
  "tile.floor.isolation": { w: 32, h: 32, draw: floorTile("#b0b4b8", "#9ca0a4", "#a88880", [[3, 5, 5, 3], [24, 22, 4, 2]]) },
  "tile.floor.storage": { w: 32, h: 32, draw: floorTile("#a8a8a4", "#989894", "#9c9c98", [[10, 8, 8, 3]]) },
  "tile.floor.morgue": { w: 32, h: 32, draw: floorTile("#a0b4c0", "#8ca4b0", "#90a8b8", [[4, 12, 6, 2], [22, 6, 4, 2]]) },
  "tile.bloodfloor": { w: 32, h: 32, draw: layers(floorTile("#b8c8d4", "#a4b8c6", "#8b1a1a", [[6, 8, 20, 16], [3, 12, 8, 8]]), rects("#6b0e0e", [[10, 12, 12, 8]])) },
  "tile.wall": { w: 32, h: 32, draw: wallTile("#dce8f0", "#c4d4e0", "#6b8fa8", "#cddce8", [[2, 2, 7, 7], [12, 12, 8, 8]]) },
  "tile.wall2": { w: 32, h: 32, draw: wallTile("#d0dfe8", "#b8cad6", "#5c7f96", "#a4b8c8", [[4, 4, 8, 4], [20, 14, 6, 5]]) },
  "tile.doorfloor": { w: 32, h: 32, draw: layers(rects("#90a0ac", [[0, 0, 32, 32]]), rects("#7c909c", [[0, 10, 32, 1], [0, 22, 32, 1], [10, 0, 1, 32], [22, 0, 1, 32]])) },
};

export function drawPlaceholder(key: string): HTMLCanvasElement | null {
  const p = PLACEHOLDERS[key];
  if (!p) return null;
  const c = document.createElement("canvas");
  c.width = p.w; c.height = p.h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  p.draw(ctx);
  return c;
}

/** Solid 16×16 square in `color` — last resort for a missing file. */
export function drawSolid(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  return c;
}
