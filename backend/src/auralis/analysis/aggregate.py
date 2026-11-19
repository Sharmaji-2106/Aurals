"""Aggregate curated tracks into a MusicProfile (the listening representation).

Layers, kept apart:

* measured: per-track band levels (power per octave relative to 500 Hz-2 kHz),
  loudness, bandwidth and the rest of :class:`TrackFeatures`;
* derived: each band's deviation from the reference corpus in dB and in corpus-scale
  units, summarised across the library by a weighted median with a bootstrap
  estimate of its sampling uncertainty (``balance_db`` / ``balance_z``);
* heuristic: 0-1 descriptors and band emphasis (logistic of the same z-scores).

The weighted median is robust to a single extreme recording, the per-octave levels are
relative to the midrange so mastering loudness cancels out, and every track counts once
regardless of its duration (curation weights handle duplicates and outliers).
"""

from __future__ import annotations

import hashlib
import math
from collections import Counter
from collections.abc import Mapping, Sequence
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
from pydantic import BaseModel, Field

from auralis.acoustics.bands import BANDS, BANDS_VERSION, BandKey
from auralis.analysis.curation import Curation, CurationTrack, curate
from auralis.analysis.descriptors import (
    DESCRIPTOR_KEYS,
    DESCRIPTOR_SPECS,
    Calibration,
    DescriptorKey,
    TrackDescriptors,
    describe,
    descriptor_z,
    load_calibration,
)
from auralis.analysis.version import ANALYZER_VERSION, DESCRIPTORS_VERSION, MUSIC_PROFILE_VERSION

# A track "covers" a band when its codec kept content up to (most of) that band.
AIR_BANDWIDTH_HZ = 16_000.0
UPPER_TREBLE_BANDWIDTH_HZ = 11_000.0


class Stat(BaseModel):
    median: float
    p25: float
    p75: float


class Uncertain(BaseModel):
    """A library-level estimate with its sampling uncertainty (bootstrap over songs)."""

    estimate: float
    se: float = Field(description="Bootstrap standard error of the estimate")
    ci_low: float = Field(description="5th percentile of the bootstrap distribution")
    ci_high: float = Field(description="95th percentile of the bootstrap distribution")
    method: Literal["bootstrap", "approximation"] = Field(
        default="bootstrap",
        description="approximation: too few songs to resample; SE from the corpus spread",
    )


class BandSummary(BaseModel):
    key: BandKey
    label: str
    low_hz: float
    high_hz: float
    level_db: Stat = Field(description="Power per octave relative to 500-2000 Hz (measured)")
    emphasis: Stat = Field(description="0-1 relative to the calibration corpus (heuristic)")
    confidence: float
    deviation_db: Stat | None = Field(
        default=None, description="Per-song deviation from the reference corpus median (derived)"
    )
    balance_db: Uncertain | None = Field(
        default=None, description="The library's typical deviation in dB, with uncertainty"
    )
    balance_z: Uncertain | None = Field(
        default=None, description="The same in units of the corpus's robust spread"
    )
    coverage: float = Field(
        default=1.0, description="Share of songs whose codec kept content in this band"
    )


class DescriptorSummary(BaseModel):
    key: DescriptorKey
    label: str
    summary: str
    basis: Literal["heuristic"] = "heuristic"
    value: Stat
    confidence: float
    z: Uncertain | None = Field(
        default=None, description="Library median of the underlying z-scores, with uncertainty"
    )


class MeasureSummary(BaseModel):
    key: str
    label: str
    unit: str
    value: Stat


class SpectrumSummary(BaseModel):
    freqs_hz: list[float]
    median_db: list[float]
    p25_db: list[float]
    p75_db: list[float]


class ClusterSummary(BaseModel):
    id: int
    label: str
    size: int
    share: float
    descriptors: dict[DescriptorKey, float]
    band_emphasis: dict[BandKey, float]
    representative_track_ids: list[str]


class MapPoint(BaseModel):
    track_id: str
    x: float = Field(description="brightness descriptor")
    y: float = Field(description="energy descriptor")
    cluster: int
    weight: float
    flag: Literal["duplicate", "outlier"] | None = None


class LibraryCounts(BaseModel):
    analysed: int
    effective: float
    duplicates: int
    outliers: int


class MusicProfileData(BaseModel):
    version: str = MUSIC_PROFILE_VERSION
    analyzer_version: str = ANALYZER_VERSION
    descriptors_version: str = DESCRIPTORS_VERSION
    bands_version: str = BANDS_VERSION
    calibration: str
    counts: LibraryCounts
    bands: list[BandSummary]
    descriptors: list[DescriptorSummary]
    measures: list[MeasureSummary]
    spectrum: SpectrumSummary
    clusters: list[ClusterSummary]
    map: list[MapPoint]
    notes: list[str]


def weighted_quantiles(
    values: npt.ArrayLike, weights: npt.ArrayLike, qs: Sequence[float]
) -> list[float]:
    v = np.asarray(values, dtype=np.float64)
    w = np.asarray(weights, dtype=np.float64)
    keep = w > 0
    v, w = v[keep], w[keep]
    if v.size == 0:
        return [float("nan")] * len(qs)
    order = np.argsort(v)
    v, w = v[order], w[order]
    cdf = (np.cumsum(w) - 0.5 * w) / w.sum()
    return [float(np.interp(q, cdf, v)) for q in qs]


def _stat(values: npt.ArrayLike, weights: npt.ArrayLike, digits: int = 3) -> Stat:
    p25, median, p75 = weighted_quantiles(values, weights, (0.25, 0.5, 0.75))
    return Stat(median=round(median, digits), p25=round(p25, digits), p75=round(p75, digits))


BOOTSTRAP_SAMPLES = 400
# Median of a normal sample: SE = sqrt(pi / 2) * sigma / sqrt(n).
_MEDIAN_SE_FACTOR = math.sqrt(math.pi / 2)


def _seed(track_ids: Sequence[str]) -> int:
    digest = hashlib.sha256("|".join(sorted(track_ids)).encode()).digest()
    return int.from_bytes(digest[:8], "little")


def _bootstrap_median(
    values: npt.ArrayLike,
    weights: npt.ArrayLike,
    resamples: npt.NDArray[np.int64] | None,
    fallback_scale: float,
    digits: int = 3,
) -> Uncertain:
    """Weighted median with a bootstrap over songs (the same resamples for every metric).

    With fewer than three weighted songs a bootstrap is meaningless; the standard
    error then falls back to the median's normal approximation using the reference
    corpus's spread, and says so.
    """
    v = np.asarray(values, dtype=np.float64)
    w = np.asarray(weights, dtype=np.float64)
    estimate = weighted_quantiles(v, w, [0.5])[0]
    n_eff = float(w.sum())
    if resamples is None or n_eff < 3:
        se = _MEDIAN_SE_FACTOR * fallback_scale / math.sqrt(max(n_eff, 1.0))
        return Uncertain(
            estimate=round(estimate, digits),
            se=round(se, digits),
            ci_low=round(estimate - 1.645 * se, digits),
            ci_high=round(estimate + 1.645 * se, digits),
            method="approximation",
        )
    medians = np.array([weighted_quantiles(v[idx], w[idx], [0.5])[0] for idx in resamples])
    medians = medians[np.isfinite(medians)]
    return Uncertain(
        estimate=round(estimate, digits),
        se=round(float(np.std(medians, ddof=1)), digits),
        ci_low=round(float(np.percentile(medians, 5)), digits),
        ci_high=round(float(np.percentile(medians, 95)), digits),
    )


def _confidence(n_effective: float, iqr: float, coverage: float = 1.0) -> float:
    sample = n_effective / (n_effective + 4.0)
    consistency = 1.0 - 0.5 * min(1.0, iqr / 0.5)
    return round(sample * consistency * coverage, 3)


_TRAIT_WORDS: dict[str, tuple[str, str]] = {
    "brightness": ("Darker", "Brighter"),
    "warmth": ("Leaner", "Warmer"),
    "energy": ("Calmer", "More energetic"),
    "dynamics": ("More compressed", "More dynamic"),
    "density": ("Sparser", "Busier"),
    "width": ("Narrower", "Wider"),
    "bass": ("Lighter bass", "Heavier bass"),
}


def cluster_traits(cluster: dict[str, float], library: dict[str, float]) -> list[tuple[float, str]]:
    """Traits that set a cluster apart from the whole library, strongest first."""
    traits = []
    for key, (low, high) in _TRAIT_WORDS.items():
        delta = cluster[key] - library[key]
        traits.append((abs(delta), high if delta >= 0 else low))
    return sorted(traits, reverse=True)


def label_clusters(clusters: list[dict[str, float]], library: dict[str, float]) -> list[str]:
    """Distinct, data-derived names: the two traits that most separate each cluster."""
    if len(clusters) == 1:
        return ["Your core sound"]
    labels: list[str] = []
    for cluster in clusters:
        words = [w for dist, w in cluster_traits(cluster, library) if dist >= 0.03]
        label = " · ".join(words[:2]) or "Close to your overall sound"
        # Keep names unique: swap in the next distinguishing trait on a clash.
        extra = iter(words[2:])
        while label in labels:
            nxt = next(extra, None)
            label = f"{words[0]} · {nxt}" if nxt else f"{label} ({len(labels) + 1})"
        labels.append(label)
    return labels


def build_profile(
    tracks: Sequence[CurationTrack], calibration: Calibration | None = None
) -> MusicProfileData:
    if not tracks:
        raise ValueError("cannot build a profile from zero tracks")
    cal = calibration or load_calibration()
    curation: Curation = curate(tracks)
    ids = [t.track_id for t in tracks]
    w = np.array([curation.weights[i] for i in ids])
    desc: list[TrackDescriptors] = [describe(t.features, cal) for t in tracks]
    n_eff = float(w.sum())

    bandwidths = np.array([t.features.effective_bandwidth_hz for t in tracks])
    coverage = {
        "air": float(np.average(bandwidths >= AIR_BANDWIDTH_HZ, weights=w)),
        "upper_treble": float(np.average(bandwidths >= UPPER_TREBLE_BANDWIDTH_HZ, weights=w)),
    }

    # One set of bootstrap resamples (songs drawn with replacement) shared by every
    # metric, seeded by the library's contents so rebuilding gives identical numbers.
    positive = np.flatnonzero(w > 0)
    resamples = (
        np.random.default_rng(_seed(ids)).choice(
            positive, size=(BOOTSTRAP_SAMPLES, positive.size), replace=True
        )
        if positive.size >= 3
        else None
    )

    bands = []
    for band in BANDS:
        emphasis = [d.band_emphasis[band.key] for d in desc]
        emph = _stat(emphasis, w)
        center, scale = cal.metrics[f"band:{band.key}"]
        levels = np.array([t.features.band_levels_db[band.key] for t in tracks])
        deviation = levels - center
        bands.append(
            BandSummary(
                key=band.key,
                label=band.label,
                low_hz=band.low_hz,
                high_hz=band.high_hz,
                level_db=_stat(levels, w, 2),
                emphasis=emph,
                confidence=_confidence(n_eff, emph.p75 - emph.p25, coverage.get(band.key, 1.0)),
                deviation_db=_stat(deviation, w, 2),
                balance_db=_bootstrap_median(deviation, w, resamples, scale, 2),
                balance_z=_bootstrap_median(deviation / scale, w, resamples, 1.0),
                coverage=round(coverage.get(band.key, 1.0), 3),
            )
        )

    track_z = [descriptor_z(t.features, cal) for t in tracks]

    descriptors = []
    for key in DESCRIPTOR_KEYS:
        stat = _stat([d.values[key] for d in desc], w)
        spec = DESCRIPTOR_SPECS[key]
        descriptors.append(
            DescriptorSummary(
                key=key,
                label=spec.label,
                summary=spec.summary,
                value=stat,
                confidence=_confidence(n_eff, stat.p75 - stat.p25),
                z=_bootstrap_median([z[key] for z in track_z], w, resamples, 1.0),
            )
        )

    def measure(
        key: str, label: str, unit: str, values: list[float | None]
    ) -> MeasureSummary | None:
        pairs = [(v, wi) for v, wi in zip(values, w, strict=True) if v is not None]
        if not pairs:
            return None
        return MeasureSummary(
            key=key,
            label=label,
            unit=unit,
            value=_stat([p[0] for p in pairs], [p[1] for p in pairs], 2),
        )

    measures = [
        m
        for m in (
            measure("tempo_bpm", "Tempo", "BPM", [t.features.tempo_bpm for t in tracks]),
            measure(
                "integrated_lufs", "Loudness", "LUFS", [t.features.integrated_lufs for t in tracks]
            ),
            measure(
                "loudness_range_lu",
                "Loudness range",
                "LU",
                [t.features.loudness_range_lu for t in tracks],
            ),
            measure(
                "side_to_mid_db",
                "Side / mid energy",
                "dB",
                [t.features.side_to_mid_db for t in tracks],
            ),
            measure(
                "centroid_hz",
                "Spectral centroid",
                "Hz",
                [t.features.centroid_hz.median for t in tracks],
            ),
        )
        if m is not None
    ]

    spectra = _aligned_spectra(tracks)
    freqs, matrix = spectra
    spectrum = SpectrumSummary(freqs_hz=freqs, median_db=[], p25_db=[], p75_db=[])
    for col in range(matrix.shape[1]):
        column = matrix[:, col]
        valid = np.isfinite(column)
        p25, med, p75 = weighted_quantiles(column[valid], w[valid], (0.25, 0.5, 0.75))
        spectrum.median_db.append(round(med, 2))
        spectrum.p25_db.append(round(p25, 2))
        spectrum.p75_db.append(round(p75, 2))

    clusters = []
    by_cluster: dict[int, list[int]] = {}
    for idx, tid in enumerate(ids):
        if tid not in curation.duplicate_of:
            by_cluster.setdefault(curation.cluster_of[tid], []).append(idx)
    for cid in sorted(by_cluster):
        members = by_cluster[cid]
        cw = w[members]
        cdesc = {
            k: round(float(np.average([desc[i].values[k] for i in members], weights=cw)), 3)
            for k in DESCRIPTOR_KEYS
        }
        cemph = {
            b.key: round(
                float(np.average([desc[i].band_emphasis[b.key] for i in members], weights=cw)), 3
            )
            for b in BANDS
        }
        centroid = np.array([cdesc[k] for k in DESCRIPTOR_KEYS])
        distances = [
            (
                float(
                    np.linalg.norm(
                        np.array([desc[i].values[k] for k in DESCRIPTOR_KEYS]) - centroid
                    )
                ),
                i,
            )
            for i in members
            if ids[i] not in curation.outlier_scores
        ]
        reps = [ids[i] for _, i in sorted(distances)[:3]]
        clusters.append(
            ClusterSummary(
                id=cid,
                label="",
                size=len(members),
                share=round(float(cw.sum()) / n_eff, 3) if n_eff else 0.0,
                descriptors=cdesc,
                band_emphasis=cemph,
                representative_track_ids=reps,
            )
        )

    def trait_vector(values: Mapping[Any, float], emph: Mapping[Any, float]) -> dict[str, float]:
        return {**values, "bass": (emph["sub_bass"] + emph["mid_bass"]) / 2}

    library_traits = trait_vector(
        {d.key: d.value.median for d in descriptors},
        {b.key: b.emphasis.median for b in bands},
    )
    names = label_clusters(
        [trait_vector(c.descriptors, c.band_emphasis) for c in clusters], library_traits
    )
    for cluster, name in zip(clusters, names, strict=True):
        cluster.label = name

    points = []
    for idx, tid in enumerate(ids):
        flag: Literal["duplicate", "outlier"] | None = None
        if tid in curation.duplicate_of:
            flag = "duplicate"
        elif tid in curation.outlier_scores:
            flag = "outlier"
        points.append(
            MapPoint(
                track_id=tid,
                x=desc[idx].values["brightness"],
                y=desc[idx].values["energy"],
                cluster=curation.cluster_of.get(tid, 0),
                weight=round(float(w[idx]), 3),
                flag=flag,
            )
        )

    return MusicProfileData(
        calibration=cal.id,
        counts=LibraryCounts(
            analysed=len(tracks),
            effective=round(n_eff, 2),
            duplicates=len(curation.duplicate_of),
            outliers=len(curation.outlier_scores),
        ),
        bands=bands,
        descriptors=descriptors,
        measures=measures,
        spectrum=spectrum,
        clusters=clusters,
        map=points,
        notes=_notes(len(tracks), n_eff, coverage, curation, tracks),
    )


def _aligned_spectra(
    tracks: Sequence[CurationTrack],
) -> tuple[list[float], npt.NDArray[np.float64]]:
    """Put every track's spectrum on the longest grid; missing top points become NaN."""
    longest = max(tracks, key=lambda t: len(t.features.spectrum_freqs_hz))
    freqs = longest.features.spectrum_freqs_hz
    matrix = np.full((len(tracks), len(freqs)), np.nan)
    for i, t in enumerate(tracks):
        n = min(len(t.features.spectrum_db), len(freqs))
        matrix[i, :n] = t.features.spectrum_db[:n]
    return freqs, matrix


def _notes(
    n: int,
    n_eff: float,
    coverage: dict[str, float],
    curation: Curation,
    tracks: Sequence[CurationTrack],
) -> list[str]:
    notes = []
    if n_eff < 8:
        notes.append(
            f"Based on {n} track{'s' if n != 1 else ''}. Add more music for a steadier profile."
        )
    if coverage["air"] < 0.6:
        notes.append(
            f"Only {coverage['air']:.0%} of tracks carried content above 16 kHz (streaming "
            "codecs often cut it), so the air band is less certain."
        )
    if curation.duplicate_of:
        k = len(curation.duplicate_of)
        notes.append(f"{k} duplicate upload{'s were' if k != 1 else ' was'} counted once.")
    if curation.outlier_scores:
        k = len(curation.outlier_scores)
        notes.append(
            f"{k} acoustically atypical track{'s' if k != 1 else ''} "
            f"{'were' if k != 1 else 'was'} down-weighted rather than removed."
        )
    truncated = sum(t.features.truncated for t in tracks)
    if truncated:
        notes.append(
            f"{truncated} long track{'s' if truncated != 1 else ''} "
            "analysed on the first 10 minutes."
        )
    counts = Counter(curation.cluster_of.values())
    if curation.cluster_count > 1 and min(counts.values()) >= 3:
        notes.append(
            f"Your library splits into {curation.cluster_count} distinct sonic groups; "
            "the overall profile blends them in proportion."
        )
    return notes
