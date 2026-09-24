// How each kind of light looks: colour, strength and size (radii in tiles).
export type RGB = [number, number, number];

export interface LightLook { color: RGB; intensity: number; radius?: number; }

export const LIGHTS = {
  lamp:       { color: [0.78, 0.9, 1.0],   intensity: 1.15 },
  emergency:  { color: [1.0, 0.3, 0.24],   intensity: 1.0 },
  flashlight: { color: [1.0, 0.9, 0.72],   intensity: 1.2 },
  /** Light spilling around a flashlight holder. */
  spill:      { color: [1.0, 0.9, 0.72],   intensity: 0.4, radius: 1.4 },
  /** Night vision around the local runner (only the viewer sees it). */
  personal:   { color: [0.42, 0.48, 0.62], intensity: 0.6, radius: 2.8 },
  /** The hunter sees in the dark further (only the viewer sees it). */
  hunterEyes: { color: [0.95, 0.55, 0.5],  intensity: 0.75, radius: 6 },
  foxFlash:   { color: [1.0, 0.92, 0.86],  intensity: 1.8 },
  terminal:   { color: [0.2, 1.0, 0.5],    intensity: 0.7, radius: 1.8 },
  exitOpen:   { color: [0.35, 1.0, 0.45],  intensity: 1.1, radius: 3.5 },
  exitLocked: { color: [1.0, 0.3, 0.25],   intensity: 0.55, radius: 2 },
  key:        { color: [1.0, 0.82, 0.35],  intensity: 0.5, radius: 1.1 },
} satisfies Record<string, LightLook>;

/** Share of lamps that are red emergency lights, and of lamps that flicker. */
export const EMERGENCY_SHARE = 0.15;
export const FLICKER_SHARE = 0.25;
/** After the boss wakes, every lamp is tinted this much towards emergency red. */
export const BOSS_RED_TINT = 0.45;
