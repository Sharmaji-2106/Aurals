"""Is the music representation stable, and does it carry information?"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from pydantic import BaseModel, Field

from auralis.acoustics.bands import BAND_KEYS, BANDS_BY_KEY
from auralis.analysis.aggregate import build_profile
from auralis.analysis.curation import CurationTrack
from auralis.analysis.descriptors import load_calibration
from auralis.evaluation.data import Library, PoolTrack
from auralis.sound_profile.fusion import fuse


def _deviations(tracks: Sequence[CurationTrack]) -> np.ndarray:
    """Per-track band deviation from the reference corpus (dB), tracks x bands."""
    cal = load_calibration()
    centers = np.array([cal.metrics[f"band:{k}"][0] for k in BAND_KEYS])
    levels = np.array([[t.features.band_levels_db[k] for k in BAND_KEYS] for t in tracks])
    return np.asarray(levels - centers)


class SizeRow(BaseModel):
    songs: int
    ci_width_db: dict[str, float]


def ci_width_by_size(
    pool: Sequence[PoolTrack], sizes: Sequence[int] = (5, 10, 20, 40, 80), reps: int = 8
) -> list[SizeRow]:
    """Median 90 % bootstrap interval width of the library balance, by library size."""
    rng = np.random.default_rng(2026)
    rows = []
    for n in sizes:
        if n > len(pool):
            continue
        widths: dict[str, list[float]] = {k: [] for k in BAND_KEYS}
        for _ in range(reps):
            chosen = rng.choice(len(pool), size=n, replace=False)
            profile = build_profile([pool[i].track for i in chosen])
            for band in profile.bands:
                if band.balance_db is not None:
                    widths[band.key].append(band.balance_db.ci_high - band.balance_db.ci_low)
        rows.append(
            SizeRow(
                songs=n,
                ci_width_db={k: round(float(np.median(v)), 2) for k, v in widths.items() if v},
            )
        )
    return rows


class SplitHalf(BaseModel):
    library: str
    songs: int
    half_correlation: float = Field(description="Mean r between halves' band profiles")
    reliability: float | None = Field(
        description="Spearman-Brown corrected to the full library; None when r <= 0"
    )
    per_band_sd_db: dict[str, float] = Field(
        description="Sampling noise of the full-library balance per band (from the halves)"
    )


def split_half(library: Library, splits: int = 50) -> SplitHalf | None:
    """How consistently do random halves of one library describe the same balance?

    The correlation is between the halves' band-deviation profiles (mids excluded,
    it is the normalisation region). Correlations are averaged via Fisher's z and the
    Spearman-Brown correction is applied to that mean, only when it is positive: a
    library whose balance sits close to the reference has little shape to reproduce,
    and its reliability is then reported as undefined rather than as a number.
    """
    dev = _deviations(library.tracks)
    if len(dev) < 10:
        return None
    rng = np.random.default_rng(7)
    fisher = []
    halves_diff = []
    keep = [i for i, k in enumerate(BAND_KEYS) if k != "mids"]
    for _ in range(splits):
        order = rng.permutation(len(dev))
        a, b = order[: len(dev) // 2], order[len(dev) // 2 :]
        ma, mb = np.median(dev[a], axis=0), np.median(dev[b], axis=0)
        r = float(np.corrcoef(ma[keep], mb[keep])[0, 1])
        fisher.append(math.atanh(max(-0.999, min(0.999, r))))
        halves_diff.append(ma - mb)
    r_mean = math.tanh(float(np.mean(fisher)))
    diff = np.array(halves_diff)
    return SplitHalf(
        library=library.label,
        songs=len(dev),
        half_correlation=round(r_mean, 3),
        reliability=round(2 * r_mean / (1 + r_mean), 3) if r_mean > 0 else None,
        # The difference of two half-medians has twice each half's variance, and a half
        # has twice the full library's; so full-library SD = SD(diff) / 2.
        per_band_sd_db={
            k: round(float(np.std(diff[:, i])) / 2, 2) for i, k in enumerate(BAND_KEYS)
        },
    )


class GenreContrast(BaseModel):
    group_a: str
    group_b: str
    songs_a: int
    songs_b: int
    sub_bass_db: tuple[float, float]
    air_db: tuple[float, float]
    difference_db: float
    permutation_p: float
    music_only_bass_db: tuple[float, float]


BASS_FORWARD = frozenset({"electronic", "hip-hop", "bass-music", "drum-and-bass", "rnb"})
ACOUSTIC = frozenset({"classical", "jazz", "folk", "acoustic", "singer-songwriter", "ambient"})


def genre_contrast(pool: Sequence[PoolTrack], genres: dict[str, str]) -> GenreContrast | None:
    """Do libraries built from bass-forward genres read differently from acoustic ones?

    Genre labels are external to the measurement, so this is not circular. The
    permutation test shuffles the labels to ask how often a difference this large
    appears by chance.
    """
    a = [p.track for p in pool if genres.get(p.source_id) in BASS_FORWARD]
    b = [p.track for p in pool if genres.get(p.source_id) in ACOUSTIC]
    if len(a) < 3 or len(b) < 3:
        return None
    sub = BAND_KEYS.index("sub_bass")
    air = BAND_KEYS.index("air")
    dev_a, dev_b = _deviations(a), _deviations(b)
    observed = float(np.median(dev_a[:, sub]) - np.median(dev_b[:, sub]))
    both = np.concatenate([dev_a[:, sub], dev_b[:, sub]])
    rng = np.random.default_rng(11)
    extreme = 0
    trials = 2000
    for _ in range(trials):
        perm = rng.permutation(both)
        diff = np.median(perm[: len(a)]) - np.median(perm[len(a) :])
        extreme += abs(diff) >= abs(observed)

    def music_bass(tracks: list[CurationTrack]) -> float:
        profile = fuse(music=build_profile(tracks), answers=None)
        return next(c.offset_db for c in profile.preference_curve if c.band == "sub_bass")

    return GenreContrast(
        group_a="bass-forward genres",
        group_b="acoustic genres",
        songs_a=len(a),
        songs_b=len(b),
        sub_bass_db=(
            round(float(np.median(dev_a[:, sub])), 1),
            round(float(np.median(dev_b[:, sub])), 1),
        ),
        air_db=(
            round(float(np.median(dev_a[:, air])), 1),
            round(float(np.median(dev_b[:, air])), 1),
        ),
        difference_db=round(observed, 1),
        permutation_p=round((extreme + 1) / (trials + 1), 4),
        music_only_bass_db=(round(music_bass(a), 2), round(music_bass(b), 2)),
    )


class ReferenceCheck(BaseModel):
    slope_vs_pink_db_per_octave: float
    psd_slope_db_per_octave: float
    literature: str


def reference_corpus_slope() -> ReferenceCheck:
    """The reference corpus's spectral decay, comparable with Pestana et al. (2013).

    Band levels are power per octave (pink noise is flat); a power spectral density
    falls a further 3 dB per octave.
    """
    cal = load_calibration()
    low, high = BANDS_BY_KEY["mid_bass"], BANDS_BY_KEY["presence"]
    octaves = math.log2(high.center_hz / low.center_hz)
    slope = (cal.metrics["band:presence"][0] - cal.metrics["band:mid_bass"][0]) / octaves
    return ReferenceCheck(
        slope_vs_pink_db_per_octave=round(slope, 2),
        psd_slope_db_per_octave=round(slope - 3.0, 2),
        literature="Pestana et al. (2013): roughly linear decay of about 5 dB/octave between "
        "100 Hz and 4 kHz in number-one singles, 1950-2010.",
    )
