"""Snapshot all ranked IEMs for three real, locally stored sound profiles."""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select

from auralis.db import new_session
from auralis.sound_profile.models import SoundProfile
from auralis.recommend.base import Constraints
from auralis.recommend.service import recommend
from auralis.sound_profile.fusion import SoundProfileData

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data/iem/reports"


def run(name: str) -> None:
    sample = json.loads((ROOT / "web/src/components/book/sample-match.json").read_text(encoding="utf-8"))
    profiles = [("sample", SoundProfileData.model_validate(sample["sound"]["data"]))]
    with new_session() as session:
        rows = session.scalars(select(SoundProfile).order_by(SoundProfile.created_at.desc()).limit(20)).all()
        for row in rows:
            if len(profiles) >= 4:
                break
            if str(row.id) == sample["sound"]["id"]:
                continue
            data = SoundProfileData.model_validate(row.profile)
            profiles.append((str(row.id), data))
        output = {}
        for key, profile in profiles:
            result = recommend(session, profile, Constraints(), limit=1000)
            output[key] = [
                {"slug": item.slug, "score": item.predicted_preference.mean,
                 "source_ref": item.measurement.source_ref}
                for item in result.items
            ]
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / f"ranking-{name}.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    print({key: len(value) for key, value in output.items()})


if __name__ == "__main__":
    import sys
    run(sys.argv[1])
