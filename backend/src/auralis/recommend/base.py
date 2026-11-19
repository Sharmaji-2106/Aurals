"""The recommender contract: inputs, outputs and explanations.

Everything a recommendation says is traceable: the measured response it used (with its
source and rig), the personal target it was compared with, the numbers per frequency
region, and the model that turned them into a prediction. Recommenders are swappable
behind :class:`Recommender`, so a learned model can replace the content-based one
without touching the API or the data layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Protocol

import numpy as np
import numpy.typing as npt
from pydantic import BaseModel, ConfigDict, Field

from auralis.sound_profile.fusion import Provenance, SoundProfileData

Region = Literal["bass", "lower_mids", "vocals", "treble", "air"]
Fit = Literal["within", "above", "below", "unreliable"]
Match = Literal["close", "good", "partial", "poor"]


class Price(BaseModel):
    amount: Decimal
    currency: str
    source: str | None = None
    observed_at: datetime | None = None


class MeasurementRef(BaseModel):
    """Where the response a recommendation rests on came from."""

    source: str
    rig: str | None
    rig_family: str | None
    variant: str | None = Field(description="Measured configuration when not stock")
    source_ref: str | None
    license: str | None
    converted_to: str | None = Field(
        default=None,
        description="When measured on another rig: the family it was converted to (derived)",
    )
    conversion_pairs: int | None = Field(
        default=None, description="Earphones measured on both rigs that the conversion rests on"
    )


class Target(BaseModel):
    """A reference target on the common grid, normalised at 500 Hz."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    label: str
    citation: str
    rig_family: str
    freqs_hz: npt.NDArray[np.float64]
    db: npt.NDArray[np.float64]


class ProductImage(BaseModel):
    """A real photograph of the product, with who to credit for it.

    Present only where one has actually been gathered. The measurement source
    carries no imagery, so most earphones have none, and the interface says so
    rather than showing a stand-in that could be mistaken for the product.
    """

    path: str = Field(description="File name within the served image directory")
    source: str
    source_url: str | None = None
    credit: str


class Mention(BaseModel):
    """A published recommendation, as the page itself put it."""

    publisher: str
    title: str
    url: str
    published_on: str | None = None
    note: str


class Standing(BaseModel):
    """How widely an earphone is stocked and recommended (see ``recommend.standing``)."""

    score: float = Field(description="0-1: 0.4 x market presence + 0.6 x published acclaim")
    points: float = Field(description="Added to the ranking score (at most 3); always shown")
    stores: int = Field(description="Retailers in the listener's market with a stored price")
    mentions: list[Mention]
    status: Literal["heuristic"] = "heuristic"


class Candidate(BaseModel):
    """One IEM with its chosen (stock) measurement, normalised at 500 Hz."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    iem_id: uuid.UUID
    brand: str
    model: str
    slug: str
    price: Price | None
    #: The best retail price per currency, and how many retailers list it there.
    prices: dict[str, Price] = Field(default_factory=dict)
    stores: dict[str, int] = Field(default_factory=dict)
    driver_config: dict[str, Any] | None = None
    image: ProductImage | None = None
    measurement: MeasurementRef
    freqs_hz: npt.NDArray[np.float64]
    response_db: npt.NDArray[np.float64] = Field(description="NaN where not measured")
    #: For a converted measurement: the observed conversion residuals (pairs x grid), which
    #: the scorer draws from so the prediction carries the conversion's own error.
    transfer_residuals: npt.NDArray[np.float64] | None = Field(default=None, exclude=True)

    @property
    def scored_on(self) -> str | None:
        """The rig family this candidate is compared on."""
        return self.measurement.converted_to or self.measurement.rig_family

    @property
    def name(self) -> str:
        return f"{self.brand} {self.model}"


DriverCategory = Literal["dynamic", "balanced_armature", "planar", "hybrid"]
_SINGLE_KINDS = ("dynamic", "balanced_armature", "planar")
_DRIVER_KINDS = (*_SINGLE_KINDS, "electrostatic", "piezo", "bone_conduction")


def driver_category(config: dict[str, Any] | None) -> DriverCategory | None:
    """One technology, or a hybrid of several; ``None`` when nothing is recorded.

    Reads both the retailer-listing records (which carry ``category`` and
    ``kinds``) and hand-entered counts such as ``{"dynamic": 1, "balanced_armature": 4}``.
    """
    if not config:
        return None
    if config.get("category") in (*_SINGLE_KINDS, "hybrid"):
        return config["category"]  # type: ignore[no-any-return]
    kinds = {k for k in _DRIVER_KINDS if isinstance(config.get(k), int) and config[k] > 0}
    if len(kinds) > 1:
        return "hybrid"
    if len(kinds) == 1 and (only := next(iter(kinds))) in _SINGLE_KINDS:
        return only  # type: ignore[return-value]
    return None


class Constraints(BaseModel):
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    currency: str | None = None
    rig_family: str = "iec60318-4"


class Reason(BaseModel):
    """One explanation, generated from numbers the engine actually computed."""

    kind: Literal["match", "mismatch", "note"]
    region: Region | None = None
    message: str
    error_db: float | None = Field(default=None, description="Measured minus your target")
    tolerance_db: float | None = Field(default=None, description="Your range in this region")
    status: Provenance = "derived"


class RegionFit(BaseModel):
    region: Region
    label: str
    low_hz: float
    high_hz: float
    error_db: float | None = Field(description="Mean of measured minus your target (derived)")
    tolerance_db: float = Field(description="80 % range of your target here (model-inferred)")
    fit: Fit
    target_db: float = Field(description="Your target offset from the reference here")
    target_basis: str = Field(description="What your target in this region rests on")


class Prediction(BaseModel):
    """The model's rating, averaged over draws of the listener's target (expected value)."""

    mean: float
    low: float = Field(description="10th percentile over your profile's uncertainty")
    high: float = Field(description="90th percentile over your profile's uncertainty")


class BandValue(BaseModel):
    band: str
    center_hz: float
    measured_db: float | None = Field(description="IEM minus reference target, 1/6-octave")


class Recommendation(BaseModel):
    iem_id: uuid.UUID
    brand: str
    model: str
    slug: str = Field(description="Stable identifier, e.g. for looking up review evidence")
    rank: int
    match: Match
    predicted_preference: Prediction = Field(
        description="Olive et al. in-ear model against your personal target (extension)"
    )
    population_preference: float = Field(
        description="Olive et al. in-ear model against the reference target, as published"
    )
    price: Price | None
    driver_config: dict[str, Any] | None = None
    driver_category: DriverCategory | None = Field(
        default=None,
        description="From the product's recorded driver configuration; never ranked on",
    )
    image: ProductImage | None = Field(
        default=None, description="A real product photograph, where one has been gathered"
    )
    standing: Standing | None = Field(
        default=None, description="Community standing: a rule of thumb, at most +3 points"
    )
    regions: list[RegionFit]
    bands: list[BandValue]
    reasons: list[Reason]
    measurement: MeasurementRef


class Recommender(Protocol):
    version: str

    def recommend(
        self,
        profile: SoundProfileData,
        candidates: list[Candidate],
        target: Target,
        constraints: Constraints,
        *,
        limit: int = 10,
    ) -> list[Recommendation]: ...
