"""
Articulated container crane for the shipping-harbor banner.

The artwork is a single flattened painting, so the crane's moving parts are separated
from it once, at master resolution:

  plate      the artwork with the trolley, cables, spreader and container removed.
             Behind the trolley the girder is rebuilt from the identical section next to it;
             behind the hoist the sky is filled smoothly from its surroundings and given real
             cloud texture borrowed from nearby sky, so the empty spot is not a blurry patch.
  cutouts    soft-edged mattes of the trolley, the spreader (with headblock) and the
             container, taken as the difference between the artwork and the plate.
  occluders  parts of the painting that stay in front of a moving container: the crane legs and
             braces (matted by brightness, the steel is dark against the sky), the portal
             crossbeam, and the terminal stacks in the left foreground.

Each frame re-assembles the crane from these parts: the trolley runs along the girder,
four hoist cables are redrawn from the trolley sheaves to the headblock (so they never
disconnect), and the spreader carries the container or travels empty.

Timeline (LOOP seconds, two halves):
  load    lower the spreader to a container on the lane behind the portal crossbeam, lock, lift, travel right,
          lower onto the ship's stack, release, raise
  unload  the reverse: lower, lock, lift from the ship, travel left, lower into the
          terminal, release, raise
The end state equals the start state, so the GIF loops seamlessly.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- geometry in master-artwork pixels (2172 x 724) ----
TROLLEY = (852, 78, 970, 150)          # trolley body (hangs from the girder)
GIRDER_ROWS = (78, 119)                # rows of the girder behind the trolley
HOIST = (850, 136, 996, 284)           # cables + headblock + spreader + container
SPLIT_Y = 221                          # spreader above, container below
CONT_BOTTOM = 275                      # bottom edge of the container
SHEAVES = (-5.0, 0.0, 17.0, 22.0)      # cable x offsets from the trolley centre
CABLE_TOP = 141                        # cable attachment under the trolley
HEAD_TOP = 163                         # top of the headblock (original position)
X_SHIP = 911.0                         # trolley centre above the ship (original position)
X_YARD = 470.0                         # trolley centre above the terminal lane (inside the portal)
DY_UP = -11.0                          # spreader fully raised (relative to the original)
DY_TRAVEL = -7.0                       # container carried at this height
DY_SHIP = 26.0                         # container resting on the ship's stack (bottom on the stack top)
DY_YARD = 72.0                         # container resting on the lane, just behind the portal crossbeam


def push_pull_fill(img, unknown):
    """Smoothly fill unknown pixels from their surroundings (pyramid push-pull)."""
    img = img.astype(np.float32); w = (1 - unknown).astype(np.float32)
    levels = []
    cur_i, cur_w = img * w[..., None], w
    while min(cur_w.shape) > 4:
        levels.append((cur_i, cur_w))
        h2, w2 = cur_w.shape[0] // 2, cur_w.shape[1] // 2
        ci = cur_i[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2, 3).sum((1, 3))
        cw = cur_w[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2).sum((1, 3))
        cur_i, cur_w = ci, cw
    mean = cur_i.reshape(-1, 3).sum(0) / max(cur_w.sum(), 1e-6)
    filled = np.where((cur_w > 1e-6)[..., None], cur_i / np.maximum(cur_w, 1e-6)[..., None], mean)
    for ci, cw in reversed(levels):
        up = np.repeat(np.repeat(filled, 2, 0), 2, 1)
        up = np.pad(up, ((0, ci.shape[0] - up.shape[0]), (0, ci.shape[1] - up.shape[1]), (0, 0)), mode="edge")
        up = np.asarray(Image.fromarray(np.clip(up, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32)
        known = cw > 1e-6
        filled = np.where(known[..., None], ci / np.maximum(cw, 1e-6)[..., None], up)
    return filled


def blur(a, r):
    return np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)


def soft_matte(diff, lo, hi, feather=0.8):
    a = np.clip((diff - lo) / (hi - lo), 0, 1)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(feather))).astype(np.float32) / 255
    return a


def connected(alpha, seeds, thr=0.35):
    """Geodesic reconstruction: keep the parts of the matte connected to the seed points."""
    m = Image.fromarray(((alpha > thr) * 255).astype(np.uint8))
    seed = Image.new("L", m.size, 0)
    d = ImageDraw.Draw(seed)
    for x, y in seeds:
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=255)
    prev = None
    from PIL import ImageChops
    while True:
        seed = ImageChops.multiply(seed.filter(ImageFilter.MaxFilter(3)), m)
        cur = seed.tobytes()
        if cur == prev:
            break
        prev = cur
    keep = np.asarray(seed.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32) / 255
    return alpha * keep


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class Crane:
    def __init__(self, master_path, loop):
        self.loop = loop
        art = np.asarray(Image.open(master_path).convert("RGB")).astype(np.float32)
        self.art = art
        H, W = art.shape[:2]
        plate = art.copy()

        # ---- girder behind the trolley: the section immediately to its left is identical
        x0, y0, x1, y1 = TROLLEY
        g0, g1 = GIRDER_ROWS
        shift = 118
        plate[g0:g1, x0:x1] = art[g0:g1, x0 - shift:x1 - shift]
        # ---- sky behind the trolley's lower half and the whole hoist
        unknown = np.zeros((H, W), np.float32)
        unknown[g1:y1, x0:x1] = 1
        hx0, hy0, hx1, hy1 = HOIST
        unknown[hy0:hy1, hx0:hx1] = 1
        bx0, by0, bx1, by1 = min(x0, hx0) - 30, g1 - 2, max(x1, hx1) + 30, hy1 + 14
        sub = plate[by0:by1, bx0:bx1]
        # learn only from sky pixels (not the dark girder above or the ship below)
        sky_known = (sub.mean(axis=2) > 95) & (sub[..., 2] >= sub[..., 1] + 6) & (unknown[by0:by1, bx0:bx1] < 0.5)
        fill = push_pull_fill(sub, 1 - sky_known.astype(np.float32))
        # cloud texture from clean sky to the right of the hoist, added to the smooth fill
        donor = art[by0:by1, bx0 + 175:bx1 + 175]
        detail = donor - blur(donor, 6)
        u = unknown[by0:by1, bx0:bx1]
        u_soft = np.clip(blur(u * 255, 3) / 255, 0, 1)[..., None]
        sub = sub * (1 - u_soft) + (fill + detail * 0.9) * u_soft
        plate[by0:by1, bx0:bx1] = sub
        self.plate = plate

        # ---- cutouts (alpha = how different the artwork is from the plate)
        diff = np.abs(art - plate).max(axis=2)
        self.trolley_rgb = art[y0:y1, x0:x1]
        self.trolley_a = soft_matte(diff[y0:y1, x0:x1], 10, 34)
        hx0, hy0, hx1, hy1 = HOIST
        hr = art[hy0:hy1, hx0:hx1]
        skylike = (hr[..., 2] >= hr[..., 1] + 4) & (hr.mean(axis=2) > 88)
        a = soft_matte(diff[hy0:hy1, hx0:hx1] * (~skylike), 16, 42)
        # keep only what is connected to the spreader / container (drops stray cloud specks)
        a = connected(a, seeds=[(921 - hx0, 250 - hy0), (921 - hx0, 205 - hy0), (920 - hx0, 175 - hy0)])
        rows = np.arange(hy0, hy1)[:, None]
        a[rows[:, 0] < HEAD_TOP - 3] = 0                     # cables are redrawn every frame
        self.hoist_rgb = art[hy0:hy1, hx0:hx1]
        self.spreader_a = a * (rows < SPLIT_Y)
        self.container_a = a * (rows >= SPLIT_Y) * (rows <= CONT_BOTTOM)   # trim the painted glow below it
        self.cable_rgb = np.array([58, 52, 62], np.float32)

        # ---- occluders that stay in front of a moving container
        occ = np.zeros((H, W), np.float32)
        lum = art.mean(axis=2)
        legs = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(legs)
        for poly in ([(280, 118), (322, 118), (322, 330), (280, 330)],          # left leg
                     ([(528, 118), (618, 118), (618, 330), (528, 330)]),        # right legs
                     ([(318, 118), (618, 118), (618, 296), (318, 296)]),        # braces between the legs
                     ):
            d.polygon(poly, fill=255)
        legs = np.asarray(legs).astype(np.float32) / 255
        occ = np.maximum(occ, legs * smooth(112, 78, lum))
        beam = Image.new("L", (W, H), 0)                                          # portal crossbeam (solid)
        ImageDraw.Draw(beam).polygon([(318, 295), (616, 295), (616, 350), (318, 350)], fill=255)
        occ = np.maximum(occ, np.asarray(beam.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255)
        stacks = Image.new("L", (W, H), 0)
        ImageDraw.Draw(stacks).polygon([(0, 126), (116, 128), (118, 166), (172, 168), (172, 250), (262, 249), (264, 268), (338, 270), (338, 724), (0, 724)], fill=255)
        stacks = np.asarray(stacks.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
        self.occ = np.maximum(occ, stacks)[..., None]

    # ---------------------------------------------------------------- timeline
    def state(self, t):
        """trolley x, spreader dy, container dy (None = carried), attached flag, sway."""
        T = self.loop; half = T / 2
        k = (t % T) / half
        loading = k < 1
        u = (k if loading else k - 1) * half          # seconds into this half
        sc = half / 12.0                               # timings below are for a 12 s half
        A, B = (X_YARD, X_SHIP) if loading else (X_SHIP, X_YARD)
        rest_a, rest_b = (DY_YARD, DY_SHIP) if loading else (DY_SHIP, DY_YARD)

        def e(a, b):            # eased progress between two times
            x = min(1.0, max(0.0, (u - a * sc) / ((b - a) * sc)))
            return x * x * (3 - 2 * x)

        def lerp(a, b, k):
            return a + (b - a) * k

        if u < 1.6 * sc:                  # lower the empty spreader
            x, dy, att = A, lerp(DY_UP, rest_a, e(0, 1.6)), False
        elif u < 2.1 * sc:                # lock (pause)
            x, dy, att = A, rest_a, True
        elif u < 3.9 * sc:                # lift clear
            x, dy, att = A, lerp(rest_a, DY_TRAVEL, e(2.1, 3.9)), True
        elif u < 8.9 * sc:                # trolley travel along the girder
            x, dy, att = lerp(A, B, e(3.9, 8.9)), DY_TRAVEL, True
        elif u < 10.6 * sc:               # lower onto the stack
            x, dy, att = B, lerp(DY_TRAVEL, rest_b, e(8.9, 10.6)), True
        elif u < 11.0 * sc:               # release (pause)
            x, dy, att = B, rest_b, False
        else:                             # raise the empty spreader
            x, dy, att = B, lerp(rest_b, DY_UP, e(11.0, 12.0)), False
        if att:
            cx, cdy = x, dy
        elif u < 2.1 * sc:
            cx, cdy = A, rest_a
        else:
            cx, cdy = B, rest_b
        # small pendulum sway driven by the trolley's acceleration and braking
        sway = 0.0
        if 3.9 * sc <= u < 8.9 * sc:
            p = (u - 3.9 * sc) / (5.0 * sc)
            sway = -2.0 * math.sin(2 * math.pi * p) * (1 if B > A else -1)
        elif 8.9 * sc <= u < 10.1 * sc:
            p = (u - 8.9 * sc) / (1.2 * sc)
            sway = 0.8 * math.sin(math.pi * p) * (1 - p) * (1 if B > A else -1)
        return x, dy, cx, cdy, att, sway

    # ---------------------------------------------------------------- render
    def compose(self, t):
        x, dy, cx, cdy, att, sway = self.state(t)
        out = self.plate.copy()
        x0, y0, x1, y1 = TROLLEY
        hx0, hy0, hx1, hy1 = HOIST
        # container (when resting it is drawn before the spreader)
        def paste(rgb, a, left, top):
            h, w = a.shape
            L, T_ = int(math.floor(left)), int(math.floor(top))
            fx, fy = left - L, top - T_
            # sub-pixel placement by bilinear shift of the sprite
            if fx or fy:
                rgb = rgb * (1 - fx) * (1 - fy) + np.roll(rgb, 1, 1) * fx * (1 - fy) + np.roll(rgb, 1, 0) * (1 - fx) * fy + np.roll(np.roll(rgb, 1, 0), 1, 1) * fx * fy
                a = a * (1 - fx) * (1 - fy) + np.roll(a, 1, 1) * fx * (1 - fy) + np.roll(a, 1, 0) * (1 - fx) * fy + np.roll(np.roll(a, 1, 0), 1, 1) * fx * fy
            ys, xs = slice(max(0, T_), min(out.shape[0], T_ + h)), slice(max(0, L), min(out.shape[1], L + w))
            sy, sx = slice(ys.start - T_, ys.stop - T_), slice(xs.start - L, xs.stop - L)
            aa = a[sy, sx][..., None]
            out[ys, xs] = out[ys, xs] * (1 - aa) + rgb[sy, sx] * aa

        off_x = hx0 - X_SHIP
        cont_left = cx + off_x + (sway if att else 0)
        paste(self.hoist_rgb, self.container_a, cont_left, hy0 + cdy)
        # cables, from the trolley sheaves to the headblock
        img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(img, "RGBA")
        head_y = HEAD_TOP + dy
        for k, s in enumerate(SHEAVES):
            top = (x + s, CABLE_TOP)
            bot = (x + s + sway, head_y + 1)
            d.line([top, bot], fill=(52, 46, 58, 235), width=2)
            d.line([(top[0] + 0.8, top[1]), (bot[0] + 0.8, bot[1])], fill=(255, 190, 120, 55), width=1)
        out = np.asarray(img).astype(np.float32)
        # spreader + headblock
        paste(self.hoist_rgb, self.spreader_a, x + off_x + sway, hy0 + dy)
        # parts of the painting that stay in front (crane legs, foreground stacks)
        out = out * (1 - self.occ) + self.art * self.occ
        # trolley last: it runs on top of the girder
        paste(self.trolley_rgb, self.trolley_a, x + (x0 - X_SHIP), y0)
        return out

    def trolley_box(self, t):
        x = self.state(t)[0]
        return (x - 70, 70, x + 70, 160)
