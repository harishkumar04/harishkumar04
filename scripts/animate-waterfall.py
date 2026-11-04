# Adds drifting mist and slowly breathing light rays to the waterfall GIF.
# The source GIF (assets/art/waterfall-src.gif) is left untouched.
# Usage: python3 scripts/animate-waterfall.py assets/art/waterfall-src.gif assets/art/waterfall.gif
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
g = Image.open(src)
base = []
for i in range(g.n_frames):
    g.seek(i)
    base.append(np.asarray(g.convert("RGB")).astype(np.float32))
H, W, _ = base[0].shape
REPEAT = 4                      # 8 source frames x 4 = one seamless 4.5 s loop
N = len(base) * REPEAT

rng = np.random.default_rng(7)
def mist_layer(seed, blur):
    r = np.random.default_rng(seed)
    noise = Image.fromarray((r.random((H // 6, W // 6)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    noise = noise.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(noise).astype(np.float32) / 255
    fall = np.clip((np.arange(H)[:, None] - H * 0.55) / (H * 0.45), 0, 1) ** 1.3   # only near the ground / pools
    return a * fall
m1, m2 = mist_layer(1, 10), mist_layer(2, 14)

def rays(phase):
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for k, (x0, w, a) in enumerate([(70, 40, 60), (150, 26, 45), (260, 34, 38), (420, 22, 28)]):
        alpha = int(a * (0.55 + 0.45 * math.sin(phase + k * 1.3)))
        d.polygon([(x0, 0), (x0 + w, 0), (x0 + w + 160, H), (x0 + 120, H)], fill=alpha)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(16))).astype(np.float32) / 255

frames = []
for f in range(N):
    t = f / N
    fr = base[f % len(base)].copy()
    shift1 = int(round(14 * math.sin(2 * math.pi * t)))
    shift2 = int(round(-18 * math.sin(2 * math.pi * t + 0.8)))
    mist = 0.55 * np.roll(m1, shift1, axis=1) + 0.45 * np.roll(m2, shift2, axis=1)
    mist = np.clip(mist * 0.75, 0, 0.6)[..., None]
    fr = fr * (1 - mist) + np.array([214, 228, 236]) * mist
    ray = rays(2 * math.pi * t)[..., None]
    fr = fr + ray * np.array([255, 240, 200]) * 0.35
    frames.append(Image.fromarray(np.clip(fr, 0, 255).astype(np.uint8)))

pal = frames[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=140, loop=0, optimize=True, disposal=1)
print(out, W, H, N, "frames")
