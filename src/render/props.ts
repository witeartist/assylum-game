// Procedural 3/4-view placeholders for interactive objects (lockers, terminals, doors, the
// exit hatch, lamp fixtures). Replaced by files from public/assets/ with the same keys.
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

/** A box seen from the 3/4 camera: top face on top, front face below it. */
function box(w: number, topH: number, frontH: number, top: string, front: string, decorate?: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const [c, ctx] = canvas(w, topH + frontH);
  ctx.fillStyle = front; ctx.fillRect(0, topH, w, frontH);
  ctx.fillStyle = top; ctx.fillRect(0, 0, w, topH);
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(0, topH - 1, w, 1);   // top edge catches light
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, topH + frontH - 2, w, 2); // contact with the floor
  ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, topH + frontH - 1);
  decorate?.(ctx);
  return c;
}

/** Generic furniture stand-in: a box with the footprint's proportions, tinted per object. */
export function furnitureBox(key: string, w: number, h: number): HTMLCanvasElement {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const px = 40;
  return box(w * px, h * px * 0.8, px * 0.55, `hsl(${hue},12%,42%)`, `hsl(${hue},12%,28%)`);
}

export const PROP_ART: Record<string, () => HTMLCanvasElement> = {
  "interactive/locker_closed": () => box(56, 16, 84, "#56616a", "#46515a", ctx => {
    ctx.fillStyle = "#39434b"; ctx.fillRect(4, 20, 22, 76); ctx.fillRect(30, 20, 22, 76);
    ctx.fillStyle = "#1e2429";
    for (const x of [8, 34]) for (let y = 26; y < 40; y += 4) ctx.fillRect(x, y, 14, 2);
    ctx.fillStyle = "#b8c2cc"; ctx.fillRect(22, 56, 2, 8); ctx.fillRect(32, 56, 2, 8);
    ctx.fillStyle = "rgba(110,60,30,0.5)"; ctx.fillRect(10, 70, 6, 20);
  }),
  "interactive/terminal": () => box(44, 12, 34, "#2b3438", "#1f272a", ctx => {
    ctx.fillStyle = "#07261b"; ctx.fillRect(6, 16, 32, 14);
    ctx.fillStyle = "#1dff8e"; ctx.fillRect(8, 18, 28, 3); ctx.fillRect(8, 23, 18, 2);
    ctx.fillStyle = "#56605f";
    for (let y = 33; y < 43; y += 4) for (let x = 8; x < 38; x += 7) ctx.fillRect(x, y, 5, 3);
  }),
  "interactive/door_metal_h": () => box(64, 10, 66, "#3b4145", "#4b5256", ctx => {
    ctx.fillStyle = "#3a4043"; ctx.fillRect(8, 16, 48, 54);
    ctx.fillStyle = "#1c1f20"; for (let x = 20; x < 44; x += 5) ctx.fillRect(x, 22, 2, 10);
    ctx.fillStyle = "#9aa3a8"; ctx.fillRect(46, 44, 6, 3);
  }),
  "interactive/door_metal_v": () => box(34, 10, 66, "#3b4145", "#454c50", ctx => {
    ctx.fillStyle = "#30363a"; ctx.fillRect(6, 16, 22, 54);
  }),
  "interactive/exit_door_closed": () => box(120, 10, 84, "#2d3336", "#4a5357", ctx => {
    ctx.fillStyle = "#3c4448"; ctx.fillRect(10, 22, 48, 70); ctx.fillRect(62, 22, 48, 70);
    ctx.fillStyle = "#1c7a3a"; ctx.fillRect(44, 12, 32, 9);
    ctx.strokeStyle = "#8a6d24"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 58); ctx.lineTo(80, 50); ctx.stroke();
  }),
  "interactive/exit_door_open": () => box(120, 10, 84, "#2d3336", "#4a5357", ctx => {
    ctx.fillStyle = "#050806"; ctx.fillRect(18, 22, 84, 70);
    ctx.fillStyle = "#3c4448"; ctx.fillRect(4, 22, 16, 70); ctx.fillRect(100, 22, 16, 70);
    ctx.fillStyle = "#33ff66"; ctx.fillRect(44, 12, 32, 9);
  }),
  // Wooden ward doors: front view (in a left–right wall), edge-on (in an up–down wall), and open.
  "interactive/door_wood_h": () => box(40, 6, 54, "#4a3a2e", "#5c4636", ctx => {
    ctx.fillStyle = "#4b392c"; ctx.fillRect(5, 11, 30, 45);
    ctx.fillStyle = "#1a1f22"; ctx.fillRect(12, 16, 16, 12);
    ctx.fillStyle = "rgba(160,190,200,0.25)"; ctx.fillRect(13, 17, 6, 10);
    ctx.fillStyle = "#b9b09a"; ctx.fillRect(30, 34, 3, 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(20, 6, 1, 54);
  }),
  "interactive/door_wood_h2": () => box(72, 6, 54, "#4a3a2e", "#5c4636", ctx => {
    ctx.fillStyle = "#4b392c"; ctx.fillRect(4, 11, 31, 45); ctx.fillRect(37, 11, 31, 45);
    ctx.fillStyle = "#1a1f22"; ctx.beginPath(); ctx.arc(19, 24, 6, 0, 7); ctx.arc(53, 24, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(35, 8, 2, 50);
  }),
  "interactive/door_wood_h_open": () => box(8, 4, 56, "#3a2d24", "#2c221b"),
  "interactive/door_wood_v": () => box(10, 4, 56, "#4a3a2e", "#3a2d24", ctx => {
    ctx.fillStyle = "#b9b09a"; ctx.fillRect(3, 30, 4, 2);
  }),
  "interactive/door_wood_v_open": () => box(34, 5, 30, "#4a3a2e", "#5c4636", ctx => {
    ctx.fillStyle = "#1a1f22"; ctx.fillRect(10, 9, 14, 9);
  }),
  "interactive/fuse_box": () => box(40, 8, 48, "#3a4146", "#4b555b", ctx => {
    ctx.fillStyle = "#2a3034"; ctx.fillRect(5, 13, 30, 38);
    ctx.fillStyle = "#11161a"; for (let y = 17; y < 47; y += 8) ctx.fillRect(9, y, 22, 5);
    ctx.fillStyle = "#e8c02a"; ctx.fillRect(12, 50, 16, 3);
    ctx.fillStyle = "#ff4a3a"; ctx.fillRect(31, 15, 2, 2);
  }),
  "interactive/fuse_box_on": () => box(40, 8, 48, "#3a4146", "#4b555b", ctx => {
    ctx.fillStyle = "#2a3034"; ctx.fillRect(5, 13, 30, 38);
    ctx.fillStyle = "#c9b27a"; for (let y = 17; y < 47; y += 8) ctx.fillRect(9, y, 22, 5);
    ctx.fillStyle = "#e8c02a"; ctx.fillRect(12, 50, 16, 3);
    ctx.fillStyle = "#3dff7a"; ctx.fillRect(31, 15, 2, 2); ctx.fillRect(31, 20, 2, 2);
  }),
  "props/lamp_fluorescent": () => {
    const [c, ctx] = canvas(64, 16);
    ctx.fillStyle = "#3a3f42"; ctx.fillRect(0, 2, 64, 12);
    ctx.fillStyle = "#f4f8ff"; ctx.fillRect(4, 5, 56, 3); ctx.fillRect(4, 9, 56, 2);
    return c;
  },
  "props/lamp_emergency": () => {
    const [c, ctx] = canvas(24, 16);
    ctx.fillStyle = "#3a3f42"; ctx.fillRect(0, 2, 24, 12);
    ctx.fillStyle = "#ff5a4a"; ctx.fillRect(4, 5, 16, 6);
    return c;
  },
  "props/lamp_broken": () => {
    const [c, ctx] = canvas(64, 16);
    ctx.fillStyle = "#3a3f42"; ctx.fillRect(0, 2, 64, 12);
    ctx.fillStyle = "#c9ced6"; ctx.fillRect(4, 5, 30, 3); ctx.fillRect(40, 7, 20, 2);
    return c;
  },
};
