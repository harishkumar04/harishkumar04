"""
Animate the master artwork into a seamless looping GIF for the GitHub README.

The artwork itself is never redrawn. Every effect is a small, masked change to the
original pixels, and every motion completes a whole number of cycles per LOOP, so the
last frame flows straight back into the first:

  ocean        gentle wave displacement (stronger towards the viewer) + shimmering sun glints
  clouds       selected cloud masses drift a few pixels back and forth; the sun never moves
  sunset glow  a soft pulse of warm light around the sun
  main ship    sub-pixel vertical rocking, feathered so it stays anchored to the quay
  far ships    tiny drift towards the horizon and back, plus bobbing
  crane        a working ship-to-shore crane (crane.py): the trolley runs along the girder, the
               hoist lowers, locks, lifts, carries a container onto the ship, then unloads it again
  lights       existing harbor lights get a soft glow; a few twinkle
  panel        "NEXT SHIPMENT IN" countdown, rendered into the frames (ticks every second of the loop;
               the live, configurable countdown is in preview.html)

Usage:
  python3 animate.py <master-artwork.png> <out-dir> [--width 1200] [--fps 8] [--loop 24] [--gif-width 1000]
"""
import argparse, json, math, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crane import Crane, TROLLEY, HOIST
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TAU = 2 * math.pi
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONTB = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def poly_mask(W, H, poly, feather):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([(x * W, y * H) for x, y in poly], fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(m).astype(np.float32) / 255.0


def box_mask(W, H, box, feather):
    x0, y0, x1, y1 = box
    return poly_mask(W, H, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], feather)


def sample(src, mx, my):
    """Bilinear sample src (H,W,3) at float coords."""
    H, W = src.shape[:2]
    mx = np.clip(mx, 0, W - 1.001); my = np.clip(my, 0, H - 1.001)
    x0 = mx.astype(np.int32); y0 = my.astype(np.int32)
    fx = (mx - x0)[..., None]; fy = (my - y0)[..., None]
    a = src[y0, x0]; b = src[y0, x0 + 1]; c = src[y0 + 1, x0]; d = src[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class Animator:
    def __init__(self, art, R, width, loop):
        H = round(art.height * width / art.width)
        self.W, self.H, self.L, self.R = width, H, loop, R
        self.master_w = art.width
        self.img = np.asarray(art.convert("RGB").resize((width, H), Image.LANCZOS)).astype(np.float32) / 255.0
        W = width
        s = W / 1200.0
        self.s = s
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        self.xs, self.ys = xs, ys
        self.hz = R["horizon"] * H
        self.ocean = poly_mask(W, H, R["ocean"], 3 * s)
        sun = R["sun"]
        self.sun = (sun["x"] * W, sun["y"] * H, sun["r"] * W)
        sun_keep = np.clip(np.hypot(xs - self.sun[0], ys - self.sun[1]) / (self.sun[2] * 2.2) - 0.6, 0, 1)
        keep_ships = np.ones((H, W), np.float32)
        for d_ in R["distant_ships"]:
            x0, y0, x1, y1 = d_["box"]
            keep_ships *= 1 - box_mask(W, H, [x0 - 0.01, y0 - 0.03, x1 + 0.01, y1], 6 * s)
        self.clouds = [(poly_mask(W, H, c["poly"], 10 * s) * poly_mask(W, H, R["sky"], 6 * s) * sun_keep * keep_ships, c["amp"] * s, c["phase"]) for c in R["clouds"]]
        self.ship = poly_mask(W, H, R["main_ship"], 4 * s)
        self.far = [(box_mask(W, H, d["box"], 2.5 * s), np.array(d["drift"]) * s) for d in R["distant_ships"]]
        # ocean helpers
        p = np.clip((ys - self.hz) / (H - self.hz), 0, 1)
        self.p = p
        lum = self.img.mean(axis=2)
        self.glint = self.ocean * smoothstep(0.45, 0.85, lum) * np.exp(-((xs - self.sun[0]) / (W * 0.09 + p * W * 0.12)) ** 2)
        self.lights = self.find_lights(lum, R)

    def find_lights(self, lum, R):
        """Existing warm light sources in the harbor: local brightness maxima with warm colour."""
        W, H = self.W, self.H
        region = poly_mask(W, H, R["lights_region"], 0)
        r, g, b = self.img[..., 0], self.img[..., 1], self.img[..., 2]
        # the crane's moving parts carry their own lights, so skip their original spot
        k = W / self.master_w
        for bx0, by0, bx1, by1 in (TROLLEY, HOIST):
            region[int(by0 * k) - 4:int(by1 * k) + 4, int(bx0 * k) - 4:int(bx1 * k) + 4] = 0
        warm = (r > 0.85) & (g > 0.6) & (r >= b + 0.15) & (region > 0.5)
        blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))).astype(np.float32) / 255
        peaks = warm & (lum >= blur - 1e-3) & (lum > 0.82)
        ys, xs = np.nonzero(peaks)
        pts = sorted(zip(lum[ys, xs], xs, ys), reverse=True)
        chosen = []
        for v, x, y in pts:
            if all(abs(x - cx) + abs(y - cy) > 9 * self.s for cx, cy, _ in chosen):
                chosen.append((x, y, len(chosen)))
            if len(chosen) >= 40:
                break
        return chosen

    def frame(self, t, base=None):
        """base: this frame's artwork (with the crane re-assembled), at output size, 0..1."""
        W, H, L, s = self.W, self.H, self.L, self.s
        src = self.img if base is None else base
        xs, ys, p = self.xs, self.ys, self.p
        w = TAU * t / (L / max(1, round(L / 12)))     # environment cycles every ~12 s (a divisor of the loop)
        dx = np.zeros((H, W), np.float32); dy = np.zeros((H, W), np.float32)

        # --- ocean: travelling waves, perspective-scaled, whole cycles per loop
        amp = (0.25 + 2.2 * p ** 1.6) * s
        fx = 0.035 / (0.25 + p); fy = 0.55 / (0.12 + p)
        wav = (np.sin(xs * fx + ys * fy * 0.6 - 3 * w) * 0.55 + np.sin(xs * fx * 1.9 - ys * fy * 0.35 + 2 * w + 1.3) * 0.3 +
               np.sin(ys * fy * 1.4 + 4 * w + xs * fx * 0.4) * 0.25)
        dy += self.ocean * amp * wav
        dx += self.ocean * amp * 0.6 * np.sin(xs * fx * 1.3 + ys * fy * 0.8 - 2 * w + 0.7)

        # --- clouds drift a few pixels (the sun is masked out)
        for m, a, ph in self.clouds:
            dx += m * a * np.sin(w + ph)

        # --- main ship: sub-pixel rocking
        dy += self.ship * 0.55 * s * np.sin(2 * w) + self.ship * 0.25 * s * np.sin(w + 1)

        # --- distant ships: drift towards the horizon and back, with bobbing
        for i, (m, d) in enumerate(self.far):
            k = 0.5 - 0.5 * math.cos(w + i * 0.9)
            dx += m * d[0] * k
            dy += m * (d[1] * k + 0.35 * s * math.sin(3 * w + i))

        out = sample(src, xs - dx, ys - dy)

        # --- ocean light: shimmering glints in the sun's path and a soft brightness ripple
        sh = np.sin(xs * 0.9 / s + ys * 1.7 / s * (0.4 + p) - 5 * w) * np.sin(xs * 0.37 / s - 3 * w + ys * 0.2 / s)
        glint = self.glint * np.clip(sh, 0, 1) ** 3
        out += glint[..., None] * np.array([1.0, 0.82, 0.55]) * 0.55
        out *= (1 + self.ocean * 0.035 * np.sin(xs * 0.05 / s + ys * 0.3 / s - 2 * w))[..., None]

        # --- sunset glow pulse (the sun disc itself is untouched)
        r = np.hypot(xs - self.sun[0], ys - self.sun[1])
        glow = np.exp(-(r / (self.sun[2] * 6)) ** 2) * (0.035 + 0.03 * math.sin(w))
        out += glow[..., None] * np.array([1.0, 0.7, 0.4])

        img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).convert("RGBA")

        # --- harbor lights: soft glow, a few twinkle
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for x, y, i in self.lights:
            k = (1, 2, 3)[i % 3]
            a = 0.55 + 0.45 * math.sin(k * w + i * 1.7)
            if i % 7 == 3:          # an occasional slow blink
                a = 0.15 + 0.85 * max(0.0, math.sin(2 * w + i)) ** 2
            rr = (3.2 + 1.2 * a) * s
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(255, 205, 130, int(70 * a)))
        layer = layer.filter(ImageFilter.GaussianBlur(2.2 * s))
        img.alpha_composite(layer)
        return img

    def panel(self, img, t, seconds=4 * 3600 + 32 * 60 + 18):
        """Glass status panel, sized to stay readable at GitHub's README width (~830-1000 px).
        In the GIF the countdown ticks down once per second of the loop."""
        s = self.s
        sec = int(t); frac = t - sec
        k = min(1.0, max(0.0, (frac - 0.82) / 0.18))
        fmt = lambda v: "%02d:%02d:%02d" % (v // 3600, v // 60 % 60, v % 60)
        x0, y0, w, h = 16 * s, 14 * s, 204 * s, 88 * s
        box = (int(x0), int(y0), int(x0 + w), int(y0 + h))
        # glass: blur and darken what is behind the panel
        crop = img.crop(box).filter(ImageFilter.GaussianBlur(6 * s))
        mask = Image.new("L", crop.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, crop.width - 1, crop.height - 1), radius=int(9 * s), fill=255)
        img.paste(crop, box[:2], mask)
        L0 = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(L0)
        d.rounded_rectangle(box, radius=int(9 * s), fill=(9, 14, 34, 178), outline=(255, 255, 255, 64), width=max(1, int(1.2 * s)))
        f1 = ImageFont.truetype(FONTB, int(11.5 * s)); f2 = ImageFont.truetype(FONTB, int(29 * s)); f3 = ImageFont.truetype(FONTB, int(10.4 * s))
        d.text((x0 + 15 * s, y0 + 11 * s), "NEXT SHIPMENT IN", font=f1, fill=(205, 214, 236, 235))
        pulse = 0.5 + 0.5 * math.sin(TAU * t / 2)
        cx, cy = x0 + 18.5 * s, y0 + 71.5 * s
        for rr, al in ((6.5 + 3 * pulse, 40 * pulse), (4.2, 90)):
            d.ellipse((cx - rr * s, cy - rr * s, cx + rr * s, cy + rr * s), fill=(95, 211, 141, int(al)))
        d.ellipse((cx - 2.6 * s, cy - 2.6 * s, cx + 2.6 * s, cy + 2.6 * s), fill=(110, 230, 155, 255))
        d.text((x0 + 28 * s, y0 + 65 * s), "SYSTEM STATUS: OPERATIONAL", font=f3, fill=(205, 214, 236, 225))
        img.alpha_composite(L0)
        for v, a in ((seconds - sec, 1 - k), (seconds - sec - 1, k)):
            if a > 0.01:
                L = Image.new("RGBA", img.size, (0, 0, 0, 0))
                ImageDraw.Draw(L).text((x0 + 14 * s, y0 + 25 * s), fmt(v), font=f2, fill=(250, 248, 242, int(255 * a)))
                img.alpha_composite(L)
        return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("art"); ap.add_argument("out")
    ap.add_argument("--width", type=int, default=1200); ap.add_argument("--fps", type=int, default=10)
    ap.add_argument("--loop", type=float, default=24.0); ap.add_argument("--still", type=float, default=None)
    ap.add_argument("--static-t", type=float, default=9.0)
    ap.add_argument("--gif-width", type=int, default=1000)
    a = ap.parse_args()
    R = json.load(open(os.path.join(HERE, "regions.json")))
    art = Image.open(a.art)
    crane = Crane(a.art, a.loop)
    an = Animator(art, R, a.width, a.loop)

    def base(t, width=a.width):
        comp = Image.fromarray(np.clip(crane.compose(t), 0, 255).astype(np.uint8))
        h = round(comp.height * width / comp.width)
        return np.asarray(comp.resize((width, h), Image.LANCZOS)).astype(np.float32) / 255.0

    os.makedirs(a.out, exist_ok=True)
    if a.still is not None:
        an.panel(an.frame(a.still, base(a.still)), a.still).convert("RGB").save(os.path.join(a.out, "still.png"))
        return
    frames = os.path.join(a.out, "frames"); os.makedirs(frames, exist_ok=True)
    for f in os.listdir(frames): os.remove(os.path.join(frames, f))
    n = int(round(a.loop * a.fps))
    for i in range(n):
        t = i / n * a.loop
        an.panel(an.frame(t, base(t)), t).convert("RGB").save(os.path.join(frames, f"{i:04d}.png"))
    # static fallback: crane mid-operation, full artwork resolution (capped at 2x banner width)
    sw = min(art.width, a.width * 2)
    big = Animator(art, R, sw, a.loop)
    big.panel(Image.fromarray((base(a.static_t, sw) * 255).astype(np.uint8)).convert("RGBA"), 0.0).convert("RGB").save(os.path.join(a.out, "shipping-harbor-static.png"))
    pal = os.path.join(a.out, "palette.png"); gif = os.path.join(a.out, "shipping-harbor.gif")
    # ordered (Bayer) dithering keeps the sky stable between frames; no lossy pass, because
    # lossy GIF compression accumulates error across frames and makes the loop point jump
    sc = f"scale={a.gif_width}:-1:flags=lanczos"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", f"{frames}/%04d.png", "-vf", f"{sc},palettegen=max_colors=256:stats_mode=full", pal], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", f"{frames}/%04d.png", "-i", pal,
                    "-lavfi", f"[0]{sc}[x];[x][1]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", "-loop", "0", gif], check=True)
    if subprocess.run(["which", "gifsicle"], capture_output=True).returncode == 0:
        subprocess.run(["gifsicle", "-O3", "-b", gif], check=True)
    print(f"{n} frames, gif {os.path.getsize(gif) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
