// What you hear in a round. Everything that happens makes its sound where it happens, and you
// hear it the way the game says you hear it: the same noise system as the AI and the ripples on
// screen, walls muffle, distance fades. Plus the building — the drone, lamps humming and
// sputtering, far-off bangs and screams — and your own heart racing when a monster is near.
// Only listens: it never changes the game.
import { audio, type PlayOptions, type Voice } from "../core/audio";
import { TILE } from "../core/constants";
import { dist } from "../core/geom";
import type { Vec2 } from "../core/types";
import type { SoundKey } from "../data/sounds";
import type { Actor } from "../entities/Actor";
import type { World } from "../game/World";
import { hasLineOfSight } from "../world/grid";

/** Heartbeat: a monster this close starts it; seconds between beats far → near. */
const HEART = { range: TILE * 8, slow: 1.15, fast: 0.42 };
/** Lamps that hum around you at once, and how close they must be, px. */
const HUMS = { count: 3, range: TILE * 5 };
/** A lamp dipping below this share of its light sputters. */
const SPUTTER_LEVEL = 0.35;
/** Seconds between far-off sounds of the building. */
const DISTANT = { min: 18, max: 45 };
const DISTANT_KEYS: SoundKey[] = ["distantBang", "distantScream", "distantGroan", "drip"];
/** Seconds between the hunter's laughs from afar. */
const LAUGH = { min: 45, max: 90, far: TILE * 10 };

export class Soundscape {
  private lastNoise: number;
  private drone: Voice | null;
  private hums = new Map<number, Voice>();
  private sputtered = new Map<number, number>();
  private beatT = 0;
  private distantT = DISTANT.min;
  private laughT = LAUGH.min;
  private flashlightOn: boolean;
  private flashActive = false;
  private shown = -1;
  private typed = 0;
  private states = new Map<Actor, string>();
  private growled = new Map<Actor, number>();
  private t = 0;
  private off: (() => void)[] = [];

  constructor(private world: World) {
    this.lastNoise = world.noise.lastId;
    this.flashlightOn = world.local.flashlight.on;
    audio.playMusic(null);
    this.drone = audio.loop("drone");
    const ev = world.events, on = <K extends Parameters<typeof ev.on>[0]>(k: K, f: Parameters<typeof ev.on<K>>[1]) => this.off.push(ev.on(k, f));
    on("keyCollected", ({ by }) => this.at("keyPickup", this.actor(by)));
    on("doorOpened", ({ index }) => {
      const t = world.doors.doors[index]?.terminal;
      if (!t) return;
      this.at("unlock", t);
      this.at("terminalOk", t, { delay: 0.35 });
    });
    on("runnerCaught", ({ actor, by }) => {
      this.at("grab", actor);
      this.at("scream", actor, { delay: 0.15 });
      const catcher = this.actor(by);
      if (catcher?.role === "hunter") this.at("foxLaugh", catcher, { delay: 0.9 });
      if (actor === world.local) audio.play("stinger");
    });
    on("hidingChanged", ({ actor }) => {
      const spot = world.hiding.spots.reduce<{ s: typeof world.hiding.spots[number] | null; d: number }>((b, s) => {
        const d = dist(s, actor);
        return d < b.d ? { s, d } : b;
      }, { s: null, d: TILE * 1.5 }).s;
      if (spot?.kind === "bed") { this.at("bedHide", actor); return; }
      this.at("lockerOpen", actor);
      if (actor.hiding) this.at("lockerClose", actor, { delay: 0.45 });
    });
    on("spotChecked", ({ index }) => {
      const s = world.hiding.spots[index];
      if (s) this.at(s.kind === "bed" ? "bedHide" : "lockerOpen", s, { volume: 1.2 });
    });
    on("brokeFree", ({ actor }) => this.at("breakFree", actor));
    on("itemPicked", ({ index, by }) => {
      const it = world.items.ground[index], a = this.actor(by);
      this.at(it && (it.kind === "note" || it.kind === "map") ? "note" : "pickup", a ?? it);
    });
    on("itemThrown", ({ kind, x, y }) => {
      if (kind === "whistle") this.at("whistle", { x, y });
      else if (kind === "glowstick") this.at("glowstick", { x, y });
    });
    on("itemUsed", ({ kind, by }) => this.at(kind === "battery" ? "battery" : "injection", this.actor(by)));
    on("fusePicked", ({ by }) => this.at("pickup", this.actor(by)));
    on("fuseInserted", () => { const b = world.power.box; if (b) this.at("fuseInsert", b); });
    on("powerRestored", () => audio.play("powerOn", { delay: 0.4 }));
    on("exitOpened", () => this.at("exitOpen", world.objectives.exit.point));
    on("gateChanged", ({ index, open, by }) => {
      const g = world.gates.gates[index], a = this.actor(by);
      if (!g) return;
      if (open) this.at(a?.role === "boss" ? "doorSmash" : "doorOpen", g);
      else this.at("doorSlam", g, { volume: a?.gait === "run" ? 1.15 : 0.7 });
    });
    on("bossSpawned", () => { audio.play("roar"); audio.play("stinger", { delay: 0.2 }); });
  }

  /** Leaving the round: silence the building. */
  dispose(): void {
    for (const f of this.off) f();
    this.drone?.stop(0.8);
    for (const v of this.hums.values()) v.stop(0.3);
    this.hums.clear();
  }

  update(dt: number): void {
    const w = this.world, ear = w.vision.viewer;
    this.t += dt;
    audio.setListener(ear);
    this.noises(ear);
    this.own(dt);
    this.heart(dt);
    this.monsters(dt);
    this.lamps();
    this.building(dt, ear);
  }

  /** A sound at a place in the world (flat when it is the listener's own). */
  private at(key: SoundKey, p: Vec2 | null | undefined, o: PlayOptions = {}): void {
    const w = this.world, ear = w.vision.viewer;
    if (!p || p === ear) { audio.play(key, o); return; }
    const clear = dist(ear, p) < TILE * 0.8 || hasLineOfSight(w.sight, ear, p);
    audio.play(key, { at: { x: p.x, y: p.y }, muffle: clear ? 0 : 1, ...o });
  }

  private actor(id: string | null | undefined): Actor | null { return id ? this.world.byId(id) ?? null : null; }

  /** Steps, breathing, glass and alarms: the noises the listener hears. */
  private noises(ear: Actor): void {
    const w = this.world;
    for (const e of w.noise.since(this.lastNoise)) {
      const key: SoundKey | null = e.kind === "step" ? "stepWalk" : e.kind === "run" ? "stepRun"
        : e.kind === "monster" ? (e.source?.role === "boss" ? "stepMonster" : "stepClaws")
        : e.kind === "breath" ? "pant" : e.kind === "gasp" ? "gasp" : e.kind === "glass" ? "bottleBreak" : e.kind === "alarm" ? "terminalError" : null;
      if (!key) continue;
      if (e.source === ear) { audio.play(key, { volume: 0.55 }); continue; }
      if (!w.noise.hears(ear, e)) continue;
      const clear = hasLineOfSight(w.sight, ear, e);
      audio.play(key, { at: e, range: e.radius / TILE * 1.2, muffle: clear ? 0 : 1 });
    }
    this.lastNoise = w.noise.lastId;
  }

  /** Your own hands: the flashlight, the terminal. */
  private own(_dt: number): void {
    const w = this.world, me = w.local;
    if (me.flashlight.on !== this.flashlightOn) { this.flashlightOn = me.flashlight.on; audio.play("flashlight"); }
    const mg = w.doors.minigame;
    if (!mg.active) { this.shown = -1; this.typed = 0; return; }
    if (mg.shown >= 0 && mg.shown !== this.shown) audio.play("terminalBeep", { rate: 1.25 });
    this.shown = mg.shown;
    if (mg.input.length > this.typed) audio.play("terminalBeep", { rate: 1 });
    this.typed = mg.input.length;
  }

  /** Your heart when a monster is near: faster and louder the closer it is. */
  private heart(dt: number): void {
    const w = this.world, me = w.local;
    if (me.role !== "runner" || !me.inPlay) return;
    let near = Infinity;
    for (const t of w.threats()) near = Math.min(near, dist(me, t.authPos));
    const danger = Math.max(0, 1 - near / HEART.range);
    if (danger <= 0.05) { this.beatT = 0; return; }
    this.beatT -= dt;
    if (this.beatT > 0) return;
    audio.play("heartbeat", { volume: 0.35 + 0.65 * danger });
    this.beatT = HEART.slow + (HEART.fast - HEART.slow) * danger;
  }

  /** The hunter growls when it starts a chase and laughs from afar now and then. */
  private monsters(dt: number): void {
    const w = this.world, ear = w.vision.viewer;
    for (const a of w.threats()) {
      const state = a.brain && "state" in a.brain ? String((a.brain as { state: unknown }).state) : "";
      const was = this.states.get(a);
      this.states.set(a, state);
      if (state === "chase" && was !== "chase" && this.t - (this.growled.get(a) ?? -99) > 6) {
        this.growled.set(a, this.t);
        this.at(a.role === "boss" ? "roar" : "foxGrowl", a);
      }
    }
    const flash = w.foxFlash;
    if (flash.active && !this.flashActive) this.at("foxFlash", { x: flash.x, y: flash.y });
    this.flashActive = flash.active;
    this.laughT -= dt;
    if (this.laughT > 0) return;
    this.laughT = LAUGH.min + Math.random() * (LAUGH.max - LAUGH.min);
    const fox = w.threats().find(a => a.role === "hunter");
    if (fox && dist(fox.authPos, ear) > LAUGH.far) audio.play("foxLaugh", { at: fox.authPos, range: 45, muffle: 0.8 });
  }

  /** The nearest lamps hum; one that dips sputters. */
  private lamps(): void {
    const w = this.world, ear = w.vision.viewer;
    const levels = w.lighting.lampLevels;
    const near = levels.map((l, i) => ({ l, i, d: dist(l, ear) }))
      .filter(o => o.d < HUMS.range).sort((a, b) => a.d - b.d).slice(0, HUMS.count);
    const keep = new Set(near.map(o => o.i));
    for (const [i, v] of this.hums) if (!keep.has(i)) { v.stop(0.4); this.hums.delete(i); }
    for (const { l, i } of near) {
      const muffle = hasLineOfSight(w.sight, ear, l) ? 0 : 1;
      const volume = l.level < SPUTTER_LEVEL ? 0.25 : Math.min(1, l.level);
      const v = this.hums.get(i);
      if (v) v.set({ muffle, volume });
      else { const nv = audio.loop("lampHum", { at: l, muffle, volume }); if (nv) this.hums.set(i, nv); }
    }
    levels.forEach((l, i) => {
      if (l.level >= SPUTTER_LEVEL || this.t - (this.sputtered.get(i) ?? -99) < 3 || dist(l, ear) > TILE * 9) return;
      this.sputtered.set(i, this.t);
      this.at("lampDie", l, { volume: 0.8 });
    });
  }

  /** Far-off sounds of the building, from any side. */
  private building(dt: number, ear: Actor): void {
    this.distantT -= dt;
    if (this.distantT > 0) return;
    this.distantT = DISTANT.min + Math.random() * (DISTANT.max - DISTANT.min);
    const key = DISTANT_KEYS[Math.floor(Math.random() * DISTANT_KEYS.length)];
    const a = Math.random() * Math.PI * 2;
    audio.play(key, { at: { x: ear.x + Math.cos(a) * TILE * 10, y: ear.y + Math.sin(a) * TILE * 10 }, range: 30, muffle: 0.6 });
  }
}
