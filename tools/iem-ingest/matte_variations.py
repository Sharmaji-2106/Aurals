"""Prototype an object-only matte for the real Variations studio photograph."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / "data/iem-images/originals/moondrop-variations/5d7161d41128c209.jpg"
name = sys.argv[1]
output = ROOT / f"data/iem/reports/variations-matte-{name}.png"
preview = ROOT / f"data/iem/reports/variations-matte-{name}-dark.jpg"
if output.exists() or preview.exists():
    raise FileExistsError(name)
with Image.open(source) as image:
    image.load()
    rgb = np.asarray(image.convert("RGB"))
height, width, _ = rgb.shape
level = rgb.max(axis=2)
core = level < int(sys.argv[2])
# The product ends above the studio shadow and reflection.
core[730:, :] = False
core = ndi.binary_closing(core, structure=np.ones((5, 5), bool), iterations=2)
labels, count = ndi.label(core)
sizes = np.bincount(labels.ravel())
sizes[0] = 0
keep = np.argsort(sizes)[-3:]
mask = np.isin(labels, keep)
mask = ndi.binary_fill_holes(mask)
mask = ndi.binary_closing(mask, structure=np.ones((9, 9), bool), iterations=1)
mask = ndi.binary_fill_holes(mask)
mask = ndi.binary_erosion(mask, iterations=1)
rgba = Image.fromarray(rgb, "RGB").convert("RGBA")
alpha = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.7))
rgba.putalpha(alpha)
rgba.save(output)
dark = Image.new("RGBA", rgba.size, "#1a1c22")
dark.alpha_composite(rgba)
dark.convert("RGB").save(preview, quality=95)
print(f"{output} foreground pixels {mask.sum()} components {count}")
