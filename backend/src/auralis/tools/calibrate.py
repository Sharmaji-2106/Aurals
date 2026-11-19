"""Build ``analysis/calibration.json`` from a corpus file of YouTube video ids.

The corpus format is a TSV of ``video_id<TAB>genre<TAB>title`` with ``#`` comments.
Each metric's calibration is the corpus median and a robust standard deviation
(IQR / 1.349), so descriptors read 0.5 for a corpus-typical track.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from importlib import resources
from pathlib import Path

import numpy as np

from auralis.analysis.descriptors import raw_metrics
from auralis.core.time import utcnow
from auralis.music.acquire import fetch_and_extract

log = logging.getLogger(__name__)

MIN_SCALE = {"percussive_ratio": 0.02, "log10_flatness": 0.05}


def read_corpus(path: Path) -> list[tuple[str, str]]:
    rows = []
    for line in path.read_text("utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            video_id, genre, *_ = line.split("\t")
            rows.append((video_id.strip(), genre.strip()))
    return rows


def run(corpus: Path, output: Path | None = None, workers: int = 3) -> Path:
    rows = read_corpus(corpus)

    def analyse(row: tuple[str, str]) -> tuple[str, dict[str, float]] | None:
        try:
            return row[1], raw_metrics(fetch_and_extract(row[0]).features)
        except Exception:
            log.exception("calibration track %s failed", row[0])
            return None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = [r for r in pool.map(analyse, rows) if r is not None]
    if len(results) < 10:
        raise SystemExit(f"only {len(results)} tracks analysed; refusing to calibrate on so few")

    metrics: dict[str, tuple[float, float]] = {}
    for name in results[0][1]:
        values = np.array([m[name] for _, m in results])
        q25, median, q75 = np.percentile(values, [25, 50, 75])
        scale = max(float(q75 - q25) / 1.349, MIN_SCALE.get(name, 0.25))
        metrics[name] = (round(float(median), 4), round(scale, 4))

    genres = Counter(g for g, _ in results)
    payload = {
        "id": f"corpus-{utcnow():%Y-%m}",
        "description": (
            f"Provisional calibration from {len(results)} commercially released tracks across "
            f"{len(genres)} genres ({corpus.name}). Small and hand-picked: treat descriptor "
            "values as relative indications, not population percentiles."
        ),
        "track_count": len(results),
        "metrics": metrics,
    }
    target = output or Path(str(resources.files("auralis.analysis").joinpath("calibration.json")))
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return target
