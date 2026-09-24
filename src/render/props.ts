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
  // Locked doors are drawn like walls: a plate on the cap and a metal front.
  "interactive/door_top": () => {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = "#34383a"; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#b8901e";
    for (let i = -64; i < 64; i += 16) { ctx.beginPath(); ctx.moveTo(i, 64); ctx.lineTo(i + 8, 64); ctx.lineTo(i + 72, 0); ctx.lineTo(i + 64, 0); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(6, 6, 52, 52);
    ctx.strokeStyle = "#1a1c1d"; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 61, 61);
    return c;
  },
  "interactive/door_face": () => {
    const [c, ctx] = canvas(64, 32);
    ctx.fillStyle = "#4b5256"; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = "#3a4043"; ctx.fillRect(4, 3, 26, 27); ctx.fillRect(34, 3, 26, 27);
    ctx.fillStyle = "#9aa3a8"; for (const x of [6, 26, 36, 56]) for (const y of [5, 26]) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = "#ff3030"; ctx.fillRect(30, 12, 4, 4);
    ctx.fillStyle = "#1b1d1e"; ctx.fillRect(0, 29, 64, 3);
    return c;
  },
  "interactive/exit_closed": () => {
    const [c, ctx] = canvas(72, 72);
    ctx.fillStyle = "#2c3133"; ctx.fillRect(4, 4, 64, 64);
    ctx.fillStyle = "#454c50"; ctx.fillRect(10, 10, 52, 52);
    ctx.strokeStyle = "#8a6d24"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(62, 62); ctx.moveTo(62, 10); ctx.lineTo(10, 62); ctx.stroke();
    ctx.fillStyle = "#c9a227"; ctx.fillRect(30, 30, 12, 12);
    ctx.strokeStyle = "#101213"; ctx.lineWidth = 2; ctx.strokeRect(4, 4, 64, 64);
    return c;
  },
  "interactive/exit_open": () => {
    const [c, ctx] = canvas(72, 72);
    ctx.fillStyle = "#2c3133"; ctx.fillRect(4, 4, 64, 64);
    const g = ctx.createLinearGradient(0, 10, 0, 62);
    g.addColorStop(0, "#030504"); g.addColorStop(1, "#0f2a17");
    ctx.fillStyle = g; ctx.fillRect(10, 10, 52, 52);
    ctx.fillStyle = "#3a4a3e"; for (let y = 16; y < 60; y += 9) ctx.fillRect(14, y, 44, 3);
    ctx.fillStyle = "#33ff66"; ctx.fillRect(28, 0, 16, 6);
    return c;
  },
  "props/lamp_fixture": () => {
    const [c, ctx] = canvas(64, 16);
    ctx.fillStyle = "#3a3f42"; ctx.fillRect(0, 2, 64, 12);
    ctx.fillStyle = "#f4f8ff"; ctx.fillRect(4, 5, 56, 3); ctx.fillRect(4, 9, 56, 2);
    return c;
  },
};
