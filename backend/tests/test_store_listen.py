"""The listening curve: an earphone's measured tuning, as a filter for the browser."""

from __future__ import annotations

import numpy as np

from auralis.acoustics import fr
from auralis.store.listen import LIMIT_DB, listening_gain

F = fr.R40_HZ


def at(gain: np.ndarray, hz: float) -> float:
    return float(np.interp(np.log10(hz), np.log10(F), gain))


def test_the_same_curve_changes_nothing() -> None:
    curve = 90 - 3 * np.log2(F / 1000)
    assert np.allclose(listening_gain(F, curve, curve), 0.0, atol=1e-9)


def test_a_bass_shelf_is_heard_as_a_bass_shelf() -> None:
    base = np.full_like(F, 90.0)
    bassy = base + 6.0 / (1 + (F / 150) ** 2)
    gain = listening_gain(F, bassy, base)
    assert 4.5 < at(gain, 40) < 6.5
    assert abs(at(gain, 1000)) < 0.6
    assert abs(at(gain, 5000)) < 0.6


def test_treble_swings_are_softened_and_everything_is_limited() -> None:
    base = np.full_like(F, 90.0)
    peak = base + 10.0 * np.exp(-0.5 * (np.log2(F / 16_000) / 0.15) ** 2)
    assert at(listening_gain(F, peak, base), 16_000) < 6.0  # halved, then smoothed
    wild = base + 40.0 / (1 + (F / 100) ** 2)
    assert listening_gain(F, wild, base).max() <= LIMIT_DB


def test_unmeasured_ends_are_held_not_invented() -> None:
    base = np.full_like(F, 90.0)
    partial = base + 3.0
    partial[F > 12_000] = np.nan
    gain = listening_gain(F, partial, base)
    assert np.isfinite(gain).all()
    assert abs(at(gain, 15_000)) < 1.0  # level-aligned: an offset is not a tuning


def _seed() -> None:
    from auralis.db import session_scope
    from auralis.iem.importer import checksum, import_points
    from auralis.iem.models import FrTarget

    freqs = np.geomspace(20, 20_000, 400)

    def synthetic(bass: float) -> list[list[float]]:
        """Made-up response: flat plus a bass shelf. Test data only, never a real IEM."""
        return [[float(f), float(90 + bass / (1 + (f / 150) ** 2))] for f in freqs]

    target = synthetic(0)
    with session_scope() as s:
        s.add(
            FrTarget(
                name="harman-ie-2019",
                label="Synthetic stand-in",
                rig_family="iec60318-4",
                citation="test",
                source="test",
                raw_points=target,
                checksum=checksum(target),
            )
        )
    with session_scope() as s:
        for model, bass in (("Flat", 0.0), ("Bassy", 8.0)):
            import_points(
                s,
                synthetic(bass),
                brand="Synthetic",
                model=model,
                source="synthetic test data",
                rig_family="iec60318-4",
            )


def test_listening_curve_api(client) -> None:  # type: ignore[no-untyped-def]
    _seed()
    slugs = {p["model"]: p["slug"] for p in client.get("/api/store/products").json()["items"]}
    body = client.get(f"/api/store/products/{slugs['Bassy']}/listen").json()
    assert body["baseline"] == "target"
    assert body["measured_by"] == "synthetic test data"
    assert len(body["freqs_hz"]) == len(body["gain_db"])
    gain = np.array(body["gain_db"])
    assert at(gain, 40) > 5.0
    assert abs(at(gain, 1000)) < 0.6
    assert any("reference target" in n for n in body["notes"])

    # Against a measured earphone: the difference between the two.
    against = client.get(
        f"/api/store/products/{slugs['Bassy']}/listen", params={"against": slugs["Flat"]}
    ).json()
    assert against["baseline"] == "device"
    assert against["baseline_label"] == "Synthetic Flat"

    missing = client.get("/api/store/products/not-a-real-earphone/listen")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_listenable"
