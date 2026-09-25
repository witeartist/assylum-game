// Render resolution and graphics quality. The canvas is rendered at RES × the logical 960×600
// layout (sharp on big and HiDPI screens); every camera zooms by RES so layout code keeps
// working in logical units.
import { CANVAS_W, CANVAS_H } from "../core/constants";
import { settings, type Quality } from "../core/settings";

export interface QualityPreset {
  /** Highest render scale this preset allows. */
  maxRes: number;
  /** Lightmap size relative to the logical 960×600 canvas. */
  lightScale: number;
  /** Jittered light positions for soft shadow edges. */
  softShadows: boolean;
  /** Film grain, chromatic aberration, light glow. */
  post: boolean;
  /** Dust motes floating around the player. */
  dust: number;
  /** Shadows of furniture and characters: 0 only under them, 1 from flashlights, 2 from every strong light. */
  objectShadows: 0 | 1 | 2;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low:    { maxRes: 1,   lightScale: 0.35, softShadows: false, post: false, dust: 0,  objectShadows: 0 },
  medium: { maxRes: 1.5, lightScale: 0.5,  softShadows: false, post: true,  dust: 40, objectShadows: 1 },
  high:   { maxRes: 2,   lightScale: 0.5,  softShadows: true,  post: true,  dust: 90, objectShadows: 2 },
};

/** Current preset (follows the settings; the render scale below is fixed at startup). */
export const quality = {
  get lightScale() { return QUALITY[settings.quality].lightScale; },
  get softShadows() { return QUALITY[settings.quality].softShadows; },
  get post() { return QUALITY[settings.quality].post; },
  get dust() { return QUALITY[settings.quality].dust; },
  get objectShadows() { return QUALITY[settings.quality].objectShadows; },
};

function computeRes(): number {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min(window.innerWidth * dpr / CANVAS_W, window.innerHeight * dpr / CANVAS_H);
  return Math.max(1, Math.min(QUALITY[settings.quality].maxRes, Math.round(fit * 2) / 2));
}

/** Render scale: canvas pixels per logical pixel (1, 1.5 or 2). Fixed for the session. */
export const RES = computeRes();

/** World camera zoom on top of RES: one tile is 48 logical px on screen. */
export const VIEW_ZOOM = 1.5;
