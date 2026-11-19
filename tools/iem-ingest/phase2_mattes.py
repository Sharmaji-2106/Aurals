"""Trial studio-backdrop mattes; originals remain untouched and unindexed trials stay in reports."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "data/iem-images"
REPORTS = ROOT / "data/iem/reports"


def matte(source: Path, target: Path) -> dict[str, float | str]:
    with Image.open(source) as opened:
        opened.load()
        rgb = np.asarray(opened.convert("RGB"), dtype=np.float32)
    height, width, _ = rgb.shape
    corner = np.concatenate((rgb[:min(40, height), :min(40, width)].reshape(-1, 3),
                             rgb[:min(40, height), -min(40, width):].reshape(-1, 3),
                             rgb[-min(40, height):, :min(40, width)].reshape(-1, 3)))
    background = np.median(corner, axis=0)
    if background.min() < 215 or background.max() - background.min() > 28:
        return {"status": "non-plain border", "background_min": float(background.min())}
    distance = np.max(np.abs(rgb - background), axis=2)
    near = distance < 34
    seed = np.zeros((height, width), dtype=bool)
    seed[0, :] = near[0, :]
    seed[-1, :] = near[-1, :]
    seed[:, 0] = near[:, 0]
    seed[:, -1] = near[:, -1]
    backdrop = ndimage.binary_propagation(seed, mask=near, structure=np.ones((3, 3), dtype=bool))
    foreground = ~backdrop
    alpha = ndimage.gaussian_filter(foreground.astype(np.float32), sigma=0.7)
    alpha = np.clip((alpha - 0.06) / 0.88, 0, 1)
    # The product's fully opaque RGB pixels are copied exactly. Only partially
    # transparent edge pixels are decontaminated from their studio backdrop.
    output_rgb = rgb.copy()
    edge = (alpha > 0.02) & (alpha < 0.995)
    if edge.any():
        a = alpha[edge, None]
        output_rgb[edge] = np.clip((rgb[edge] - (1 - a) * background) / a, 0, 255)
    rgba = np.concatenate((output_rgb, alpha[..., None] * 255), axis=2)
    Image.fromarray(np.rint(rgba).astype(np.uint8), "RGBA").save(target, optimize=True)
    return {"status": "trial", "background_min": float(background.min()),
            "foreground_fraction": round(float((alpha > 0.5).mean()), 4)}


def run(batch: int) -> None:
    rows = [json.loads(line) for line in (ROOT / f"data/iem/processed/phase2-batch{batch}-library-sources.jsonl")
            .read_text(encoding="utf-8").splitlines()]
    originals = [row for row in rows if row["role"] == "original"]
    folder = REPORTS / f"matte-trials-batch{batch}"
    folder.mkdir(parents=True, exist_ok=True)
    outcomes = []
    for row in originals:
        target = folder / f"{row['slug']}.png"
        if target.exists():
            raise FileExistsError(target)
        outcome = matte(LIB / row["file_path"], target)
        outcomes.append({"slug": row["slug"], "file": str(target.relative_to(ROOT)) if target.exists() else None,
                         **outcome})
        print(row["slug"], outcome)
    metadata = REPORTS / f"phase2-batch{batch}-matte-trials.json"
    with metadata.open("x", encoding="utf-8") as handle:
        json.dump(outcomes, handle, indent=2)
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 19) if font_path.exists() else ImageFont.load_default()
    for sheet in range((len(originals) + 6) // 7):
        section = originals[sheet * 7:(sheet + 1) * 7]
        canvas = Image.new("RGB", (960, len(section) * 340), "#e5e7eb")
        draw = ImageDraw.Draw(canvas)
        for n, row in enumerate(section):
            y = n * 340
            draw.text((10, y + 3), row["slug"], font=font, fill="black")
            trial = folder / f"{row['slug']}.png"
            if not trial.exists():
                draw.text((10, y + 50), "No matte: non-plain backdrop", font=font, fill="red")
                continue
            with Image.open(trial) as source:
                art = source.convert("RGBA")
            art.thumbnail((460, 300))
            for side, backdrop in enumerate(((19, 23, 44, 255), (240, 235, 227, 255))):
                panel = Image.new("RGBA", (470, 300), backdrop)
                panel.alpha_composite(art, ((470-art.width)//2, (300-art.height)//2))
                canvas.paste(panel.convert("RGB"), (10 + side * 475, y + 30))
        out = REPORTS / f"phase2-batch{batch}-mattes-sheet-{sheet + 1}.png"
        with out.open("xb") as handle:
            canvas.save(handle, format="PNG")
        print(out)


if __name__ == "__main__":
    import sys
    run(int(sys.argv[1]))
