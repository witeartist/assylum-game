// ============================================================
//  ASSYLUM — sprites.ts — Drawing, textures, Phaser loading
// ============================================================
import Phaser from "phaser";
import { COLORS, SPRITE_DIMENSIONS } from "./config";

let _pngTotal = 0;
let _pngLoaded = 0;

function makeSpriteCanvas(drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 16, h = 16): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx, w, h);
  return c;
}

// ── Character pixel-art draw helpers ─────────────────────────
function drawRunner(ctx: CanvasRenderingContext2D, color: string, eyeColor = "#fff", hasBand = false) {
  ctx.fillStyle = color;
  ctx.fillRect(4, 6, 8, 9); ctx.fillRect(5, 1, 6, 5);
  ctx.fillRect(4, 15, 3, 3); ctx.fillRect(9, 15, 3, 3);
  ctx.fillStyle = eyeColor;
  ctx.fillRect(6, 3, 2, 2); ctx.fillRect(9, 3, 2, 2);
  ctx.fillStyle = "#000";
  ctx.fillRect(7, 4, 1, 1); ctx.fillRect(10, 4, 1, 1);
  if (hasBand) { ctx.fillStyle = "#ffffff55"; ctx.fillRect(4, 7, 8, 2); }
}

function drawFoxmind(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#e84040";
  ctx.fillRect(3, 5, 10, 10);
  ctx.fillStyle = "#c02020"; ctx.fillRect(4, 1, 8, 5);
  ctx.fillStyle = "#ffff00";
  ctx.fillRect(5, 2, 3, 2); ctx.fillRect(9, 2, 3, 2);
  ctx.fillStyle = "#000";
  ctx.fillRect(6, 3, 1, 1); ctx.fillRect(10, 3, 1, 1);
  ctx.fillStyle = "#ff8888";
  ctx.fillRect(1, 8, 3, 2); ctx.fillRect(12, 8, 3, 2);
  ctx.fillStyle = "#e84040";
  ctx.fillRect(4, 15, 3, 3); ctx.fillRect(9, 15, 3, 3);
}

function drawJelo(ctx: CanvasRenderingContext2D) {
  const g = "#3a7c3a", lg = "#5ec45e";
  ctx.fillStyle = g; ctx.fillRect(2, 8, 20, 14);
  ctx.fillStyle = "#2a5c2a"; ctx.fillRect(4, 1, 16, 8);
  ctx.fillStyle = "#ff0";
  ctx.fillRect(5, 3, 4, 3); ctx.fillRect(10, 3, 4, 3); ctx.fillRect(15, 3, 4, 3);
  ctx.fillStyle = "#000";
  ctx.fillRect(7, 4, 1, 1); ctx.fillRect(12, 4, 1, 1); ctx.fillRect(17, 4, 1, 1);
  ctx.fillStyle = lg;
  ctx.fillRect(0, 10, 3, 2); ctx.fillRect(0, 14, 3, 2);
  ctx.fillRect(21, 10, 3, 2); ctx.fillRect(21, 14, 3, 2);
  ctx.fillStyle = g; ctx.fillRect(4, 22, 5, 3); ctx.fillRect(15, 22, 5, 3);
  ctx.fillStyle = "#000"; ctx.fillRect(6, 10, 12, 2);
  ctx.fillStyle = "#ff4444";
  ctx.fillRect(7, 11, 2, 1); ctx.fillRect(11, 11, 2, 1); ctx.fillRect(15, 11, 2, 1);
}

function drawKey(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(3, 6, 10, 4); ctx.fillRect(5, 3, 4, 4);
  ctx.fillRect(11, 7, 3, 2); ctx.fillRect(11, 10, 3, 2);
}
function drawExit(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#27ae60"; ctx.fillRect(2, 1, 12, 14);
  ctx.fillStyle = "#1a8048"; ctx.fillRect(6, 5, 4, 10);
  ctx.fillStyle = "#f1c40f"; ctx.fillRect(12, 7, 2, 2);
}
function drawExitLocked(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#555"; ctx.fillRect(2, 1, 12, 14);
  ctx.fillStyle = "#888"; ctx.fillRect(6, 5, 4, 10);
  ctx.fillStyle = "#999"; ctx.fillRect(12, 7, 2, 2);
  ctx.fillStyle = "#f1c40f"; ctx.fillRect(5, 8, 6, 5);
  ctx.strokeStyle = "#f1c40f"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(8, 8, 3, Math.PI, 0); ctx.stroke();
}
function drawBloodSplat(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#8b0000";
  ctx.fillRect(3, 3, 10, 10); ctx.fillRect(1, 5, 4, 4);
  ctx.fillRect(11, 2, 4, 5); ctx.fillRect(5, 11, 6, 4);
  ctx.fillStyle = "#600000"; ctx.fillRect(5, 5, 6, 6);
}
function drawCorpse(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#600000"; ctx.fillRect(1, 6, 14, 8); ctx.fillRect(3, 4, 10, 12);
  ctx.fillStyle = "#8b0000"; ctx.fillRect(2, 7, 12, 6);
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(4, 5, 8, 2); ctx.fillRect(3, 7, 10, 4);
  ctx.fillRect(5, 11, 3, 3); ctx.fillRect(9, 11, 3, 2);
  ctx.fillRect(2, 6, 2, 3); ctx.fillRect(12, 7, 2, 2);
  ctx.fillStyle = "#555"; ctx.fillRect(6, 4, 4, 3);
}

// ── Furniture ────────────────────────────────────────────────
function drawBed(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#5f6878"; ctx.fillRect(1,3,14,10);
  ctx.fillStyle="#aeb7c3"; ctx.fillRect(3,5,10,6);
  ctx.fillStyle="#d7dde8"; ctx.fillRect(11,5,2,3);
  ctx.fillStyle="#2f3440"; ctx.fillRect(1,1,2,14); ctx.fillRect(13,1,2,14);
}
function drawGurney(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#7e878f"; ctx.fillRect(2,4,12,8);
  ctx.fillStyle="#93b7bf"; ctx.fillRect(3,5,10,6);
  ctx.fillStyle="#2b3136"; ctx.fillRect(3,12,2,3); ctx.fillRect(11,12,2,3);
  ctx.fillRect(1,2,1,12); ctx.fillRect(14,2,1,12);
}
function drawTable(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#6e5442"; ctx.fillRect(2,3,12,8);
  ctx.fillStyle="#4e392d"; ctx.fillRect(3,11,2,4); ctx.fillRect(11,11,2,4);
  ctx.fillStyle="#8a6b57"; ctx.fillRect(4,4,8,2);
}
function drawBars(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#414853"; ctx.fillRect(0,0,16,16);
  ctx.fillStyle="#8d97a4";
  ctx.fillRect(2,1,1,14); ctx.fillRect(6,1,1,14); ctx.fillRect(10,1,1,14); ctx.fillRect(14,1,1,14);
  ctx.fillRect(1,4,14,1); ctx.fillRect(1,11,14,1);
}
function drawCabinet(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#646d78"; ctx.fillRect(2,1,12,14);
  ctx.fillStyle="#9fb3c8"; ctx.fillRect(4,3,8,4);
  ctx.fillStyle="#2b3138"; ctx.fillRect(7,8,2,5);
}
function drawLocker(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#4a5560"; ctx.fillRect(2,0,12,16);
  ctx.fillStyle="#38424c"; ctx.fillRect(3,1,4,14); ctx.fillRect(9,1,4,14);
  ctx.fillStyle="#aab4c0"; ctx.fillRect(6,6,1,3); ctx.fillRect(8,6,1,3);
  ctx.fillStyle="#2a3038";
  ctx.fillRect(4,2,2,1); ctx.fillRect(10,2,2,1); ctx.fillRect(4,13,2,1); ctx.fillRect(10,13,2,1);
}
function drawTerminal(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#1a2a30"; ctx.fillRect(2,1,12,14);
  ctx.fillStyle="#0a3a28"; ctx.fillRect(3,2,10,7);
  ctx.fillStyle="#00ff80"; ctx.fillRect(4,3,8,4);
  ctx.fillStyle="#00cc66"; ctx.fillRect(5,4,3,1); ctx.fillRect(9,5,2,1);
  ctx.fillStyle="#556060";
  ctx.fillRect(4,10,2,2); ctx.fillRect(7,10,2,2); ctx.fillRect(10,10,2,2);
  ctx.fillRect(4,13,2,1); ctx.fillRect(7,13,2,1); ctx.fillRect(10,13,2,1);
}

// ── Tile textures (32×32) ────────────────────────────────────
function drawFloor(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#b8c8d4"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#a4b8c6"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#9db0be"; ctx.fillRect(5,8,3,2); ctx.fillRect(20,22,4,2); ctx.fillRect(12,3,2,3);
}
function drawFloorWard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#afc4d8"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#9bb4ca"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#a4bcd0"; ctx.fillRect(3,3,4,3); ctx.fillRect(24,20,3,3);
}
function drawFloorProcedure(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#b0ccc0"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#9cbcae"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#a8c4b6"; ctx.fillRect(6,8,4,3); ctx.fillRect(22,4,3,4);
}
function drawFloorCanteen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#c4c0b8"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#b0aba4"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#b8b4ac"; ctx.fillRect(10,10,6,4);
}
function drawFloorIsolation(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#b0b4b8"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#9ca0a4"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#a88880"; ctx.fillRect(3,5,5,3); ctx.fillRect(24,22,4,2);
}
function drawFloorStorage(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#a8a8a4"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#989894"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#9c9c98"; ctx.fillRect(10,8,8,3);
}
function drawFloorMorgue(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#a0b4c0"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#8ca4b0"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#90a8b8"; ctx.fillRect(4,12,6,2); ctx.fillRect(22,6,4,2);
}
function drawBloodFloor(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#b8c8d4"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#a4b8c6"; ctx.fillRect(0,15,32,1); ctx.fillRect(15,0,1,32);
  ctx.fillStyle="#8b1a1a"; ctx.fillRect(6,8,20,16); ctx.fillRect(3,12,8,8);
  ctx.fillStyle="#6b0e0e"; ctx.fillRect(10,12,12,8);
}
function drawWall(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#dce8f0"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#c4d4e0"; ctx.fillRect(0,10,32,1); ctx.fillRect(0,21,32,1); ctx.fillRect(10,0,1,32); ctx.fillRect(21,0,1,32);
  ctx.fillStyle="#6b8fa8"; ctx.fillRect(0,26,32,6);
  ctx.fillStyle="#cddce8"; ctx.fillRect(2,2,7,7); ctx.fillRect(12,12,8,8);
}
function drawWall2(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#d0dfe8"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#b8cad6"; ctx.fillRect(0,10,32,1); ctx.fillRect(0,21,32,1); ctx.fillRect(10,0,1,32); ctx.fillRect(21,0,1,32);
  ctx.fillStyle="#5c7f96"; ctx.fillRect(0,26,32,6);
  ctx.fillStyle="#a4b8c8"; ctx.fillRect(4,4,8,4); ctx.fillRect(20,14,6,5);
}
function drawDoorFloor(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle="#90a0ac"; ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#7c909c"; ctx.fillRect(0,10,32,1); ctx.fillRect(0,22,32,1); ctx.fillRect(10,0,1,32); ctx.fillRect(22,0,1,32);
}

// ── PNG loading with crop ────────────────────────────────────
function getOpaqueBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  if (maxX === -1) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function cropAndResizeImage(img: HTMLImageElement): HTMLCanvasElement {
  const sc = document.createElement("canvas");
  sc.width = img.width; sc.height = img.height;
  const sctx = sc.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const b = getOpaqueBounds(sctx, img.width, img.height);
  const MAX_TEX = 2048;
  let outW = b.width, outH = b.height;
  if (outW > MAX_TEX || outH > MAX_TEX) {
    const ratio = Math.min(MAX_TEX / outW, MAX_TEX / outH);
    outW = Math.floor(outW * ratio); outH = Math.floor(outH * ratio);
  }
  const c = document.createElement("canvas");
  c.width = outW; c.height = outH;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sc, b.x, b.y, b.width, b.height, 0, 0, outW, outH);
  return c;
}

// ── Register generated textures with Phaser ──────────────────
export function registerGeneratedTextures(scene: Phaser.Scene) {
  const sprites: Record<string, [(ctx: CanvasRenderingContext2D, w: number, h: number) => void, number, number]> = {
    key: [drawKey, 16, 16], exit: [drawExit, 16, 16], exitlocked: [drawExitLocked, 16, 16],
    blood: [drawBloodSplat, 16, 16], corpse: [drawCorpse, 16, 16],
    bed: [drawBed, 16, 16], gurney: [drawGurney, 16, 16], table: [drawTable, 16, 16],
    bars: [drawBars, 16, 16], cabinet: [drawCabinet, 16, 16],
    locker: [drawLocker, 16, 16], terminal: [drawTerminal, 16, 16],
    floor: [drawFloor, 32, 32], "floor-ward": [drawFloorWard, 32, 32],
    "floor-procedure": [drawFloorProcedure, 32, 32], "floor-canteen": [drawFloorCanteen, 32, 32],
    "floor-isolation": [drawFloorIsolation, 32, 32], "floor-storage": [drawFloorStorage, 32, 32],
    "floor-morgue": [drawFloorMorgue, 32, 32], bloodfloor: [drawBloodFloor, 32, 32],
    wall: [drawWall, 32, 32], wall2: [drawWall2, 32, 32], doorfloor: [drawDoorFloor, 32, 32],
  };
  for (const name in sprites) {
    const s = sprites[name];
    const c = makeSpriteCanvas(s[0], s[1], s[2]);
    scene.textures.addCanvas(name, c);
    SPRITE_DIMENSIONS[name] = { width: s[1], height: s[2] };
  }
}

// ── Load PNGs and register with Phaser ───────────────────────
const _pngSpecs = [
  { name: "Naumi",   src: "Sprite/naumi.png" },
  { name: "Kuruna",  src: "Sprite/Kuruna.png" },
  { name: "Wite",    src: "Sprite/Wite.png" },
  { name: "Sumrak",  src: "Sprite/Sumrak.png" },
  { name: "Yoko",    src: "Sprite/yoko.png" },
  { name: "Foxmind", src: "Sprite/Foxmind.png" },
  { name: "Jelo",    src: "Sprite/jeloch.png" },
  { name: "menuArt", src: "Sprite/arts/main menu.jpg" },
  { name: "bed_vertical",         src: "Sprite/interior/bed_vertical.png" },
  { name: "bed_vertical_type_2",  src: "Sprite/interior/bed_vertical_type_2.png" },
  { name: "bed_vertical_type_3",  src: "Sprite/interior/bed_vertical_type_3.png" },
  { name: "bed_horizontal_type_1", src: "Sprite/interior/bed_horizontal_type_1.png" },
];

export function loadPNGSprites(scene: Phaser.Scene, onDone: () => void) {
  _pngTotal = _pngSpecs.length;
  _pngLoaded = 0;
  _pngSpecs.forEach(function(spec) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
      const c = cropAndResizeImage(img);
      scene.textures.addCanvas(spec.name, c);
      SPRITE_DIMENSIONS[spec.name] = { width: c.width, height: c.height };
      _pngLoaded++;
      if (_pngLoaded >= _pngTotal && onDone) onDone();
    };
    img.onerror = function() {
      const c = document.createElement("canvas");
      c.width = 16; c.height = 16;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = COLORS[spec.name] || "#e879a0";
      ctx.fillRect(0, 0, 16, 16);
      scene.textures.addCanvas(spec.name, c);
      SPRITE_DIMENSIONS[spec.name] = { width: 16, height: 16 };
      _pngLoaded++;
      if (_pngLoaded >= _pngTotal && onDone) onDone();
    };
    img.src = spec.src;
  });
  if (_pngTotal === 0 && onDone) onDone();
}
