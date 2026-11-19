"""Driver configurations, read from the retailer listings AURALS already saved.

The measurement sources carry no driver information, so it is read from the
product pages of the shops whose prices are stored (their saved Shopify feeds,
see ``data/iem/market``): the text the shop published for that exact product.

Reading is deliberately strict, because a wrong driver type is worse than none:

- **Stated configurations** count: "1DD + 4BA", "2 dynamic + 4 balanced armature",
  "Driver: 14.5mm planar magnetic". A configuration that trails off ("1DD + 2BA +")
  is incomplete and ignored.
- **Prose** counts only when it names one driver technology ("a 10mm dynamic
  driver"), or several *and* calls the product a hybrid / tribrid. Prose that
  merely mentions armatures, as comparisons often do, is not read.
- **Every source must agree** on which technologies are inside. One that
  disagrees makes the product unknown rather than a guess.

Counts are kept only when they were stated. ``build_index`` writes the record
(``data/iem/drivers.json``) with the quote and the URL it came from;
``import_index`` copies it into ``iems.driver_config``, filling only products
with nothing recorded — hand-entered configurations are never overwritten.

Driver type is product metadata. The recommender never ranks or filters by it;
the results page only uses it to show the best-matching earphone of each kind.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.iem.models import Iem, IemPriceObservation

Kind = Literal[
    "dynamic", "balanced_armature", "planar", "electrostatic", "piezo", "bone_conduction"
]
Category = Literal["dynamic", "balanced_armature", "planar", "hybrid"]

#: Saved feeds: the shop's domain and the file under ``data/iem``.
FEEDS: dict[str, str] = {
    "headphonezone.in": "market/india/feed-headphonezone.json",
    "conceptkart.com": "market/india/feed-conceptkart.json",
    "avstore.in": "market/india/feed-avstore.json",
    "ooberpad.com": "market/india/feed-ooberpad.json",
    "proaudiobrands.in": "market/india/feed-proaudiobrands.json",
    "prohifi.in": "market/india/feed-prohifi.json",
    "theaudiostore.in": "market/india/feed-theaudiostore.json",
    "bajaao.com": "market/india/feed-bajaao-iems.json",
    "linsoul.com": "processed/linsoul-products.json",
    "audio46.com": "processed/phase2-audio46-products.json",
    "apos.audio": "processed/phase2-apos-products.json",
}

_WORD_COUNT = {
    "single": 1,
    "one": 1,
    "dual": 2,
    "twin": 2,
    "two": 2,
    "triple": 3,
    "three": 3,
    "quad": 4,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "ten": 10,
    "twelve": 12,
}
_KIND_PATTERNS: list[tuple[Kind, str]] = [
    (
        "planar",
        r"micro[\s-]*planar(?:\s+drivers?)?|planar(?:[\s-]*magnetic)?(?:\s+drivers?)?|PMD|PD",
    ),
    ("dynamic", r"dynamic(?:\s+drivers?)?|DD"),
    ("balanced_armature", r"balanced[\s-]*armatures?(?:\s+drivers?)?|BAs?"),
    ("electrostatic", r"electrostatic(?:\s+drivers?)?|ESTs?"),
    ("piezo", r"piezo(?:electric)?(?:\s+ceramic)?(?:\s+drivers?)?|PZTs?"),
    ("bone_conduction", r"bone[\s-]*conduction(?:\s+drivers?)?|BCDs?"),
]
_KIND = "|".join(f"(?P<{k}>{p})" for k, p in _KIND_PATTERNS)
_COUNT = r"\d{1,2}(?!\d)|" + "|".join(_WORD_COUNT)
#: One stated element: a count, an optional "x 10mm", then the technology.
_TOKEN = rf"\b(?P<n>{_COUNT})\s*(?:x\s*(?:\d{{1,2}}(?:\.\d+)?\s*mm\s*)?)?(?:{_KIND})\b"
_JOIN = r"\s*(?:\+|&|,|\band\b|\bplus\b)\s*"
_CONFIG = re.compile(rf"(?:{_TOKEN})(?:{_JOIN}(?:{_TOKEN.replace('?P<', '?P<x_')}))*", re.I)
_ONE_TOKEN = re.compile(_TOKEN, re.I)
_SPEC_FIELD = re.compile(
    r"\b(?:driver(?:s|\s+units?|\s+configuration|\s+config|\s+type)?|transducers?|configuration)"
    r"\s*[:\uff1a]\s*(?P<value>[^:\uff1a]{3,90})",
    re.I,
)
#: Technologies named in prose, with "driver" or the technology's own name as context.
_PROSE: list[tuple[Kind, re.Pattern[str]]] = [
    (
        "dynamic",
        re.compile(r"\bdynamic\s+drivers?\b|\b\d+(?:\.\d+)?\s*mm\s+(?:[\w-]+\s+){0,3}?DD\b", re.I),
    ),
    ("balanced_armature", re.compile(r"\bbalanced[\s-]*armatures?\b", re.I)),
    (
        "planar",
        re.compile(
            r"\bplanar(?:[\s-]*magnetic)?\s+(?:diaphragm\s+)?drivers?\b|\bplanar[\s-]*magnetic\b",
            re.I,
        ),
    ),
    ("electrostatic", re.compile(r"\belectrostatic\s+drivers?\b", re.I)),
    ("piezo", re.compile(r"\bpiezo(?:electric)?(?:\s+ceramic)?\s+drivers?\b", re.I)),
    ("bone_conduction", re.compile(r"\bbone[\s-]*conduction\s+drivers?\b", re.I)),
]
_HYBRID_WORD = re.compile(r"\b(?:hybrid|tribrid|quadbrid|quad-brid|tri-brid)\b", re.I)


@dataclass(frozen=True)
class Reading:
    """What one listing says is inside. ``None`` counts: present, number not stated."""

    counts: dict[str, int | None]
    quote: str
    strength: Literal["stated", "prose"]

    @property
    def kinds(self) -> frozenset[str]:
        return frozenset(self.counts)


def _count(word: str) -> int:
    return int(word) if word.isdigit() else _WORD_COUNT[word.lower()]


def _kind_of(groups: dict[str, str | None], prefix: str = "") -> Kind:
    for kind, _ in _KIND_PATTERNS:
        if groups.get(prefix + kind):
            return kind
    raise ValueError("no driver kind matched")


def _stated(text: str) -> tuple[Reading | None, bool]:
    """The fullest stated configuration, and whether the listing trailed off anywhere.

    A configuration is *strong* when it lists several elements ("1DD + 4BA") or uses
    the trade shorthand ("8BA"); a lone spelled-out element ("a single balanced
    armature") may be one half of a hybrid described in prose, so it is weak.
    """
    found: list[tuple[dict[str, int | None], str, bool]] = []
    partial = False
    for m in _CONFIG.finditer(text):
        rest = text[m.end() : m.end() + 3]
        if re.match(r"\s*\+", rest):
            partial = True  # trails off into something we can't read: incomplete
            continue
        counts: dict[str, int | None] = {}
        tokens = list(_ONE_TOKEN.finditer(m.group(0)))
        for t in tokens:
            kind = _kind_of(t.groupdict())
            counts[kind] = (counts.get(kind) or 0) + _count(t.group("n"))
        shorthand = all(
            t.group("n").isdigit()
            and re.fullmatch(
                r"\d{1,2}\s*(?:DD|BAs?|ESTs?|PD|PMD|PZTs?|BCDs?)", t.group(0).strip(), re.I
            )
            for t in tokens
        )
        found.append((counts, m.group(0).strip(), len(tokens) > 1 or shorthand))
    if not found:
        return None, partial
    found.sort(key=lambda f: -sum(v or 0 for v in f[0].values()))
    best_counts, quote, strong = found[0]
    # Any other statement must describe a part of the fullest one.
    for counts, _, _ in found[1:]:
        if not set(counts) <= set(best_counts):
            return None, partial
    return Reading(
        counts=best_counts, quote=quote, strength="stated" if strong else "prose"
    ), partial


def _spec_field(text: str) -> Reading | None:
    """'Driver: 10mm dynamic driver' — a spec line naming the technology without counts."""
    kinds: dict[str, int | None] = {}
    quotes: list[str] = []
    for m in _SPEC_FIELD.finditer(text):
        value = m.group("value")
        named = [k for k, pattern in _PROSE if pattern.search(value)]
        if not named and re.search(r"\b(?:DD|BA|EST)\b", value):
            named = [
                k
                for k, _ in _KIND_PATTERNS
                if re.search(rf"\b(?:{dict(_KIND_PATTERNS)[k]})\b", value)
            ]
        for k in named:
            kinds.setdefault(k, None)
        if named:
            quotes.append(m.group(0).strip()[:80])
    if not kinds:
        return None
    if len(kinds) == 1:
        only = next(iter(kinds))
        if not re.search(rf"{only.split('_')[0]}\w*\s+drivers\b", " ".join(quotes), re.I):
            kinds[only] = 1  # one technology, named in the singular: one driver
    return Reading(counts=kinds, quote="; ".join(quotes[:2]), strength="prose")


def _named(text: str) -> dict[str, str]:
    """Every technology the prose names, with the phrase that named it."""
    named: dict[str, str] = {}
    for kind, pattern in _PROSE:
        m = pattern.search(text)
        if m:
            named[kind] = m.group(0)
    return named


def _prose(text: str, named: dict[str, str]) -> Reading | None:
    if not named:
        return None
    if len(named) > 1 and not _HYBRID_WORD.search(text):
        return None  # several technologies mentioned, none of them said to be inside
    counts: dict[str, int | None] = dict.fromkeys(named)
    if len(named) == 1:
        only, phrase = next(iter(named.items()))
        if re.search(
            rf"\b(?:a|an|single|one)\s+(?:[\w.-]+\s+){{0,3}}?{re.escape(phrase)}", text, re.I
        ) and not re.search(r"\bdrivers\b", phrase, re.I):
            counts[only] = 1
    return Reading(counts=counts, quote="; ".join(named.values())[:120], strength="prose")


def read_drivers(text: str) -> Reading | None:
    """What a product listing says about its drivers, or ``None`` if it says nothing usable.

    A strong stated configuration stands on its own. Anything weaker must account
    for every technology the prose names: if prose names another one, the product
    is read as a hybrid only when the listing says so (or trailed off mid-list),
    with counts dropped since nothing stated them all; otherwise it is unknown.
    """
    text = re.sub(r"\s+", " ", text)
    stated, partial = _stated(text)
    if stated and stated.strength == "stated" and not partial:
        return stated
    named = _named(text)
    if re.search(r"\b(?:Knowles|Sonion)\b", text) and "electrostatic" not in named:
        named.setdefault("balanced_armature", "Knowles/Sonion")
    if re.search(r"\b\d{1,2}\s*(?:x\s*)?(?:[A-Z][\w-]*\s+){0,2}BAs?\b", text):
        named.setdefault("balanced_armature", "BA")
    base = stated or _spec_field(text)
    if base is None:
        return _prose(text, named)
    extra = set(named) - set(base.counts)
    if not extra and not partial:
        return base
    if _HYBRID_WORD.search(text) or partial:
        kinds = set(base.counts) | extra
        return Reading(counts=dict.fromkeys(sorted(kinds)), quote=base.quote, strength="prose")
    return None


def category(kinds: frozenset[str] | set[str]) -> Category | None:
    """The kind a listener chooses between: one technology, or a hybrid of several."""
    if len(kinds) > 1:
        return "hybrid"
    if not kinds:
        return None
    only = next(iter(kinds))
    return only if only in ("dynamic", "balanced_armature", "planar") else None  # type: ignore[return-value]


# ------------------------------------------------------------------ the index ---


@dataclass
class _Listing:
    domain: str
    url: str
    title: str
    text: str
    retrieved_on: date
    norm_title: str = ""


@dataclass
class IndexResult:
    products: int = 0
    with_listing: int = 0
    recorded: int = 0
    disagreed: list[str] = field(default_factory=list)
    unreadable: int = 0


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _load_feeds(data_dir: Path) -> tuple[dict[tuple[str, str], _Listing], list[_Listing]]:
    by_handle: dict[tuple[str, str], _Listing] = {}
    listings: list[_Listing] = []
    for domain, rel in FEEDS.items():
        path = data_dir / rel
        if not path.exists():
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        products = raw if isinstance(raw, list) else raw.get("products") or raw.get("items") or []
        retrieved = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).date()
        for p in products:
            if not isinstance(p, dict) or "handle" not in p:
                continue
            body = re.sub(r"<[^>]+>", " ", html.unescape(p.get("body_html") or ""))
            listing = _Listing(
                domain=domain,
                url=f"https://{domain}/products/{p['handle']}",
                title=str(p.get("title") or ""),
                text=f"{p.get('title') or ''}. {body}",
                retrieved_on=retrieved,
                norm_title=_norm(str(p.get("title") or "")),
            )
            by_handle[(domain, p["handle"])] = listing
            listings.append(listing)
    return by_handle, listings


_TITLE_TAIL_OK = {
    "",
    "in",
    "iem",
    "iems",
    "earphone",
    "earphones",
    "wired",
    "with",
    "hifi",
    "in-ear",
}


def _titled(listing: _Listing, brand: str, model: str) -> bool:
    """The listing is for this exact product: "Aria" must not take "Aria 2"'s page."""
    title, name = listing.norm_title, f"{_norm(brand)} {_norm(model)}"
    if name not in title:
        return False
    tail = title.split(name, 1)[1].split()
    return not tail or tail[0] in _TITLE_TAIL_OK


def build_index(
    db: Session, data_dir: Path, slugs: list[str] | None = None
) -> tuple[dict[str, Any], IndexResult]:
    """Read every saved listing for each product; record what they agree on."""
    by_handle, listings = _load_feeds(data_dir)
    query = select(Iem.id, Iem.slug, Iem.brand, Iem.model)
    if slugs is not None:
        query = query.where(Iem.slug.in_(slugs))
    iems = db.execute(query).all()
    urls: dict[str, list[str]] = {}
    for iem_id, url in db.execute(
        select(IemPriceObservation.iem_id, IemPriceObservation.source_url).where(
            IemPriceObservation.source_url.is_not(None)
        )
    ):
        urls.setdefault(str(iem_id), []).append(url)

    # Listings by each word of their title, so each product scans only its brand's.
    by_word: dict[str, list[_Listing]] = {}
    for x in listings:
        for w in set(x.norm_title.split()):
            by_word.setdefault(w, []).append(x)
    result = IndexResult(products=len(iems))
    items: dict[str, dict[str, Any]] = {}
    for iem_id, slug, brand, model in iems:
        found: list[_Listing] = []
        for url in urls.get(str(iem_id), []):
            parsed = urlparse(url)
            handle = parsed.path.rstrip("/").split("/")[-1]
            hit = by_handle.get((parsed.netloc.removeprefix("www."), handle))
            if hit and hit not in found:
                found.append(hit)
        lead = (_norm(brand).split(" ") or [""])[0]
        found += [x for x in by_word.get(lead, ()) if x not in found and _titled(x, brand, model)]
        if not found:
            continue
        result.with_listing += 1
        readings = [(x, r) for x in found if (r := read_drivers(x.text))]
        stated = [(x, r) for x, r in readings if r.strength == "stated"]
        use = stated or readings
        if not use:
            result.unreadable += 1
            continue
        if len({r.kinds for _, r in use}) > 1:
            result.disagreed.append(slug)
            continue
        kinds = use[0][1].kinds
        cat = category(kinds)
        if cat is None:
            result.unreadable += 1
            continue
        # Counts survive only where every source that states them agrees.
        counts: dict[str, int | None] = {}
        for k in sorted(kinds):
            stated_counts = {r.counts[k] for _, r in use if r.counts.get(k) is not None}
            counts[k] = stated_counts.pop() if len(stated_counts) == 1 else None
        first = use[0]
        items[slug] = {
            "category": cat,
            "counts": counts,
            "evidence": first[1].strength,
            "quote": first[1].quote,
            "sources": [{"url": x.url, "retrieved_on": x.retrieved_on.isoformat()} for x, _ in use],
        }
        result.recorded += 1
    index = {
        "method": "auralis.iem.drivers.build_index — stated configurations or "
        "single-technology prose "
        "from saved retailer listings; every source must agree on the technologies inside.",
        "generated_on": date.today().isoformat(),
        "items": dict(sorted(items.items())),
    }
    return index, result


@dataclass
class ImportResult:
    filled: int = 0
    kept: int = 0
    missing: list[str] = field(default_factory=list)


def import_index(db: Session, path: Path, *, dry_run: bool = False) -> ImportResult:
    """Fill ``iems.driver_config`` from the record, only where nothing is recorded yet."""
    index = json.loads(path.read_text(encoding="utf-8"))
    result = ImportResult()
    rows = {i.slug: i for i in db.scalars(select(Iem).where(Iem.slug.in_(list(index["items"]))))}
    for slug, item in index["items"].items():
        iem = rows.get(slug)
        if iem is None:
            result.missing.append(slug)
            continue
        if iem.driver_config and iem.driver_config.get("source") != "retailer-listing":
            result.kept += 1
            continue
        counts = {k: v for k, v in item["counts"].items() if v is not None}
        source = item["sources"][0]
        iem.driver_config = {
            **counts,
            "category": item["category"],
            "kinds": sorted(item["counts"]),
            "source": "retailer-listing",
            "source_url": source["url"],
            "retrieved_on": source["retrieved_on"],
            "quote": item["quote"],
        }
        result.filled += 1
    if dry_run:
        db.rollback()
    return result
