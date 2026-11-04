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
python3 animate.py ../master-artwork.png build --width 1200 --fps 12 --loop 10
cp build/shipping-harbor.gif build/shipping-harbor-static.png ..
```

Requires Python 3 with NumPy and Pillow, plus ffmpeg.

## Animation techniques

- **Ocean:** a displacement field of travelling waves. It is stronger near the viewer and fades towards the horizon, warping only the water pixels. Glints in the sun's path shimmer by brightening pixels that are already bright.
- **Clouds:** selected cloud masses drift a few pixels back and forth using feathered masks. The sun is masked out and never moves. A soft warm glow pulses around it.
- **Main ship:** sub-pixel vertical rocking, feathered so it stays anchored to the quay.
- **Distant ships:** a slight drift towards the horizon and back, plus bobbing.
- **Suspended container:** sways and lifts a little. The motion fades to zero at the trolley, so the cables bend instead of detaching.
- **Lights:** existing warm light sources are detected automatically and given a soft glow. A few of them twinkle.
- **Seamless loop:** every motion completes a whole number of cycles per loop, so the last frame flows into the first.
- **GIF encoding:** ffmpeg with ordered (Bayer) dithering, which keeps the sky stable between frames, and changed-rectangle encoding, which keeps the file small.

## Status panel and countdown

- **In the GIF:** the panel is drawn into the frames, because GitHub does not run JavaScript. Its countdown ticks down for one loop and repeats. It is decorative.
- **In `preview.html`:** the countdown really updates every second.
  - Set the duration with `data-duration="HH:MM:SS"` on the panel, or with `?duration=HH:MM:SS` in the URL.
  - When it reaches zero, it resets to the configured duration.
  - It is not connected to any real shipment schedule.
