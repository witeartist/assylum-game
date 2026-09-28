// Things drawn over the lit world without being lit themselves: name tags, terminal labels,
// ripples of sounds you can hear (you hear steps even in total darkness), marks from a map piece
// and what some characters sense through the dark — a brute player smells the runners' trails,
// Naumi sees the runners she marked through walls; villains see where blight lies.
// Lives in the HUD scene and tracks world positions through the camera rig.
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H, TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import { BLIGHT, RIPPLE_LIFE, ROAR } from "../data/balance";
import { VIEW_ZOOM } from "../render/display";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import type { NoiseEvent } from "../systems/noise";
import { hasLineOfSight } from "../world/grid";
import { label } from "./components";
import { TONES, UI_DEPTH } from "./theme";

const TAG_GAP = 3;
/** Ripple colours: runners, monsters, everything else (glass, alarms…). */
const RIPPLE = { runner: 0x6478a0, monster: 0xc0302a, thing: 0xb8a060 };
/**
 * Sounds of one kind from close together make one wave: from sources this near each other
 * (world px), heard within `window` s of the wave's start; and a group sends a wave at most
 * every `beat` s — steps that fall between wait for the next one.
 */
const MERGE = { near: TILE * 2.5, window: 0.15, beat: 0.45 };
type WaveKind = keyof typeof RIPPLE;
const TAU = Math.PI * 2;

/** Rings spreading from a group of sources together: their outline, not one ring each. */
interface Wave {
  kind: WaveKind;
  /** One circle per source (all the same size); the wave is the outline of them all. */
  pts: Vec2[];
  /** Who made each sound: until the wave starts, its circles follow them. */
  srcs: (Actor | null)[];
  /** How far it spreads, world px. */
  reach: number;
  /** When it starts spreading (overlay clock). */
  start: number;
  /** Heard in the open (not only through a wall). */
  clear: boolean;
  seed: number;
}
const EDGE = 26;
/**
 * A brute player smells trails this close (tiles) and this fresh (seconds) — but not the last
 * `lag` seconds of them: it knows where you went, not where you are.
 */
const SMELL = { range: 10, age: 22, lag: 3, color: 0x7ed65a };
/** Blight: patches a villain knows about, runners Naumi marked. */
const BLIGHT_INK = 0xb58cff;

export class WorldOverlay {
  private tags = new Map<Actor, Phaser.GameObjects.Text>();
  private terminals: Phaser.GameObjects.Text[];
  private g: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];
  private t = 0;
  private waves: Wave[] = [];
  private lastNoise: number;
  /** Runners Naumi marked, seen through walls: their silhouettes. */
  private ghosts: Phaser.GameObjects.Image[] = [];
  /** A brute's roar spreading: the shockwave that kills flashlights. */
  private roars: { x: number; y: number; age: number }[] = [];

  constructor(private scene: Phaser.Scene, private world: World) {
    this.g = scene.add.graphics().setDepth(UI_DEPTH.bar - 1);
    this.terminals = world.doors.doors.map(() => label(scene, 0, 0, "", "tag", TONES.terminal.ink));
    this.lastNoise = world.noise.lastId;
    world.events.on("abilityUsed", ({ kind, slot, x, y }) => { if (kind === "brute" && slot === "r") this.roars.push({ x, y, age: 0 }); });
  }

  update(): void {
    const w = this.world, rig = w.camera;
    this.t += this.scene.game.loop.delta / 1000;
    for (const a of w.actors) {
      let tag = this.tags.get(a);
      if (!tag) { tag = label(this.scene, 0, 0, a.displayName, "tag", a.nameColor); this.tags.set(a, tag); }
      tag.setVisible(a.shown).setAlpha(a.fade);
      if (!a.shown) continue;
      const p = rig.toScreen({ x: a.x, y: a.feetY - a.figureHeight - TAG_GAP });
      tag.setPosition(Math.round(p.x), Math.round(p.y));
    }
    w.doors.doors.forEach((d, i) => {
      const t = this.terminals[i];
      const visible = !d.open && w.vision.canSeePoint(d.terminal, true);
      t.setVisible(visible);
      if (!visible) return;
      const { text, tone } = w.doors.label(i);
      const p = rig.toScreen({ x: d.terminal.x, y: d.terminal.y - d.terminal.displayHeight - TAG_GAP });
      t.setText(text).setColor(TONES[tone].ink).setPosition(Math.round(p.x), Math.round(p.y));
    });

    const g = this.g;
    g.clear();
    const viewer = w.vision.viewer;
    this.hearNew(viewer);
    for (const e of w.noise.events) if (e.source === viewer) this.ownStep(e);
    this.drawWaves();
    this.drawRoars(viewer);
    this.blight(viewer);
    let icon = 0;
    const mark = (p: Vec2, key: string, alpha: number, edge = false) => { icon = this.mark(icon, p, key, alpha, edge); };
    for (const m of w.items.markers) mark(m, m.icon, Math.min(1, m.left / 3) * (0.7 + 0.3 * Math.sin(this.t * 5)), true);
    if (w.local.inPlay && w.local.kit === "brute") this.smell(w.local);
    const sense = w.local.def.ability;
    if (w.local.inPlay && sense?.objectSense) {
      const r = sense.objectSense * TILE;
      for (const k of w.objectives.keys) if (!k.taken && dist(w.local, k.sprite) < r) mark(k.sprite, "ui/icon_key", 0.55);
      for (const s of w.hiding.spots) if (dist(w.local, s) < r * 0.7) mark(s, "ui/icon_hide", 0.35);
    }
    if (w.local.inPlay && sense?.itemSense) {
      const r = sense.itemSense * TILE;
      for (const it of w.items.ground) {
        if (it.taken || dist(w.local, it) > r) continue;
        const p = rig.toScreen(it), k = 0.5 + 0.5 * Math.sin(this.t * 4 + it.x);
        g.fillStyle(0xfff2c0, 0.25 + 0.35 * k).fillCircle(p.x, p.y, 1.5 + k * 1.5);
      }
    }
    for (let i = icon; i < this.icons.length; i++) this.icons[i].setVisible(false);
  }

  /**
   * Sounds the viewer just heard join waves: one from a group of sources close together, so two
   * or three people walking side by side spread one ring between them instead of a tangle.
   */
  private hearNew(viewer: Actor): void {
    const w = this.world;
    const fresh = w.noise.since(this.lastNoise).reverse();
    this.lastNoise = w.noise.lastId;
    for (const e of fresh) {
      if (e.source === viewer || !w.noise.hears(viewer, e)) continue;
      const who = e.source?.role;
      const kind: WaveKind = who === "runner" ? "runner" : who ? "monster" : "thing";
      const near = (v: Wave) => v.kind === kind && v.pts.some(p => dist(p, e) < MERGE.near);
      const clear = hasLineOfSight(w.sight, viewer, e), reach = Math.min(e.radius, TILE * 4);
      // Still gathering (or waiting for its beat): join it.
      let wave = this.waves.find(v => near(v) && v.start > this.t - MERGE.window);
      if (!wave) {
        const last = this.waves.filter(near).reduce<Wave | null>((b, v) => !b || v.start > b.start ? v : b, null);
        const start = last && last.start > this.t - MERGE.beat ? last.start + MERGE.beat : this.t;
        wave = { kind, pts: [], srcs: [], reach: 0, start, clear: false, seed: e.id };
        this.waves.push(wave);
      }
      const i = e.source ? wave.srcs.indexOf(e.source) : -1;
      if (i < 0) { wave.pts.push({ x: e.x, y: e.y }); wave.srcs.push(e.source); }
      wave.reach = Math.max(wave.reach, reach);
      wave.clear ||= clear;
    }
  }

  /** Your own steps: a small pulse at your feet. */
  private ownStep(e: NoiseEvent): void {
    const k = e.age / (RIPPLE_LIFE * 0.45);
    if (k >= 1) return;
    const p = this.world.camera.toScreen(e);
    this.g.lineStyle(1, RIPPLE.runner, 0.22 * (1 - k)).strokeCircle(p.x, p.y, (2 + k * 6) * VIEW_ZOOM);
  }

  /**
   * Each wave: two soft broken rings spreading, the second lagging. Monsters' are heavier, slower
   * and tremble; a sound from behind a wall comes out faint and torn. A wave from several sources
   * is the outline of equal rings around each of them.
   */
  private drawWaves(): void {
    const w = this.world, g = this.g;
    for (let n = this.waves.length - 1; n >= 0; n--) {
      const v = this.waves[n], age = this.t - v.start;
      const monster = v.kind === "monster", life = RIPPLE_LIFE * (monster ? 1.35 : 1);
      if (age >= life) { this.waves.splice(n, 1); continue; }
      if (age < 0) {
        // Waiting for its beat: it will spread from where they are by then.
        v.srcs.forEach((a, i) => { if (a?.inPlay) v.pts[i] = { x: a.x, y: a.y }; });
        continue;
      }
      const pts = v.pts.map(p => w.camera.toScreen(p));
      const color = RIPPLE[v.kind];
      const pieces = v.clear ? 5 : 3, gap = TAU / pieces;
      for (const lag of [0, 0.25]) {
        const k = (age / life - lag) / (1 - lag);
        if (k <= 0 || k >= 1) continue;
        // Quick at first, then slowing as it spreads.
        const r = v.reach * VIEW_ZOOM * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
        const alpha = (monster ? 0.55 : 0.45) * (1 - k) * (lag ? 0.55 : 1) * (v.clear ? 1 : 0.6);
        pts.forEach((p, i) => {
          const free = outerArcs(pts, i, r);
          for (let j = 0; j < pieces; j++) {
            const a0 = v.seed * 2.39 + j * gap + k * 0.5;
            const span = gap * (v.clear ? 0.64 : 0.38) * (0.8 + 0.2 * Math.sin(v.seed + j * 1.7));
            const rr = r + (monster ? Math.sin(this.t * 21 + j * 2.1 + v.seed) * 1.6 * VIEW_ZOOM : 0);
            for (const [s0, s1] of clip(a0, a0 + span, free)) {
              g.lineStyle(monster ? 6 : 4.5, color, alpha * 0.22);
              g.beginPath(); g.arc(p.x, p.y, rr, s0, s1); g.strokePath();
              if (!v.clear) continue;
              const inset = (s1 - s0) * 0.08;
              g.lineStyle(monster ? 2.2 : 1.4, color, alpha);
              g.beginPath(); g.arc(p.x, p.y, rr, s0 + inset, s1 - inset); g.strokePath();
            }
          }
        });
      }
    }
  }

  /** The roar's shockwave for whoever hears it: a heavy red ring out to where flashlights die. */
  private drawRoars(viewer: Actor): void {
    const g = this.g, dt = this.scene.game.loop.delta / 1000;
    for (let i = this.roars.length - 1; i >= 0; i--) {
      const r = this.roars[i];
      r.age += dt;
      const k = r.age / 0.7;
      if (k >= 1) { this.roars.splice(i, 1); continue; }
      if (dist(viewer, r) > ROAR.noise * TILE) continue;
      const p = this.world.camera.toScreen(r), e = 1 - (1 - k) * (1 - k), reach = ROAR.jamRange * TILE * VIEW_ZOOM;
      for (const [lag, width] of [[0, 7], [0.12, 3]] as const) {
        const rr = reach * Math.max(0, e - lag) + Math.sin(this.t * 40) * 2;
        if (rr <= 0) continue;
        g.lineStyle(width, RIPPLE.monster, 0.5 * (1 - k)).strokeCircle(p.x, p.y, rr);
      }
    }
  }

  /**
   * Blight. A villain sees where patches lie (a faint violet mark); Naumi sees the runners she
   * marked wherever they are — a violet silhouette through walls and darkness, a ring at the feet.
   */
  private blight(viewer: Actor): void {
    const w = this.world, g = this.g, rig = w.camera;
    let n = 0;
    if (viewer.role === "hunter") {
      for (const t of w.abilities.traps) {
        const p = rig.toScreen(t), armed = t.age >= BLIGHT.trap.arm;
        g.lineStyle(1.2, BLIGHT_INK, armed ? 0.55 : 0.3).strokeCircle(p.x, p.y + 4, (armed ? 7 : 4) * VIEW_ZOOM);
        g.fillStyle(BLIGHT_INK, armed ? 0.5 : 0.25).fillCircle(p.x, p.y + 4, 1.6 * VIEW_ZOOM);
      }
    }
    if (viewer.kit === "blight") {
      for (const a of w.runners()) {
        if (!w.vision.sensesMark(a)) continue;
        const pulse = 0.6 + 0.4 * Math.sin(this.t * 5);
        const feet = rig.toScreen({ x: a.x, y: a.feetY });
        // Off screen: a violet pointer at the edge, the way to go.
        if (feet.x < 0 || feet.y < 0 || feet.x > CANVAS_W || feet.y > CANVAS_H) {
          const x = Phaser.Math.Clamp(feet.x, EDGE, CANVAS_W - EDGE), y = Phaser.Math.Clamp(feet.y, EDGE + 30, CANVAS_H - EDGE);
          const ang = Math.atan2(feet.y - y, feet.x - x), r = 9;
          g.fillStyle(BLIGHT_INK, 0.55 + 0.35 * pulse).fillTriangle(
            x + Math.cos(ang) * r, y + Math.sin(ang) * r,
            x + Math.cos(ang + 2.5) * r, y + Math.sin(ang + 2.5) * r,
            x + Math.cos(ang - 2.5) * r, y + Math.sin(ang - 2.5) * r);
          continue;
        }
        g.lineStyle(1.5, BLIGHT_INK, 0.7 * pulse).strokeEllipse(feet.x, feet.y, 16 * VIEW_ZOOM, 7 * VIEW_ZOOM);
        // Through walls and the dark (not when in plain sight): her silhouette, violet.
        if (w.vision.seesPlainly(a)) continue;
        let img = this.ghosts[n];
        if (!img) { img = this.scene.add.image(0, 0, a.view.texture.key).setDepth(UI_DEPTH.bar - 2); this.ghosts.push(img); }
        const v = a.view;
        img.setTexture(v.texture.key, v.frame.name).setOrigin(v.originX, 1).setFlipX(v.flipX).setVisible(true)
          .setPosition(feet.x, feet.y).setScale(v.scaleX * VIEW_ZOOM, v.scaleY * VIEW_ZOOM).setTintFill(BLIGHT_INK).setAlpha(0.35 + 0.2 * pulse);
        n++;
      }
    }
    for (let i = n; i < this.ghosts.length; i++) this.ghosts[i].setVisible(false);
  }

  /** The runners' trails around the brute: faint drops, brighter the fresher. */
  private smell(me: Actor): void {
    const g = this.g, rig = this.world.camera;
    for (const m of this.world.scent.near(me, SMELL.range * TILE, SMELL.age)) {
      if (m.age < SMELL.lag) continue;
      const k = 1 - (m.age - SMELL.lag) / (SMELL.age - SMELL.lag), p = rig.toScreen(m);
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 3 + m.x * 0.05 + m.y * 0.03);
      g.fillStyle(SMELL.color, 0.1 * k).fillCircle(p.x, p.y, (3 + 3 * k) * VIEW_ZOOM);
      g.fillStyle(SMELL.color, 0.5 * k * pulse).fillCircle(p.x, p.y, (0.8 + 0.9 * k) * VIEW_ZOOM);
    }
  }

  /** An icon over a world point; `edge`: if it's off screen, pin it to the border. */
  private mark(i: number, at: Vec2, key: string, alpha: number, edge: boolean): number {
    let p = this.world.camera.toScreen(at);
    const off = p.x < 0 || p.y < 0 || p.x > CANVAS_W || p.y > CANVAS_H;
    if (off && !edge) return i;
    if (off) p = { x: Phaser.Math.Clamp(p.x, EDGE, CANVAS_W - EDGE), y: Phaser.Math.Clamp(p.y, EDGE + 30, CANVAS_H - EDGE) };
    let img = this.icons[i];
    if (!img) { img = this.scene.add.image(0, 0, key).setDepth(UI_DEPTH.bar - 1); this.icons.push(img); }
    img.setTexture(key).setVisible(true).setAlpha(alpha).setPosition(p.x, p.y);
    img.setScale(18 / Math.max(img.width, img.height));
    return i + 1;
  }
}

/**
 * Arcs of circle `i` (all circles radius `r`) that lie outside every other one, as [from, to]
 * radians within 0..2π: drawn together they are the outline of the group.
 */
function outerArcs(pts: Vec2[], i: number, r: number): [number, number][] {
  const cover: [number, number][] = [];
  for (let j = 0; j < pts.length; j++) {
    if (j === i) continue;
    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy);
    if (d >= 2 * r) continue;
    if (d < 0.5) { if (j < i) return []; continue; } // the same spot: one circle is enough
    const half = Math.acos(d / (2 * r));
    const a = ((Math.atan2(dy, dx) - half) % TAU + TAU) % TAU, b = a + 2 * half;
    if (b > TAU) cover.push([a, TAU], [0, b - TAU]); else cover.push([a, b]);
  }
  if (cover.length === 0) return [[0, TAU]];
  cover.sort((p, q) => p[0] - q[0]);
  const free: [number, number][] = [];
  let at = 0;
  for (const [a, b] of cover) { if (a > at) free.push([at, a]); at = Math.max(at, b); }
  if (at < TAU) free.push([at, TAU]);
  return free;
}

/** The parts of the arc from `a0` to `a1` (radians, a1 > a0) that fall in `free`. */
function clip(a0: number, a1: number, free: [number, number][]): [number, number][] {
  const s = ((a0 % TAU) + TAU) % TAU, e = s + (a1 - a0);
  const parts: [number, number][] = e > TAU ? [[s, TAU], [0, e - TAU]] : [[s, e]];
  const out: [number, number][] = [];
  for (const [p0, p1] of parts) for (const [f0, f1] of free) {
    const x0 = Math.max(p0, f0), x1 = Math.min(p1, f1);
    if (x1 - x0 > 0.02) out.push([x0, x1]);
  }
  return out;
}
