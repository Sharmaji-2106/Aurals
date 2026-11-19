"""The store: every earphone and headphone AURALS knows, with where to buy it.

Read-only over the catalogue. Each product carries what the catalogue actually
holds — its photograph, its measurements, and the retail listings gathered for it,
rupee listings in India first — and, for a listener with a sound profile, how it
scores for them. Nothing is estimated here: a product without a listing says so, and
a product that cannot be compared with the listener's target (a headphone, or an
in-ear measured on a rig without a conversion) has no score rather than a guessed one.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict
from datetime import datetime
from decimal import Decimal
from typing import Literal

import numpy as np
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auralis.acoustics import fr
from auralis.iem.models import FrMeasurement, Iem, IemImage, IemPriceObservation
from auralis.recommend.base import Constraints, Prediction, ProductImage, Recommendation
from auralis.recommend.harman import HarmanPersonalRecommender, offsets_on
from auralis.recommend.service import _fingerprint, load_candidates, load_target
from auralis.sound_profile.fusion import SoundProfileData

Kind = Literal["in-ear", "earbuds", "headphones"]
Sort = Literal["featured", "match", "price_asc", "price_desc", "name"]


class Offer(BaseModel):
    retailer: str
    url: str | None
    amount: Decimal
    currency: str
    region: str | None
    observed_at: datetime


class Score(BaseModel):
    mean: float
    low: float
    high: float
    rank: int


class StoreItem(BaseModel):
    slug: str
    brand: str
    model: str
    kind: Kind
    image: ProductImage | None
    #: The lowest Indian rupee listing when there is one, else the latest of any.
    price: Offer | None
    offers: int
    #: In the matching pool: measured on, or converted to, the target's rig.
    comparable: bool
    converted: bool
    #: Listed (a shop sells it) but no published measurement has been found yet.
    measured: bool
    score: Score | None


class Facet(BaseModel):
    name: str
    count: int


class StorePage(BaseModel):
    items: list[StoreItem]
    total: int
    kinds: list[Facet]
    brands: list[Facet]
    scored: bool


class Measurement(BaseModel):
    source: str
    rig: str | None
    rig_family: str | None
    form: str | None
    variant: str | None


class Curve(BaseModel):
    freqs_hz: list[float]
    db: list[float | None]
    target_db: list[float]
    personal_db: list[float] | None


class StoreProduct(BaseModel):
    item: StoreItem
    offers: list[Offer]
    images: list[str]
    measurements: list[Measurement]
    curve: Curve | None
    recommendation: Recommendation | None


def _kind(forms: set[str]) -> Kind:
    if forms & {"over-ear", "on-ear"}:
        return "headphones"
    if "earbud" in forms:
        return "earbuds"
    return "in-ear"


def _offers(db: Session, iem_ids: list[uuid.UUID] | None = None) -> dict[uuid.UUID, list[Offer]]:
    query = select(IemPriceObservation).order_by(IemPriceObservation.observed_at.desc())
    if iem_ids is not None:
        query = query.where(IemPriceObservation.iem_id.in_(iem_ids))
    out: dict[uuid.UUID, list[Offer]] = {}
    seen: set[tuple[uuid.UUID, str]] = set()
    for row in db.scalars(query):
        # The latest listing per page only: an older price for the same page is history.
        key = (row.iem_id, row.source_url or row.source)
        if key in seen:
            continue
        seen.add(key)
        out.setdefault(row.iem_id, []).append(
            Offer(
                retailer=row.source,
                url=row.source_url,
                amount=row.amount,
                currency=row.currency,
                region=row.region,
                observed_at=row.observed_at,
            )
        )
    return out


def _best(offers: list[Offer]) -> Offer | None:
    """The lowest rupee listing in India; failing that, the most recent of any."""
    india = [o for o in offers if o.currency == "INR"]
    if india:
        return min(india, key=lambda o: o.amount)
    return offers[0] if offers else None


def sorted_offers(offers: list[Offer]) -> list[Offer]:
    return sorted(offers, key=lambda o: (o.currency != "INR", o.region != "IN", o.amount))


# Scores per listener profile and catalogue state: scoring the whole pool takes about a
# second, and the store asks for it on every filter change.
_SCORES: OrderedDict[tuple[str, tuple[int, ...]], dict[str, Score]] = OrderedDict()


def scores_for(db: Session, profile_key: str, profile: SoundProfileData) -> dict[str, Score]:
    stamp = _fingerprint(db)
    key = (profile_key, stamp)
    hit = _SCORES.get(key)
    if hit is not None:
        _SCORES.move_to_end(key)
        return hit
    target = load_target(db, profile.reference_target)
    if target is None:
        return {}
    candidates = load_candidates(db, target.rig_family)
    scored = HarmanPersonalRecommender().score(profile, candidates, target)
    ranked = sorted(scored, key=lambda s: -s.personal.mean)
    out = {
        s.candidate.slug: Score(
            mean=s.personal.mean, low=s.personal.low, high=s.personal.high, rank=i
        )
        for i, s in enumerate(ranked, start=1)
    }
    _SCORES[key] = out
    while len(_SCORES) > 16:
        _SCORES.popitem(last=False)
    return out


def _catalogue(db: Session) -> list[tuple[Iem, set[str], set[str]]]:
    """Every product, measured or not, with its measurement forms and rigs (empty if none)."""
    rows = db.execute(
        select(
            Iem,
            func.array_agg(func.distinct(FrMeasurement.form)),
            func.array_agg(func.distinct(FrMeasurement.rig_family)),
        )
        .outerjoin(FrMeasurement, FrMeasurement.iem_id == Iem.id)
        .group_by(Iem.id)
    ).all()
    return [(iem, {f for f in forms if f}, {r for r in rigs if r}) for iem, forms, rigs in rows]


def _image(iem: Iem) -> ProductImage | None:
    if not iem.image_path:
        return None
    return ProductImage(
        path=iem.image_path,
        source=iem.image_source or "unknown",
        source_url=iem.image_source_url,
        credit=iem.image_credit or "unknown",
    )


def _item(
    iem: Iem,
    forms: set[str],
    rigs: set[str],
    offers: list[Offer],
    pool: dict[str, bool],
    scores: dict[str, Score],
) -> StoreItem:
    converted = pool.get(iem.slug)
    return StoreItem(
        slug=iem.slug,
        brand=iem.brand,
        model=iem.model,
        kind=_kind(forms),
        image=_image(iem),
        price=_best(offers),
        offers=len(offers),
        comparable=converted is not None,
        converted=bool(converted),
        measured=bool(rigs),
        score=scores.get(iem.slug),
    )


def _pool(db: Session) -> dict[str, bool]:
    """Slug -> converted, for every product in the matching pool."""
    target = load_target(db)
    if target is None:
        return {}
    return {
        c.slug: bool(c.measurement.converted_to) for c in load_candidates(db, target.rig_family)
    }


def browse(
    db: Session,
    *,
    profile: tuple[str, SoundProfileData] | None,
    q: str = "",
    kind: Kind | None = None,
    brand: str | None = None,
    min_inr: int | None = None,
    max_inr: int | None = None,
    with_photo: bool = False,
    sort: Sort = "featured",
    offset: int = 0,
    limit: int = 48,
) -> StorePage:
    scores = scores_for(db, profile[0], profile[1]) if profile else {}
    pool = _pool(db)
    offers = _offers(db)
    items = [
        _item(iem, forms, rigs, offers.get(iem.id, []), pool, scores)
        for iem, forms, rigs in _catalogue(db)
    ]
    text = q.strip().lower()

    def keep(i: StoreItem, *, by_kind: bool = True, by_brand: bool = True) -> bool:
        if text and text not in f"{i.brand} {i.model}".lower():
            return False
        if by_kind and kind and i.kind != kind:
            return False
        if by_brand and brand and i.brand != brand:
            return False
        if with_photo and not i.image:
            return False
        if min_inr is not None or max_inr is not None:
            p = i.price
            if p is None or p.currency != "INR":
                return False
            if min_inr is not None and p.amount < min_inr:
                return False
            if max_inr is not None and p.amount > max_inr:
                return False
        return True

    chosen = [i for i in items if keep(i)]
    if sort == "match" and scores:
        chosen.sort(key=lambda i: (i.score is None, -(i.score.mean if i.score else 0), i.brand))
    elif sort in ("price_asc", "price_desc"):
        sign = 1 if sort == "price_asc" else -1
        chosen.sort(
            key=lambda i: (
                not (i.price and i.price.currency == "INR"),
                sign * float(i.price.amount) if i.price else 0.0,
            )
        )
    elif sort == "name":
        chosen.sort(key=lambda i: (i.brand.lower(), i.model.lower()))
    else:
        # Featured: photographed first, then those with a rupee listing, then those
        # that can be matched; within that, best for the listener when known.
        chosen.sort(
            key=lambda i: (
                i.image is None,
                not (i.price and i.price.currency == "INR"),
                not i.comparable,
                -(i.score.mean if i.score else 0),
                i.brand.lower(),
                i.model.lower(),
            )
        )

    kinds: dict[str, int] = {}
    for i in items:
        if keep(i, by_kind=False):
            kinds[i.kind] = kinds.get(i.kind, 0) + 1
    brands: dict[str, int] = {}
    for i in items:
        if keep(i, by_brand=False):
            brands[i.brand] = brands.get(i.brand, 0) + 1
    return StorePage(
        items=chosen[offset : offset + limit],
        total=len(chosen),
        kinds=[Facet(name=k, count=v) for k, v in sorted(kinds.items())],
        brands=[
            Facet(name=k, count=v)
            for k, v in sorted(brands.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        scored=bool(scores),
    )


def product(
    db: Session, slug: str, *, profile: tuple[str, SoundProfileData] | None
) -> StoreProduct | None:
    iem = db.scalar(select(Iem).where(Iem.slug == slug))
    if iem is None:
        return None
    measurements = db.scalars(
        select(FrMeasurement).where(FrMeasurement.iem_id == iem.id).order_by(FrMeasurement.source)
    ).all()
    forms = {m.form for m in measurements if m.form}
    rigs = {m.rig_family for m in measurements if m.rig_family}
    offers = _offers(db, [iem.id]).get(iem.id, [])
    scores = scores_for(db, profile[0], profile[1]) if profile else {}
    pool = _pool(db)
    item = _item(iem, forms, rigs, offers, pool, scores)

    images = [
        path
        for (path,) in db.execute(
            select(IemImage.file_path)
            .where(
                IemImage.iem_id == iem.id,
                IemImage.role.in_(("primary", "alternate")),
                IemImage.verification_status == "verified",
            )
            .order_by(IemImage.role != "primary", IemImage.file_path)
        )
    ]
    if iem.image_path and iem.image_path not in images:
        images.insert(0, iem.image_path)

    curve = None
    recommendation = None
    target = load_target(db)
    if target is not None and item.comparable:
        candidate = next(
            (c for c in load_candidates(db, target.rig_family) if c.slug == slug), None
        )
        if candidate is not None:
            at = fr.R40_HZ
            response = fr.interpolate(fr.Curve(candidate.freqs_hz, candidate.response_db), at)
            reference = fr.interpolate(fr.Curve(target.freqs_hz, target.db), at)
            personal = None
            if profile is not None:
                engine = HarmanPersonalRecommender()
                found = engine.recommend(profile[1], [candidate], target, Constraints(), limit=1)
                if found:
                    recommendation = found[0].model_copy(
                        update={"rank": item.score.rank if item.score else 1}
                    )
                mean = [c.offset_db for c in profile[1].preference_curve]
                personal = (reference + offsets_on(at, np.array([mean]))[0]).round(2).tolist()
            curve = Curve(
                freqs_hz=at.round(1).tolist(),
                db=[None if not np.isfinite(v) else round(float(v), 2) for v in response],
                target_db=reference.round(2).tolist(),
                personal_db=personal,
            )
    return StoreProduct(
        item=item,
        offers=sorted_offers(offers),
        images=images,
        measurements=[
            Measurement(
                source=m.source, rig=m.rig, rig_family=m.rig_family, form=m.form, variant=m.variant
            )
            for m in measurements
        ],
        curve=curve,
        recommendation=recommendation,
    )


__all__ = ["Prediction", "StorePage", "StoreProduct", "browse", "product"]
