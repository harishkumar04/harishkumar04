# Shipping harbor banner

The README banner is drawn in code and rendered to a GIF so it plays reliably on GitHub
(GitHub does not run JavaScript, and animated SVG timing differs between browsers).

| File | What it is |
|---|---|
| `scene.mjs` | The whole scene as a function of time `scene(t)`: sky, sun, sea, harbor, cranes, ships, status panel. Every motion repeats within the 12 s loop, so the GIF loops seamlessly. |
| `render.mjs` | Renders the frames with Playwright, plus `assets/banner/shipping-harbor-static.png` and the SVG source snapshot. |
| `make-gif.sh` | Encodes the frames with ffmpeg (Bayer dithering, changed-rectangle encoding) and writes the preview PNG. |

## Rebuild

```bash
node scripts/banner/render.mjs 10     # 10 fps -> 120 frames in build/banner-frames
bash scripts/banner/make-gif.sh 10    # -> assets/banner/shipping-harbor.gif + preview PNG
```

## How the loop works

- **Ships:** ship *i* sits at path position `u = i + t/12`. Over one loop every ship moves exactly
  to the next ship's position and size, a new ship slides out from behind the docked one, and the
  farthest fades into the sun glare, so the ships keep sailing with no visible reset.
- **Crane:** lowers onto a yard truck, hoists, travels over the ship and lowers the container into
  an open hatch. The empty truck drives off behind the hull while the next loaded truck rolls in.
- **Status panel:** the countdown is a looping display (it ticks down 12 seconds and repeats).
  It is not a live countdown.
