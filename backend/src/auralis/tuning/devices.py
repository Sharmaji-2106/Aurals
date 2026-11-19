"""What the listener is wearing during the tuning duel, and how it already sounds.

The duel is heard through the listener's own earphones, so its choices are relative
to them. Three cases, said plainly to the listener:

- **Measured on the reference rig** (``comparable``): its deviation from the target
  on each tonal dimension is computed exactly as recommendations do, and added back
  to the listener's choices.
- **Measured, on a different rig** (RTINGS' HMS II.3, a B&K 5128, a clone coupler):
  it is identified and remembered, but a target defined on one rig cannot be
  subtracted from a curve measured on another, so the evidence is widened as for
  an unknown device rather than corrected with numbers that do not apply.
- **Not measured** ("other earbuds", "over-ear", "not sure"): widened.
"""

from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from auralis.iem.models import FrMeasurement, Iem
from auralis.recommend.harman import _band_values
from auralis.recommend.service import load_candidates, load_target


class DeviceOut(BaseModel):
    slug: str
    label: str
    image_path: str | None = None
    #: Measured on the reference target's rig, so its sound can be accounted for exactly.
    comparable: bool = False
    #: Over-ear or on-ear, measured on a headphone rig.
    headphones: bool = False


class DeviceDetail(DeviceOut):
    """A device and how it already sounds against the target, where that is known."""

    offsets: dict[str, float] = {}


class DeviceProfile(BaseModel):
    slug: str
    label: str
    offsets: dict[str, float]


# The sound profile's tonal dimensions, as the canonical bands they cover.
DIMENSION_BANDS: dict[str, tuple[str, ...]] = {
    "sub_bass": ("sub_bass",),
    "mid_bass": ("mid_bass",),
    "warmth": ("lower_mids",),
    "vocal_presence": ("upper_mids", "presence"),
    "treble": ("lower_treble", "upper_treble"),
    "air": ("air",),
}

#: Offered as one tap: what most people are actually wearing, wireless first, then
#: the in-ears most often bought first. Shown only when the catalogue has them.
POPULAR: tuple[str, ...] = (
    "apple-airpods-pro2",
    "apple-airpods-pro",
    "samsung-galaxy-buds2-pro",
    "samsung-galaxy-buds-fe",
    "sony-wf-1000xm5",
    "sony-wf-1000xm4",
    "oneplus-buds-pro-2",
    "nothing-ear-2",
    "google-pixel-buds-pro",
    "jbl-live-pro-tws",
    "moondrop-chu-2",
    "kz-edx-pro",
    "truthear-hola",
    "tangzu-wan-er-s-g",
    "7hz-salnotes-zero",
    "moondrop-aria",
)
POPULAR_HEADPHONES: tuple[str, ...] = (
    "sony-wh-1000xm5",
    "sony-wh-1000xm4",
    "sony-wh-ch720n",
    "apple-airpods-max",
    "bose-quietcomfort-ultra-headphones",
    "bose-quietcomfort-45",
    "sennheiser-momentum-4-wireless",
    "audio-technica-ath-m50x",
    "audio-technica-ath-m40x",
    "sennheiser-hd-560s",
    "sennheiser-hd-600",
    "sennheiser-hd-650",
    "beyerdynamic-dt-770-pro",
    "beyerdynamic-dt-990-pro",
    "akg-k371",
    "hifiman-sundara",
)


def _devices(db: Session, where: object, limit: int, order: list[object]) -> list[DeviceOut]:
    target = load_target(db)
    family = target.rig_family if target else None
    comparable = func.bool_or(FrMeasurement.rig_family == family) if family else func.bool_or(False)
    headphones = func.bool_or(FrMeasurement.rig_family.like("headphone:%"))
    rows = db.execute(
        select(
            Iem.slug,
            Iem.brand,
            Iem.model,
            Iem.image_path,
            comparable.label("comparable"),
            headphones.label("headphones"),
        )
        .join(FrMeasurement, FrMeasurement.iem_id == Iem.id)
        .where(where)  # type: ignore[arg-type]
        .group_by(Iem.id)
        .order_by(*order)  # type: ignore[arg-type]
        .limit(limit)
    ).all()
    return [
        DeviceOut(slug=s, label=f"{b} {m}", image_path=img, comparable=bool(c), headphones=bool(h))
        for s, b, m, img, c, h in rows
    ]


def search(db: Session, q: str, limit: int = 12) -> list[DeviceOut]:
    """Every measured device in the catalogue whose name matches, best matches first."""
    text = q.strip().lower()
    if len(text) < 2:
        return []
    name = func.lower(Iem.brand + " " + Iem.model)
    like = f"%{text}%"
    return _devices(
        db,
        or_(name.like(like), func.lower(Iem.model).like(like)),
        limit,
        [
            # Names that start with what was typed, then the rest, alphabetically.
            case((name.like(f"{text}%"), 0), (func.lower(Iem.model).like(f"{text}%"), 1), else_=2),
            func.length(name),
            Iem.brand,
            Iem.model,
        ],
    )


def popular(db: Session, headphones: bool = False) -> list[DeviceOut]:
    slugs = POPULAR_HEADPHONES if headphones else POPULAR
    found = {d.slug: d for d in _devices(db, Iem.slug.in_(slugs), len(slugs), [Iem.slug])}
    return [found[s] for s in slugs if s in found]


def profile(db: Session, slug: str) -> DeviceProfile | None:
    """The device's deviation from the target per tonal dimension, if it is comparable."""
    target = load_target(db)
    if target is None:
        return None
    # Exact-rig only: a converted curve carries too much error to subtract from choices.
    candidates = load_candidates(db, target.rig_family, convert=False)
    match = next((c for c in candidates if c.slug == slug), None)
    if match is None:
        return None
    bands = {b.band: b.measured_db for b in _band_values(match, target)}
    offsets: dict[str, float] = {}
    for dim, keys in DIMENSION_BANDS.items():
        values = [v for k in keys if (v := bands.get(k)) is not None]
        if values:
            offsets[dim] = round(sum(values) / len(values), 2)
    return DeviceProfile(slug=slug, label=f"{match.brand} {match.model}", offsets=offsets)


def detail(db: Session, slug: str) -> DeviceDetail | None:
    """One device, with its sound against the target where its rig allows it."""
    found = _devices(db, Iem.slug == slug, 1, [Iem.slug])
    if not found:
        return None
    device = found[0]
    measured = profile(db, slug) if device.comparable else None
    return DeviceDetail(**device.model_dump(), offsets=measured.offsets if measured else {})
