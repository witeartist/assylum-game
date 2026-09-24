// UI building blocks. Scenes assemble their screens only from these, so every button,
// panel and message in the game looks and behaves the same.
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import type { EventBus } from "../core/events";
import { RES } from "../render/display";
import { INK, SURFACE, TONES, UI_DEPTH, textStyle, toCss, type TextKind, type Tone } from "./theme";

type Scene = Phaser.Scene;

/** Every screen-space scene calls this first: its camera shows the logical 960×600 layout at RES. */
export function uiCamera(scene: Scene): void {
  scene.cameras.main.setZoom(RES).centerOn(CANVAS_W / 2, CANVAS_H / 2);
}

export interface LabelOptions {
  origin?: number | [number, number];
  wrap?: number;
  align?: "left" | "center" | "right";
}

/** Text in one of the theme's type styles. Origin defaults to the centre. */
export function label(scene: Scene, x: number, y: number, text: string, kind: TextKind = "body", ink: string = INK.text, o: LabelOptions = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, {
    ...textStyle(kind, ink),
    align: o.align ?? "center",
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
  });
  const [ox, oy] = typeof o.origin === "number" ? [o.origin, o.origin] : o.origin ?? [0.5, 0.5];
  return t.setOrigin(ox, oy);
}

export interface ButtonOptions {
  x: number; y: number; w: number; h: number;
  text: string;
  onClick: () => void;
  tone?: Tone;
  kind?: TextKind;
  enabled?: boolean;
}

export class Button {
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly text: Phaser.GameObjects.Text;
  private tone: Tone;
  private enabled: boolean;
  private hovered = false;

  constructor(scene: Scene, o: ButtonOptions) {
    this.tone = o.tone ?? "blood";
    this.enabled = o.enabled ?? true;
    this.bg = scene.add.rectangle(o.x, o.y, o.w, o.h, 0).setInteractive({ useHandCursor: true });
    this.text = label(scene, o.x, o.y, o.text, o.kind ?? "body");
    this.bg.on("pointerover", () => { this.hovered = true; this.paint(); });
    this.bg.on("pointerout", () => { this.hovered = false; this.paint(); });
    this.bg.on("pointerdown", () => { if (this.enabled) o.onClick(); });
    this.paint();
  }

  setEnabled(on: boolean): this { this.enabled = on; this.paint(); return this; }
  setTone(tone: Tone): this { this.tone = tone; this.paint(); return this; }
  setText(text: string): this { this.text.setText(text); return this; }
  setVisible(on: boolean): this { this.bg.setVisible(on); this.text.setVisible(on); return this; }
  setAlpha(a: number): this { this.bg.setAlpha(a); this.text.setAlpha(a); return this; }
  get objects(): Phaser.GameObjects.GameObject[] { return [this.bg, this.text]; }

  private paint(): void {
    const t = TONES[this.tone];
    this.bg.setFillStyle(!this.enabled ? SURFACE.disabled : this.hovered ? t.hover : t.soft);
    this.text.setColor(!this.enabled ? INK.faint : this.hovered ? INK.white : t.ink);
  }
}

export function button(scene: Scene, o: ButtonOptions): Button { return new Button(scene, o); }

export function panel(scene: Scene, x: number, y: number, w: number, h: number, o: { fill?: number; alpha?: number; edge?: number } = {}): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(x, y, w, h, o.fill ?? SURFACE.card, o.alpha ?? 1);
  if (o.edge !== undefined) r.setStrokeStyle(1, o.edge);
  return r;
}

/** Full-screen darkening layer. */
export function scrim(scene: Scene, alpha: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, SURFACE.black, alpha);
}

/** A character portrait scaled to `height` px. */
export function portrait(scene: Scene, x: number, y: number, texture: string, height: number): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, texture);
  return img.setScale(height / img.height);
}

/** Cover the screen with an image, keeping its aspect ratio. */
export function backdrop(scene: Scene, texture: string): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(texture)) return null;
  const img = scene.add.image(CANVAS_W / 2, CANVAS_H / 2, texture);
  return img.setScale(Math.max(CANVAS_W / img.width, CANVAS_H / img.height));
}

export interface ToggleOption<T extends string> { id: T; label: string; tone: Tone; }

/** Row of mutually exclusive toggles centred on x (e.g. the difficulty picker). */
export class ToggleRow<T extends string> {
  private bgs: Phaser.GameObjects.Rectangle[] = [];
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Scene, x: number, y: number, private options: ToggleOption<T>[], private value: T, onChange: (v: T) => void,
    o: { w?: number; h?: number; gap?: number; kind?: TextKind } = {}) {
    const w = o.w ?? 110, h = o.h ?? 30, gap = o.gap ?? 20;
    const x0 = x - ((options.length - 1) * (w + gap)) / 2;
    options.forEach((opt, i) => {
      const bx = x0 + i * (w + gap);
      const bg = scene.add.rectangle(bx, y, w, h, 0).setInteractive({ useHandCursor: true });
      this.texts.push(label(scene, bx, y, opt.label, o.kind ?? "small", INK.text));
      bg.on("pointerdown", () => { this.value = opt.id; this.paint(); onChange(opt.id); });
      this.bgs.push(bg);
    });
    this.paint();
  }

  private paint(): void {
    this.options.forEach((opt, i) => {
      const on = opt.id === this.value;
      this.bgs[i].setFillStyle(on ? TONES[opt.tone].strong : TONES.neutral.soft);
      this.texts[i].setColor(on ? INK.onStrong : INK.text).setFontStyle(on ? "bold" : "normal");
    });
  }
}

/** Horizontal slider, value 0..1. */
export function slider(scene: Scene, x: number, y: number, w: number, value: number, onChange: (v: number) => void): void {
  const left = x - w / 2;
  scene.add.rectangle(x, y, w, 4, SURFACE.track);
  const fill = scene.add.rectangle(left, y, w * value, 4, TONES.blood.strong).setOrigin(0, 0.5);
  const knob = scene.add.circle(left + w * value, y, 7, TONES.bad.strong).setInteractive({ useHandCursor: true, draggable: true });
  scene.input.setDraggable(knob);
  knob.on("drag", (_p: Phaser.Input.Pointer, dragX: number) => {
    const kx = Phaser.Math.Clamp(dragX, left, left + w);
    const v = (kx - left) / w;
    knob.setPosition(kx, y);
    fill.width = w * v;
    onChange(v);
  });
}

/** Anything hstack can lay out. */
export interface Stackable { readonly visible: boolean; readonly width: number; setX(x: number): unknown; }

/** Lay out items left to right from x with a fixed gap (widths are measured, so no overlaps). */
export function hstack(items: Stackable[], x: number, gap: number): void {
  let cx = x;
  for (const t of items) {
    if (!t.visible || t.width === 0) continue;
    t.setX(cx);
    cx += t.width + gap;
  }
}

/** An icon from ui/ followed by a text, e.g. the key counter. Origin: left, vertically centred. */
export class IconText implements Stackable {
  readonly icon: Phaser.GameObjects.Image;
  readonly text: Phaser.GameObjects.Text;
  private readonly gap = 6;

  constructor(scene: Scene, x: number, y: number, icon: string | null, text: string, kind: TextKind, ink: string, private size = 18) {
    this.icon = scene.add.image(x, y, icon ?? "__DEFAULT").setOrigin(0, 0.5).setVisible(!!icon);
    this.text = label(scene, x, y, text, kind, ink, { origin: [0, 0.5] });
    this.setIcon(icon);
  }

  get visible(): boolean { return this.text.visible; }
  get width(): number { return this.text.text === "" ? 0 : this.iconWidth + this.text.width; }
  private get iconWidth(): number { return this.icon.visible ? this.icon.displayWidth + this.gap : 0; }

  setIcon(key: string | null): this {
    if (key) {
      this.icon.setTexture(key).setVisible(true);
      this.icon.setScale(this.size / Math.max(this.icon.width, this.icon.height));
    } else {
      this.icon.setVisible(false);
    }
    return this.setX(this.icon.x);
  }

  setText(t: string): this { this.text.setText(t); this.icon.setVisible(this.icon.visible && t !== ""); return this; }
  setColor(ink: string): this { this.text.setColor(ink); this.icon.setTint(Phaser.Display.Color.HexStringToColor(ink).color); return this; }
  setX(x: number): this { this.icon.setX(x); this.text.setX(x + this.iconWidth); return this; }
  setVisible(on: boolean): this { this.text.setVisible(on); this.icon.setVisible(on); return this; }
}

/** A small meter: an icon and a bar (stamina, battery, breath…). Origin: left, vertically centred. */
export class Meter {
  private readonly icon: Phaser.GameObjects.Image | null;
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly barX: number;

  constructor(scene: Scene, x: number, y: number, icon: string | null, private readonly w: number, private tone: Tone, size = 16) {
    this.icon = icon ? scene.add.image(x, y, icon).setOrigin(0, 0.5) : null;
    this.icon?.setScale(size / Math.max(this.icon.width, this.icon.height));
    this.barX = x + (this.icon ? size + 6 : 0);
    this.track = scene.add.rectangle(this.barX, y, w, 6, SURFACE.track, 0.9).setOrigin(0, 0.5);
    this.fill = scene.add.rectangle(this.barX, y, w, 6, TONES[tone].strong).setOrigin(0, 0.5);
  }

  /** Value 0..1, optionally in another tone (e.g. red when low). */
  set(value: number, tone: Tone = this.tone): this {
    this.fill.width = Math.max(0, Math.min(1, value)) * this.w;
    this.fill.setFillStyle(TONES[tone].strong);
    this.icon?.setTint(Phaser.Display.Color.HexStringToColor(TONES[tone].ink).color);
    return this;
  }

  setVisible(on: boolean): this {
    this.icon?.setVisible(on);
    this.track.setVisible(on);
    this.fill.setVisible(on);
    return this;
  }
}

/** One inventory slot: a frame, the item's picture and the key that uses it. */
export class Slot {
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly item: Phaser.GameObjects.Image;
  private readonly key: Phaser.GameObjects.Text;

  constructor(scene: Scene, x: number, y: number, private readonly size: number, keyLabel: string) {
    this.frame = scene.add.rectangle(x, y, size, size, SURFACE.card, 0.8).setStrokeStyle(1, SURFACE.edge);
    this.item = scene.add.image(x, y, "__DEFAULT").setVisible(false);
    this.key = label(scene, x - size / 2 + 3, y - size / 2 + 1, keyLabel, "tag", INK.dim, { origin: [0, 0] });
  }

  set(icon: string | null): this {
    if (!icon) { this.item.setVisible(false); return this; }
    this.item.setTexture(icon).setVisible(true);
    this.item.setScale((this.size - 8) / Math.max(this.item.width, this.item.height));
    return this;
  }

  setVisible(on: boolean): this {
    this.frame.setVisible(on);
    this.key.setVisible(on);
    if (!on) this.item.setVisible(false);
    return this;
  }
}

/** A sheet of paper read on the spot (notes found in the hospital). */
export class NotePanel {
  private readonly objects: Phaser.GameObjects.GameObject[];
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;

  constructor(scene: Scene) {
    const cx = CANVAS_W / 2, cy = CANVAS_H / 2 - 20, w = 420, h = 190;
    this.title = label(scene, cx, cy - h / 2 + 24, "", "h3", TONES.warn.ink);
    this.body = label(scene, cx, cy + 6, "", "body", INK.text, { wrap: w - 48 });
    this.objects = [
      panel(scene, cx, cy, w + 6, h + 6, { fill: TONES.warn.soft, alpha: 0.5 }),
      panel(scene, cx, cy, w, h, { fill: SURFACE.card, alpha: 0.96 }),
      this.title, this.body,
      label(scene, cx, cy + h / 2 - 16, "ESC — закрыть", "tiny", INK.faint),
    ];
    for (const o of this.objects) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(UI_DEPTH.modal);
    this.show(null);
  }

  show(note: { title: string; text: string } | null): void {
    for (const o of this.objects) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!!note);
    if (note) { this.title.setText(note.title); this.body.setText(note.text); }
  }
}

/** Short messages in the middle of the screen; several stack instead of overlapping. */
export class ToastStack {
  private items: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Scene, private x: number, private y: number, private max = 4) {}

  push(text: string, tone: Tone): void {
    const t = label(this.scene, this.x, this.y, text, "toast", TONES[tone].ink).setDepth(UI_DEPTH.toast);
    this.items.unshift(t);
    while (this.items.length > this.max) this.items.pop()!.destroy();
    this.items.forEach((it, i) => it.setY(this.y - i * 26));
    this.scene.tweens.add({
      targets: t, alpha: 0, delay: 900, duration: 700,
      onComplete: () => { this.items = this.items.filter(i => i !== t); t.destroy(); },
    });
  }
}

/** Big announcement that fades in, holds and fades out. */
export function banner(scene: Scene, text: string, tone: Tone): void {
  const t = label(scene, CANVAS_W / 2, CANVAS_H / 2, text, "banner", toCss(TONES[tone].strong))
    .setDepth(UI_DEPTH.banner).setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, duration: 500, hold: 2000, yoyo: true, onComplete: () => t.destroy() });
}

/** Full-screen colour flash that fades out. */
export function screenFlash(scene: Scene, color: number, alpha: number, ms: number): void {
  const r = scene.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, color, alpha).setDepth(UI_DEPTH.flash);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}

/** Fade (and optionally slide) objects in — used for menu intros. */
export function reveal(scene: Scene, targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[], delay: number, o: { dx?: number; dy?: number; duration?: number; ease?: string } = {}): void {
  const list = Array.isArray(targets) ? targets : [targets];
  for (const obj of list) {
    const go = obj as unknown as Phaser.GameObjects.Components.Alpha & Phaser.GameObjects.Components.Transform;
    const tween: Phaser.Types.Tweens.TweenBuilderConfig = { targets: go, alpha: go.alpha, delay, duration: o.duration ?? 400, ease: o.ease ?? "Power2" };
    if (o.dx) { tween.x = go.x; go.x -= o.dx; }
    if (o.dy) { tween.y = go.y; go.y -= o.dy; }
    go.setAlpha(0);
    scene.tweens.add(tween);
  }
}

/** "← НАЗАД (ESC)" in the corner plus the ESC key. */
export function backLink(scene: Scene, onBack: () => void): void {
  label(scene, 20, CANVAS_H - 20, "← НАЗАД (ESC)", "tiny", INK.faint, { origin: [0, 1] })
    .setInteractive({ useHandCursor: true }).on("pointerdown", onBack);
  scene.input.keyboard!.on("keydown-ESC", onBack);
}

/** Subscribe to a bus for as long as the scene runs. */
export function listen<M extends object, K extends keyof M>(scene: Scene, bus: EventBus<M>, event: K, fn: (payload: M[K]) => void): void {
  const off = bus.on(event, fn);
  scene.events.once("shutdown", off);
}
