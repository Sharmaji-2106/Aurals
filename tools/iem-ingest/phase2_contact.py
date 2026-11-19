"""Create model-row contact sheets for manual image verification."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data/iem/reports"


def run(batch: int) -> None:
    records = json.loads((ROOT / f"data/iem/processed/phase2-image-batch{batch}-candidates.json").read_text(encoding="utf-8"))
    grouped = defaultdict(list)
    for row in records:
        if "file" in row:
            grouped[row["slug"]].append(row)
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default()
    small = ImageFont.truetype(str(font_path), 15) if font_path.exists() else ImageFont.load_default()
    models = list(grouped)
    for sheet_no in range((len(models) + 6) // 7):
        section = models[sheet_no * 7:(sheet_no + 1) * 7]
        canvas = Image.new("RGB", (1120, len(section) * 380), "#e5e7eb")
        draw = ImageDraw.Draw(canvas)
        for row_no, slug in enumerate(section):
            y = row_no * 380
            draw.text((15, y + 4), slug, font=font, fill="#111827")
            for image_no, record in enumerate(grouped[slug][:3]):
                x = 10 + image_no * 370
                try:
                    with Image.open(ROOT / record["file"]) as source:
                        source.load()
                        image = source.convert("RGBA")
                    image.thumbnail((345, 320))
                    box = Image.new("RGBA", (350, 320), "white")
                    box.alpha_composite(image, ((350-image.width)//2, (320-image.height)//2))
                    canvas.paste(box.convert("RGB"), (x, y + 30))
                    label = f"{image_no + 1}: {record['width']}x{record['height']} {record['quality_score_heuristic']}"
                    draw.text((x + 4, y + 354), label, font=small, fill="#111827")
                except OSError:
                    draw.text((x + 4, y + 50), "DECODE FAILED", font=font, fill="red")
        target = REPORTS / f"phase2-batch{batch}-sheet-{sheet_no + 1}.png"
        with target.open("xb") as handle:
            canvas.save(handle, format="PNG")
        print(target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=int)
    run(parser.parse_args().batch)
