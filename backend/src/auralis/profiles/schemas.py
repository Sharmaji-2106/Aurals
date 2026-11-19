from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    field_validator,
    model_validator,
)

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Experience = Literal["new", "casual", "enthusiast"]
# The contexts a listener says they will use earphones in. Stored as declared
# preference; the recommender does not read them, and the client says so.
UseCase = Literal[
    # What the listener plays
    "pop",
    "hip_hop",
    "rock_metal",
    "electronic",
    "bollywood",
    "classical",
    "jazz_acoustic",
    # Where and how they listen
    "cinematic_gaming",
    "competitive_gaming",
    "production",
    "stage_monitoring",
    "everyday",
    "podcasts",
]
# A stated leaning only. Driver architecture is product metadata, not a predictor of
# how an earphone sounds, so nothing is ranked or filtered by it.
DriverPreference = Literal["dynamic", "balanced_armature", "planar", "hybrid", "none"]
# Budgets are stored as exact decimals but sent to clients as plain numbers.
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
GearItem = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
# An IEM slug the listener saved. Shape is checked here; whether it names a real
# earphone is the catalogue's business, and an unknown slug simply renders nothing.
IemSlug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,259}$")]


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    display_name: str
    country_code: str | None
    currency: str | None
    budget_min: Money | None
    budget_max: Money | None
    experience: Experience | None
    current_gear: list[str]
    use_cases: list[UseCase]
    primary_use_case: UseCase | None
    driver_preference: DriverPreference | None
    shortlist: list[str]


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    country_code: Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{2}$")] | None = None
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{3}$")] | None = None
    budget_min: Annotated[Decimal, Field(ge=0, le=100_000, decimal_places=2)] | None = None
    budget_max: Annotated[Decimal, Field(ge=0, le=100_000, decimal_places=2)] | None = None
    experience: Experience | None = None
    current_gear: Annotated[list[GearItem], Field(max_length=10)] | None = None
    use_cases: Annotated[list[UseCase], Field(max_length=16)] | None = None
    primary_use_case: UseCase | None = None
    driver_preference: DriverPreference | None = None
    shortlist: Annotated[list[IemSlug], Field(max_length=40)] | None = None

    @field_validator("use_cases", "shortlist")
    @classmethod
    def keep_unique_in_order(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        seen: list[str] = []
        for item in v:
            if item not in seen:
                seen.append(item)
        return seen

    @field_validator("country_code", "currency")
    @classmethod
    def upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v

    @model_validator(mode="after")
    def budget_order(self) -> ProfileUpdate:
        if (
            self.budget_min is not None
            and self.budget_max is not None
            and self.budget_min > self.budget_max
        ):
            raise ValueError("budget_min must not exceed budget_max")
        return self


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName


class Journey(BaseModel):
    next_step: Literal["add_music", "questionnaire", "processing", "sound_profile"]
    active_submission_id: uuid.UUID | None
    latest_submission_id: uuid.UUID | None
    has_music_profile: bool
    has_questionnaire: bool
    has_sound_profile: bool


class MeOut(BaseModel):
    id: uuid.UUID
    profile: ProfileOut
    journey: Journey


class SessionOut(BaseModel):
    me: MeOut | None
