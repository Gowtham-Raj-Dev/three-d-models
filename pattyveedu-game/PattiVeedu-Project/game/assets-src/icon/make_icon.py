"""App icon from Paatti's screaming face (render: shots/icon-src-N.png from iconshot.js).
Crops to the face, turns the glowing eyes blood-red, adds a dark red backdrop and vignette, then writes every icon size
(Android legacy + adaptive foreground, desktop, .ico, favicon, splash face)."""
import sys, io, base64, re
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

import os
HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
GAME = os.path.abspath(HERE + '../..') + '/'; PROJ = os.path.abspath(GAME + '..') + '/'
# render a new face with: node game/tests/iconshot.js  (writes game/tests/shots/icon-src-N.png)
SRC = sys.argv[1] if len(sys.argv) > 1 else HERE + 'icon-src.png'
OUT = HERE
im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32) / 255
H, W, _ = im.shape
L = im.mean(2)

# eyes: the brightest blobs in the upper half of the face
from scipy import ndimage
band = (np.arange(H)[:, None] < H * 0.55) & (np.arange(H)[:, None] > H * 0.2)
lab, n = ndimage.label((L > 0.8) & band)
sizes = ndimage.sum(np.ones_like(L), lab, range(1, n + 1))
big = np.argsort(sizes)[::-1][:2] + 1
eyes = sorted([ndimage.center_of_mass(np.ones_like(L), lab, i)[::-1] for i in big])
print('eyes', [(round(x), round(y)) for x, y in eyes])

# crop: square around the face (eyes ~ 42% down)
ex = (eyes[0][0] + eyes[1][0]) / 2; ey = (eyes[0][1] + eyes[1][1]) / 2
size = int(W * 0.8); x0 = int(ex - size * 0.5); y0 = int(ey - size * 0.40)
x0 = max(0, min(W - size, x0)); y0 = max(0, min(H - size, y0))
im = im[y0:y0 + size, x0:x0 + size]; L = im.mean(2)
eyes = [(x - x0, y - y0) for x, y in eyes]
N = size
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)

# eye whites -> burning red, with a glow around them
out = im.copy()
for x, y in eyes:
    d = np.hypot(xx - x, yy - y) / N
    core = np.clip(1 - d / 0.03, 0, 1) ** 0.5 * np.clip((L - 0.4) / 0.3, 0, 1)
    red = np.stack([np.clip(L * 1.2, 0, 1), L * 0.12, L * 0.06], 2)
    out = out * (1 - core[..., None]) + red * core[..., None]
    hot = np.clip(1 - d / 0.012, 0, 1) * np.clip((L - 0.8) / 0.2, 0, 1)  # tiny bright centre
    out = out + hot[..., None] * np.array([0.5, 0.25, 0.15])
    glow = np.exp(-(d / 0.035) ** 2) * 0.5 + np.exp(-(d / 0.1) ** 2) * 0.12
    out = out + glow[..., None] * np.array([0.85, 0.05, 0.02])

# backdrop: deep red haze behind her, screened in where the render is black
cx, cy = N * 0.5, N * 0.42
r = np.hypot(xx - cx, yy - cy) / N
bg = np.clip(1 - r / 0.75, 0, 1) ** 1.6
bg = (bg * np.clip(1 - im.max(2) / 0.12, 0, 1))[..., None] * np.array([0.3, 0.025, 0.02])
out = 1 - (1 - out) * (1 - bg)
# a little contrast in the mid-tones, cold skin stays cold
out = np.clip((out - 0.5) * 1.08 + 0.5 - 0.01, 0, 1)
# vignette into black
vig = np.clip(1 - (np.hypot(xx - N / 2, yy - N * 0.46) / N - 0.36) / 0.36, 0, 1) ** 1.3
out = out * (0.25 + 0.75 * vig[..., None])
img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=40, threshold=2))

for s in (1024, 512, 256): img.resize((s, s), Image.LANCZOS).save(f'{OUT}icon_{s}.png')
fav = img.resize((64, 64), Image.LANCZOS); fav.save(f'{OUT}favicon64.png')

# Android: legacy square icons + adaptive foreground (rounded square, feathered, inside the safe area)
AR = PROJ + 'android/res/'
for d, s in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    img.resize((s, s), Image.LANCZOS).save(f'{AR}mipmap-{d}/ic_launcher.png')
    F = s * 108 // 48; inner = round(F * 0.83); pad = (F - inner) // 2
    face = img.resize((inner, inner), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (inner * 4, inner * 4), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, inner * 4 - 1, inner * 4 - 1), radius=inner * 4 * 0.2, fill=255)
    m = m.resize((inner, inner), Image.LANCZOS).filter(ImageFilter.GaussianBlur(inner * 0.02))
    face.putalpha(m)
    fg = Image.new('RGBA', (F, F), (0, 0, 0, 0)); fg.alpha_composite(face, (pad, pad)); fg.save(f'{AR}mipmap-{d}/ic_launcher_fg.png')

# desktop
img.resize((512, 512), Image.LANCZOS).save(PROJ + 'desktop/icon.png')
img.resize((256, 256), Image.LANCZOS).save(PROJ + 'desktop/seticon/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# game page: favicon + splash face
p = GAME + 'index.html'; h = open(p, encoding='utf-8').read()
b = io.BytesIO(); fav.save(b, 'PNG', optimize=True); fb = base64.b64encode(b.getvalue()).decode()
h, n1 = re.subn(r'(<link rel="icon" href="data:image/png;base64,)[A-Za-z0-9+/=]+(")', lambda m: m.group(1) + fb + m.group(2), h)
b = io.BytesIO(); img.resize((200, 200), Image.LANCZOS).save(b, 'JPEG', quality=82, optimize=True); sb = base64.b64encode(b.getvalue()).decode()
h, n2 = re.subn(r'(class="sface" alt="" src="data:image/jpeg;base64,)[A-Za-z0-9+/=]+(")', lambda m: m.group(1) + sb + m.group(2), h)
open(p, 'w', encoding='utf-8').write(h)
print('favicon', n1, 'splash', n2)
