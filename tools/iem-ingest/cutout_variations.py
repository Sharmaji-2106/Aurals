"""Isolate the selected product from its studio photograph.

    python -I design/book/cutout.py

Input: web/public/book/products/nova-studio.jpg — Truthear's own photograph of
Nova on white, unaltered (see edition.ts for its source).

Output, at exactly the input's size and registration, so either can be laid
over the printed photograph without moving a pixel:

- nova-cutout.png — the earphones alone, alpha-matted.
- nova-shadow.png — the soft studio shadow and reflection under them, as black
  with alpha, so that over a light page it looks as it does in the photograph.

How the matte is made, and what it does not do:

- The background is the near-white region *connected to the border*, found by
  flood fill. Highlights inside the shells are near-white too, but enclosed, so
  they stay part of the product.
- The edge is softened over a pixel or two and its colour decontaminated: a
  pixel that is part white background has the white subtracted back out, so
  no light fringe survives against a dark or coloured page.
- No pixel of the product is repainted, regenerated or retouched. This is a
  matte, not an edit.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "iem-images" / "originals" / "moondrop-variations" / "5d7161d41128c209.jpg"
OUT = ROOT / "data" / "iem" / "reports" / "variations-cutout-trial"


def main() -> None:
    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32) / 255.0
    h, w, _ = rgb.shape
    darkness = 1.0 - rgb.min(axis=2)  # 0 on pure white

    # Background seed: near-white pixels connected to the frame.
    near_white = (darkness < 0.035).astype(np.uint8)
    flood = near_white.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood[y, x]:
            cv2.floodFill(flood, mask, (x, y), 2)
    background = flood == 2

    # The product: clearly darker than the backdrop, holes (highlights) filled.
    core = (darkness > 0.16).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    filled = core.copy()
    contours, _ = cv2.findContours(core, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    big = [c for c in contours if cv2.contourArea(c) > 0.004 * w * h]
    filled[:] = 0
    cv2.drawContours(filled, big, -1, 1, thickness=cv2.FILLED)

    # The studio's contact reflection — a neutral grey band just under each
    # shell — is dark enough to pass for product. It is cut at each shell's
    # true bottom: the last row that still has genuinely dark shell in it.
    # In the lowest tenth of each piece only the genuinely dark shell is kept;
    # the light-grey reflection goes to the shadow layer. (The ear tips are
    # light grey too, but they sit far higher, so they are untouched.)
    value = rgb.max(axis=2)
    for c in big:
        x, y, bw, bh = cv2.boundingRect(c)
        y0 = y + int(bh * 0.9)
        region = filled[y0 : y + bh + 3, x : x + bw]
        region &= (value[y0 : y + bh + 3, x : x + bw] < 0.27).astype(np.uint8)
        # Keep only the part still joined to the shell above it.
        n, labels = cv2.connectedComponents(filled[y : y + bh + 3, x : x + bw])
        if n > 2:
            sizes = [(labels == k).sum() for k in range(1, n)]
            keep = 1 + int(np.argmax(sizes))
            filled[y : y + bh + 3, x : x + bw] = (labels == keep).astype(np.uint8)
    # The rule above can punch pin-holes into the shell's own dark base; the
    # product is solid, so fill whatever its outline encloses.
    outlines, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled[:] = 0
    cv2.drawContours(filled, [c for c in outlines if cv2.contourArea(c) > 0.004 * w * h], -1, 1, thickness=cv2.FILLED)
    # One pixel in from the edge, so no white backdrop survives in the matte.
    filled = cv2.erode(filled, np.ones((3, 3), np.uint8), iterations=1)
    product = filled.astype(np.float32)

    # The ear tips' outer rim is light grey. Printed onto ivory it disappears;
    # composited as a cutout and magnified it reads as a halo. Within a few
    # pixels of the outline, light pixels are background.
    inside = cv2.distanceTransform(filled, cv2.DIST_L2, 3)
    rim = (inside > 0) & (inside < 4.5) & (value > 0.66)
    product = np.where(rim, 0, filled).astype(np.float32)

    # Soft edge: a feathered matte that hugs the core.
    alpha = cv2.GaussianBlur(product, (0, 0), 0.8)
    alpha = np.clip((alpha - 0.12) / 0.7, 0, 1)

    # Decontaminate: I = a*C + (1-a)*white  =>  C = (I - (1-a)) / a
    a3 = alpha[..., None]
    colour = np.where(a3 > 0.02, (rgb - (1 - a3)) / np.maximum(a3, 1e-3), rgb)
    colour = np.clip(colour, 0, 1)
    cutout = np.dstack([colour, alpha])
    Image.fromarray((cutout * 255 + 0.5).astype(np.uint8), "RGBA").save(OUT / "nova-cutout.png", optimize=True)

    # The studio shadow: what is left that is darker than white and is not
    # the product, as black with the darkness as its alpha.
    shade = np.clip(darkness * (1 - alpha) * 1.04, 0, 1)
    shade = np.where(background, np.minimum(shade, darkness), shade)
    shadow = np.dstack([np.zeros((h, w, 3), np.float32), shade])
    Image.fromarray((shadow * 255 + 0.5).astype(np.uint8), "RGBA").save(OUT / "nova-shadow.png", optimize=True)

    # Where each earpiece is, in the image's own 0–1 coordinates: the camera
    # needs a point to push toward.
    boxes = []
    for c in sorted(big, key=lambda c: cv2.boundingRect(c)[0]):
        x, y, bw, bh = cv2.boundingRect(c)
        boxes.append({"x": x / w, "y": y / h, "w": bw / w, "h": bh / h})
    ys, xs = np.nonzero(alpha > 0.5)
    pair = {"x": xs.min() / w, "y": ys.min() / h, "w": (xs.max() - xs.min()) / w, "h": (ys.max() - ys.min()) / h}
    (OUT / "nova-cutout.json").write_text(json.dumps({"pair": pair, "pieces": boxes}, indent=2), encoding="utf-8")
    print("pair", {k: round(v, 3) for k, v in pair.items()}, "pieces", len(boxes))

    # Review: the cutout over navy and over ivory, side by side.
    review = Image.new("RGB", (w * 2, h))
    for i, bg in enumerate([(23, 29, 69), (241, 229, 209)]):
        canvas = Image.new("RGBA", (w, h), bg + (255,))
        canvas.alpha_composite(Image.fromarray((shadow * 255).astype(np.uint8), "RGBA"))
        canvas.alpha_composite(Image.fromarray((cutout * 255).astype(np.uint8), "RGBA"))
        review.paste(canvas.convert("RGB"), (i * w, 0))
    review.save(OUT / "cutout-review.jpg", quality=90)


if __name__ == "__main__":
    main()
