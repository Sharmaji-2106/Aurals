"""Compare parser cost on the same already-cached public HTML response."""

from __future__ import annotations

import hashlib
import json
import statistics
import time
from pathlib import Path

from lxml import html
from scrapy import Selector
from scrapling.parser import Adaptor
from selectolax.lexbor import LexborHTMLParser

ROOT = Path(__file__).resolve().parents[2]
URL = "https://headphones.com/pages/hps-iem-ranking"
PATH = ROOT / "data/iem/raw/headphones.com" / (hashlib.sha256(URL.encode()).hexdigest() + ".bin")
PAGE = PATH.read_bytes()


def measure(name: str, parser: object) -> dict[str, object]:
    durations = []
    found = 0
    for _ in range(20):
        start = time.perf_counter()
        found = len(parser(PAGE))  # type: ignore[operator]
        durations.append((time.perf_counter() - start) * 1000)
    return {"name": name, "median_ms": round(statistics.median(durations), 3),
            "img_tags": found, "input_bytes": len(PAGE),
            "note": "public ranking page; model table absent from static HTML; generic captcha script is not a challenge"}


results = [
    measure("selectolax", lambda data: LexborHTMLParser(data).css("img")),
    measure("lxml", lambda data: html.fromstring(data).cssselect("img")),
    measure("Scrapy Selector", lambda data: Selector(text=data.decode("utf-8", "replace")).css("img")),
    measure("Scrapling Adaptor", lambda data: Adaptor(data).css("img")),
]
target = ROOT / "data/iem/reports/extractor-probe.json"
if target.exists():
    raise FileExistsError(target)
target.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
