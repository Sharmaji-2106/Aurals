"""Library-level curation: duplicates, outliers and sonic clusters.

The aim is a robust picture of what someone listens to, not an average over whatever
happened to be in a playlist:

* the same recording uploaded twice should count once;
* a podcast, rain-sounds video or other atypical item shouldn't pull the profile
  around (it is down-weighted, not dropped, and the reason is recorded);
* distinct listening modes are kept visible as clusters, because the median of a
  bimodal library describes neither mode.

Track proportions are otherwise preserved: if 80 % of a library is electronic, the
profile should reflect that.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

from auralis.acoustics.bands import BAND_KEYS
from auralis.analysis.descriptors import load_calibration, raw_metrics
from auralis.analysis.features import TrackFeatures

OUTLIER_WEIGHT = 0.25
OUTLIER_SCORE = 3.0
DUPLICATE_DISTANCE = 0.06
MIN_TRACKS_FOR_OUTLIERS = 8
MIN_TRACKS_FOR_CLUSTERS = 10
MAX_CLUSTERS = 5
MIN_SILHOUETTE = 0.12
CLUSTER_COMPONENTS = 4  # PCA keeps the strong shared directions, drops per-feature noise

CORE_METRICS = (
    *(f"band:{k}" for k in BAND_KEYS),
    "log2_centroid",
    "integrated_lufs",
    "log10_flatness",
    "onset_rate_hz",
)
CLUSTER_METRICS = (*CORE_METRICS, "percussive_ratio", "loudness_range_lu", "side_to_mid_db")
TIMBRE_COEFFS = slice(1, 13)  # MFCC 1-12; coefficient 0 is overall level


@dataclass(frozen=True, slots=True)
class CurationTrack:
    track_id: str
    features: TrackFeatures
    duration_s: float | None = None


@dataclass(slots=True)
class Curation:
    weights: dict[str, float]
    duplicate_of: dict[str, str] = field(default_factory=dict)
    outlier_scores: dict[str, float] = field(default_factory=dict)
    cluster_of: dict[str, int] = field(default_factory=dict)
    cluster_count: int = 1
    silhouette: float | None = None


def _robust_z(matrix: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    median = np.median(matrix, axis=0)
    mad = np.median(np.abs(matrix - median), axis=0) * 1.4826
    iqr_like = np.maximum(mad, np.std(matrix, axis=0) * 0.5)
    return np.asarray((matrix - median) / np.maximum(iqr_like, 1e-6))


def _calibrated(matrix: npt.NDArray[np.float64], names: Sequence[str]) -> npt.NDArray[np.float64]:
    """Scale by how much each metric varies across music in general (the calibration
    corpus), so a feature matters in proportion to how unusual its differences are."""
    metrics = load_calibration().metrics
    centers = np.array([metrics[n][0] for n in names])
    scales = np.array([metrics[n][1] for n in names])
    return np.asarray((matrix - centers) / scales)


def _metric_matrix(
    tracks: Sequence[CurationTrack], names: Sequence[str]
) -> npt.NDArray[np.float64]:
    rows = [raw_metrics(t.features) for t in tracks]
    return np.array([[r[n] for n in names] for r in rows], dtype=np.float64)


def _timbre_matrix(tracks: Sequence[CurationTrack]) -> npt.NDArray[np.float64]:
    return np.array([t.features.mfcc_mean[TIMBRE_COEFFS] for t in tracks], dtype=np.float64)


def find_duplicates(tracks: Sequence[CurationTrack]) -> dict[str, str]:
    """Map near-identical recordings onto the first occurrence."""
    if len(tracks) < 2:
        return {}
    x = np.hstack([_metric_matrix(tracks, CLUSTER_METRICS), _timbre_matrix(tracks)])
    scale = np.maximum(np.std(x, axis=0), 1e-6)
    z = x / scale
    dim = z.shape[1]
    duplicates: dict[str, str] = {}
    for i in range(len(tracks)):
        if tracks[i].track_id in duplicates:
            continue
        dist = np.linalg.norm(z[i + 1 :] - z[i], axis=1) / np.sqrt(dim)
        for offset in np.nonzero(dist < DUPLICATE_DISTANCE)[0]:
            j = i + 1 + int(offset)
            a, b = tracks[i].features.analysed_seconds, tracks[j].features.analysed_seconds
            if abs(a - b) <= 3.0 and tracks[j].track_id not in duplicates:
                duplicates[tracks[j].track_id] = tracks[i].track_id
    return duplicates


def curate(tracks: Sequence[CurationTrack]) -> Curation:
    ids = [t.track_id for t in tracks]
    weights = dict.fromkeys(ids, 1.0)
    result = Curation(weights=weights)
    if not tracks:
        return result

    result.duplicate_of = find_duplicates(tracks)
    for dup, canonical in result.duplicate_of.items():
        weights[dup] = 0.0
        weights[canonical] = 1.0  # a duplicate adds no extra weight to its original

    unique = [t for t in tracks if t.track_id not in result.duplicate_of]
    if len(unique) >= MIN_TRACKS_FOR_OUTLIERS:
        z = _robust_z(_metric_matrix(unique, CORE_METRICS))
        scores = np.sqrt(np.mean(np.clip(z, -10, 10) ** 2, axis=1))
        for t, score in zip(unique, scores, strict=True):
            if score > OUTLIER_SCORE:
                result.outlier_scores[t.track_id] = round(float(score), 2)
                weights[t.track_id] = OUTLIER_WEIGHT

    for t in unique:
        result.cluster_of[t.track_id] = 0
    if len(unique) >= MIN_TRACKS_FOR_CLUSTERS:
        x = np.hstack(
            [
                _calibrated(_metric_matrix(unique, CLUSTER_METRICS), CLUSTER_METRICS),
                0.5 * _robust_z(_timbre_matrix(unique)),  # timbre helps, but shouldn't dominate
            ]
        )
        x = np.clip(x, -4, 4)
        x = PCA(n_components=min(CLUSTER_COMPONENTS, *x.shape), random_state=0).fit_transform(x)
        best: tuple[float, npt.NDArray[np.int32], int] | None = None
        for k in range(2, min(MAX_CLUSTERS, len(unique) // 4) + 1):
            labels = KMeans(n_clusters=k, n_init=10, random_state=0).fit_predict(x)
            if len(set(labels)) < k:
                continue
            score = float(silhouette_score(x, labels))
            if best is None or score > best[0]:
                best = (score, labels, k)
        if best is not None and best[0] >= MIN_SILHOUETTE:
            score, labels, k = best
            # Order clusters by size so cluster 0 is the dominant listening mode.
            order = np.argsort(-np.bincount(labels, minlength=k), kind="stable")
            remap = {int(old): new for new, old in enumerate(order)}
            result.cluster_of = {
                t.track_id: remap[int(lbl)] for t, lbl in zip(unique, labels, strict=True)
            }
            result.cluster_count = k
            result.silhouette = round(score, 3)
    for dup, canonical in result.duplicate_of.items():
        result.cluster_of[dup] = result.cluster_of[canonical]
    return result
