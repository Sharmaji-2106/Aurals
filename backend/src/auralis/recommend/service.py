"""Load candidates, the reference target and the listener's constraints; run a recommender."""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal
from itertools import pairwise
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auralis.acoustics import fr
from auralis.acoustics.bands import log_grid
from auralis.auth.models import User
from auralis.iem.models import FrMeasurement, FrTarget, Iem, IemAcousticProfile, IemPriceObservation
from auralis.profiles.service import get_profile
from auralis.recommend import rig_transfer
from auralis.recommend.base import (
    Candidate,
    Constraints,
    DriverCategory,
    MeasurementRef,
    Price,
    ProductImage,
    Recommendation,
    Recommender,
    Standing,
    Target,
    driver_category,
)
from auralis.recommend.harman import HarmanPersonalRecommender
from auralis.recommend.standing import is_wireless, standing
from auralis.sound_profile.fusion import REFERENCE_TARGET, SoundProfileData
from auralis.sound_profile.service import latest_sound_profile


class TargetOut(BaseModel):
    name: str
    label: str
    citation: str
    rig_family: str


class DatasetOut(BaseModel):
    measurements: int
    sources: list[str]


class BudgetPicks(BaseModel):
    """The best-ranked earphones at the top of the listener's price bracket.

    Only earphones with a stored price in the bracket's currency are eligible:
    "under 10,000" is never claimed for something whose price is unknown.
    """

    currency: str
    floor: float
    ceiling: float
    basis: Literal["budget", "top_pick"] = Field(
        description="budget: the listener's own ceiling; top_pick: the bracket the #1 falls in"
    )
    priced_in_bracket: int = Field(description="Ranked earphones with a price in the bracket")
    items: list[Recommendation]


class DriverPick(BaseModel):
    """The best-ranked earphone of one driver technology, from the same ranking.

    Driver type never changes a score; this only reads the ranking by type.
    """

    category: DriverCategory
    ranked: int = Field(description="Ranked earphones of this type with a recorded configuration")
    item: Recommendation


class RecommendationsOut(BaseModel):
    recommender: str
    sound_profile_version: str
    reference_target: TargetOut | None
    dataset: DatasetOut
    constraints: Constraints
    items: list[Recommendation]
    notes: list[str]
    budget_picks: BudgetPicks | None = None
    driver_picks: list[DriverPick] = Field(default_factory=list)
    drivers_on_record: int = Field(0, description="Ranked earphones whose driver type is recorded")


def load_target(db: Session, name: str = REFERENCE_TARGET) -> Target | None:
    row = db.scalar(select(FrTarget).where(FrTarget.name == name))
    if row is None:
        return None
    curve = fr.normalise(fr.to_grid(fr.validate_points(row.raw_points)))
    return Target(
        name=row.name,
        label=row.label,
        citation=row.citation,
        rig_family=row.rig_family,
        freqs_hz=curve.freqs_hz,
        db=curve.db,
    )


def _measured(db: Session, rig_family: str) -> list[tuple[Iem, FrMeasurement, np.ndarray]]:
    """One measurement per IEM on a rig family: the stock configuration when there is one.

    Choosing the best-scoring configuration instead would flatter products with many
    measured variants, so variants only stand in when no stock measurement exists.
    """
    rows = db.execute(
        select(Iem, FrMeasurement, IemAcousticProfile.grid_db)
        .join(FrMeasurement, FrMeasurement.iem_id == Iem.id)
        .join(IemAcousticProfile, IemAcousticProfile.measurement_id == FrMeasurement.id)
        .where(
            FrMeasurement.rig_family == rig_family,
            IemAcousticProfile.processor_version == fr.FR_PROCESSOR_VERSION,
            IemAcousticProfile.target_name.is_(None),
        )
        .order_by(Iem.brand, Iem.model, FrMeasurement.variant.is_not(None), FrMeasurement.id)
    ).all()
    seen: set[uuid.UUID] = set()
    out = []
    for iem, measurement, grid_db in rows:
        if iem.id in seen:
            continue
        seen.add(iem.id)
        out.append(
            (iem, measurement, np.array([np.nan if v is None else v for v in grid_db], dtype=float))
        )
    return out


_CACHE: dict[tuple[str, bool], tuple[tuple[int, ...], list[Candidate]]] = {}


def _fingerprint(db: Session) -> tuple[int, ...]:
    """Cheap to read, and changes whenever a curve, a price or a photograph is added."""
    row = db.execute(
        select(
            select(func.count()).select_from(IemAcousticProfile).scalar_subquery(),
            select(func.count()).select_from(IemPriceObservation).scalar_subquery(),
            select(func.count())
            .select_from(Iem)
            .where(Iem.image_path.is_not(None))
            .scalar_subquery(),
            select(func.count()).select_from(Iem).scalar_subquery(),
        )
    ).one()
    return tuple(int(v) for v in row)


def load_candidates(db: Session, rig_family: str, *, convert: bool = True) -> list[Candidate]:
    """Every comparable IEM, from memory while the catalogue has not changed."""
    key = (rig_family, convert)
    stamp = _fingerprint(db)
    hit = _CACHE.get(key)
    if hit is not None and hit[0] == stamp:
        return hit[1]
    candidates = _load_candidates(db, rig_family, convert=convert)
    _CACHE[key] = (stamp, candidates)
    return candidates


def _load_candidates(db: Session, rig_family: str, *, convert: bool = True) -> list[Candidate]:
    """Every IEM that can be compared on ``rig_family``.

    First those measured on it. Then, with ``convert``, those measured only on a rig
    that has a measured conversion into it (see ``rig_transfer``): their response is
    converted, and they carry the conversion's residuals so their score's range does.
    """
    measured = _measured(db, rig_family)
    grid = log_grid(fr.GRID_POINTS_PER_OCTAVE)
    converted: list[tuple[Iem, FrMeasurement, np.ndarray]] = []
    transfer = None
    if convert:
        for source_family, into in rig_transfer.CONVERTIBLE.items():
            if into != rig_family:
                continue
            others = _measured(db, source_family)
            transfer = rig_transfer.fit(
                grid,
                {iem.slug: curve for iem, _, curve in others},
                {iem.slug: curve for iem, _, curve in measured},
                source_family=source_family,
                target_family=rig_family,
            )
            if transfer is not None:
                have = {iem.id for iem, _, _ in measured}
                converted = [r for r in others if r[0].id not in have]
    rows = measured + converted
    prices, stores = _market(db, [iem.id for iem, _, _ in rows])
    candidates = []
    for iem, measurement, response in rows:
        is_converted = transfer is not None and measurement.rig_family == transfer.source_family
        candidates.append(
            Candidate(
                iem_id=iem.id,
                brand=iem.brand,
                model=iem.model,
                slug=iem.slug,
                # India first: the rupee price leads when there is one.
                price=(prices.get(iem.id) or {}).get("INR")
                or next(iter((prices.get(iem.id) or {}).values()), None),
                prices=prices.get(iem.id, {}),
                stores=stores.get(iem.id, {}),
                driver_config=iem.driver_config,
                image=(
                    ProductImage(
                        path=iem.image_path,
                        source=iem.image_source or "unknown",
                        source_url=iem.image_source_url,
                        credit=iem.image_credit or "unknown",
                    )
                    if iem.image_path
                    else None
                ),
                measurement=MeasurementRef(
                    source=measurement.source,
                    rig=measurement.rig,
                    rig_family=measurement.rig_family,
                    variant=measurement.variant,
                    source_ref=measurement.source_ref,
                    license=measurement.license,
                    converted_to=transfer.target_family if is_converted and transfer else None,
                    conversion_pairs=transfer.pairs if is_converted and transfer else None,
                ),
                freqs_hz=grid,
                response_db=transfer.convert(response) if is_converted and transfer else response,
                transfer_residuals=transfer.residuals_db if is_converted and transfer else None,
            )
        )
    return candidates


#: Observations older than this, before an IEM's newest one, are out of date.
PRICE_WINDOW_DAYS = 60
#: Not a retailer's own listing: a search-result snippet, a used or demo unit.
_NOT_RETAIL = ("snippet", "pre-owned", "ex-demo", "unboxed", "used")


def _retail(source: str, url: str | None) -> bool:
    text = f"{source} {url or ''}".lower()
    return not any(word in text for word in _NOT_RETAIL)


def _market(
    db: Session, iem_ids: list[uuid.UUID]
) -> tuple[dict[uuid.UUID, dict[str, Price]], dict[uuid.UUID, dict[str, int]]]:
    """Per IEM and currency: the best current retail price, and how many retailers list it.

    Each retailer's latest price within ``PRICE_WINDOW_DAYS`` of the newest one
    counts; the lowest of those is the price a buyer can actually pay. A
    marketplace snippet or a used unit is used only when no retailer lists it.
    """
    if not iem_ids:
        return {}, {}
    rows = db.scalars(
        select(IemPriceObservation)
        .where(IemPriceObservation.iem_id.in_(iem_ids))
        .order_by(IemPriceObservation.observed_at.desc())
    ).all()
    newest: dict[tuple[uuid.UUID, str], object] = {}
    by_source: dict[tuple[uuid.UUID, str], dict[str, IemPriceObservation]] = defaultdict(dict)
    for row in rows:
        key = (row.iem_id, row.currency)
        newest.setdefault(key, row.observed_at)
        if (newest[key] - row.observed_at).days > PRICE_WINDOW_DAYS:  # type: ignore[operator]
            continue
        by_source[key].setdefault(row.source, row)  # rows are newest first
    prices: dict[uuid.UUID, dict[str, Price]] = defaultdict(dict)
    stores: dict[uuid.UUID, dict[str, int]] = defaultdict(dict)
    for (iem_id, currency), latest in by_source.items():
        retail = [r for r in latest.values() if _retail(r.source, r.source_url)]
        pool = retail or list(latest.values())
        best = min(pool, key=lambda r: r.amount) if retail else pool[0]
        prices[iem_id][currency] = Price(
            amount=best.amount, currency=currency, source=best.source, observed_at=best.observed_at
        )
        stores[iem_id][currency] = len(retail)
    return prices, stores


def constraints_for(db: Session, user: User, rig_family: str) -> Constraints:
    profile = get_profile(db, user)
    return Constraints(
        budget_min=profile.budget_min,
        budget_max=profile.budget_max,
        currency=profile.currency,
        rig_family=rig_family,
    )


def recommend(
    db: Session,
    profile: SoundProfileData,
    constraints: Constraints,
    *,
    recommender: Recommender | None = None,
    limit: int = 10,
) -> RecommendationsOut:
    engine = recommender or HarmanPersonalRecommender()
    target = load_target(db, profile.reference_target)
    notes: list[str] = []
    candidates = load_candidates(db, target.rig_family) if target else []
    if target is None:
        notes.append("The reference target hasn't been imported yet (auralis import-autoeq).")
    elif not candidates:
        notes.append("No measured IEMs have been imported yet (auralis import-autoeq).")
    sources: dict[str, int] = defaultdict(int)
    for c in candidates:
        converted = " converted from a clone coupler" if c.measurement.converted_to else ""
        sources[f"{c.measurement.source}{converted}"] += 1
    budget_picks: BudgetPicks | None = None
    driver_picks: list[DriverPick] = []
    on_record = 0
    if target and isinstance(engine, HarmanPersonalRecommender):
        ranked, standings, left_out = _pragmatic(engine, profile, candidates, target, constraints)
        notes.extend(left_out)

        def explain(s: Any, rank: int) -> Recommendation:
            rec = engine.explain(profile, s, rank, target, constraints)
            return rec.model_copy(update={"standing": standings.get(s.candidate.slug)})

        engine_explain = explain
        items = [explain(s, rank) for rank, s in enumerate(ranked[:limit], start=1)]
        budget_picks = _budget_picks(engine_explain, ranked, constraints)
        shown = {ranked[0].candidate.slug} if ranked else set()
        shown |= {r.slug for r in (budget_picks.items if budget_picks else [])}
        driver_picks, on_record = _driver_picks(engine_explain, ranked, constraints, shown)
    else:
        items = (
            engine.recommend(profile, candidates, target, constraints, limit=limit)
            if target
            else []
        )
    if candidates and not any(c.price for c in candidates):
        notes.append("No verified prices are stored yet, so budgets can't be applied.")
    return RecommendationsOut(
        recommender=f"{engine.version}+standing/1"
        if isinstance(engine, HarmanPersonalRecommender)
        else engine.version,
        sound_profile_version=profile.model_version,
        reference_target=TargetOut(
            name=target.name,
            label=target.label,
            citation=target.citation,
            rig_family=target.rig_family,
        )
        if target
        else None,
        dataset=DatasetOut(
            measurements=len(candidates),
            sources=[f"{source} ({count})" for source, count in sorted(sources.items())],
        ),
        constraints=constraints,
        items=items,
        notes=notes,
        budget_picks=budget_picks,
        driver_picks=driver_picks,
        drivers_on_record=on_record,
    )


#: Where price brackets break, per currency: the familiar "under 2k / 5k / 10k".
BRACKETS: dict[str, list[int]] = {
    "INR": [0, 2_000, 5_000, 10_000, 20_000, 35_000, 60_000, 100_000, 200_000, 500_000],
    "USD": [0, 25, 60, 120, 250, 450, 750, 1_200, 2_500, 6_000],
}
BUDGET_PICKS = 3


def _bracket(
    constraints: Constraints, first_price: Price | None
) -> tuple[str, Decimal, Decimal, Literal["budget", "top_pick"]] | None:
    """The listener's own ceiling and the bracket below it; else the #1's bracket."""
    if constraints.budget_max is not None and constraints.currency in BRACKETS:
        ceiling = constraints.budget_max
        below = [Decimal(b) for b in BRACKETS[constraints.currency] if Decimal(b) < ceiling]
        floor = max(constraints.budget_min or Decimal(0), below[-1] if below else Decimal(0))
        return constraints.currency, floor, ceiling, "budget"
    if first_price is None or first_price.currency not in BRACKETS:
        return None
    stops = [Decimal(b) for b in BRACKETS[first_price.currency]]
    for lo, hi in pairwise(stops):
        if lo < first_price.amount <= hi:
            return first_price.currency, lo, hi, "top_pick"
    return None


#: A budgeted ranking keeps unverified prices out unless fewer than this many are verified.
VERIFIED_ENOUGH = 5


def _pragmatic(
    engine: HarmanPersonalRecommender,
    profile: SoundProfileData,
    candidates: list[Candidate],
    target: Target,
    constraints: Constraints,
) -> tuple[list[Any], dict[str, Standing], list[str]]:
    """The measured ranking, made into a buying list.

    1. Prices in the listener's currency (the best current retail price).
    2. True-wireless earbuds left out: AURALS recommends wired IEMs.
    3. Ordered by measured match plus community standing (at most +3 points).
    4. With a budget, only earphones with a verified price in it — unless too
       few are, when the unverified follow, flagged.
    """
    currency = constraints.currency or "INR"
    local = [
        c.model_copy(update={"price": c.prices.get(currency) or c.price})
        for c in candidates
        if not is_wireless(c.brand, c.model)
    ]
    notes: list[str] = []
    wireless = len(candidates) - len(local)
    if wireless:
        notes.append(
            f"{wireless} true-wireless earbuds were left out: AURALS recommends wired IEMs."
        )
    ranked = engine.ranked(profile, local, target, constraints)
    standings = {
        s.candidate.slug: standing(s.candidate.slug, s.candidate.stores.get(currency, 0))
        for s in ranked
    }
    ranked.sort(key=lambda s: -(s.personal.mean + standings[s.candidate.slug].points))
    if constraints.budget_max is not None and constraints.currency:
        verified = [
            s
            for s in ranked
            if s.candidate.price is not None and s.candidate.price.currency == constraints.currency
        ]
        unverified = len(ranked) - len(verified)
        if len(verified) >= VERIFIED_ENOUGH:
            ranked = verified
            if unverified:
                notes.append(
                    f"{unverified} earphones without a verified {constraints.currency} price were "
                    "left out of this budgeted list."
                )
        else:
            ranked = verified + [s for s in ranked if s not in verified]
    return ranked, standings, notes


def _budget_picks(
    explain: Any,
    ranked: list[Any],
    constraints: Constraints,
) -> BudgetPicks | None:
    if not ranked:
        return None
    first_priced = next((s.candidate.price for s in ranked if s.candidate.price), None)
    bracket = _bracket(constraints, ranked[0].candidate.price or first_priced)
    if bracket is None:
        return None
    currency, floor, ceiling, basis = bracket
    inside = [
        (rank, s)
        for rank, s in enumerate(ranked, start=1)
        if s.candidate.price is not None
        and s.candidate.price.currency == currency
        and floor <= s.candidate.price.amount <= ceiling
    ]
    picks = [(rank, s) for rank, s in inside if rank != 1][:BUDGET_PICKS]
    return BudgetPicks(
        currency=currency,
        floor=float(floor),
        ceiling=float(ceiling),
        basis=basis,
        priced_in_bracket=len(inside),
        items=[explain(s, rank) for rank, s in picks],
    )


def _driver_picks(
    explain: Any,
    ranked: list[Any],
    constraints: Constraints,
    shown: set[str] | None = None,
) -> tuple[list[DriverPick], int]:
    """The best of each driver type; with a budget, one priced inside it comes first."""
    by_type: dict[str, list[tuple[int, Any]]] = defaultdict(list)
    for rank, s in enumerate(ranked, start=1):
        kind = driver_category(s.candidate.driver_config)
        if kind:
            by_type[kind].append((rank, s))

    def priced(s: Any) -> bool:
        price = s.candidate.price
        return (
            constraints.budget_max is not None
            and price is not None
            and price.currency == constraints.currency
        )

    picks = []
    order: tuple[DriverCategory, ...] = ("dynamic", "balanced_armature", "planar", "hybrid")
    for kind in order:
        options = by_type.get(kind)
        if not options:
            continue
        # Something not already on the page above it: the #1 and the budget picks.
        fresh = [(r, s) for r, s in options if s.candidate.slug not in (shown or set())] or options
        rank, best = next(((r, s) for r, s in fresh if priced(s)), fresh[0])
        picks.append(
            DriverPick(
                category=kind,
                ranked=len(options),
                item=explain(best, rank),
            )
        )
    return picks, sum(len(v) for v in by_type.values())


def recommendations_for(db: Session, user: User, limit: int = 10) -> RecommendationsOut:
    profile = latest_sound_profile(db, user).data
    target = load_target(db, profile.reference_target)
    rig_family = target.rig_family if target else "iec60318-4"
    return recommend(db, profile, constraints_for(db, user, rig_family), limit=limit)
