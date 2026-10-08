import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
# Turn flat espeak lines into an old dead woman's voice: shaky, breathy, a whisper layered under it, a room around it.
import json, numpy as np, subprocess, base64
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, resample, fftconvolve
SR = 22050; rng = np.random.default_rng(3)
def rd(p): sr, x = wavfile.read(p); x = x.astype(np.float32) / 32768; return x
def bp(x, lo, hi): return sosfilt(butter(4, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(4, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f): return sosfilt(butter(2, f, 'highpass', fs=SR, output='sos'), x)
def stretch_to(x, n): return resample(x, n).astype(np.float32)
def warp(x, depth, rate, pitch=1.0):
    # vibrato + pitch: read the signal at a wobbling speed
    n = len(x); t = np.arange(int(n / pitch)) / SR
    pos = np.cumsum(pitch * (1 + depth * np.sin(2 * np.pi * rate * t + rng.random() * 6) + 0.004 * np.sin(2 * np.pi * 0.7 * t)))
    pos = np.clip(pos, 0, n - 1); return np.interp(pos, np.arange(n), x).astype(np.float32)
def env(x, ms=25):
    k = int(SR * ms / 1000); return np.convolve(np.abs(x), np.ones(k) / k, 'same')
def ir(sec=2.2, pre=0.03):
    n = int(SR * sec); t = np.arange(n) / SR
    d = rng.standard_normal(n) * np.exp(-6.9 * t / sec); d = lp(d, 3800)
    d[: int(pre * SR)] = 0; d /= np.abs(d).max(); return d.astype(np.float32)
IR = ir()
L = json.load(open('lines.json')); out = {}
for k, ta, en in L:
    v = rd(f'{k}_v.wav'); w = rd(f'{k}_w.wav'); w = stretch_to(w, len(v))
    v = warp(v, 0.018, 5.6, pitch=0.9)                  # lower and shaking
    w = warp(w, 0.01, 4.1, pitch=0.95); w = w[:len(v)] if len(w) >= len(v) else np.pad(w, (0, len(v) - len(w)))
    breath = bp(rng.standard_normal(len(v)).astype(np.float32), 1200, 4200) * env(v, 30) * 0.9   # rasp riding on the voice
    trem = 1 + 0.22 * np.sin(2 * np.pi * 6.8 * np.arange(len(v)) / SR)
    x = (1.0 * v * trem + 0.38 * w + 0.18 * breath)
    x = hp(lp(x, 5200), 140)
    x = x / (np.abs(x).max() + 1e-6); x = np.tanh(x * 1.5) / np.tanh(1.5)                 # a little grit
    pad = int(SR * 1.6); x = np.pad(x, (int(SR * 0.6), pad))
    wet = fftconvolve(x, IR)[:len(x)]
    rev = fftconvolve(x[::-1], IR)[:len(x)][::-1]       # a reversed-room swell that rises into the first word
    rev[int(SR * 0.6) + int(SR * 0.25):] *= 0           # only before the voice starts
    y = 0.85 * x + 0.32 * wet / (np.abs(wet).max() + 1e-6) * np.abs(x).max() * 1.2 + 0.25 * rev / (np.abs(rev).max() + 1e-6) * np.abs(x).max()
    y /= np.abs(y).max() + 1e-6; y *= 0.89
    # trim silence at both ends, fade the tail
    e = env(y, 40); idx = np.where(e > 0.004)[0]; y = y[max(0, idx[0] - 200): min(len(y), idx[-1] + 2000)]
    f = int(SR * 0.4); y[-f:] *= np.linspace(1, 0, f)
    wavfile.write(f'{k}.wav', SR, (y * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{k}.wav', '-ac', '1', '-ar', '22050', '-b:a', '40k', f'{k}.mp3'], check=True)
    out[k] = {'d': base64.b64encode(open(f'{k}.mp3', 'rb').read()).decode(), 'ta': ta, 'en': en, 'dur': round(len(y) / SR, 2)}
    print(k, round(len(y) / SR, 2), 's', len(open(f'{k}.mp3', 'rb').read()) // 1024, 'KB')
js = '// Paatti\'s voice: lines spoken with eSpeak NG (Tamil), aged and roomed for the game\nwindow.PAATTI_VOICE=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
open('../../js/voice-data.js', 'w', encoding='utf-8').write(js)
print('js KB', len(js.encode()) // 1024)
