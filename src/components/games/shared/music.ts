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

interface Out {
  ctx: AudioContext;
  dry: AudioNode;
  reverb: AudioNode;
  echo: AudioNode;
}

/** Connects a voice's output to the dry bus and the reverb / echo sends. */
function route(out: Out, node: AudioNode, reverb = 0, echo = 0) {
  node.connect(out.dry);
  if (reverb > 0) {
    const g = out.ctx.createGain();
    g.gain.value = reverb;
    node.connect(g).connect(out.reverb);
  }
  if (echo > 0) {
    const g = out.ctx.createGain();
    g.gain.value = echo;
    node.connect(g).connect(out.echo);
  }
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, t: number, end: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function noiseSrc(ctx: AudioContext, t: number, end: number) {
  const s = ctx.createBufferSource();
  s.buffer = audio.noiseBuffer;
  s.start(t, Math.random() * 1.5);
  s.stop(end + 0.05);
  return s;
}

/** Gain with attack → sustain → release, ending at t + dur + release. */
function adsr(ctx: AudioContext, t: number, dur: number, peak: number, attack: number, release: number, sustain = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (sustain !== 1) g.gain.setTargetAtTime(peak * sustain, t + attack, dur * 0.4 + 0.02);
  g.gain.setValueAtTime(peak * sustain, Math.max(t + attack, t + dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
  return g;
}

/** Gain that decays exponentially from `peak` over `decay` seconds. */
function decayGain(ctx: AudioContext, t: number, peak: number, decay: number, attack = 0.003) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function vibrato(ctx: AudioContext, target: AudioParam, t: number, end: number, depth: number, rate = 5.5, delay = 0.12) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.setValueAtTime(0, t);
  amount.gain.linearRampToValueAtTime(depth, t + delay + 0.1);
  lfo.connect(amount).connect(target);
  lfo.start(t);
  lfo.stop(end + 0.05);
}

type Voice = (out: Out, t: number, midi: number, dur: number, vel: number) => void;

const VOICES: Record<Instrument, Voice> = {
  kick(out, t, _m, _d, vel) {
    const { ctx } = out;
    const o = osc(ctx, "sine", 160, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = decayGain(ctx, t, 0.95 * vel, 0.4, 0.002);
    route(out, o.connect(g));
    const click = noiseSrc(ctx, t, t + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    route(out, click.connect(hp).connect(decayGain(ctx, t, 0.12 * vel, 0.012, 0.001)));
  },
  snare(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(ctx, t, t + 0.25);
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
    const n = noiseSrc(ctx, t, t + 0.3);
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
    const n = noiseSrc(ctx, t, t + 0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7600;
    route(out, n.connect(hp).connect(decayGain(ctx, t, 0.13 * vel, 0.045, 0.001)));
  },
  openhat(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(ctx, t, t + 0.4);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    route(out, n.connect(hp).connect(decayGain(ctx, t, 0.1 * vel, 0.28, 0.002)), 0.1);
  },
  shaker(out, t, _m, _d, vel) {
    const { ctx } = out;
    const n = noiseSrc(ctx, t, t + 0.1);
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
    const end = t + dur + 0.08;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(260 + 1500 * vel, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + Math.min(0.25, dur + 0.05));
    const g = adsr(ctx, t, dur, 0.3 * vel, 0.006, 0.07, 0.85);
    osc(ctx, "sawtooth", f, t, end).connect(lp);
    const sub = osc(ctx, "square", f / 2, t, end);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain).connect(lp);
    route(out, lp.connect(g));
  },
  sub(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const g = adsr(ctx, t, dur, 0.42 * vel, 0.01, 0.08);
    osc(ctx, "sine", f, t, t + dur + 0.1).connect(g);
    const tri = osc(ctx, "triangle", f, t, t + dur + 0.1);
    const tg = ctx.createGain();
    tg.gain.value = 0.25;
    tri.connect(tg).connect(g);
    route(out, g);
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
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    lp.Q.value = 0.4;
    const end = t + dur + 0.7;
    for (const d of [-9, 9]) osc(ctx, "sawtooth", f, t, end, d).connect(lp);
    osc(ctx, "triangle", f, t, end).connect(lp);
    route(out, lp.connect(adsr(ctx, t, dur, 0.045 * vel, 0.35, 0.65)), 0.7);
  },
  lead(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const end = t + dur + 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3000;
    const a = osc(ctx, "square", f, t, end);
    const b = osc(ctx, "sawtooth", f, t, end, 6);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    a.connect(lp);
    b.connect(bg).connect(lp);
    vibrato(ctx, a.detune, t, end, 9);
    vibrato(ctx, b.detune, t, end, 9);
    route(out, lp.connect(adsr(ctx, t, dur, 0.075 * vel, 0.015, 0.1, 0.8)), 0.2, 0.3);
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
    const end = t + dur + 0.15;
    const g = adsr(ctx, t, dur, 0.05 * vel, 0.02, 0.12);
    [1, 2, 3, 4].forEach((h, i) => {
      const hg = ctx.createGain();
      hg.gain.value = [1, 0.6, 0.35, 0.25][i];
      osc(ctx, "sine", f * h, t, end).connect(hg).connect(g);
    });
    route(out, g, 0.3);
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
    const end = t + dur + 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    for (const d of [-7, 7]) {
      const o = osc(ctx, "sawtooth", f, t, end, d);
      vibrato(ctx, o.detune, t, end, 6, 5, 0.25);
      o.connect(lp);
    }
    route(out, lp.connect(adsr(ctx, t, dur, 0.045 * vel, 0.14, 0.4)), 0.55);
  },
  brass(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const end = t + dur + 0.15;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 0.06);
    lp.frequency.setTargetAtTime(1500, t + 0.08, 0.15);
    osc(ctx, "sawtooth", f, t, end).connect(lp);
    osc(ctx, "sawtooth", f, t, end, 8).connect(lp);
    route(out, lp.connect(adsr(ctx, t, dur, 0.06 * vel, 0.035, 0.12)), 0.3);
  },
  piano(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const decay = Math.max(0.6, Math.min(1.8, dur + 0.6));
    const end = t + decay + 0.1;
    const g = ctx.createGain();
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.5;
    const tg = ctx.createGain();
    tg.gain.value = 0.18;
    trem.connect(tg).connect(g.gain);
    g.gain.value = 1;
    trem.start(t);
    trem.stop(end);
    route(out, osc(ctx, "sine", f, t, end).connect(decayGain(ctx, t, 0.15 * vel, decay)).connect(g), 0.3);
    route(out, osc(ctx, "sine", f * 2, t, end).connect(decayGain(ctx, t, 0.04 * vel, decay * 0.5)), 0.3);
    route(out, osc(ctx, "triangle", f * 3, t, t + 0.2).connect(decayGain(ctx, t, 0.015 * vel, 0.08, 0.001)));
  },
  flute(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const end = t + dur + 0.15;
    const o = osc(ctx, "triangle", f, t, end);
    vibrato(ctx, o.detune, t, end, 12, 5, 0.18);
    const g = adsr(ctx, t, dur, 0.13 * vel, 0.06, 0.12, 0.9);
    o.connect(g);
    const breath = noiseSrc(ctx, t, end);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f * 2;
    bp.Q.value = 6;
    const bg = ctx.createGain();
    bg.gain.value = 0.08;
    breath.connect(bp).connect(bg).connect(g);
    route(out, g, 0.4, 0.2);
  },
  accordion(out, t, m, dur, vel) {
    const { ctx } = out;
    const f = midiToFreq(m);
    const end = t + dur + 0.1;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    osc(ctx, "square", f, t, end, -11).connect(lp);
    osc(ctx, "sawtooth", f, t, end, 11).connect(lp);
    const g = adsr(ctx, t, dur, 0.05 * vel, 0.03, 0.08);
    const trem = ctx.createOscillator();
    trem.frequency.value = 6;
    const tg = ctx.createGain();
    tg.gain.value = 0.012 * vel;
    trem.connect(tg).connect(g.gain);
    trem.start(t);
    trem.stop(end);
    route(out, lp.connect(g), 0.25);
  },
};

const DRUMS = new Set<Instrument>(["kick", "snare", "clap", "hat", "openhat", "shaker"]);

// --- Player ---------------------------------------------------------------------------------------

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

class MusicPlayer {
  private song: Song | null = null;
  private timingInfo: SongTiming | null = null;
  private readonly startListeners = new Set<(t: SongTiming) => void>();
  private layers: ParsedLayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private out: { gain: GainNode; reverb: GainNode; echo: GainNode } | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private intensity = 1;
  private barIntensity = 1;
  private ducked = false;

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
      if (this.song === song && !this.timer) this.begin();
    });
  }

  /** 0 = calm (menus), 1 = playing, 2+ = intense. Takes effect on the next bar. */
  setIntensity(intensity: number) {
    this.intensity = intensity;
  }

  /** Softens the music (pause screens) without stopping it. */
  duck(on: boolean) {
    this.ducked = on;
    const { ctx } = audio;
    if (ctx && this.out) this.out.gain.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.15);
  }

  /** Timing of the playing song (null before it has started — see onStart). */
  timing(): SongTiming | null {
    return this.timingInfo;
  }

  /** Called with the timing each time a song actually starts playing. Returns an unsubscribe function. */
  onStart(fn: (t: SongTiming) => void) {
    this.startListeners.add(fn);
    return () => void this.startListeners.delete(fn);
  }

  stop(fade = 0.5) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    this.timingInfo = null;
    const { ctx } = audio;
    const out = this.out;
    this.out = null;
    if (ctx && out) {
      out.gain.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.gain.setValueAtTime(out.gain.gain.value, ctx.currentTime);
      out.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
      setTimeout(() => {
        out.gain.disconnect();
        out.reverb.disconnect();
        out.echo.disconnect();
      }, fade * 1000 + 3000);
    }
  }

  private stepDur(song: Song) {
    return ((60 / song.bpm) * (song.beats ?? 4)) / (song.steps ?? 16);
  }

  private begin() {
    const { ctx } = audio;
    const song = this.song;
    if (!ctx || !song) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.ducked ? 0.3 : 1, ctx.currentTime + 0.8);
    gain.connect(audio.musicBus);
    const reverb = ctx.createGain();
    reverb.connect(audio.reverb);
    const echo = ctx.createGain();
    echo.connect(audio.echo);
    this.out = { gain, reverb, echo };
    audio.echoDelay.delayTime.setValueAtTime(this.stepDur(song) * (song.echoSteps ?? 3), ctx.currentTime);
    this.nextTime = ctx.currentTime + 0.12;
    this.step = 0;
    this.bar = 0;
    this.barIntensity = this.intensity;
    this.timer = setInterval(() => this.tick(), 25);
    this.timingInfo = { song, start: this.nextTime, stepDur: this.stepDur(song), steps: song.steps ?? 16, swing: (song.swing ?? 0) * this.stepDur(song) };
    const timing = this.timingInfo;
    this.startListeners.forEach((fn) => fn(timing));
  }

  private tick() {
    const { ctx } = audio;
    const song = this.song;
    if (!ctx || !song || !this.out) return;
    // After a throttled background tab, skip ahead instead of firing a burst of late notes
    // (this breaks the song timing, so rhythm games should pause with audio.hold() instead).
    if (this.nextTime < ctx.currentTime - 0.05) {
      const dur = this.stepDur(song);
      const skipped = Math.ceil((ctx.currentTime + 0.05 - this.nextTime) / dur);
      for (let i = 0; i < skipped; i++) {
        this.nextTime += dur;
        if (++this.step >= (song.steps ?? 16)) {
          this.step = 0;
          this.bar++;
        }
      }
    }
    const steps = song.steps ?? 16;
    const dur = this.stepDur(song);
    while (this.nextTime < ctx.currentTime + 0.14) {
      if (this.step === 0) this.barIntensity = this.intensity;
      const swing = this.step % 2 === 1 ? (song.swing ?? 0) * dur : 0;
      this.scheduleStep(song, this.nextTime + swing, dur);
      this.nextTime += dur;
      this.step++;
      if (this.step >= steps) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private scheduleStep(song: Song, t: number, stepDur: number) {
    const ctx = audio.ctx!;
    const fader = this.out!;
    const out: Out = { ctx, dry: fader.gain, reverb: fader.reverb, echo: fader.echo };
    // The sends are fed through the song fader so fades and ducking apply to them.
    fader.reverb.gain.value = fader.gain.gain.value;
    fader.echo.gain.value = fader.gain.gain.value;
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
