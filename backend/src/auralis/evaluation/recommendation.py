"""Do rankings behave sensibly, what does each evidence source contribute, and how much
do the unvalidated assumptions matter?"""

from __future__ import annotations

import math
from collections.abc import Sequence
from itertools import pairwise

import numpy as np
from pydantic import BaseModel
from scipy import stats

from auralis.acoustics import fr
from auralis.analysis.aggregate import build_profile
from auralis.evaluation.data import Library
from auralis.recommend.band_rms import BandRmsRecommender
from auralis.recommend.base import Candidate, Constraints, Recommendation, Target
from auralis.recommend.harman import HarmanPersonalRecommender, offsets_on
from auralis.sound_profile.assumptions import ALL as ASSUMPTIONS
from auralis.sound_profile.assumptions import DEFAULT, ModelParameters
from auralis.sound_profile.fusion import SoundProfileData, fuse

TOP_K = 10


def rank_all(
    profile: SoundProfileData,
    candidates: list[Candidate],
    target: Target,
    engine: HarmanPersonalRecommender | None = None,
) -> list[Recommendation]:
    engine = engine or HarmanPersonalRecommender()
    return engine.recommend(
        profile, candidates, target, Constraints(rig_family=target.rig_family), limit=10_000
    )


def order(recs: Sequence[Recommendation]) -> list[str]:
    return [str(r.iem_id) for r in recs]


def overlap(a: Sequence[str], b: Sequence[str], k: int = TOP_K) -> float:
    """Jaccard overlap of the top-k sets."""
    sa, sb = set(a[:k]), set(b[:k])
    return len(sa & sb) / len(sa | sb) if sa | sb else 1.0


def kendall(a: Sequence[str], b: Sequence[str]) -> float:
    position = {item: i for i, item in enumerate(b)}
    common = [x for x in a if x in position]
    tau = stats.kendalltau(range(len(common)), [position[x] for x in common]).statistic
    return round(float(tau), 3)


def _bass_level(c: Candidate, target: Target) -> float:
    """Mean measured deviation from the reference, 20-200 Hz (derived)."""
    mask = (c.freqs_hz >= 20) & (c.freqs_hz <= 200)
    return float(np.nanmean(c.response_db[mask] - target.db[mask]))


def _treble_level(c: Candidate, target: Target) -> float:
    mask = (c.freqs_hz >= 5000) & (c.freqs_hz <= 10_000)
    return float(np.nanmean(c.response_db[mask] - target.db[mask]))


def shifted_profile(
    bass_db: float = 0.0, treble_db: float = 0.0, sd: float = 0.75
) -> SoundProfileData:
    """A controlled synthetic listener: the reference target shifted by known amounts."""
    base = fuse(music=None, answers=None)
    shifts = {"sub_bass": bass_db, "mid_bass": bass_db, "treble": treble_db}
    dims = [
        d.model_copy(update={"mean": shifts.get(d.key, 0.0), "sd": sd if d.unit == "dB" else d.sd})
        for d in base.dimensions
    ]
    band_shift = {
        "sub_bass": bass_db,
        "mid_bass": bass_db,
        "presence": treble_db / 2,
        "lower_treble": treble_db,
        "upper_treble": treble_db,
    }
    curve = [
        c.model_copy(
            update={
                "offset_db": band_shift.get(c.band, 0.0),
                "sd_db": 0.0 if c.reference else sd,
            }
        )
        for c in base.preference_curve
    ]
    return base.model_copy(update={"dimensions": dims, "preference_curve": curve})


class SweepPoint(BaseModel):
    shift_db: float
    top_mean_level_db: float
    top_names: list[str]


class Sensitivity(BaseModel):
    dimension: str
    points: list[SweepPoint]
    spearman: float
    monotonic: bool


def sensitivity(
    candidates: list[Candidate], target: Target, dimension: str = "bass"
) -> Sensitivity:
    """Move the listener's target by known amounts; do the top matches follow?"""
    shifts = (-4.0, -2.0, 0.0, 2.0, 4.0, 6.0)
    level = _bass_level if dimension == "bass" else _treble_level
    by_id = {str(c.iem_id): c for c in candidates}
    points = []
    for shift in shifts:
        profile = (
            shifted_profile(bass_db=shift)
            if dimension == "bass"
            else shifted_profile(treble_db=shift)
        )
        top = rank_all(profile, candidates, target)[:TOP_K]
        levels = [level(by_id[str(r.iem_id)], target) for r in top]
        points.append(
            SweepPoint(
                shift_db=shift,
                top_mean_level_db=round(float(np.mean(levels)), 2),
                top_names=[f"{r.brand} {r.model}" for r in top[:3]],
            )
        )
    means = [p.top_mean_level_db for p in points]
    return Sensitivity(
        dimension=dimension,
        points=points,
        spearman=round(float(stats.spearmanr(shifts, means).statistic), 3),
        monotonic=all(b >= a for a, b in pairwise(means)),
    )


class AblationRow(BaseModel):
    library: str
    songs: int
    answered: bool
    music_vs_reference: float
    answers_vs_reference: float | None
    combined_vs_answers: float | None
    combined_vs_music: float | None
    kendall_combined_vs_answers: float | None
    bass_target_db: dict[str, float]


def ablation(
    libraries: Sequence[Library], candidates: list[Candidate], target: Target
) -> list[AblationRow]:
    """Rank with music only, answers only, and both; compare the top-10 sets.

    Overlap of 1.0 means a source changed nothing; lower values mean it moved the
    recommendations. This measures contribution, not correctness.
    """
    reference = order(rank_all(fuse(music=None, answers=None), candidates, target))
    rows = []
    for lib in libraries:
        music = build_profile(lib.tracks)
        music_only = fuse(music=music, answers=None)
        m = order(rank_all(music_only, candidates, target))
        answered = bool(lib.answers) and any(v is not None for v in (lib.answers or {}).values())

        def bass(profile: SoundProfileData) -> float:
            return next(c.offset_db for c in profile.preference_curve if c.band == "sub_bass")

        bass_targets = {"music": bass(music_only)}
        if answered:
            answers_only = fuse(music=None, answers=lib.answers)
            combined = fuse(music=music, answers=lib.answers)
            a = order(rank_all(answers_only, candidates, target))
            c = order(rank_all(combined, candidates, target))
            bass_targets |= {"answers": bass(answers_only), "combined": bass(combined)}
        rows.append(
            AblationRow(
                library=lib.label,
                songs=len(lib.tracks),
                answered=answered,
                music_vs_reference=round(overlap(m, reference), 2),
                answers_vs_reference=round(overlap(a, reference), 2) if answered else None,
                combined_vs_answers=round(overlap(c, a), 2) if answered else None,
                combined_vs_music=round(overlap(c, m), 2) if answered else None,
                kendall_combined_vs_answers=kendall(c, a) if answered else None,
                bass_target_db={k: round(v, 2) for k, v in bass_targets.items()},
            )
        )
    return rows


class AssumptionRow(BaseModel):
    key: str
    status: str
    value: float
    mean_top10_overlap: float
    min_top10_overlap: float


def assumption_sensitivity(
    libraries: Sequence[Library], candidates: list[Candidate], target: Target
) -> list[AssumptionRow]:
    """Change one assumption at a time; how similar do the top-10 lists stay?"""
    fields = {
        "prior_sd_bass_db": "sd_bass_db",
        "prior_sd_treble_db": "sd_treble_db",
        "prior_sd_mids_db": "sd_mids_db",
        "prior_sd_air_db": "sd_air_db",
        "answer_reliability": "answer_reliability",
        "indirect_reliability_factor": "indirect_factor",
        "music_correlation": "music_correlation",
    }
    musics = [build_profile(lib.tracks) for lib in libraries]

    def rankings(params: ModelParameters) -> list[list[str]]:
        return [
            order(rank_all(fuse(music=m, answers=lib.answers, params=params), candidates, target))
            for m, lib in zip(musics, libraries, strict=True)
        ]

    default = rankings(DEFAULT)
    rows = []
    for assumption in ASSUMPTIONS:
        for value in assumption.sweep:
            if math.isclose(value, getattr(DEFAULT, fields[assumption.key])):
                continue
            varied = rankings(DEFAULT.with_(**{fields[assumption.key]: value}))
            overlaps = [overlap(a, b) for a, b in zip(default, varied, strict=True)]
            rows.append(
                AssumptionRow(
                    key=assumption.key,
                    status=assumption.status,
                    value=value,
                    mean_top10_overlap=round(float(np.mean(overlaps)), 2),
                    min_top10_overlap=round(float(np.min(overlaps)), 2),
                )
            )
    return rows


class MethodComparison(BaseModel):
    reference_vs_published_kendall: float
    reference_top10_vs_published: float
    olive_vs_band_rms_top10: list[float]


def method_comparison(
    libraries: Sequence[Library], candidates: list[Candidate], target: Target
) -> MethodComparison:
    """(a) With no evidence, does Auralis reproduce the published model's ranking?
    (b) How different is a simpler scoring rule on the same inputs?"""
    recs = rank_all(fuse(music=None, answers=None), candidates, target)
    ours = order(recs)
    published = [str(r.iem_id) for r in sorted(recs, key=lambda r: -r.population_preference)]
    comparisons = []
    for lib in libraries:
        profile = fuse(music=build_profile(lib.tracks), answers=lib.answers)
        comparisons.append(
            round(
                overlap(
                    order(rank_all(profile, candidates, target)),
                    order(rank_all(profile, candidates, target, BandRmsRecommender())),
                ),
                2,
            )
        )
    return MethodComparison(
        reference_vs_published_kendall=kendall(ours, published),
        reference_top10_vs_published=round(overlap(ours, published), 2),
        olive_vs_band_rms_top10=comparisons,
    )


class ExplanationAudit(BaseModel):
    recommendations: int
    reasons: int
    consistent: int
    problems: list[str]


def explanation_audit(
    profiles: Sequence[SoundProfileData], candidates: list[Candidate], target: Target
) -> ExplanationAudit:
    """Recompute every region error from the raw curves and check each reason against it."""
    total = checked = consistent = 0
    problems: list[str] = []
    engine = HarmanPersonalRecommender()
    for profile in profiles:
        recs = engine.recommend(profile, candidates, target, Constraints(), limit=TOP_K)
        by_id = {c.iem_id: c for c in candidates}
        mean = np.array([c.offset_db for c in profile.preference_curve])
        personal = offsets_on(fr.R40_HZ, mean[None, :])[0]
        reference = fr.interpolate(fr.Curve(target.freqs_hz, target.db), fr.R40_HZ)
        for rec in recs:
            total += 1
            c = by_id[rec.iem_id]
            error = (
                fr.interpolate(fr.Curve(c.freqs_hz, c.response_db), fr.R40_HZ)
                - reference
                - personal
            )
            regions = {g.region: g for g in rec.regions}
            for reason in rec.reasons:
                if reason.kind == "note" or reason.region is None or reason.error_db is None:
                    continue
                checked += 1
                g = regions[reason.region]
                freqs = fr.R40_HZ
                mask = (freqs >= g.low_hz) & (freqs < g.high_hz)
                recomputed = float(np.nanmean(error[mask]))
                ok = (
                    math.isclose(recomputed, reason.error_db, abs_tol=0.01)
                    and (
                        (reason.kind == "match") == (abs(reason.error_db) <= g.tolerance_db)
                        or reason.status == "user_provided"
                    )
                    and f"{abs(reason.error_db):.1f}" in reason.message
                )
                consistent += ok
                if not ok and len(problems) < 5:
                    problems.append(f"{rec.brand} {rec.model}: {reason.message}")
    return ExplanationAudit(
        recommendations=total, reasons=checked, consistent=consistent, problems=problems
    )
