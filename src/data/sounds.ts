// Sound catalogue: every sound the game plays — which raw files it comes from (art/sound/), how
// to cut them, how loud it is, which channel it plays on and how far it carries. `npm run assets`
// turns the raw files into short levelled variants (public/assets/sound/, listed in
// public/assets/sounds.json); the game picks a random variant each time. A new sound is a line
// here. Self-contained on purpose: the asset script reads this file too.

export type Bus = "music" | "sfx" | "ambience";

/**
 * How to get variants out of the raw files:
 * - whole: the file without its silent ends;
 * - split: every separate sound in the file (steps, clicks, beats), at most `max`; `gap` — the
 *   least time between two of them, s (a heartbeat's lub-dub stays one); `len` — the longest piece;
 * - loop: one seamless loop (from `from` to `to`, s), its ends crossfaded over `fade` s.
 */
export type Cut =
  | { mode: "whole"; len?: number }
  | { mode: "split"; gap?: number; max?: number; len?: number }
  | { mode: "loop"; from?: number; to?: number; fade?: number };

export interface SoundDef {
  /** Every raw file whose name contains this. */
  match: string;
  cut: Cut;
  bus: Bus;
  /** Loudness, 0..1 (variants are levelled first). */
  volume: number;
  /** Positional: carries this far, tiles. Without it the sound plays flat (UI, music, your own). */
  range?: number;
  /** Random pitch spread, ± fraction. */
  pitch?: number;
  /** Keep both channels (music). */
  stereo?: boolean;
}

export const SOUNDS = {
  // ── Steps ──
  stepWalk:     { match: "single footstep, hard-soled", cut: { mode: "split", gap: 0.3, max: 10, len: 0.6 }, bus: "sfx", volume: 0.45, range: 7, pitch: 0.08 },
  stepRun:      { match: "single running footstep", cut: { mode: "split", gap: 0.3, max: 12, len: 0.5 }, bus: "sfx", volume: 0.6, range: 12, pitch: 0.08 },
  stepMonster:  { match: "heavy slow monster footsteps", cut: { mode: "split", gap: 0.5, max: 12, len: 1 }, bus: "sfx", volume: 0.85, range: 14, pitch: 0.06 },
  stepClaws:    { match: "footsteps with claws", cut: { mode: "split", gap: 0.15, max: 12, len: 0.4 }, bus: "sfx", volume: 0.6, range: 10, pitch: 0.08 },
  // ── Doors, lockers, beds ──
  doorOpen:     { match: "wooden door slowly creaking", cut: { mode: "split", gap: 0.8, max: 5, len: 1.8 }, bus: "sfx", volume: 0.55, range: 12, pitch: 0.06 },
  doorSlam:     { match: "door slamming shut", cut: { mode: "whole", len: 1.4 }, bus: "sfx", volume: 0.7, range: 16, pitch: 0.05 },
  doorSmash:    { match: "violently smashed open", cut: { mode: "whole", len: 1.8 }, bus: "sfx", volume: 0.95, range: 22 },
  unlock:       { match: "key turning in an old door lock", cut: { mode: "whole" }, bus: "sfx", volume: 0.8, range: 12 },
  exitOpen:     { match: "metal doors bursting open", cut: { mode: "whole" }, bus: "sfx", volume: 1, range: 30 },
  lockerOpen:   { match: "locker door opening", cut: { mode: "split", gap: 0.4, max: 4, len: 1.6 }, bus: "sfx", volume: 0.6, range: 10, pitch: 0.05 },
  lockerClose:  { match: "locker door shutting", cut: { mode: "whole", len: 1 }, bus: "sfx", volume: 0.6, range: 10, pitch: 0.05 },
  bedHide:      { match: "bed springs creaking", cut: { mode: "split", gap: 0.8, max: 4, len: 1.6 }, bus: "sfx", volume: 0.5, range: 8, pitch: 0.05 },
  // ── Terminal and power ──
  terminalBeep: { match: "terminal beep", cut: { mode: "split", gap: 0.3, max: 3, len: 0.5 }, bus: "sfx", volume: 0.35, pitch: 0.04 },
  terminalError:{ match: "error buzzer", cut: { mode: "whole" }, bus: "sfx", volume: 0.55, range: 14 },
  terminalOk:   { match: "success chime", cut: { mode: "whole" }, bus: "sfx", volume: 0.5, range: 10 },
  fuseInsert:   { match: "fuse pushed into", cut: { mode: "whole", len: 1.2 }, bus: "sfx", volume: 0.65, range: 10 },
  powerOn:      { match: "power switching back on", cut: { mode: "whole" }, bus: "sfx", volume: 0.9 },
  // ── Things in hand ──
  flashlight:   { match: "flashlight switch click", cut: { mode: "split", gap: 0.2, max: 4, len: 0.25 }, bus: "sfx", volume: 0.4, range: 4, pitch: 0.05 },
  battery:      { match: "battery compartment", cut: { mode: "whole", len: 1.2 }, bus: "sfx", volume: 0.5 },
  keyPickup:    { match: "metal keys picked up", cut: { mode: "whole" }, bus: "sfx", volume: 0.6 },
  pickup:       { match: "picking up a small object", cut: { mode: "whole", len: 0.8 }, bus: "sfx", volume: 0.5, pitch: 0.06 },
  note:         { match: "unfolding an old paper note", cut: { mode: "whole" }, bus: "sfx", volume: 0.55 },
  injection:    { match: "syringe injection", cut: { mode: "whole", len: 1 }, bus: "sfx", volume: 0.55 },
  glowstick:    { match: "glowstick bent", cut: { mode: "whole", len: 1.2 }, bus: "sfx", volume: 0.55, range: 6 },
  bottleBreak:  { match: "bottle shattering", cut: { mode: "whole" }, bus: "sfx", volume: 0.85, range: 16, pitch: 0.06 },
  whistle:      { match: "human whistle", cut: { mode: "whole" }, bus: "sfx", volume: 0.8, range: 22 },
  // ── Breath and body ──
  pant:         { match: "panting after running", cut: { mode: "whole" }, bus: "sfx", volume: 0.5, range: 5, pitch: 0.05 },
  gasp:         { match: "gasping for air", cut: { mode: "split", gap: 0.6, max: 4, len: 1.4 }, bus: "sfx", volume: 0.6, range: 6, pitch: 0.04 },
  heartbeat:    { match: "human heartbeat", cut: { mode: "split", gap: 0.5, max: 6, len: 0.9 }, bus: "sfx", volume: 0.75 },
  scream:       { match: "terrified human scream", cut: { mode: "whole" }, bus: "sfx", volume: 0.9, range: 30 },
  grab:         { match: "monster grabbing a person", cut: { mode: "whole" }, bus: "sfx", volume: 0.8, range: 16 },
  breakFree:    { match: "breaking free from a grip", cut: { mode: "whole", len: 1.2 }, bus: "sfx", volume: 0.75, range: 14 },
  // ── Monsters ──
  foxLaugh:     { match: "fox laugh", cut: { mode: "split", gap: 1.2, max: 6, len: 3 }, bus: "sfx", volume: 0.75, range: 26, pitch: 0.05 },
  foxGrowl:     { match: "fox growl", cut: { mode: "split", gap: 1.5, max: 4, len: 3.5 }, bus: "sfx", volume: 0.8, range: 12, pitch: 0.05 },
  foxFlash:     { match: "camera flash charging", cut: { mode: "whole" }, bus: "sfx", volume: 0.7, range: 16 },
  roar:         { match: "massive monster roar", cut: { mode: "whole" }, bus: "sfx", volume: 1 },
  stinger:      { match: "jump scare stinger", cut: { mode: "whole" }, bus: "sfx", volume: 0.75 },
  // ── Building ──
  lampHum:      { match: "fluorescent lamp electrical hum", cut: { mode: "loop", from: 0.6, to: 3.4, fade: 0.5 }, bus: "ambience", volume: 0.3, range: 5 },
  lampDie:      { match: "tube sputtering and dying", cut: { mode: "whole" }, bus: "ambience", volume: 0.55, range: 9 },
  drone:        { match: "dark ambient drone", cut: { mode: "loop", from: 1, to: 7.4, fade: 1.6 }, bus: "ambience", volume: 0.55, stereo: true },
  distantBang:  { match: "distant metal bang", cut: { mode: "whole", len: 5 }, bus: "ambience", volume: 0.5 },
  distantScream:{ match: "distant muffled scream", cut: { mode: "whole", len: 5 }, bus: "ambience", volume: 0.4 },
  distantGroan: { match: "structure groaning", cut: { mode: "whole" }, bus: "ambience", volume: 0.5 },
  drip:         { match: "water dripping", cut: { mode: "whole", len: 6 }, bus: "ambience", volume: 0.35 },
  // ── Music and screens ──
  menuMusic:    { match: "main menu", cut: { mode: "loop", fade: 1.2 }, bus: "music", volume: 0.7, stereo: true },
  stingWin:     { match: "sting of relief", cut: { mode: "whole" }, bus: "music", volume: 0.8, stereo: true },
  stingLose:    { match: "sting of defeat", cut: { mode: "whole" }, bus: "music", volume: 0.8, stereo: true },
  uiClick:      { match: "UI button click", cut: { mode: "split", gap: 0.15, max: 4, len: 0.3 }, bus: "sfx", volume: 0.35, pitch: 0.04 },
} satisfies Record<string, SoundDef>;

export type SoundKey = keyof typeof SOUNDS;

/** Where `npm run assets` lists the variants: key → files (and loop points for loops). */
export const SOUND_INDEX = "assets/sounds.json";

export interface SoundVariant { url: string; /** Loop points, s (loops only). */ loop?: [number, number]; }
export type SoundIndex = Partial<Record<SoundKey, SoundVariant[]>>;
