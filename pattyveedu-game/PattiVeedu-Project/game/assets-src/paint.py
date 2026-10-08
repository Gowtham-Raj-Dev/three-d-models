import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
# Turns the Rocketbox visitor into Paatti the pei: corpse skin, black hair, milky eyes, dirty white dress.
import numpy as np, random
from PIL import Image, ImageDraw, ImageFilter
R = np.random.default_rng(7); random.seed(7)
def arr(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def save(a, p, q=88): Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(p, quality=q, optimize=True)
def lum(a): return a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
def hsv(a):
    mx = a.max(-1); mn = a.min(-1); s = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0); return mx, s
def blur(m, r): return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
def noise(h, w, scale, seed):
    g = np.random.default_rng(seed).random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
def corpse(a, m, seed):
    # bloodless grey-green skin that keeps the photo's shading
    L = lum(a); mot = noise(a.shape[0], a.shape[1], 48, seed) * 0.7 + noise(a.shape[0], a.shape[1], 16, seed + 1) * 0.3
    base = np.stack([L * 0.83 + 0.035, L * 0.87 + 0.04, L * 0.84 + 0.045], -1) * (0.93 + 0.12 * mot[..., None])
    bruise = np.clip(noise(a.shape[0], a.shape[1], 60, seed + 2) - 0.66, 0, 1)[..., None] * 1.2 * np.array([0.30, 0.22, 0.36]) # purple-grey lividity
    out = base - bruise * 0.35
    return a * (1 - m[..., None]) + out * m[..., None]
def overlay(a, layer):  # RGBA PIL layer composited over a
    l = np.asarray(layer).astype(np.float32) / 255; al = l[..., 3:4]; return a * (1 - al) + l[..., :3] * al

# ---------------- head ----------------
H = arr('visitorF1_head.jpg'); h, w = H.shape[:2]
V, S = hsv(H); L = lum(H)
yy, xx = np.mgrid[0:h, 0:w]
special = ((xx < 205) & (yy > 640)) | (np.hypot(xx - 270, yy - 950) < 72)   # teeth, mouth, eyeball
_gr = H[..., 1] / np.maximum(H[..., 0], 1e-3)
inner0 = ((xx < 205) & (yy > 640)) & ((_gr < 0.58) | (L < 0.25) | (S < 0.2))
eye0 = np.hypot(xx - 270, yy - 950) < 72
skin = (H[..., 0] > H[..., 2] + 0.06) & (L > 0.3) & ~eye0 & ~inner0
skin = blur(skin.astype(np.float32), 2) > 0.5
hair = (L < 0.3) & ~special & ~skin
gold = (S > 0.5) & (H[..., 0] > 0.45) & (H[..., 1] > 0.35) & (yy < 110)
# grey hair: salt and pepper, keeps the strands
streak = np.asarray(Image.fromarray((np.random.default_rng(11).random((h // 2, w // 24)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
grey = (0.025 + L[..., None] * 0.5) * np.array([1.0, 0.96, 0.92]) * (0.86 + 0.22 * streak[..., None])  # the photo's strands, black like the hair she wears
Hn = np.where(hair[..., None], grey, H)
Hn = np.where(gold[..., None], lum(H)[..., None] * np.array([0.45, 0.42, 0.36]), Hn)
Hn = corpse(Hn, skin.astype(np.float32), 21)
im = Image.fromarray((np.clip(Hn, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
def soft(cx, cy, rx, ry, col, a, blurr):
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(l2).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=col + (a,))
    return l2.filter(ImageFilter.GaussianBlur(blurr))
def line(pts, col, a, wd, bl=1.2):
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(l2).line(pts, fill=col + (a,), width=wd, joint='curve')
    return l2.filter(ImageFilter.GaussianBlur(bl))
E = [(440, 291), (584, 291)]
layers = []
for (ex, ey) in E:
    layers += [soft(ex, ey + 4, 66, 52, (14, 10, 14), 200, 22), soft(ex, ey + 2, 40, 22, (4, 2, 3), 235, 6)]   # sunken black sockets
    layers.append(soft(ex, ey + 40, 42, 16, (40, 26, 40), 150, 10))                                           # bags
layers += [soft(395, 430, 52, 70, (30, 30, 34), 120, 26), soft(630, 430, 52, 70, (30, 30, 34), 120, 26)]     # hollow cheeks
layers += [soft(512, 410, 46, 12, (40, 30, 40), 200, 4), soft(512, 412, 40, 4, (8, 4, 6), 230, 2)]            # dead lips, dark seam
# wrinkles: forehead, crow's feet, smile lines, mouth, neck
for k in range(5):
    y0 = 160 + k * 17 + random.uniform(-3, 3); layers.append(line([(436, y0 + 6), (472, y0 + random.uniform(-3, 3)), (512, y0 - 3), (552, y0 + random.uniform(-3, 3)), (590, y0 + 6)], (30, 26, 28), 80, 2))
for (ex, ey), s in zip(E, (-1, 1)):
    for k in range(4): layers.append(line([(ex + s * 46, ey - 8 + k * 9), (ex + s * 66, ey - 16 + k * 13)], (30, 26, 28), 110, 2))
    for k in range(3): layers.append(line([(ex - 26, ey + 24 + k * 8), (ex, ey + 30 + k * 9), (ex + 26, ey + 24 + k * 8)], (30, 26, 28), 90, 2))
for s in (-1, 1):
    layers.append(line([(512 + s * 36, 368), (512 + s * 58, 400), (512 + s * 66, 440)], (26, 22, 24), 150, 3, 2))
    layers.append(line([(512 + s * 44, 418), (512 + s * 52, 455), (512 + s * 48, 490)], (26, 22, 24), 120, 2, 1.5))
for k in range(5): layers.append(line([(380, 580 + k * 18), (512, 588 + k * 18), (644, 580 + k * 18)], (30, 26, 28), 80, 2, 2))
for k in range(9): x = 488 + k * 6; layers.append(line([(x, 402), (x + 1, 418)], (20, 14, 16), 120, 1, 0.6))  # cracked lips
# veins at temples and neck
def vein(x, y, a, ln, wd, depth=0):
    if ln < 8 or depth > 5: return
    import math
    x2, y2 = x + math.cos(a) * ln, y + math.sin(a) * ln
    layers.append(line([(x, y), (x2, y2)], (46, 56, 86), 110, max(1, int(wd)), 0.8))
    vein(x2, y2, a + random.uniform(-0.6, 0.6), ln * 0.75, wd * 0.75, depth + 1)
    if random.random() < 0.5: vein(x2, y2, a + random.uniform(-1.3, 1.3), ln * 0.6, wd * 0.6, depth + 1)
import math
for (x, y, a) in [(372, 250, 0.9), (652, 250, math.pi - 0.9), (420, 600, -1.3), (600, 600, -1.9), (512, 150, 1.6), (350, 380, 0.3), (674, 380, math.pi - 0.3)]: vein(x, y, a, 34, 3)
# vibhuti (three ash lines) and a smeared kumkum
for k in range(3): layers.append(line([(452, 183 + k * 14), (512, 180 + k * 14), (572, 183 + k * 14)], (200, 198, 188), 120, 6, 2.5))
layers += [soft(512, 246, 9, 10, (110, 6, 6), 240, 1.5), line([(512, 250), (514, 290), (510, 330)], (110, 8, 6), 160, 6, 2)]
# blood tears
for (ex, ey) in E:
    for ox, ln in ((-10, 150), (12, 95)):
        x0 = ex + ox; pts = [(x0, ey + 14)]
        for t in range(1, 7): pts.append((x0 + random.uniform(-3, 3), ey + 14 + ln * t / 6))
        layers.append(line(pts, (92, 4, 4), 220, 5, 1.2)); layers.append(soft(pts[-1][0], pts[-1][1], 4, 5, (80, 2, 2), 230, 1))
# blood from the mouth corner
layers.append(line([(548, 414), (552, 450), (549, 500), (553, 540)], (88, 4, 4), 210, 5, 1.2))
for l2 in layers: im = Image.alpha_composite(im, l2)
H2 = np.asarray(im.convert('RGB')).astype(np.float32) / 255
# eyeball: milky, bloodshot
ec = (270, 950); er = np.hypot(xx - ec[0], yy - ec[1])
eye = er < 70
sclera = np.stack([0.80, 0.74, 0.62], 0)[None, None] * (0.85 + 0.15 * noise(h, w, 4, 3)[..., None])
iris = np.stack([0.80, 0.84, 0.84], 0)[None, None] * np.ones((h, w, 1))
E2 = np.where((er < 26)[..., None], iris, sclera); E2 = np.where((er < 5)[..., None], 0.05, E2)
ring = np.clip((er - 40) / 30, 0, 1)[..., None]; E2 = E2 * (1 - ring) + np.array([0.45, 0.06, 0.05]) * ring
H2 = np.where(eye[..., None], E2, H2)
im = Image.fromarray((np.clip(H2, 0, 1) * 255).astype(np.uint8)); d = ImageDraw.Draw(im)
for k in range(14):
    a = random.uniform(0, 6.28); r0 = random.uniform(40, 60); pts = [(ec[0] + math.cos(a) * r0, ec[1] + math.sin(a) * r0)]
    for t in range(4): a += random.uniform(-0.3, 0.3); r0 -= 5; pts.append((ec[0] + math.cos(a) * r0, ec[1] + math.sin(a) * r0))
    d.line(pts, fill=(150, 20, 16), width=1)
H2 = np.asarray(im).astype(np.float32) / 255
# teeth and mouth: yellow-brown teeth, dark gums
mouth = special & ~eye
H0 = arr('visitorF1_head.jpg'); g_r = H0[..., 1] / np.maximum(H0[..., 0], 1e-3)
inner = mouth & ((g_r < 0.58) | (lum(H0) < 0.25) | (hsv(H0)[1] < 0.2))          # gums, tongue, teeth — not the neck skin beside them
inner = blur(inner.astype(np.float32), 1.5) > 0.5
Lm = lum(H2)[..., None]; H2 = np.where(inner[..., None], (H2 * 0.25 + Lm * 0.15) * np.array([0.85, 0.62, 0.55]), H2)   # a dark throat, grey-brown teeth
save(H2, 'paatti_head.jpg', 88)

# ---------------- hair cards ----------------
O = Image.open('visitorF1_opacity.png').convert('RGBA'); o = np.asarray(O).astype(np.float32) / 255
Lo = lum(o[..., :3]); st = noise(o.shape[0], o.shape[1], 2, 5)
g = (0.26 + Lo[..., None] * 2.3) * np.array([1.0, 0.985, 0.95]) * (0.8 + 0.3 * st[..., None])
o[..., :3] = g
Image.fromarray((np.clip(o, 0, 1) * 255).astype(np.uint8)).quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save('paatti_hair.png', optimize=True)

# ---------------- body ----------------
B = arr('visitorF1_body.jpg'); h, w = B.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; Lb = lum(B); Vb, Sb = hsv(B)
skinB = (B[..., 0] > B[..., 2] + 0.12) & (Lb > 0.33) & (Sb > 0.18) & (Sb < 0.62)
skinB = blur(skinB.astype(np.float32), 2) > 0.5
boots = ((xx < 330) | (xx > 690)) & (yy > 870)
shoes = ((xx > 150) & (xx < 340) | (xx > 685) & (xx < 875)) & (yy > 120) & (yy < 290)
belt = (yy > 285) & (yy < 410) & ((xx < 340) | (xx > 700))
cloth = ~skinB & ~boots & ~shoes & ~belt & (Lb > 0.02)
# white cotton saree cloth with the knit's folds kept as shading; mud and old blood
det = Lb / np.maximum(blur(Lb, 18), 0.02)
creme = np.array([0.74, 0.72, 0.66]) * np.clip(0.72 + 0.28 * det, 0.5, 1.2)[..., None]
dirt = noise(h, w, 30, 41)[..., None]
creme = creme * (0.78 + 0.25 * dirt)
mud = np.clip(noise(h, w, 50, 42) - 0.55, 0, 1)[..., None] * 2.2
creme = creme * (1 - mud * 0.5) + np.array([0.33, 0.27, 0.19]) * mud * 0.5
Bn = np.where(cloth[..., None], creme, B)
# her own dress, the same cut, only gone a dead, dirty white; skin corpse-pale; boots black with mud
Bn = corpse(Bn, skinB.astype(np.float32), 51)
bootc = (0.05 + Lb[..., None] * 0.55) * np.array([0.42, 0.38, 0.36])
bootc = bootc * (1 - mud * 0.5) + np.array([0.20, 0.16, 0.11]) * mud * 0.5
Bn = np.where((boots | shoes)[..., None] & ~skinB[..., None], bootc, Bn)
# tarnished silver ottiyanam where the belt was
Bn = np.where(belt[..., None], (0.25 + Lb[..., None] * 0.9) * np.array([0.62, 0.62, 0.58]), Bn)
im = Image.fromarray((np.clip(Bn, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
for k in range(9):  # old blood on the cloth: splashes of drops and runs, dried brown at the edges
    x = random.uniform(370, 640); y = random.uniform(320, 980)
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); dd = ImageDraw.Draw(l2)
    for q in range(random.randint(6, 14)):
        r = random.uniform(2, 12); px = x + random.gauss(0, 14); py = y + random.gauss(0, 10)
        dd.ellipse((px - r, py - r * random.uniform(0.5, 1), px + r, py + r * random.uniform(0.5, 1)), fill=(78, 10, 6, random.randint(120, 200)))
    for q in range(random.randint(0, 3)):
        px = x + random.gauss(0, 10); dd.line([(px, y), (px + random.uniform(-3, 3), y + random.uniform(25, 80))], fill=(70, 8, 5, 160), width=random.randint(2, 4))
    im = Image.alpha_composite(im, l2.filter(ImageFilter.GaussianBlur(1.6)))
# dark fingertips
for cx in (95, 929):
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(l2).rectangle((cx - 95, 0, cx + 95, 60), fill=(30, 26, 30, 120)); im = Image.alpha_composite(im, l2.filter(ImageFilter.GaussianBlur(20)))
save(np.asarray(im.convert('RGB')).astype(np.float32) / 255, 'paatti_body.jpg', 88)
Image.open('visitorF1_body_n.jpg').resize((512, 512), Image.LANCZOS).save('paatti_body_n.jpg', quality=88)
Image.open('visitorF1_head_n.jpg').resize((512, 512), Image.LANCZOS).save('paatti_head_n.jpg', quality=88)
print('done')
