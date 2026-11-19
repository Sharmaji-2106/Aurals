"""Rank the exact same local sound-profile IDs named in a prior snapshot."""

import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import select

from auralis.db import new_session
from auralis.recommend.base import Constraints
from auralis.recommend.service import recommend
from auralis.sound_profile.fusion import SoundProfileData
from auralis.sound_profile.models import SoundProfile

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data/iem/reports"
name, source_name = sys.argv[1:3]
reference = json.loads((REPORTS / f"ranking-{source_name}.json").read_text(encoding="utf-8"))
sample = json.loads((ROOT / "web/src/components/book/sample-match.json").read_text(encoding="utf-8"))
output = {}
with new_session() as session:
    for key in reference:
        if key == "sample":
            data = SoundProfileData.model_validate(sample["sound"]["data"])
        else:
            profile = session.scalar(select(SoundProfile).where(SoundProfile.id == uuid.UUID(key)))
            if profile is None:
                raise ValueError(f"reference profile absent locally: {key}")
            data = SoundProfileData.model_validate(profile.profile)
        result = recommend(session, data, Constraints(), limit=1000)
        output[key] = [{"slug": item.slug, "score": item.predicted_preference.mean,
                        "source_ref": item.measurement.source_ref} for item in result.items]
target = REPORTS / f"ranking-{name}.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(output, handle, indent=2)
print({key: len(rows) for key, rows in output.items()})
