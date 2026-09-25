// Sound: one engine on WebAudio for music, effects and ambience. The variants come from
// public/assets/sounds.json (made by `npm run assets` from art/sound/); every play picks one at
// random, never the same twice in a row. A sound can stand somewhere in the world: it pans and
// fades with distance from the listener, and heard through a wall it loses its high end and some
// loudness. Loops (lamp hum, the drone, menu music) play until stopped. Browsers keep audio
// suspended until the first click or key, so the engine wakes up then.
import { SOUNDS, SOUND_INDEX, type Bus, type SoundDef, type SoundIndex, type SoundKey } from "../data/sounds";
import { TILE } from "./constants";
import { settings, updateSettings } from "./settings";
import type { Vec2 } from "./types";

interface Loaded { buffer: AudioBuffer; loop?: [number, number]; }

export interface PlayOptions {
  /** Where it sounds in the world: it pans and fades with distance from the listener. */
  at?: Vec2;
  /** Carries this far, tiles (instead of the catalogue's range). */
  range?: number;
  /** Extra loudness factor. */
  volume?: number;
  /** 0 clear … 1 through a wall. */
  muffle?: number;
  /** Seconds from now. */
  delay?: number;
  /** Fixed pitch instead of the random spread (1 = as recorded). */
  rate?: number;
}

/** Highest and lowest cut-off of the muffling filter, Hz. */
const CLEAR_HZ = 16000, MUFFLED_HZ = 650;
/** Sounds further than this share of their range across the screen pan fully. */
const PAN_SPAN = TILE * 7;
const MAX_VOICES = 40;

/** A playing sound; positional ones can be moved and re-levelled while they play. */
export class Voice {
  ended = false;
  constructor(
    private engine: AudioEngine,
    private def: SoundDef,
    private src: AudioBufferSourceNode,
    private gain: GainNode,
    private pan: StereoPannerNode,
    private filter: BiquadFilterNode,
    private o: PlayOptions,
  ) {
    src.onended = () => { this.ended = true; engine.release(this); };
    this.apply(0);
  }

  set(o: Partial<PlayOptions>): void {
    Object.assign(this.o, o);
    this.apply(0.08);
  }

  stop(fade = 0.15): void {
    if (this.ended) return;
    const t = this.engine.now;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(0, t + fade);
    try { this.src.stop(t + fade + 0.02); } catch { /* already stopped */ }
  }

  /** Loudness, pan and filter from the listener's point of view. */
  private apply(glide: number): void {
    const { volume, pan, cutoff } = this.engine.mix(this.def, this.o);
    const t = this.engine.now;
    this.gain.gain.setTargetAtTime(volume, t, glide || 0.001);
    this.pan.pan.setTargetAtTime(pan, t, glide || 0.001);
    this.filter.frequency.setTargetAtTime(cutoff, t, glide || 0.001);
  }

  /** The listener moved: re-level. */
  refresh(): void { this.apply(0.05); }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private sounds = new Map<SoundKey, Loaded[]>();
  private last = new Map<SoundKey, number>();
  private voices = new Set<Voice>();
  private listener: Vec2 | null = null;
  private music: { key: SoundKey; voice: Voice } | null = null;
  private loading: Promise<void> | null = null;
  /** How many times each sound has started (browser checks read it). */
  readonly playCount = new Map<SoundKey, number>();

  get now(): number { return this.ctx?.currentTime ?? 0; }
  get ready(): boolean { return this.sounds.size > 0; }

  /** Boot: decode every variant (missing files are just silent). */
  load(): Promise<void> {
    if (!this.loading) this.loading = this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    const ctx = this.context();
    if (!ctx) return;
    let index: SoundIndex;
    try { index = await (await fetch(SOUND_INDEX)).json() as SoundIndex; } catch { return; }
    const jobs: Promise<void>[] = [];
    for (const [key, variants] of Object.entries(index) as [SoundKey, NonNullable<SoundIndex[SoundKey]>][]) {
      if (!(key in SOUNDS)) continue;
      const list: Loaded[] = [];
      this.sounds.set(key, list);
      for (const v of variants) {
        jobs.push(fetch(v.url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b))
          .then(buffer => { list.push({ buffer, loop: v.loop }); })
          .catch(() => { /* a broken file stays silent */ }));
      }
    }
    await Promise.all(jobs);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(comp); return g; };
    this.buses = { music: bus(), sfx: bus(), ambience: bus() };
    this.ctx = ctx;
    this.applyVolumes();
    const wake = () => { if (ctx.state !== "running") void ctx.resume(); };
    for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, wake, { capture: true });
    return ctx;
  }

  /** Channel volumes from the settings. */
  applyVolumes(): void {
    if (!this.buses || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(settings.musicVolume, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(settings.sfxVolume, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(settings.ambienceVolume, t, 0.05);
  }

  /** Where the ears are (the viewer); null in menus. Playing positional sounds follow. */
  setListener(p: Vec2 | null): void {
    this.listener = p ? { x: p.x, y: p.y } : null;
    for (const v of this.voices) v.refresh();
  }

  /** Loudness, pan and filter cut-off of a sound for the current listener. */
  mix(def: SoundDef, o: PlayOptions): { volume: number; pan: number; cutoff: number } {
    let volume = def.volume * (o.volume ?? 1), pan = 0;
    const range = (o.range ?? def.range ?? 0) * TILE;
    if (o.at && this.listener && range > 0) {
      const dx = o.at.x - this.listener.x, dy = o.at.y - this.listener.y, d = Math.hypot(dx, dy);
      const k = Math.max(0, 1 - d / range);
      volume *= k * Math.sqrt(k);
      pan = Math.max(-1, Math.min(1, dx / PAN_SPAN)) * 0.8;
    }
    const m = Math.max(0, Math.min(1, o.muffle ?? 0));
    volume *= 1 - 0.45 * m;
    return { volume, pan, cutoff: CLEAR_HZ * Math.pow(MUFFLED_HZ / CLEAR_HZ, m) };
  }

  /** Play a sound once (or looped for loops); null if it can't be heard or isn't loaded. */
  play(key: SoundKey, o: PlayOptions = {}, loop = false): Voice | null {
    const ctx = this.ctx, buses = this.buses, list = this.sounds.get(key);
    if (!ctx || !buses || !list || list.length === 0) return null;
    const def: SoundDef = SOUNDS[key];
    if (!loop && this.mix(def, o).volume < 0.01) return null;
    if (this.voices.size >= MAX_VOICES) return null;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last.get(key)) i = (i + 1) % list.length;
    this.last.set(key, i);
    const v = list[i];
    const src = ctx.createBufferSource();
    src.buffer = v.buffer;
    if (loop && v.loop) { src.loop = true; src.loopStart = v.loop[0]; src.loopEnd = v.loop[1]; }
    else if (loop) src.loop = true;
    src.playbackRate.value = o.rate ?? 1 + (def.pitch ?? 0) * (Math.random() * 2 - 1);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const pan = ctx.createStereoPanner(), gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(pan).connect(gain).connect(buses[def.bus]);
    const voice = new Voice(this, def, src, gain, pan, filter, { ...o });
    this.voices.add(voice);
    this.playCount.set(key, (this.playCount.get(key) ?? 0) + 1);
    const at = ctx.currentTime + (o.delay ?? 0);
    src.start(at, loop && v.loop ? v.loop[0] : 0);
    return voice;
  }

  /** A looping sound (lamp hum, drone); stop it with voice.stop(). */
  loop(key: SoundKey, o: PlayOptions = {}): Voice | null { return this.play(key, o, true); }

  /** Background music: one track at a time, crossfading. */
  playMusic(key: SoundKey | null): void {
    if (this.music?.key === key) return;
    this.music?.voice.stop(1.2);
    this.music = null;
    if (!key) return;
    const voice = this.loop(key);
    if (voice) this.music = { key, voice };
  }

  release(v: Voice): void { this.voices.delete(v); }
}

export const audio = new AudioEngine();

/** Settings: channel volumes (0..1), saved. */
export function setVolume(bus: Bus, v: number): void {
  updateSettings(bus === "music" ? { musicVolume: v } : bus === "sfx" ? { sfxVolume: v } : { ambienceVolume: v });
  audio.applyVolumes();
}
