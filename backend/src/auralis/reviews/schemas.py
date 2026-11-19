from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Stance = Literal["positive", "negative", "mixed"]
SourceKind = Literal["publication", "forum", "reddit", "video"]


class Claim(BaseModel):
    id: uuid.UUID
    topic: str
    topic_label: str
    stance: Stance
    quote: str = Field(description="Quoted verbatim from the source")
    tagged_by: str = Field(description="Who assigned the topic and stance to this quote")


class Source(BaseModel):
    id: uuid.UUID
    kind: SourceKind
    publication: str
    author: str | None
    title: str
    url: str
    published_on: date | None
    excerpt: str | None
    retrieved_at: datetime
    license_note: str | None
    claims: list[Claim]


class TopicOut(BaseModel):
    """A theme, counted from the evidence rather than declared in advance."""

    slug: str
    label: str
    positive: int
    negative: int
    mixed: int
    sources: list[uuid.UUID]
    contested: bool = Field(description="At least one source each way on this theme")


class Collection(BaseModel):
    name: str
    is_live: bool = Field(description="False for a curated snapshot; never animated as a crawl")
    retrieved_at: datetime | None
    note: str


class IemRef(BaseModel):
    id: uuid.UUID
    brand: str
    model: str
    slug: str
    has_measurement: bool = Field(description="Whether a measured response exists for this IEM")


class ReviewsOut(BaseModel):
    iem: IemRef
    collection: Collection
    topics: list[TopicOut]
    sources: list[Source]


class CollectionSummary(BaseModel):
    slug: str
    brand: str
    model: str
    sources: int


class CollectionsOut(BaseModel):
    showcase_slug: str | None = Field(description="The IEM the research experience opens on")
    items: list[CollectionSummary]
