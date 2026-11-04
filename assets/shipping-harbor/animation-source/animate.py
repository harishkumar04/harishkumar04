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
  container    sways and lifts slightly; the cables bend because the motion fades to zero at the trolley
  lights       existing harbor lights get a soft glow; a few twinkle
  panel        "NEXT SHIPMENT IN" overlay (a looping display in the GIF; the live countdown is in preview.html)

Usage:
  python3 animate.py <master-artwork.png> <out-dir> [--width 1200] [--fps 12] [--loop 10]
"""
import argparse, json, math, os, subprocess
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
        self.clouds = [(poly_mask(W, H, c["poly"], 10 * s) * poly_mask(W, H, R["sky"], 6 * s) * sun_keep, c["amp"] * s, c["phase"]) for c in R["clouds"]]
        self.ship = poly_mask(W, H, R["main_ship"], 4 * s)
        self.far = [(box_mask(W, H, d["box"], 2.5 * s), np.array(d["drift"]) * s) for d in R["distant_ships"]]
        c = R["container"]
        self.cont = box_mask(W, H, c["box"], 3 * s)
        self.cont_w = smoothstep(c["cable_top"] * H, c["load_top"] * H, ys)     # 0 at the trolley -> 1 at the load
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

    def frame(self, t):
        W, H, L, s = self.W, self.H, self.L, self.s
        xs, ys, p = self.xs, self.ys, self.p
        w = TAU * t / L
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

        # --- suspended container: sway + gentle lift; cables bend because the weight fades to 0 at the trolley
        cw = self.cont * self.cont_w
        dx += cw * 1.8 * s * math.sin(w)
        dy += cw * (-2.2 * s * (0.5 - 0.5 * math.cos(w)) + 0.4 * s * math.sin(3 * w))

        out = sample(self.img, xs - dx, ys - dy)

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
        """Small glass status panel. In the GIF it is a looping display (it ticks down for one loop)."""
        s = self.s
        sec = int(t); frac = t - sec
        k = min(1.0, max(0.0, (frac - 0.8) / 0.2))
        fmt = lambda v: "%02d:%02d:%02d" % (v // 3600, v // 60 % 60, v % 60)
        P = self.R["panel"]
        x0, y0, w, h = P["x"] * s, P["y"] * s, 150 * s, 50 * s
        L0 = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(L0)
        # glass: blur what is behind the panel
        crop = img.crop((int(x0), int(y0), int(x0 + w), int(y0 + h))).filter(ImageFilter.GaussianBlur(4 * s))
        img.paste(crop, (int(x0), int(y0)))
        d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=6 * s, fill=(12, 18, 42, 120), outline=(255, 255, 255, 40), width=1)
        f1 = ImageFont.truetype(FONT, max(7, int(6.8 * s))); f2 = ImageFont.truetype(FONTB, int(15 * s)); f3 = ImageFont.truetype(FONT, max(6, int(6.0 * s)))
        d.text((x0 + 10 * s, y0 + 6 * s), "NEXT SHIPMENT IN", font=f1, fill=(225, 230, 245, 205))
        pulse = 0.5 + 0.5 * math.sin(TAU * t / 2)
        cx, cy = x0 + 12 * s, y0 + 41 * s
        rr = (2 + 2.6 * pulse) * s
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(95, 211, 141, int(70 * pulse)))
        d.ellipse((cx - 1.6 * s, cy - 1.6 * s, cx + 1.6 * s, cy + 1.6 * s), fill=(95, 211, 141, 255))
        d.text((x0 + 18 * s, y0 + 37.5 * s), "SYSTEM STATUS: OPERATIONAL", font=f3, fill=(225, 230, 245, 185))
        img.alpha_composite(L0)
        for v, a in ((seconds - sec, 1 - k), (seconds - sec - 1, k)):
            if a > 0.01:
                L = Image.new("RGBA", img.size, (0, 0, 0, 0))
                ImageDraw.Draw(L).text((x0 + 10 * s, y0 + 15 * s), fmt(v), font=f2, fill=(246, 242, 234, int(255 * a)))
                img.alpha_composite(L)
        return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("art"); ap.add_argument("out")
    ap.add_argument("--width", type=int, default=1200); ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--loop", type=float, default=10.0); ap.add_argument("--still", type=float, default=None)
    a = ap.parse_args()
    R = json.load(open(os.path.join(HERE, "regions.json")))
    art = Image.open(a.art)
    an = Animator(art, R, a.width, a.loop)
    os.makedirs(a.out, exist_ok=True)
    if a.still is not None:
        an.panel(an.frame(a.still), a.still).convert("RGB").save(os.path.join(a.out, "still.png"))
        print("lights found:", len(an.lights)); return
    frames = os.path.join(a.out, "frames"); os.makedirs(frames, exist_ok=True)
    n = int(round(a.loop * a.fps))
    for i in range(n):
        t = i / n * a.loop
        an.panel(an.frame(t), t).convert("RGB").save(os.path.join(frames, f"{i:04d}.png"))
    # static fallback: the untouched artwork at 2x banner width, with the panel
    big = Animator(art, R, min(art.width, a.width * 2), a.loop)
    big.panel(Image.fromarray((big.img * 255).astype(np.uint8)).convert("RGBA"), 0.0).convert("RGB").save(os.path.join(a.out, "shipping-harbor-static.png"))
    pal = os.path.join(a.out, "palette.png"); gif = os.path.join(a.out, "shipping-harbor.gif")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", f"{frames}/%04d.png", "-vf", "palettegen=max_colors=256:stats_mode=full", pal], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", f"{frames}/%04d.png", "-i", pal,
                    "-lavfi", "paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", gif], check=True)
    print(f"{n} frames, gif {os.path.getsize(gif) / 1e6:.2f} MB, lights {len(an.lights)}")


if __name__ == "__main__":
    main()
