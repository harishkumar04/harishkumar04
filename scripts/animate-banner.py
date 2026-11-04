# Turns a still image into a looping GIF banner: twinkling stars, meteor glow,
# a passing shooting star and breathing window lights.
# Usage: python3 scripts/animate-banner.py assets/art/stargazing.jpg assets/art/stargazing.gif
import sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
W0, H0 = im.size
# cinematic 2.4:1 crop that keeps the meteor head, mountain, person and van
ch = int(W0 / 2.4)
top = int(H0 * 0.10)
im = im.crop((0, top, W0, top + ch))
OW = 1000
scale = OW / W0
base = im.resize((OW, int(ch * scale)), Image.LANCZOS)
W, H = base.size
arr = np.asarray(base).astype(np.float32)

# stars: local bright maxima in the upper sky
lum = arr.mean(axis=2)
cand = []
for y in range(2, int(H * 0.55)):
    row = lum[y]
    for x in range(2, W - 2):
        v = row[x]
        if x > 500 and y > 170:
            continue
        loc = lum[max(0,y-4):y+5, max(0,x-4):x+5].mean()
        if v > 110 and v - loc > 30 and loc < 95 and v >= lum[y-1:y+2, x-1:x+2].max():
            cand.append((v, x, y))
random.seed(3)
cand.sort(reverse=True)
stars = [(x, y, random.random() * 2 * math.pi, random.choice([1, 2])) for _, x, y in cand[:220]]
random.shuffle(stars)

# meteor head (approx, in source coords of the rotated 1280x720 image) -> crop coords
mx, my = 590 * scale * (W0 / 1280), (118 * (H0 / 720) - top) * scale
win = [((740 * W0 / 1280) * scale, (535 * H0 / 720 - top) * scale), ((790 * W0 / 1280) * scale, (535 * H0 / 720 - top) * scale)]

N = 30
frames = []
for f in range(N):
    t = f / N
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x, y, ph, k in stars:
        a = 0.5 + 0.5 * math.sin(2 * math.pi * k * t + ph)
        if a < 0.55:
            continue
        c = int(150 * (a - 0.55) / 0.45)
        d.ellipse((x - 1.6, y - 1.6, x + 1.6, y + 1.6), fill=(c, c, int(c * 1.1)))
    # meteor glow pulse
    g = 0.5 + 0.5 * math.sin(2 * math.pi * t)
    for rad, inten in ((30, 10), (18, 18), (9, 26)):
        c = int(inten * (0.4 + 0.6 * g))
        d.ellipse((mx - rad, my - rad, mx + rad, my + rad), fill=(c, c, int(c * 1.15)))
    # a second, faint shooting star crossing the upper left during part of the loop
    if 0.15 <= t <= 0.42:
        p = (t - 0.15) / 0.27
        hx, hy = 120 + p * 260, 30 + p * 70
        for i in range(18):
            q = i / 18
            c = int(140 * (1 - q) * math.sin(math.pi * p))
            d.ellipse((hx - q * 70 - 1.2, hy - q * 19 - 1.2, hx - q * 70 + 1.2, hy - q * 19 + 1.2), fill=(c, c, int(c * 1.1)))
    # van window lights breathing
    wl = 0.5 + 0.5 * math.sin(2 * math.pi * t * 2 + 1)
    for wx, wy in win:
        c = int(40 * wl)
        d.ellipse((wx - 10, wy - 8, wx + 10, wy + 8), fill=(c, int(c * 0.7), int(c * 0.3)))
    layer = layer.filter(ImageFilter.GaussianBlur(1.1))
    fr = np.clip(arr + np.asarray(layer).astype(np.float32), 0, 255).astype(np.uint8)
    frames.append(Image.fromarray(fr))

pal = frames[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=90, loop=0, optimize=True, disposal=1)
print(out, W, H)
