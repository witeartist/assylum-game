// Prepares sounds for the game: raw files in art/sound/ (any names, any number of repeats in a
// file) are cut into short levelled variants as src/data/sounds.ts describes, encoded to MP3
// (mono; stereo for music) into public/assets/sound/ and listed in public/assets/sounds.json.
// Pure npm: no ffmpeg needed. Deterministic, so unchanged sounds come out byte for byte the same.
//
//   npm run sounds            (also part of npm run assets)
import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { MPEGDecoder } from "mpg123-decoder";
import { Mp3Encoder } from "@breezystack/lamejs";

// The catalogue is TypeScript: Node 22.18+ reads it as is.
let SOUNDS;
try { ({ SOUNDS } = await import("../src/data/sounds.ts")); }
catch (e) { console.error("sounds: needs Node 22.18 or newer to read src/data/sounds.ts\n", e.message); process.exit(1); }

const SRC = "art/sound";
const OUT = "public/assets/sound";
const INDEX = "public/assets/sounds.json";
/** Analysis window, s. */
const WIN = 0.01;
const db = (x) => Math.pow(10, x / 20);
/** Levelling: loudest 100 ms at this level, peaks no higher than PEAK (dBFS). */
const LOUD = { sfx: -16, ambience: -18, music: -16 };
const PEAK = -1;
const KBPS = { mono: 64, stereo: 128 };
/** Circular padding around loops, s: the loop stays seamless even if a decoder shifts it a little. */
const LOOP_PAD = 0.25;

async function decode(path) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const r = decoder.decode(new Uint8Array(await readFile(path)));
  decoder.free();
  const ch = r.channelData.map(c => c.slice(0, r.samplesDecoded));
  return { rate: r.sampleRate, ch: ch.length === 1 ? [ch[0], ch[0]] : ch };
}

/** RMS per WIN window of the mix. */
function envelope(ch, rate) {
  const n = Math.round(rate * WIN), len = ch[0].length, out = new Float32Array(Math.ceil(len / n));
  for (let w = 0; w < out.length; w++) {
    let s = 0;
    for (let i = w * n; i < Math.min(len, (w + 1) * n); i++) { const v = (ch[0][i] + ch[1][i]) / 2; s += v * v; }
    out[w] = Math.sqrt(s / n);
  }
  out.samples = len;
  return out;
}

/**
 * [from, to) sample ranges of the separate sounds in a file. Whole files and loops: the file
 * without its silent ends. Split: a piece starts where the level jumps up (a step, a click, a
 * beat — even in a reverberant room where it never falls silent) at least `gap` s after the last
 * one, and runs until the next one, its own silence or `len` s.
 */
function pieces(env, rate, cut) {
  const n = Math.round(rate * WIN), max = Math.max(...env), len = env.length;
  if (max === 0) return [];
  const on = max * db(-26), off = max * db(-42);
  if (cut.mode !== "split") {
    let a = env.findIndex(v => v > off), b = len - 1;
    while (b > a && env[b] <= off) b--;
    return a < 0 ? [] : [[Math.max(0, a - 1) * n, Math.min(len, b + 3) * n]].map(([x, y]) => [x, Math.min(y, env.samples)]);
  }
  const spacing = Math.round((cut.gap ?? 0.15) / WIN), longest = cut.len ? Math.round(cut.len / WIN) : len;
  const onsets = [];
  for (let w = 0; w < len; w++) {
    if (env[w] <= on) continue;
    let lo = w === 0 ? 0 : Infinity;
    for (let k = Math.max(0, w - 8); k < w; k++) lo = Math.min(lo, env[k]);
    if (env[w] < lo * 2.5) continue;
    if (onsets.length && w - onsets[onsets.length - 1] < spacing) continue;
    onsets.push(w);
  }
  const out = [];
  onsets.forEach((w, i) => {
    let b = Math.min(i + 1 < onsets.length ? onsets[i + 1] - 1 : len, w + longest, len);
    while (b > w + 3 && env[b - 1] <= off) b--;
    if (b - w >= 6) out.push([Math.max(0, w - 1) * n, Math.min(len * n, (b + 2) * n, env.samples)]);
  });
  return out;
}

/** Copy a piece, capped at `maxLen` s, with fades so it never clicks. */
function take(ch, rate, [a, b], maxLen) {
  const cap = maxLen ? Math.min(b, a + Math.round(maxLen * rate)) : b;
  const capped = cap < b;
  const out = ch.map(c => c.slice(a, cap));
  const fin = Math.round(0.004 * rate), fout = Math.round((capped ? 0.25 : 0.02) * rate), n = out[0].length;
  for (const c of out) {
    for (let i = 0; i < Math.min(fin, n); i++) c[i] *= i / fin;
    for (let i = 0; i < Math.min(fout, n); i++) c[n - 1 - i] *= i / fout;
  }
  return out;
}

/**
 * Sharp impacts (footsteps) in a file: [{ at, crest }] — `at` is the loudest 5 ms of each, `crest`
 * how far it rises over what came just before (a step, not the scuff or the room).
 */
function hits(ch, rate, cut) {
  const n = Math.round(rate * 0.005), len = Math.floor(ch[0].length / n), env = new Float32Array(len);
  for (let w = 0; w < len; w++) {
    let s = 0;
    for (let i = w * n; i < (w + 1) * n; i++) { const v = (ch[0][i] + ch[1][i]) / 2; s += v * v; }
    env[w] = Math.sqrt(s / n);
  }
  const max = Math.max(...env), gap = Math.round((cut.gap ?? 0.2) / 0.005), out = [];
  for (let w = 0; w < len; w++) {
    if (env[w] < max * db(-22)) continue;
    let top = true;
    for (let k = Math.max(0, w - gap); k <= Math.min(len - 1, w + gap) && top; k++) if (env[k] > env[w] || (env[k] === env[w] && k < w)) top = false;
    if (!top) continue;
    // What came before: the median of 30–150 ms earlier.
    const before = Array.from(env.subarray(Math.max(0, w - 30), Math.max(0, w - 6))).sort((a, b) => a - b);
    const floor = before.length ? before[before.length >> 1] : 0;
    const crest = env[w] / Math.max(floor, max * db(-60));
    if (crest < db(8)) continue;
    // Start where it rises (at most 15 ms before the peak), not at the scuff.
    let a = w;
    while (a > w - 3 && a > 0 && env[a - 1] > env[w] * db(-12)) a--;
    out.push({ at: Math.max(0, (a - 1) * n), peak: w * n, crest });
  }
  return out;
}

/** An impact cut tight: held to just past its peak, then dying away; rumble out, treble lifted. */
function shapeHit(ch, rate, h, cut) {
  const size = Math.min(Math.round(cut.len * rate), ch[0].length - h.at);
  const hold = h.peak - h.at + Math.round(0.01 * rate), fin = Math.round(0.002 * rate), fout = Math.round(0.006 * rate);
  const hpK = Math.exp(-2 * Math.PI * (cut.hp ?? 60) / rate), lpK = Math.exp(-2 * Math.PI * 2200 / rate);
  return ch.map(c => {
    const o = new Float32Array(size);
    let hpX = 0, hpY = 0, lp = 0;
    for (let i = 0; i < size; i++) {
      const x = c[h.at + i];
      hpY = hpK * (hpY + x - hpX); hpX = x;                 // one-pole high-pass
      lp += (1 - lpK) * (hpY - lp);                          // one-pole low-pass for the treble lift
      let y = hpY + (cut.bright ?? 0) * (hpY - lp);
      y *= i < hold ? 1 : Math.exp(-(i - hold) / (cut.decay * rate));
      if (i < fin) y *= i / fin;
      if (i >= size - fout) y *= (size - 1 - i) / fout;
      o[i] = y;
    }
    return o;
  });
}

/** One seamless loop from [from, to) s: the tail crossfades into the head, padded circularly. */
function makeLoop(ch, rate, cut, range) {
  const a = cut.from !== undefined ? Math.round(cut.from * rate) : range[0];
  const b = Math.min(ch[0].length, cut.to !== undefined ? Math.round(cut.to * rate) : range[1]);
  const f = Math.round((cut.fade ?? 0.5) * rate), len = b - a - f, pad = Math.round(LOOP_PAD * rate);
  const out = ch.map(c => {
    const body = new Float32Array(len);
    for (let t = 0; t < len; t++) {
      if (t < f) { const k = t / f; body[t] = c[a + t] * k + c[a + len + t] * (1 - k); }
      else body[t] = c[a + t];
    }
    const padded = new Float32Array(len + pad * 2);
    for (let t = 0; t < padded.length; t++) padded[t] = body[((t - pad) % len + len) % len];
    return padded;
  });
  return { ch: out, loop: [pad / rate, (pad + len) / rate] };
}

/** Level a variant: its loudest 100 ms at the bus level, peaks under PEAK. */
function level(ch, rate, bus) {
  const n = Math.round(rate * 0.1);
  let peak = 0, loud = 0;
  for (const c of ch) for (const v of c) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i + n <= ch[0].length || i === 0; i += Math.round(n / 2)) {
    let s = 0;
    const end = Math.min(ch[0].length, i + n);
    for (let j = i; j < end; j++) { const v = (ch[0][j] + ch[1][j]) / 2; s += v * v; }
    loud = Math.max(loud, Math.sqrt(s / Math.max(1, end - i)));
    if (end === ch[0].length) break;
  }
  if (peak === 0) return;
  const g = Math.min(db(LOUD[bus]) / Math.max(loud, 1e-6), db(PEAK) / peak);
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= g;
}

function encode(ch, rate, stereo) {
  const toI16 = c => { const o = new Int16Array(c.length); for (let i = 0; i < c.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))); return o; };
  const out = [];
  if (stereo) {
    const [l, r] = ch.map(toI16), enc = new Mp3Encoder(2, rate, KBPS.stereo);
    for (let i = 0; i < l.length; i += 1152) out.push(enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152)));
    out.push(enc.flush());
  } else {
    const mono = new Float32Array(ch[0].length);
    for (let i = 0; i < mono.length; i++) mono[i] = (ch[0][i] + ch[1][i]) / 2;
    const m = toI16(mono), enc = new Mp3Encoder(1, rate, KBPS.mono);
    for (let i = 0; i < m.length; i += 1152) out.push(enc.encodeBuffer(m.subarray(i, i + 1152)));
    out.push(enc.flush());
  }
  return Buffer.concat(out.filter(b => b.length).map(b => Buffer.from(b.buffer, b.byteOffset, b.length)));
}

const files = (await readdir(SRC)).filter(f => /\.(mp3)$/i.test(f)).sort();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const index = {};
let bytes = 0, made = 0;
for (const [key, def] of Object.entries(SOUNDS)) {
  const mine = files.filter(f => f.toLowerCase().includes(def.match.toLowerCase()));
  if (mine.length === 0) { console.warn(`sounds: no file for ${key} ("${def.match}")`); continue; }
  // Pieces from every file, taken in turns so each file gives some.
  const perFile = [];
  for (const f of mine) {
    const { rate, ch } = await decode(join(SRC, f));
    if (def.cut.mode === "hit") {
      // The sharpest impacts first, then back in the order they come.
      const best = hits(ch, rate, def.cut).sort((a, b) => b.crest - a.crest).slice(0, def.cut.max ?? 8).sort((a, b) => a.at - b.at);
      perFile.push(best.map(h => ({ rate, ch, h })));
      continue;
    }
    const found = pieces(envelope(ch, rate), rate, def.cut);
    perFile.push(found.map(p => ({ rate, ch, p })));
  }
  const max = def.cut.mode === "split" || def.cut.mode === "hit" ? def.cut.max ?? 8 : def.cut.mode === "loop" ? 1 : perFile.length;
  const picked = [];
  for (let i = 0; picked.length < max && perFile.some(l => l.length > i); i++) for (const l of perFile) if (l[i] && picked.length < max) picked.push(l[i]);
  index[key] = [];
  for (const [n, { rate, ch, p, h }] of picked.entries()) {
    let out, loop;
    if (def.cut.mode === "loop") ({ ch: out, loop } = makeLoop(ch, rate, def.cut, p));
    else if (def.cut.mode === "hit") out = shapeHit(ch, rate, h, def.cut);
    else out = take(ch, rate, p, def.cut.len);
    level(out, rate, def.bus);
    const mp3 = encode(out, rate, !!def.stereo);
    const name = `${key}_${n}.mp3`;
    await writeFile(join(OUT, name), mp3);
    bytes += mp3.length; made++;
    index[key].push(loop ? { url: `assets/sound/${name}`, loop } : { url: `assets/sound/${name}` });
  }
}
await writeFile(INDEX, JSON.stringify(index, null, 1) + "\n");
console.log(`sounds: ${Object.keys(index).length} sounds, ${made} variants, ${(bytes / 1024).toFixed(0)} KB`);
