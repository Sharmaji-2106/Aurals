"""Community standing, and which products are in-ear monitors at all.

The measured match is the ranking. But the Olive in-ear model's prediction for a
listener carries a range several points wide, and inside that range two
earphones are not meaningfully different on measurement. What decides between
them, for a real buyer, is whether the earphone is easy to buy and whether
people who review earphones for a living recommend it. Standing says that, from
two kinds of recorded evidence:

- **Market**: how many retailers in the listener's market list it at a stored
  price (``iem_price_observations``). 3 or more counts fully.
- **Acclaim**: recommendations in published roundups and reviews
  (``data/iem/acclaim.json``, each with its URL and date). Two full-weight
  mentions count fully; store blogs carry half weight.

``score = 0.4 * market + 0.6 * acclaim`` (0 to 1), and it adds at most
``STANDING_POINTS`` to the ranking score — about the width of a prediction's
uncertainty, so it decides between near-equals and never lifts a poor match over
a good one. It is a rule of thumb, shown wherever it applies, and the measured
number is always shown beside it.

True-wireless earbuds are measured on the same rig as in-ear monitors, but they
are a different purchase; AURALS recommends wired IEMs, so they are left out by
name (``is_wireless``) and the page says how many were.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from auralis.recommend.base import Mention, Standing

ACCLAIM_PATH = Path(__file__).resolve().parents[4] / "data" / "iem" / "acclaim.json"
STANDING_POINTS = 3.0
MARKET_FULL = 3
ACCLAIM_FULL = 2.0

_WIRELESS = re.compile(
    r"\b(true[\s-]*wireless|tws|wireless|earbuds|air ?pods|free ?buds|galaxy buds|pixel buds|"
    r"echo buds|studio buds|link ?buds|wf-[\w-]+|wi-[\w-]+|powerbeats|soundcore|nothing ear|"
    r"n400|n5005|"
    r"soundsport free|free x|enco |enco$|\w*\d+bt\b|tone ultra|xb80bs)",
    re.I,
)
#: Brands whose in-ear range in the catalogue is wireless only.
_WIRELESS_BRANDS = {"jabra", "haylou", "earfun", "tronsmart", "lypertek", "vivo"}


def is_wireless(brand: str, model: str) -> bool:
    """True-wireless or Bluetooth earbuds, by name. Wired IEMs with a DSP cable are not."""
    return brand.lower() in _WIRELESS_BRANDS or bool(_WIRELESS.search(f"{brand} {model}"))


@lru_cache(maxsize=4)
def _acclaim(stamp: float) -> dict[str, list[tuple[Mention, float]]]:
    del stamp  # the cache key: the file's modification time
    data = json.loads(ACCLAIM_PATH.read_text(encoding="utf-8"))
    out: dict[str, list[tuple[Mention, float]]] = {}
    for src in data["sources"]:
        for slug, note in src["picks"].items():
            out.setdefault(slug, []).append(
                (
                    Mention(
                        publisher=src["publisher"],
                        title=src["title"],
                        url=src["url"],
                        published_on=src.get("published_on"),
                        note=note,
                    ),
                    float(src.get("weight", 1.0)),
                )
            )
    return out


def acclaim() -> dict[str, list[tuple[Mention, float]]]:
    try:
        return _acclaim(ACCLAIM_PATH.stat().st_mtime)
    except FileNotFoundError:
        return {}


def standing(slug: str, stores: int) -> Standing:
    mentions = acclaim().get(slug, [])
    market = min(1.0, stores / MARKET_FULL)
    praise = min(1.0, sum(w for _, w in mentions) / ACCLAIM_FULL)
    score = round(0.4 * market + 0.6 * praise, 3)
    return Standing(
        score=score,
        points=round(STANDING_POINTS * score, 2),
        stores=stores,
        mentions=[m for m, _ in mentions],
    )
