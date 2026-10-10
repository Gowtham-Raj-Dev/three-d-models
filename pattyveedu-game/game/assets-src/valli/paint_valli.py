import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))  # paths below are relative to this folder
# Valli the dead child: grey-blue skin, black hair with a faded red ribbon, black eye sockets, milky eyes,
# an old dark-red frock (the shirt), dark muddy leggings, dirty sleeves, bare-looking dark feet.
import sys, math, random, numpy as np
sys.path.insert(0, '..')
from PIL import Image, ImageDraw, ImageFilter
exec(open('../paint.py').read().split('# ---------------- head ----------------')[0])   # helpers: arr, save, lum, hsv, blur, noise, corpse, overlay
random.seed(11)
S = 1024   # source colour maps are stored at 1024, normal maps at 512 (the sizes the game uses)
def load(n): return np.asarray(Image.open(n).convert('RGB').resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
# ---------------- head ----------------
H = load('cf001_head_color.png'); h, w = H.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; L = lum(H); V_, Sa = hsv(H)
eyeC = (283, 950); eye = np.hypot(xx - eyeC[0], yy - eyeC[1]) < 72
mouthR = (xx < 205) & (yy > 640)
# hair by where it is on the head map: everything above the shoulders that is not the face oval or an ear, and the ponytail
faceE = ((xx - 512) / 228) ** 2 + ((yy - 338) / 192) ** 2 < 1
ears = (np.hypot(xx - 246, yy - 372) < 48) | (np.hypot(xx - 778, yy - 372) < 48)
ribbon0 = (H[..., 0] > 0.6) & (H[..., 1] < 0.72) & (H[..., 2] > 0.55) & (yy > 820) & (xx > 520)
br = H[..., 2] / np.maximum(H[..., 0], 1e-3)
pony = (xx > 540) & (yy > 630) & ((br < 0.505) | (L < 0.5)) & (L > 0.05) & ~ribbon0   # the ponytail: yellower and darker than the neck beside it
pony = blur(pony.astype(np.float32), 4) > 0.5
hair = (((yy < 470) & ~faceE & ~ears) | pony) & (L > 0.04) & ~eye & ~mouthR
hair = blur(hair.astype(np.float32), 3) > 0.5
# soften the hairline into the forehead so it is not a hard cut
edge = blur(hair.astype(np.float32), 6)
skin = (H[..., 0] > H[..., 2] + 0.05) & (L > 0.25) & ~hair & ~eye & ~mouthR
ribbon = (H[..., 0] > 0.6) & (H[..., 1] < 0.72) & (H[..., 2] > 0.55) & (yy > 820) & (xx > 520)        # the pink hair ties
Hn = H.copy()
blk = (0.025 + L[..., None] * 0.22) * np.array([1.0, 0.95, 0.9])                                         # blonde to black, strands kept
Hn = Hn * (1 - edge[..., None]) + blk * edge[..., None]
Hn = np.where(ribbon[..., None], (0.2 + L[..., None] * 0.35) * np.array([0.62, 0.1, 0.09]), Hn)
Hn = corpse(Hn, skin.astype(np.float32), 31)
Hn = np.where(skin[..., None], Hn * np.array([0.9, 0.95, 1.04]), Hn)                                     # colder, bluer than Paatti
im = Image.fromarray((np.clip(Hn, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
def soft(cx, cy, rx, ry, col, a, bl):
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(l2).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=col + (a,)); return l2.filter(ImageFilter.GaussianBlur(bl))
def line(pts, col, a, wd, bl=1.2):
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(l2).line(pts, fill=col + (a,), width=wd, joint='curve'); return l2.filter(ImageFilter.GaussianBlur(bl))
E = [(440, 290), (584, 290)]; layers = []
for (ex, ey) in E:
    layers += [soft(ex, ey + 4, 64, 50, (6, 4, 8), 225, 20), soft(ex, ey + 2, 42, 24, (0, 0, 0), 250, 5), soft(ex, ey + 42, 40, 14, (30, 20, 40), 160, 9)]
    for ox, ln in ((-8, 170), (10, 110)):   # black tears, not red: something old and wrong
        x0 = ex + ox; pts = [(x0, ey + 16)] + [(x0 + random.uniform(-3, 3), ey + 16 + ln * t / 6) for t in range(1, 7)]
        layers.append(line(pts, (10, 6, 8), 210, 6, 1.4)); layers.append(soft(pts[-1][0], pts[-1][1], 4, 6, (8, 4, 6), 220, 1))
layers += [soft(512, 412, 44, 12, (36, 30, 44), 210, 4), soft(512, 414, 36, 4, (4, 2, 4), 235, 2)]     # grey lips, a dark seam
layers += [soft(400, 430, 50, 64, (28, 30, 40), 110, 26), soft(624, 430, 50, 64, (28, 30, 40), 110, 26)]
def vein(x, y, a, ln, wd, d=0):
    if ln < 8 or d > 5: return
    x2, y2 = x + math.cos(a) * ln, y + math.sin(a) * ln; layers.append(line([(x, y), (x2, y2)], (40, 52, 90), 110, max(1, int(wd)), 0.8))
    vein(x2, y2, a + random.uniform(-0.6, 0.6), ln * 0.75, wd * 0.75, d + 1)
    if random.random() < 0.5: vein(x2, y2, a + random.uniform(-1.3, 1.3), ln * 0.6, wd * 0.6, d + 1)
for (x, y, a) in [(380, 250, 0.9), (644, 250, math.pi - 0.9), (430, 610, -1.3), (594, 610, -1.9), (360, 380, 0.3), (664, 380, math.pi - 0.3)]: vein(x, y, a, 30, 3)
for l2 in layers: im = Image.alpha_composite(im, l2)
H2 = np.asarray(im.convert('RGB')).astype(np.float32) / 255
er = np.hypot(xx - eyeC[0], yy - eyeC[1])
milk = np.array([0.86, 0.87, 0.84]) * (0.9 + 0.1 * noise(h, w, 4, 3)[..., None]); milk = np.where((er < 4)[..., None], 0.1, milk)
ring = np.clip((er - 46) / 26, 0, 1)[..., None]; milk = milk * (1 - ring) + np.array([0.3, 0.05, 0.05]) * ring
H2 = np.where(eye[..., None], milk, H2)
H2 = np.where(mouthR[..., None], H2 * np.array([0.5, 0.42, 0.4]), H2)
save(H2, 'valli_head.jpg', 88)
# ---------------- body ----------------
B = load('cf001_body_color.png'); h, w = B.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; Lb = lum(B); Vb, Sb = hsv(B)
skinB = (B[..., 0] > B[..., 2] + 0.12) & (Lb > 0.4) & (Sb > 0.15) & (Sb < 0.6) & (yy < 300)
skinB = blur(skinB.astype(np.float32), 2) > 0.5
shirt = (B[..., 0] > 0.35) & (B[..., 2] > 0.35) & (B[..., 1] < 0.3)                                    # magenta
shirt = blur(shirt.astype(np.float32), 1.5) > 0.4
jeans = (B[..., 2] > B[..., 0] + 0.03) & (Lb > 0.4) & (yy > 540)
white = (Sb < 0.12) & (Lb > 0.55) & ~skinB & ~jeans
shoes = ((xx < 330) | (xx > 690)) & (yy < 300) & ~skinB
det = Lb / np.maximum(blur(Lb, 18), 0.02); dirt = noise(h, w, 30, 41)[..., None]; mud = np.clip(noise(h, w, 50, 42) - 0.55, 0, 1)[..., None] * 2.2
frock = np.array([0.36, 0.07, 0.07]) * np.clip(0.75 + 0.25 * det, 0.5, 1.2)[..., None] * (0.75 + 0.3 * dirt)
leg = np.array([0.12, 0.08, 0.07]) * np.clip(0.7 + 0.3 * det, 0.5, 1.3)[..., None] * (0.8 + 0.3 * dirt)
sleeve = np.array([0.62, 0.6, 0.55]) * np.clip(0.7 + 0.3 * det, 0.5, 1.2)[..., None] * (0.75 + 0.3 * dirt)
Bn = B.copy()
shirt = shirt | ((xx > 345) & (xx < 680) & (yy > 60) & (yy < 900) & (Lb > 0.05))
Bn = np.where(shirt[..., None], frock, Bn); Bn = np.where(jeans[..., None], leg, Bn); Bn = np.where(white[..., None], sleeve, Bn)
Bn = np.where(shoes[..., None], (0.05 + Lb[..., None] * 0.2) * np.array([0.5, 0.45, 0.42]), Bn)
Bn = Bn * (1 - mud * 0.45) + np.array([0.18, 0.13, 0.09]) * mud * 0.45 * (shirt | jeans | white)[..., None]
Bn = corpse(Bn, skinB.astype(np.float32), 61)
im = Image.fromarray((np.clip(Bn, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
for k in range(7):   # dark old blood soaked into the frock
    x = random.uniform(360, 650); y = random.uniform(80, 720); l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); dd = ImageDraw.Draw(l2)
    for q in range(random.randint(6, 12)):
        r = random.uniform(3, 14); px = x + random.gauss(0, 16); py = y + random.gauss(0, 12); dd.ellipse((px - r, py - r * 0.8, px + r, py + r * 0.8), fill=(30, 2, 2, random.randint(110, 190)))
    im = Image.alpha_composite(im, l2.filter(ImageFilter.GaussianBlur(2)))
for cx in (95, 929):
    l2 = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(l2).rectangle((cx - 95, 0, cx + 95, 60), fill=(20, 18, 24, 140)); im = Image.alpha_composite(im, l2.filter(ImageFilter.GaussianBlur(20)))
save(np.asarray(im.convert('RGB')).astype(np.float32) / 255, 'valli_body.jpg', 88)
Image.open('cf001_body_normal.png').convert('RGB').resize((512, 512), Image.LANCZOS).save('valli_body_n.jpg', quality=88)
Image.open('cf001_head_normal.png').convert('RGB').resize((512, 512), Image.LANCZOS).save('valli_head_n.jpg', quality=88)
print('done')
