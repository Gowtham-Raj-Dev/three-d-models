/**
 * One WebAudio graph shared by every game: music and sound effects on separate buses (each can be
 * switched off, remembered in this browser), a generated reverb and an echo for the music, and a
 * limiter on the output. Nothing is a file — every sound is synthesized. The AudioContext is
 * created on the first user gesture (`audio.unlock()`), as browsers require.
 */

export interface AudioSettings {
  music: boolean;
  sfx: boolean;
}

const KEY = "games:audio:v1";
const DEFAULTS: AudioSettings = { music: true, sfx: true };
const MUSIC_LEVEL = 0.42;
const SFX_LEVEL = 0.7;

function readSettings(): AudioSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  /** Frequency change over the note (Hz, can be negative). */
  slide?: number;
  delay?: number;
  attack?: number;
}

export interface NoiseOptions {
  volume?: number;
  freq?: number;
  q?: number;
  type?: BiquadFilterType;
  /** Filter frequency change over the burst (Hz). */
  slide?: number;
  delay?: number;
}

class AudioHub {
  ctx: AudioContext | null = null;
  /** Music instruments connect here (dry); `reverb` and `echo` are optional sends. */
  musicBus!: GainNode;
  reverb!: GainNode;
  echo!: GainNode;
  echoDelay!: DelayNode;
  sfxBus!: GainNode;
  noiseBuffer!: AudioBuffer;
  private settings: AudioSettings | null = null;
  private held = false;
  private readonly listeners = new Set<() => void>();
  private readonly unlockListeners = new Set<() => void>();

  // --- Settings (React: useSyncExternalStore(audio.subscribe, audio.getSettings, audio.serverSettings)) ---

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getSettings = (): AudioSettings => (this.settings ??= readSettings());

  serverSettings = (): AudioSettings => DEFAULTS;

  set(patch: Partial<AudioSettings>) {
    this.settings = { ...this.getSettings(), ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // Storage blocked: keep the setting for this session only.
    }
    this.applyLevels();
    this.listeners.forEach((fn) => fn());
  }

  toggleMusic() {
    this.set({ music: !this.getSettings().music });
  }

  toggleSfx() {
    this.set({ sfx: !this.getSettings().sfx });
  }

  /** Runs `fn` once audio is running (immediately if it already is). */
  onUnlock(fn: () => void) {
    if (this.ctx?.state === "running") fn();
    else this.unlockListeners.add(fn);
  }

  // --- Graph ----------------------------------------------------------------------------------------

  /** Call from a click / key press. Safe to call often. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(ctx.destination);

      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(limiter);
      this.sfxBus.connect(limiter);

      // Reverb: a convolver fed with decaying stereo noise.
      const convolver = ctx.createConvolver();
      convolver.buffer = this.impulse(ctx, 2.4, 2.6);
      this.reverb = ctx.createGain();
      this.reverb.gain.value = 0.9;
      this.reverb.connect(convolver).connect(this.musicBus);

      // Echo with a darkened feedback loop; songs set the delay time.
      this.echoDelay = ctx.createDelay(2);
      this.echoDelay.delayTime.value = 0.33;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 2600;
      this.echo = ctx.createGain();
      this.echo.gain.value = 0.55;
      this.echo.connect(this.echoDelay).connect(tone).connect(feedback).connect(this.echoDelay);
      tone.connect(this.musicBus);

      const length = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.applyLevels(true);
    }
    const ctx = this.ctx;
    if (this.held) return;
    const ready = () => {
      const fns = [...this.unlockListeners];
      this.unlockListeners.clear();
      fns.forEach((fn) => fn());
    };
    if (ctx.state === "suspended") void ctx.resume().then(ready);
    else ready();
  }

  /**
   * Freezes all audio (the AudioContext clock stops, so scheduled music resumes exactly in time).
   * While held, unlock() won't resume it. Rhythm games use this for pause.
   */
  hold(on: boolean) {
    this.held = on;
    const { ctx } = this;
    if (!ctx) return;
    if (on) void ctx.suspend();
    else void ctx.resume();
  }

  private impulse(ctx: AudioContext, seconds: number, decay: number) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buf;
  }

  private applyLevels(instant = false) {
    const { ctx } = this;
    if (!ctx) return;
    const s = this.getSettings();
    const t = ctx.currentTime;
    const music = s.music ? MUSIC_LEVEL : 0;
    const sfx = s.sfx ? SFX_LEVEL : 0;
    if (instant) {
      this.musicBus.gain.value = music;
      this.sfxBus.gain.value = sfx;
    } else {
      this.musicBus.gain.setTargetAtTime(music, t, 0.08);
      this.sfxBus.gain.setTargetAtTime(sfx, t, 0.03);
    }
  }

  /** Whether sound effects should be produced at all (skips work when muted). */
  get sfxOn() {
    return !!this.ctx && this.getSettings().sfx;
  }

  // --- Sound-effect helpers ---------------------------------------------------------------------------

  tone(freq: number, duration: number, { type = "sine", volume = 0.3, slide = 0, delay = 0, attack = 0.01 }: ToneOptions = {}) {
    const { ctx } = this;
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noise(duration: number, { volume = 0.4, freq = 1200, q = 0.8, type = "lowpass", slide = 0, delay = 0 }: NoiseOptions = {}) {
    const { ctx } = this;
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  }

  /** A short rising arpeggio — power-ups, level-ups, rewards. */
  jingle(notes: number[], { type = "triangle" as OscillatorType, volume = 0.16, step = 0.07 } = {}) {
    notes.forEach((midi, i) => this.tone(440 * Math.pow(2, (midi - 69) / 12), 0.22, { type, volume, delay: i * step }));
  }
}

/** The one audio hub for all games. */
export const audio = new AudioHub();

/** A looping, filtered noise bed (engine hum, waves, rolling wheels…) whose level games set every frame. */
export class NoiseLoop {
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private src: AudioBufferSourceNode | null = null;

  constructor(private readonly opts: { type?: BiquadFilterType; freq?: number; q?: number } = {}) {}

  set(level: number, freq?: number) {
    const { ctx } = audio;
    if (!ctx || !audio.sfxBus) return;
    if (!this.gain) {
      this.src = ctx.createBufferSource();
      this.src.buffer = audio.noiseBuffer;
      this.src.loop = true;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = this.opts.type ?? "lowpass";
      this.filter.frequency.value = this.opts.freq ?? 500;
      this.filter.Q.value = this.opts.q ?? 0.7;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.src.connect(this.filter).connect(this.gain).connect(audio.sfxBus);
      this.src.start();
    }
    const t = ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, t, 0.06);
    if (freq !== undefined) this.filter!.frequency.setTargetAtTime(freq, t, 0.1);
  }

  stop() {
    try {
      this.src?.stop();
    } catch {
      // Already stopped.
    }
    this.src?.disconnect();
    this.gain?.disconnect();
    this.src = null;
    this.gain = null;
    this.filter = null;
  }
}
