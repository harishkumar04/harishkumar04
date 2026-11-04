#!/usr/bin/env bash
# Encodes rendered frames into the README banner GIF.
# Ordered (Bayer) dithering keeps the sunset gradients stable from frame to frame,
# and diff_mode=rectangle only re-encodes the parts of each frame that change.
set -euo pipefail
FPS="${1:-10}"; FRAMES="${2:-build/banner-frames}"; OUT="${3:-assets/banner/shipping-harbor.gif}"
ffmpeg -v error -y -framerate "$FPS" -i "$FRAMES/%04d.png" \
  -vf "palettegen=max_colors=256:stats_mode=full" /tmp/banner-palette.png
ffmpeg -v error -y -framerate "$FPS" -i "$FRAMES/%04d.png" -i /tmp/banner-palette.png \
  -lavfi "paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 "$OUT"
ls -la "$OUT"
# preview at roughly GitHub's README display width
ffmpeg -v error -y -i assets/banner/shipping-harbor-static.png -vf "scale=830:-1:flags=lanczos" assets/banner/shipping-harbor-preview.png
ls -la assets/banner/shipping-harbor-preview.png
