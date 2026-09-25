// Design system tokens: colors, tones, typography and depth layers. Every scene and
// component takes its look from here — change a value once and the whole game follows.
import type Phaser from "phaser";
import { RES } from "../render/display";

/** Semantic color of a message, button or accent. */
export type Tone = "neutral" | "blood" | "good" | "bad" | "warn" | "key" | "terminal" | "info" | "spectate" | "hunter";

export interface ToneColors {
  /** Text color (CSS). */
  ink: string;
  /** Bright fill: selected toggles, bars, flashes. */
  strong: number;
  /** Dark fill: buttons and panels at rest… */
  soft: number;
  /** …and hovered. */
  hover: number;
}

export function toCss(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

export const TONES: Record<Tone, ToneColors> = {
  neutral:  { ink: "#dcc8c8", strong: 0x8c7878, soft: 0x231414, hover: 0x3c1e1e },
  blood:    { ink: "#c89696", strong: 0xb40000, soft: 0x3c0a0a, hover: 0x641414 },
  good:     { ink: "#64ff64", strong: 0x3cb43c, soft: 0x123c12, hover: 0x1e5a1e },
  bad:      { ink: "#ff5050", strong: 0xc82828, soft: 0x3c0000, hover: 0x640000 },
  warn:     { ink: "#ffc864", strong: 0xc8a028, soft: 0x3c2e0a, hover: 0x5a4614 },
  key:      { ink: "#f1c40f", strong: 0xf1c40f, soft: 0x3c3208, hover: 0x5a4a0c },
  terminal: { ink: "#00c878", strong: 0x00c864, soft: 0x050f19, hover: 0x0a2a24 },
  info:     { ink: "#9696b4", strong: 0x7878a0, soft: 0x16162a, hover: 0x24243c },
  spectate: { ink: "#c8c8ff", strong: 0x8c8cdc, soft: 0x16162a, hover: 0x24243c },
  hunter:   { ink: "#ffc8c8", strong: 0xdc3232, soft: 0x461e1e, hover: 0x6e2828 },
};

/** Neutral inks and surfaces that are not tied to a tone. */
export const INK = {
  title: "#b40000",
  text: "#dcc8c8",
  body: "#c89696",
  dim: "#826464",
  faint: "#503232",
  hint: "#6e4a4a",
  goodSoft: "#96c896",
  badSoft: "#b49696",
  prompt: "#b4b464",
  fps: "#5a4646",
  white: "#ffffff",
  /** Text on a bright (tone.strong) fill. */
  onStrong: "#140808",
} as const;

export const SURFACE = {
  black: 0x000000,
  card: 0x190f0f,
  cardVillain: 0x1a0a0a,
  cardHover: 0x281414,
  edge: 0x5a2020,
  edgeVillain: 0x882222,
  bar: 0x000000,
  disabled: 0x191919,
  track: 0x3c1e1e,
} as const;

export const FONTS = {
  ui: '"JetBrains Mono", "DejaVu Sans Mono", monospace',
  display: '"Rubik Wet Paint", "JetBrains Mono", serif',
} as const;

export type TextKind = "display" | "banner" | "h1" | "h2" | "h3" | "code" | "toast" | "body" | "hud" | "small" | "tiny" | "tag";

const TYPE: Record<TextKind, { font: string; size: number; bold?: boolean }> = {
  display: { font: FONTS.display, size: 64 },
  banner:  { font: FONTS.display, size: 40 },
  h1:      { font: FONTS.ui, size: 30, bold: true },
  h2:      { font: FONTS.ui, size: 22, bold: true },
  h3:      { font: FONTS.ui, size: 16 },
  code:    { font: FONTS.ui, size: 22, bold: true },
  toast:   { font: FONTS.ui, size: 18, bold: true },
  body:    { font: FONTS.ui, size: 14 },
  hud:     { font: FONTS.ui, size: 14 },
  small:   { font: FONTS.ui, size: 12 },
  tiny:    { font: FONTS.ui, size: 10 },
  tag:     { font: FONTS.ui, size: 9 },
};

/** Text style from the type scale. Text is rasterised at the render scale so it stays crisp. */
export function textStyle(kind: TextKind, ink: string = INK.text): Phaser.Types.GameObjects.Text.TextStyle {
  const t = TYPE[kind];
  return { fontFamily: t.font, fontSize: t.size + "px", fontStyle: t.bold ? "bold" : "normal", color: ink, resolution: RES };
}

/**
 * Draw order inside the world camera. Standing objects (characters, furniture, pickups) are
 * sorted by the y of their base, i.e. depths 0..WORLD_H, between the floor and the wall tops.
 */
export const DEPTH = {
  floor: -3000,
  /** Things lying flat on the floor: blood from catches, the exit hatch. */
  floorObjects: -2500,
  shadows: -2000,
  dust: 3500,
} as const;

/** Draw order inside the HUD scene. */
export const UI_DEPTH = {
  bar: 0,
  text: 1,
  flash: 90,
  toast: 150,
  banner: 200,
  modal: 300,
} as const;

export const LAYOUT = {
  hudBarHeight: 36,
  margin: 12,
  gap: 24,
} as const;
