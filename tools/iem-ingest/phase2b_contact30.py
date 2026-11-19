"""Build 30-primary image review sheets from a staged approved-source manifest."""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
batch = int(sys.argv[1])
rows = [json.loads(line) for line in (ROOT / f"data/iem/processed/phase2-batch{batch}-library-sources.jsonl")
        .read_text(encoding="utf-8").splitlines()]
primaries = [row for row in rows if row["role"] == "original"]
out = ROOT / "data/iem/reports/contact-sheets"
out.mkdir(parents=True, exist_ok=True)
font_path = Path("C:/Windows/Fonts/arial.ttf")
font = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
for sheet_no, start in enumerate(range(0, len(primaries), 30), 1):
    section = primaries[start:start + 30]
    canvas = Image.new("RGB", (2100, 1740), "#e5e7eb")
    draw = ImageDraw.Draw(canvas)
    for offset, row in enumerate(section):
        x, y = (offset % 5) * 420, (offset // 5) * 290
        with Image.open(ROOT / "data/iem-images" / row["file_path"]) as opened:
            opened.load()
            art = opened.convert("RGBA")
        art.thumbnail((405, 245))
        panel = Image.new("RGBA", (410, 245), "white")
        panel.alpha_composite(art, ((410 - art.width) // 2, (245 - art.height) // 2))
        canvas.paste(panel.convert("RGB"), (x + 5, y + 28))
        draw.text((x + 5, y + 3), row["slug"][:40], fill="#111827", font=font)
        draw.text((x + 5, y + 273), f"{row['source_name']} {row['width']}x{row['height']}", fill="#111827", font=font)
    target = out / f"phase2b-batch{batch}-primary-{sheet_no}.png"
    with target.open("xb") as handle:
        canvas.save(handle, format="PNG")
    print(target)
