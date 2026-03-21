// ============================================================
//  ASSYLUM — perf.ts — Worker bridge, fog overlay, FPS
// ============================================================
import { CANVAS_W, CANVAS_H, MAP_W, MAP_H, TILE, tileKey } from "./config";
import { computeVisibility, findPath } from "./ai";
import type { Tile } from "./config";

// ── Worker bridge ────────────────────────────────────────────
let _worker: Worker | null = null;
let _workerReady = false;
const _workerCallbacks = new Map<number, Function>();
let _workerIdCounter = 0;
let _mapRows: string[] | null = null;

export function initWorker(rows: string[], mapW: number, mapH: number) {
  _mapRows = rows;
  _worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  _worker.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === "ready") { _workerReady = true; return; }
    if (msg.type === "visibility") {
      const cb = _workerCallbacks.get(msg.id);
      if (cb) { _workerCallbacks.delete(msg.id); cb(new Set(msg.visible)); }
      return;
    }
    if (msg.type === "pathfind") {
      const cb2 = _workerCallbacks.get(msg.id);
      if (cb2) { _workerCallbacks.delete(msg.id); cb2(msg.path); }
      return;
    }
    if (msg.type === "batchPathfind") {
      msg.results.forEach(function(r: any) {
        const cb3 = _workerCallbacks.get(r.id);
        if (cb3) { _workerCallbacks.delete(r.id); cb3(r.path); }
      });
      return;
    }
  };
  _worker.postMessage({ type: "init", rows: rows.slice(), mapW, mapH });
}

export function workerUpdateRow(row: number, data: string) {
  if (_worker && _workerReady) _worker.postMessage({ type: "updateRows", row, data });
}

export function workerVisibility(cx: number, cy: number, radius: number, callback: (vis: Set<string>) => void) {
  if (!_worker || !_workerReady) {
    callback(computeVisibility(_mapRows!, cx, cy, radius));
    return;
  }
  const id = ++_workerIdCounter;
  _workerCallbacks.set(id, callback);
  _worker.postMessage({ type: "visibility", id, cx, cy, radius });
}

export function workerPathfind(start: Tile, goal: Tile, callback: (path: Tile[]) => void) {
  if (!_worker || !_workerReady) { callback(findPath(_mapRows!, start, goal)); return; }
  const id = ++_workerIdCounter;
  _workerCallbacks.set(id, callback);
  _worker.postMessage({ type: "pathfind", id, start, goal });
}

export function workerBatchPathfind(requests: { start: Tile; goal: Tile; callback: (path: Tile[]) => void }[]) {
  if (!_worker || !_workerReady) {
    requests.forEach(req => req.callback(findPath(_mapRows!, req.start, req.goal)));
    return;
  }
  const msgs = requests.map(req => {
    const id = ++_workerIdCounter;
    _workerCallbacks.set(id, req.callback);
    return { id, start: req.start, goal: req.goal };
  });
  _worker.postMessage({ type: "batchPathfind", requests: msgs });
}

export function destroyWorker() {
  if (_worker) { _worker.terminate(); _worker = null; _workerReady = false; }
  _workerCallbacks.clear();
}

// ── Fog Overlay (offscreen canvas → Phaser CanvasTexture) ────
let _fogCanvas: HTMLCanvasElement | null = null;
let _fogCtx: CanvasRenderingContext2D | null = null;
let _fogPhaserImg: any = null;
const FOG_SCALE = 2;

export function createFogOverlay() {
  if (_fogCanvas) return;
  _fogCanvas = document.createElement("canvas");
  _fogCanvas.width = Math.ceil(CANVAS_W / FOG_SCALE);
  _fogCanvas.height = Math.ceil(CANVAS_H / FOG_SCALE);
  _fogCtx = _fogCanvas.getContext("2d", { alpha: true })!;
}

export function getFogCanvas(): HTMLCanvasElement | null { return _fogCanvas; }
export function setFogImage(img: any) { _fogPhaserImg = img; }

export function removeFogOverlay() {
  if (_fogPhaserImg) { try { _fogPhaserImg.destroy(); } catch {} _fogPhaserImg = null; }
  _fogCanvas = null; _fogCtx = null;
}

export interface FlashlightState {
  on: boolean;
  mode: number;       // 1=narrow, 2=medium, 3=wide
}

export interface FoxFlashState {
  active: boolean;
  x: number;
  y: number;
}

// Flashlight mode configs: [halfAngle (rad), range (tiles)]
const FLASH_MODES: [number, number][] = [
  [0, 0],                              // 0 — unused
  [Math.PI * 0.12, 14],                // 1 — narrow focused beam
  [Math.PI * 0.28, 9],                 // 2 — medium beam
  [Math.PI * 0.50, 5],                 // 3 — wide lantern
];

export function renderFogGPU(playerVisible: Set<string>, pTileCol: number, pTileRow: number, sight: number, camX: number, camY: number, flickerExtra: number, hudHeight: number, facingAngle: number = 0, footsteps: {x:number,y:number,age:number,maxAge:number,maxRadius:number}[] = [], lightSources: {col:number,row:number,radius:number,intensity:number}[] = [], flashlight: FlashlightState = { on: false, mode: 2 }, foxFlash: FoxFlashState = { active: false, x: 0, y: 0 }) {
  if (!_fogCtx || !_fogCanvas) return;
  const ctx = _fogCtx, w = _fogCanvas.width, h = _fogCanvas.height;
  if (!playerVisible || playerVisible.size === 0) return;

  // Start with full darkness
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const tileS = TILE / FOG_SCALE;
  const halfW = (CANVAS_W / 2) / FOG_SCALE;
  const halfH = (CANVAS_H / 2) / FOG_SCALE;
  const offsetX = camX / FOG_SCALE - halfW;
  const offsetY = camY / FOG_SCALE - halfH;
  const startCol = Math.floor((camX - CANVAS_W / 2) / TILE) - 1;
  const startRow = Math.floor((camY - CANVAS_H / 2) / TILE) - 1;
  const endCol = Math.ceil((camX + CANVAS_W / 2) / TILE) + 1;
  const endRow = Math.ceil((camY + CANVAS_H / 2) / TILE) + 1;

  // Flashlight cone params
  const flMode = flashlight.on ? (flashlight.mode || 2) : 0;
  const flHalfAngle = flMode > 0 ? FLASH_MODES[flMode][0] : 0;
  const flRange = flMode > 0 ? FLASH_MODES[flMode][1] : 0;

  ctx.globalCompositeOperation = "destination-out";

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (col < 0 || col >= MAP_W || row < 0 || row >= MAP_H) continue;
      if (!playerVisible.has(tileKey(col, row))) continue;

      const dx = col - pTileCol, dy = row - pTileRow;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Base: tiny ambient radius around player (always visible, ~2 tiles)
      let alpha = 0;
      if (dist < 2.5) {
        alpha = Math.max(alpha, 1 - dist / 2.5);
      }

      // Lit areas (rooms/corridors with lights)
      for (let li = 0; li < lightSources.length; li++) {
        const ls = lightSources[li];
        const ldx = col - ls.col, ldy = row - ls.row;
        const ld = Math.sqrt(ldx * ldx + ldy * ldy);
        if (ld < ls.radius) {
          const litAlpha = ls.intensity * (1 - ld / ls.radius);
          // Only show lit areas in forward visible direction
          const fade = Math.max(0, (dist - sight * 0.35) / (sight * 0.65));
          const visFade = 1 - Math.min(1, fade * 0.9);
          alpha = Math.max(alpha, litAlpha * visFade);
        }
      }

      // Flashlight cone
      if (flMode > 0 && dist <= flRange && dist > 0.5) {
        const tileAngle = Math.atan2(dy, dx);
        let angleDiff = Math.abs(tileAngle - facingAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        if (angleDiff <= flHalfAngle) {
          const rangeFade = 1 - dist / flRange;
          const angleFade = 1 - angleDiff / flHalfAngle;
          alpha = Math.max(alpha, rangeFade * angleFade * 0.95);
        }
      }

      // Flicker
      alpha = Math.max(0, alpha - flickerExtra);

      if (alpha < 0.01) continue;
      const sx = col * tileS - offsetX;
      const sy = row * tileS - offsetY;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx, sy, tileS + 0.5, tileS + 0.5);
    }
  }

  // ── Fox flash — tile-based (no through-walls) ───────
  if (foxFlash.active) {
    ctx.globalCompositeOperation = "destination-out";
    const FLASH_RADIUS = 9; // tiles
    const flashTileCol = Math.floor(foxFlash.x / TILE);
    const flashTileRow = Math.floor(foxFlash.y / TILE);
    for (let row = flashTileRow - FLASH_RADIUS; row <= flashTileRow + FLASH_RADIUS; row++) {
      for (let col = flashTileCol - FLASH_RADIUS; col <= flashTileCol + FLASH_RADIUS; col++) {
        if (col < 0 || col >= MAP_W || row < 0 || row >= MAP_H) continue;
        if (!playerVisible.has(tileKey(col, row))) continue;
        const fdx = col - flashTileCol, fdy = row - flashTileRow;
        const fd = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fd > FLASH_RADIUS) continue;
        const flashAlpha = Math.max(0, 0.95 - fd / FLASH_RADIUS * 0.5);
        const sx = col * tileS - offsetX;
        const sy = row * tileS - offsetY;
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = "#fff";
        ctx.fillRect(sx, sy, tileS + 0.5, tileS + 0.5);
      }
    }
  }

  // ── Footstep ripples (visible through fog) ──────────
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < footsteps.length; i++) {
    const step = footsteps[i];
    const sx = step.x / FOG_SCALE - offsetX;
    const sy = step.y / FOG_SCALE - offsetY;
    const progress = step.age / step.maxAge;
    const radius = step.maxRadius * progress / FOG_SCALE;
    const a = 0.3 * (1 - progress);
    if (a < 0.01 || radius < 1) continue;
    ctx.globalAlpha = a;
    ctx.strokeStyle = "#6478a0";
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, hudHeight / FOG_SCALE);
}

export function hideFogOverlay() { if (_fogPhaserImg) _fogPhaserImg.setVisible(false); }
export function showFogOverlay() { if (_fogPhaserImg) _fogPhaserImg.setVisible(true); }

// ── FPS counter ──────────────────────────────────────────────
let _fpsFrames = 0, _fpsLast = performance.now(), _fpsCurrent = 60;
export function updateFPS(): number {
  _fpsFrames++;
  const now = performance.now();
  if (now - _fpsLast >= 1000) { _fpsCurrent = _fpsFrames; _fpsFrames = 0; _fpsLast = now; }
  return _fpsCurrent;
}
export function getFPS(): number { return _fpsCurrent; }
