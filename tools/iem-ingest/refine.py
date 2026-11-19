"""Build the reviewed close-up matte for Variations, leaving source RGB intact."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / "data/iem-images/originals/moondrop-variations/8c5adde1907ce138.jpg"
destination = ROOT / "data/iem-images/moondrop-variations-display-v2.webp"
preview = ROOT / "data/iem/reports/variations-v2-dark-preview.jpg"
if destination.exists() or preview.exists():
    raise FileExistsError("v2 output already exists")

with Image.open(source) as image:
    image.load()
    rgb = image.convert("RGB")
width, height = rgb.size
pixels = rgb.load()
assert pixels is not None
alpha = Image.new("L", rgb.size, 255)
mask = alpha.load()
assert mask is not None
queue = deque([(x, 0) for x in range(width)] + [(x, height - 1) for x in range(width)]
              + [(0, y) for y in range(height)] + [(width - 1, y) for y in range(height)])
visited = set()
while queue:
    x, y = queue.popleft()
    if (x, y) in visited:
        continue
    visited.add((x, y))
    r, g, b = pixels[x, y]
    if min(r, g, b) < 225 or max(r, g, b) - min(r, g, b) > 20:
        continue
    mask[x, y] = 0
    for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
        if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
            queue.append((nx, ny))
rgba = rgb.convert("RGBA")
rgba.putalpha(alpha.filter(ImageFilter.MinFilter(3)))
rgba.save(destination, format="WEBP", quality=92)
background = Image.new("RGBA", rgba.size, "#1a1c22")
background.alpha_composite(rgba)
background.convert("RGB").save(preview, quality=94)
print(destination)
