# Shipping harbor banner: animation source

The README banner is the master artwork (`../master-artwork.png`), animated in place.
Nothing in the artwork is redrawn. Each effect is a small masked change to the original
pixels, so the illustration keeps its quality, colours and composition.

## Files

| File | Purpose |
|---|---|
| `animate.py` | Renders the frames and encodes `../shipping-harbor.gif` plus `../shipping-harbor-static.png`. |
| `regions.json` | Where things are in the artwork (ocean, clouds, sun, ships, suspended container, light area), in 0–1 coordinates. Adjust these if the artwork changes. |
| `preview.html` | HTML/CSS version of the status panel over the artwork, with a working countdown. |

## Build

```bash
python3 animate.py ../master-artwork.png build            # 24 s loop, 8 fps, GIF 1000 px wide
cp build/shipping-harbor.gif build/shipping-harbor-static.png ..
```

Requires Python 3 with NumPy and Pillow, plus ffmpeg. gifsicle is optional.

## Animation techniques

### Working crane (`crane.py`)

The artwork is a single flattened painting, so the crane's moving parts are separated from it once, at full resolution.

- **Background plate:** a copy of the artwork with the trolley, cables, spreader and container removed.
  - Behind the trolley, the girder is rebuilt from the identical section next to it.
  - Behind the hoist, the sky is filled smoothly from its surroundings, using sky-coloured pixels only, and given real cloud texture borrowed from nearby sky.
- **Cutouts:** soft-edged mattes of the trolley, spreader and container. They are the difference between the artwork and the plate, keeping only the pieces connected to the parts, so stray cloud specks drop out.
- **Occluders:** parts of the painting that stay in front of a moving container. These are the crane legs and braces (matted by brightness, since the steel is dark against the sky), the portal crossbeam, and the foreground terminal stacks.
- **Each frame:**
  - The trolley runs along the girder.
  - Four hoist cables are redrawn from the trolley sheaves to the headblock, so they never disconnect.
  - The spreader carries the container or travels empty.
  - A small pendulum sway follows the trolley's acceleration and braking.

**Timeline (24 s seamless loop):**

1. **Load (0–12 s):**
   - Lower the spreader to a container on the lane behind the portal crossbeam, lock, and lift it clear.
   - Travel right along the girder (5 s).
   - Lower onto the ship's stack, release, and raise the empty spreader.
2. **Unload (12–24 s):** the reverse. Pick the container up from the ship, carry it back, lower it behind the crossbeam, release, and raise.

The final state equals the starting state, so the GIF loops without a jump.

### Environment (`animate.py`)

- **Ocean:** a displacement field of travelling waves, stronger near the viewer and fading towards the horizon, warping only the water pixels. Glints in the sun's path shimmer by brightening pixels that are already bright.
- **Clouds:** selected cloud masses drift a few pixels back and forth. The sun and the distant ships are masked out, and a soft warm glow pulses around the sun.
- **Main ship:** sub-pixel vertical rocking, feathered so it stays anchored to the quay.
- **Distant ships:** a slight drift towards the horizon and back, plus bobbing.
- **Lights:** existing harbor lights get a soft glow, and a few twinkle. The crane's own lights travel with the trolley.
- **Loop timing:** every environmental motion repeats every 12 s, which divides the 24 s loop.

### Encoding

- **Ordered dithering:** ffmpeg uses ordered (Bayer) dithering, which keeps the sky stable from frame to frame.
- **Changed-rectangle encoding:** each frame stores only the part that changed, which keeps the file smaller.
- **No lossy pass:** lossy GIF compression accumulates error across frames and makes the loop point visibly jump.

## Status panel and countdown

- **In the GIF:** the panel is drawn into the frames, because GitHub does not run JavaScript. Its countdown ticks down once per second for the 24 s loop, then repeats. It is decorative.
- **Sizing:** the panel is sized so the digits stay readable at GitHub's README width, and it stays clear of the crane's working area.
- **In `preview.html`:** the countdown really updates every second.
  - Set the duration with `data-duration="HH:MM:SS"` on the panel, or with `?duration=HH:MM:SS` in the URL.
  - When it reaches zero, it resets to the configured duration.
  - It is not connected to any real shipment schedule.
