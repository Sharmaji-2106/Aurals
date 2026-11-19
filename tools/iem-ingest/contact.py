"""Make a visual review sheet of original candidate images, without editing them."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
records = json.loads((ROOT / "data/iem/reports/image-probe.json").read_text(encoding="utf-8"))
groups: dict[str, list[dict]] = {}
for row in records:
    if "file" in row:
        groups.setdefault(row["handle"], []).append(row)

tile_w, tile_h = 300, 350
sheet = Image.new("RGB", (tile_w * 5, tile_h * 3), "#17191f")
draw = ImageDraw.Draw(sheet)
for index, (slug, items) in enumerate(groups.items()):
    row = max(items, key=lambda item: item["quality_score_heuristic"])
    image = Image.open(ROOT / row["file"])
    image.load()
    image.thumbnail((270, 270))
    x, y = (index % 5) * tile_w, (index // 5) * tile_h
    sheet.paste(image, (x + (tile_w - image.width) // 2, y + 5))
    draw.text((x + 8, y + 285), slug[:38], fill="white")
    draw.text((x + 8, y + 307), f"{row['width']}x{row['height']} {row['format']}", fill="#bbbbbb")
    draw.text((x + 8, y + 328), Path(row["file"]).name, fill="#888888")
destination = ROOT / "data/iem/reports/image-contact-sheet.jpg"
if destination.exists():
    raise FileExistsError(destination)
sheet.save(destination, quality=94)
print(destination)
