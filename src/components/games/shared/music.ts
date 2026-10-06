import { audio } from "./audio";

/**
 * A small step sequencer + synth for game soundtracks — no audio files. A song is a key, a chord
 * progression and layers of step patterns. Layers can be tied to an intensity range, so a game can
 * build the music up (menu → play → boss) by calling `music.setIntensity()`; changes land on the
 * next bar so the groove never breaks.
 *
 * Pattern tokens (space separated, one per step):
 *   x / X   hit (X = accent) — drums, or the bar's chord in "chord" mode
 *   3, -2   a note: scale degree ("abs": from the key root, "rel": above the bar's chord root);
 *           add # or b for a sharp / flat (e.g. 4#)
 *   .       hold the previous note (sustain) / nothing for drums
 *   -       rest (cuts a held note)
 */

export type Instrument =
  | "kick"
  | "snare"
  | "clap"
  | "hat"
  | "openhat"
  | "shaker"
  | "tom"
  | "bass"
  | "sub"
  | "pluck"
  | "pad"
  | "lead"
  | "bell"
  | "organ"
  | "marimba"
  | "strings"
  | "brass"
  | "piano"
  | "flute"
  | "accordion";

export interface Layer {
  inst: Instrument;
  /** One pattern per bar, cycled (layers can have different lengths for longer phrases). */
  bars: string[];
  mode?: "abs" | "rel" | "chord";
  /** Octave shift for this layer. */
  octave?: number;
  gain?: number;
  /** Plays only while the intensity is in [from, to] (defaults 0 and 9). */
  from?: number;
  to?: number;
}

export interface Song {
  name: string;
  bpm: number;
  /** Steps per bar (default 16) over `beats` beats (default 4). 12 steps over 2 beats = 6/8. */
  steps?: number;
  beats?: number;
  /** 0..0.5 — delays every second step for a shuffle feel. */
  swing?: number;
  /** MIDI note of the key's root (57 = A3) and the scale in semitones. */
  root: number;
  scale: number[];
  /** Chord root per bar as a 0-based scale degree, cycled. */
  chords: number[];
  sevenths?: boolean;
  /** Echo time in steps (default 3 = dotted eighth in 16ths). */
  echoSteps?: number;
  layers: Layer[];
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

// --- Parsing --------------------------------------------------------------------------------------

/** A parsed pattern note (exported so rhythm charts read songs exactly like the player does). */
export interface Note {
  step: number;
  /** Length in steps. */
  len: number;
  accent: boolean;
  /** Scale degree (number tokens) or null for hits. */
  degree: number | null;
  semis: number;
}

interface ParsedLayer {
  layer: Layer;
  bars: Note[][];
}

export function parseBar(pattern: string, steps: number): Note[] {
  const tokens = pattern.trim().split(/\s+/).slice(0, steps);
  const notes: Note[] = [];
  let current: Note | null = null;
  tokens.forEach((tok, step) => {
    if (tok === ".") {
      if (current) current.len++;
      return;
    }
    current = null;
    if (tok === "x" || tok === "X") {
      current = { step, len: 1, accent: tok === "X", degree: null, semis: 0 };
      notes.push(current);
      return;
    }
    const m = /^(-?\d+)([#b]?)$/.exec(tok);
    if (m) {
      current = { step, len: 1, accent: false, degree: Number(m[1]), semis: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0 };
      notes.push(current);
    }
  });
  return notes;
}

const DEFAULT_OCTAVE: Partial<Record<Instrument, number>> = { bass: -2, sub: -2 };

export function degreeToMidi(song: Song, degree: number) {
  const n = song.scale.length;
  const idx = ((degree % n) + n) % n;
  return song.root + song.scale[idx] + 12 * Math.floor(degree / n);
}

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// --- Instruments ----------------------------------------------------------------------------------

/** Where a song's voices play: its fader (dry) and its reverb / echo sends. */
interface Out {
  ctx: BaseAudioContext;
  dry: AudioNode;
  reverb: AudioNode;
  echo: AudioNode;
  noise: AudioBuffer;
  /** Send levels shared by every voice, one gain per bus and level (voices use a few fixed levels). */
  sends: Map<string, GainNode>;
}

function send(out: Out, bus: "reverb" | "echo", level: number) {
  const key = `${bus}:${level}`;
  let g = out.sends.get(key);
  if (!g) {
    g = out.ctx.createGain();
    g.gain.value = level;
    g.connect(out[bus]);
    out.sends.set(key, g);
  }
  return g;
}

/** Connects a voice's output to the dry bus and the reverb / echo sends. */
function route(out: Out, node: AudioNode, reverb = 0, echo = 0) {
  node.connect(out.dry);
  if (reverb > 0) node.connect(send(out, "reverb", reverb));
  if (echo > 0) node.connect(send(out, "echo", echo));
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, end: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function noiseSrc(out: Out, t: number, end: number) {
  const s = out.ctx.createBufferSource();
  s.buffer = out.noise;
  // Looped, so a long note (a held flute's breath) never runs off the end of the buffer mid-note.
  s.loop = true;
  s.start(t, Math.random() * out.noise.duration);
  s.stop(end + 0.05);
  return s;
}

/**
 * Gain with attack → decay to the sustain level → hold for the note → release. Every segment is a
 * ramp (a jump would click), and the voice stops its oscillators at `end`, once it is silent.
 */
function adsr(ctx: BaseAudioContext, t: number, dur: number, peak: number, attack: number, release: number, sustain = 1) {
  const gain = ctx.createGain();
  const g = gain.gain;
  const hold = t + Math.max(dur, attack + 0.01);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
  if (sustain !== 1) g.linearRampToValueAtTime(peak * sustain, Math.min(hold, t + attack + 0.15));
  g.setValueAtTime(peak * sustain, hold);
  g.exponentialRampToValueAtTime(0.0001, hold + release);
  return { gain, end: hold + release };
}

/** Gain that decays exponentially from `peak` over `decay` seconds. */
function decayGain(ctx: BaseAudioContext, t: number, peak: number, decay: number, attack = 0.003) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/**
 * One vibrato LFO shared by all of a note's oscillators. Skipped on notes too short for it to fade
 * in: it could not be heard there, and an oscillator with a modulated pitch costs far more to run.
 */
function vibrato(ctx: BaseAudioContext, targets: AudioParam[], t: number, dur: number, end: number, depth: number, rate = 5.5, delay = 0.12) {
  if (dur < delay) return;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.setValueAtTime(0, t);
  amount.gain.linearRampToValueAtTime(depth, t + delay + 0.1);
  lfo.connect(amount);
  for (const target of targets) amount.connect(target);
  lfo.start(t);
  lfo.stop(end + 0.05);
}

/**
 * A gain stage wobbling around 1 (bellows, an electric piano). It multiplies the note, so a note
 * that has faded out stays silent instead of fluttering on until the LFO stops.
 */
function tremolo(ctx: BaseAudioContext, t: number, end: number, rate: number, depth: number) {
  const g = ctx.createGain();
  g.gain.value = 1;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(g.gain);
  lfo.start(t);
  lfo.stop(end + 0.05);
  return g;
}

type Voice = (out: Out, t: number, midi: number, dur: number, vel: number) => void;

const VOICES: Record<Instrument, Voice> = {
  kick(out, t, _m, _d, vel) {
    const { ctx } = out;
    const o = osc(ctx, "sine", 160, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = decayGain(ctx, t, 0.95 * vel, 0.4, 0.002);
    route(out, o.connect(g));
    const click = noiseSrc(out, t, t + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    route(out, click.connect(hp).connect(decayGain(ctx, t, 0.12 * vel, 0.012, 0.001)));
  },
  snare(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(out, t, t + 0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1100;
    route(out, n.connect(hp).connect(decayGain(ctx, t, 0.36 * vel, 0.17)), 0.12);
    const body = osc(ctx, "triangle", 190, t, t + 0.12);
    body.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    route(out, body.connect(decayGain(ctx, t, 0.32 * vel, 0.09)));
  },
  clap(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(out, t, t + 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const dt of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(0.5 * vel, t + dt);
      g.gain.exponentialRampToValueAtTime(0.05, t + dt + 0.009);
    }
    g.gain.setValueAtTime(0.42 * vel, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    route(out, n.connect(bp).connect(g), 0.25);
  },
  hat(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(out, t, t + 0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7600;
    route(out, n.connect(hp).connect(decayGain(ctx, t, 0.13 * vel, 0.045, 0.001)));
  },
  openhat(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(out, t, t + 0.4);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    route(out, n.connect(hp).connect(decayGain(ctx, t, 0.1 * vel, 0.28, 0.002)), 0.1);
  },
  shaker(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(out, t, t + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 1.6;
    route(out, n.connect(bp).connect(decayGain(ctx, t, 0.11 * vel, 0.06, 0.012)));
  },
  tom(out, t, m, _d, vel) {
    const { ctx } = out;
    const f = m ? midiToFreq(m) : 160;
    const o = osc(ctx, "sine", f * 1.3, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.3);
    route(out, o.connect(decayGain(ctx, t, 0.45 * vel, 0.32)), 0.15);
  },
  bass(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.3 * vel, 0.006, 0.07, 0.85);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(260 + 1500 * vel, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + Math.min(0.25, dur + 0.05));
    osc(ctx, "sawtooth", f, t, env.end).connect(lp);
    const sub = osc(ctx, "square", f / 2, t, env.end);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain).connect(lp);
    route(out, lp.connect(env.gain));
  },
  sub(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.42 * vel, 0.01, 0.08);
    osc(ctx, "sine", f, t, env.end).connect(env.gain);
    const tri = osc(ctx, "triangle", f, t, env.end);
    const tg = ctx.createGain();
    tg.gain.value = 0.25;
    tri.connect(tg).connect(env.gain);
    route(out, env.gain);
  },
  pluck(out, t, m, _d, vel) {
    const { ctx } = out;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    osc(ctx, "square", midiToFreq(m), t, t + 0.4).connect(lp);
    route(out, lp.connect(decayGain(ctx, t, 0.1 * vel, 0.3)), 0.15, 0.45);
  },
  pad(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.045 * vel, 0.35, 0.65);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    lp.Q.value = 0.4;
    for (const d of [-9, 9]) osc(ctx, "sawtooth", f, t, env.end, d).connect(lp);
    osc(ctx, "triangle", f, t, env.end).connect(lp);
    route(out, lp.connect(env.gain), 0.7);
  },
  lead(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.075 * vel, 0.015, 0.1, 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3000;
    const a = osc(ctx, "square", f, t, env.end);
    const b = osc(ctx, "sawtooth", f, t, env.end, 6);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    a.connect(lp);
    b.connect(bg).connect(lp);
    vibrato(ctx, [a.detune, b.detune], t, dur, env.end, 9);
    route(out, lp.connect(env.gain), 0.2, 0.3);
  },
  bell(out, t, m, _d, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const end = t + 1.8;
    route(out, osc(ctx, "sine", f, t, end).connect(decayGain(ctx, t, 0.13 * vel, 1.6)), 0.5, 0.2);
    route(out, osc(ctx, "sine", f * 2.76, t, end).connect(decayGain(ctx, t, 0.045 * vel, 0.7)), 0.5);
    route(out, osc(ctx, "sine", f * 5.4, t, end).connect(decayGain(ctx, t, 0.02 * vel, 0.3)), 0.5);
  },
  organ(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.05 * vel, 0.02, 0.12);
    [1, 2, 3, 4].forEach((h, i) => {
      const hg = ctx.createGain();
      hg.gain.value = [1, 0.6, 0.35, 0.25][i];
      osc(ctx, "sine", f * h, t, env.end).connect(hg).connect(env.gain);
    });
    route(out, env.gain, 0.3);
  },
  marimba(out, t, m, _d, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    route(out, osc(ctx, "sine", f, t, t + 0.6).connect(decayGain(ctx, t, 0.22 * vel, 0.45, 0.002)), 0.25);
    route(out, osc(ctx, "sine", f * 4, t, t + 0.2).connect(decayGain(ctx, t, 0.05 * vel, 0.07, 0.001)), 0.2);
  },
  strings(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.045 * vel, 0.14, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    const oscs = [-7, 7].map((d) => osc(ctx, "sawtooth", f, t, env.end, d));
    for (const o of oscs) o.connect(lp);
    vibrato(ctx, oscs.map((o) => o.detune), t, dur, env.end, 6, 5, 0.25);
    route(out, lp.connect(env.gain), 0.55);
  },
  brass(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.06 * vel, 0.035, 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 0.06);
    // A ramp that ends (setTargetAtTime never does: the filter would recompute every sample for the whole note).
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    osc(ctx, "sawtooth", f, t, env.end).connect(lp);
    osc(ctx, "sawtooth", f, t, env.end, 8).connect(lp);
    route(out, lp.connect(env.gain), 0.3);
  },
  piano(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const decay = Math.max(0.6, Math.min(1.8, dur + 0.6));
    const end = t + decay + 0.1;
    const trem = tremolo(ctx, t, end, 4.5, 0.18);
    route(out, osc(ctx, "sine", f, t, end).connect(decayGain(ctx, t, 0.15 * vel, decay)).connect(trem), 0.3);
    route(out, osc(ctx, "sine", f * 2, t, end).connect(decayGain(ctx, t, 0.04 * vel, decay * 0.5)), 0.3);
    route(out, osc(ctx, "triangle", f * 3, t, t + 0.2).connect(decayGain(ctx, t, 0.015 * vel, 0.08, 0.001)));
  },
  flute(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.13 * vel, 0.06, 0.12, 0.9);
    const o = osc(ctx, "triangle", f, t, env.end);
    vibrato(ctx, [o.detune], t, dur, env.end, 12, 5, 0.18);
    o.connect(env.gain);
    const breath = noiseSrc(out, t, env.end);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f * 2;
    bp.Q.value = 6;
    const bg = ctx.createGain();
    bg.gain.value = 0.08;
    breath.connect(bp).connect(bg).connect(env.gain);
    route(out, env.gain, 0.4, 0.2);
  },
  accordion(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const env = adsr(ctx, t, dur, 0.05 * vel, 0.03, 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    osc(ctx, "square", f, t, env.end, -11).connect(lp);
    osc(ctx, "sawtooth", f, t, env.end, 11).connect(lp);
    route(out, lp.connect(env.gain).connect(tremolo(ctx, t, env.end, 6, 0.24)), 0.25);
  },
};

const DRUMS = new Set<Instrument>(["kick", "snare", "clap", "hat", "openhat", "shaker"]);

// --- Player ---------------------------------------------------------------------------------------

/**
 * How far ahead notes are scheduled (seconds). Games stall the main thread now and then (loading a
 * model, compiling shaders, a slow frame), and a scheduler that runs dry during a stall leaves a
 * gap in the music. But every queued note is live audio nodes, and the browser's audio thread
 * slows down sharply as they pile up — so the queue follows the game: short while it runs
 * smoothly, longer after stalls (a bit over the longest recent one).
 */
const AHEAD_MIN = 0.2;
const AHEAD_MAX = 0.8;
/** Assumed stall when a song starts: games load and compile shaders then. */
const START_JANK = 0.3;
/** Seconds for the remembered stall to halve once the game runs smoothly. */
const JANK_HALF_LIFE = 8;
/** Background tabs may run timers only once a second. */
const AHEAD_HIDDEN = 1.6;
/** Music level on pause screens. */
const DUCKED = 0.3;

/** When a song started and how long its steps are — rhythm games compute note times from this. */
export interface SongTiming {
  song: Song;
  /** AudioContext time of bar 0, step 0. */
  start: number;
  /** Seconds per step (before swing). */
  stepDur: number;
  steps: number;
  /** Seconds added to every odd step. */
  swing: number;
}

/** A playing song's output: its voices, and the faders (dry, reverb, echo) that move together. */
interface Channel {
  out: Out;
  faders: GainNode[];
  /** Everything to disconnect once the song has faded out. */
  nodes: AudioNode[];
}

/** Moves the faders to `level` in `seconds`, smoothly from wherever they are now. */
function fade(ch: Channel, level: number, seconds: number) {
  const t = ch.out.ctx.currentTime;
  for (const { gain } of ch.faders) {
    if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(t);
    else {
      const now = gain.value;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(now, t);
    }
    gain.linearRampToValueAtTime(level, t + Math.max(0.02, seconds));
  }
}

class MusicPlayer {
  private song: Song | null = null;
  private timingInfo: SongTiming | null = null;
  private readonly startListeners = new Set<(t: SongTiming) => void>();
  private layers: ParsedLayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private channel: Channel | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private intensity = 1;
  private barIntensity = 1;
  private ducked = false;
  /** Longest recent gap between scheduler ticks (seconds), fading over time. */
  private jank = START_JANK;
  private lastTick = 0;

  /**
   * Starts a song (cross-fading from the current one). Re-playing the same song only sets the
   * intensity, unless restart is set (rhythm games restarting a track from bar 0).
   */
  play(song: Song, intensity = this.intensity, { restart = false }: { restart?: boolean } = {}) {
    this.intensity = intensity;
    if (this.song === song && !restart) return;
    this.stop(0.6);
    this.song = song;
    const steps = song.steps ?? 16;
    this.layers = song.layers.map((layer) => ({ layer, bars: layer.bars.map((b) => parseBar(b, steps)) }));
    audio.onUnlock(() => {
      if (this.song === song && !this.channel) this.begin();
    });
  }

  /** 0 = calm (menus), 1 = playing, 2+ = intense. Takes effect on the next bar. */
  setIntensity(intensity: number) {
    this.intensity = intensity;
  }

  /** Softens the music (pause screens) without stopping it. */
  duck(on: boolean) {
    // Games call this on every start / resume; re-applying it would restart a fade already running.
    if (on === this.ducked) return;
    this.ducked = on;
    if (this.channel) fade(this.channel, on ? DUCKED : 1, 0.35);
  }

  /** Timing of the playing song (null before it has started — see onStart). */
  timing(): SongTiming | null {
    return this.timingInfo;
  }

  /** AudioContext time up to which notes are already scheduled: an intensity change lands on the first bar after it. */
  scheduledUntil() {
    return this.nextTime;
  }

  /** Called with the timing each time a song actually starts playing. Returns an unsubscribe function. */
  onStart(fn: (t: SongTiming) => void) {
    this.startListeners.add(fn);
    return () => void this.startListeners.delete(fn);
  }

  stop(fadeOut = 0.5) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    this.timingInfo = null;
    const ch = this.channel;
    this.channel = null;
    if (!ch) return;
    fade(ch, 0, fadeOut);
    // Disconnect once it is silent (the fade, then the echo's tail), judged on the audio clock: it
    // stands still while audio is held, and a fade cut off half-way would click.
    const { ctx } = ch.out;
    const silentAt = ctx.currentTime + fadeOut + 3;
    const release = () => {
      if (ctx.currentTime < silentAt) setTimeout(release, 1000);
      else ch.nodes.forEach((n) => n.disconnect());
    };
    setTimeout(release, (fadeOut + 3) * 1000);
  }

  private stepDur(song: Song) {
    return ((60 / song.bpm) * (song.beats ?? 4)) / (song.steps ?? 16);
  }

  private begin() {
    const { ctx } = audio;
    const song = this.song;
    if (!ctx || !song) return;
    const dry = ctx.createGain();
    dry.connect(audio.musicBus);
    const reverb = ctx.createGain();
    reverb.connect(audio.reverb);
    // Each song has its own echo timed to its tempo, so a cross-fade never retimes (and glitches)
    // the tail of the song fading out.
    const echo = ctx.createGain();
    const echoIn = ctx.createGain();
    echoIn.gain.value = 0.55;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = Math.min(1.9, this.stepDur(song) * (song.echoSteps ?? 3));
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    echo.connect(echoIn).connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(audio.musicBus);
    const faders = [dry, reverb, echo];
    for (const { gain } of faders) {
      gain.setValueAtTime(0, ctx.currentTime);
      gain.linearRampToValueAtTime(this.ducked ? DUCKED : 1, ctx.currentTime + 0.8);
    }
    this.channel = {
      out: { ctx, dry, reverb, echo, noise: audio.noiseBuffer, sends: new Map() },
      faders,
      nodes: [dry, reverb, echo, echoIn, delay, tone, feedback],
    };
    this.nextTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.bar = 0;
    this.barIntensity = this.intensity;
    this.jank = Math.max(this.jank, START_JANK);
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 25);
    this.timingInfo = { song, start: this.nextTime, stepDur: this.stepDur(song), steps: song.steps ?? 16, swing: (song.swing ?? 0) * this.stepDur(song) };
    const timing = this.timingInfo;
    this.startListeners.forEach((fn) => fn(timing));
    this.tick();
  }

  private tick() {
    const ch = this.channel;
    const song = this.song;
    if (!ch || !song) return;
    const { ctx } = ch.out;
    const dur = this.stepDur(song);
    // A stall longer than the lookahead (a frozen tab, a long load) left steps behind: skip them
    // whole, so the song stays on its beat grid instead of firing notes late with clipped attacks.
    while (this.nextTime < ctx.currentTime + 0.005) this.advance(song, dur);
    const now = performance.now();
    const gap = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.jank = Math.max(gap, this.jank * Math.pow(0.5, gap / JANK_HALF_LIFE));
    const hidden = typeof document !== "undefined" && document.hidden;
    const ahead = hidden ? AHEAD_HIDDEN : Math.min(AHEAD_MAX, Math.max(AHEAD_MIN, this.jank * 1.4 + 0.08));
    while (this.nextTime < ctx.currentTime + ahead) {
      const swing = this.step % 2 === 1 ? (song.swing ?? 0) * dur : 0;
      this.scheduleStep(ch.out, song, this.nextTime + swing, dur);
      this.advance(song, dur);
    }
  }

  private advance(song: Song, dur: number) {
    this.nextTime += dur;
    if (++this.step >= (song.steps ?? 16)) {
      this.step = 0;
      this.bar++;
      this.barIntensity = this.intensity;
    }
  }

  private scheduleStep(out: Out, song: Song, t: number, stepDur: number) {
    const chordRoot = song.chords[this.bar % song.chords.length];
    for (const { layer, bars } of this.layers) {
      if (this.barIntensity < (layer.from ?? 0) || this.barIntensity > (layer.to ?? 9)) continue;
      const notes = bars[this.bar % bars.length];
      for (const note of notes) {
        if (note.step !== this.step) continue;
        const vel = (layer.gain ?? 1) * (note.accent ? 1.25 : 1);
        const len = note.len * stepDur;
        const voice = VOICES[layer.inst];
        if (DRUMS.has(layer.inst)) {
          voice(out, t, 0, len, vel);
          continue;
        }
        const octave = 12 * (layer.octave ?? DEFAULT_OCTAVE[layer.inst] ?? 0);
        if (layer.mode === "chord") {
          const degrees = [0, 2, 4, ...(song.sevenths ? [6] : [])];
          for (const d of degrees) voice(out, t, degreeToMidi(song, chordRoot + d) + octave, len, vel);
        } else if (note.degree !== null) {
          const base = layer.mode === "rel" ? chordRoot + note.degree : note.degree;
          voice(out, t, degreeToMidi(song, base) + note.semis + octave, len, vel);
        } else if (layer.inst === "tom") voice(out, t, 0, len, vel);
      }
    }
  }
}

/** The one music player for all games. */
export const music = new MusicPlayer();
