// Pixel-art stand-ins for small objects that have no generated art yet. Drawn tiny and shown
// with nearest-neighbour filtering; files from the asset manifest replace them key by key.
type Draw = (ctx: CanvasRenderingContext2D) => void;

function rects(color: string, list: number[][]): Draw {
  return ctx => { ctx.fillStyle = color; for (const [x, y, w, h] of list) ctx.fillRect(x, y, w, h); };
}
function layers(...draws: Draw[]): Draw { return ctx => draws.forEach(d => d(ctx)); }

export const PLACEHOLDERS: Record<string, { w: number; h: number; draw: Draw }> = {
  "interactive/key": { w: 16, h: 16, draw: rects("#f1c40f", [[3, 6, 10, 4], [5, 3, 4, 4], [11, 7, 3, 2], [11, 10, 3, 2]]) },
  "interactive/corpse": { w: 16, h: 16, draw: layers(
    rects("#600000", [[1, 6, 14, 8], [3, 4, 10, 12]]), rects("#8b0000", [[2, 7, 12, 6]]),
    rects("#3a3a3a", [[4, 5, 8, 2], [3, 7, 10, 4], [5, 11, 3, 3], [9, 11, 3, 2], [2, 6, 2, 3], [12, 7, 2, 2]]),
    rects("#555", [[6, 4, 4, 3]])) },
  "props/bed": { w: 16, h: 16, draw: layers(rects("#5f6878", [[1, 3, 14, 10]]), rects("#aeb7c3", [[3, 5, 10, 6]]), rects("#d7dde8", [[11, 5, 2, 3]]), rects("#2f3440", [[1, 1, 2, 14], [13, 1, 2, 14]])) },
  "props/gurney": { w: 16, h: 16, draw: layers(rects("#7e878f", [[2, 4, 12, 8]]), rects("#93b7bf", [[3, 5, 10, 6]]), rects("#2b3136", [[3, 12, 2, 3], [11, 12, 2, 3], [1, 2, 1, 12], [14, 2, 1, 12]])) },
  "props/table": { w: 16, h: 16, draw: layers(rects("#6e5442", [[2, 3, 12, 8]]), rects("#4e392d", [[3, 11, 2, 4], [11, 11, 2, 4]]), rects("#8a6b57", [[4, 4, 8, 2]])) },
  "props/bars": { w: 16, h: 16, draw: layers(rects("#414853", [[0, 0, 16, 16]]), rects("#8d97a4", [[2, 1, 1, 14], [6, 1, 1, 14], [10, 1, 1, 14], [14, 1, 1, 14], [1, 4, 14, 1], [1, 11, 14, 1]])) },
  "props/cabinet": { w: 16, h: 16, draw: layers(rects("#646d78", [[2, 1, 12, 14]]), rects("#9fb3c8", [[4, 3, 8, 4]]), rects("#2b3138", [[7, 8, 2, 5]])) },
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
