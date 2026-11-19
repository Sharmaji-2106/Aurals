"""Cross-codebase contracts that must not drift silently."""

import re
from pathlib import Path

import pytest

from auralis.acoustics.bands import BANDS

WEB_BANDS = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "bands.ts"


@pytest.mark.skipif(not WEB_BANDS.exists(), reason="web app not checked out alongside")
def test_frontend_bands_match_backend() -> None:
    source = WEB_BANDS.read_text(encoding="utf-8")
    entries = re.findall(r'key: "(\w+)".*?low: (\d+), high: (\d+)', source)
    assert [(k, float(lo), float(hi)) for k, lo, hi in entries] == [
        (b.key, b.low_hz, b.high_hz) for b in BANDS
    ]
