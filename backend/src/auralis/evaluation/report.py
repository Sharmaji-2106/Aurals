"""Run every evaluation and write a report (Markdown for people, JSON for tools)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from string import ascii_uppercase
from typing import Any

from pydantic import BaseModel

from auralis.analysis.aggregate import build_profile
from auralis.db import new_session
from auralis.evaluation import recommendation as rec
from auralis.evaluation import representation as rep
from auralis.evaluation import structure
from auralis.evaluation.data import Library, corpus_genres, listener_libraries, track_pool
from auralis.iem.datasets import AUTOEQ_COMMIT, CACHE_DIR
from auralis.recommend.service import load_candidates, load_target
from auralis.sound_profile.fusion import MODEL_VERSION, fuse


def _dump(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_dump(v) for v in value]
    return value


def run(output: Path) -> Path:
    with new_session() as db:
        pool = track_pool(db)
        libraries = listener_libraries(db)
        target = load_target(db)
        candidates = load_candidates(db, target.rig_family) if target else []
    if target is None or not candidates:
        raise SystemExit("Import the dataset first: auralis import-autoeq")

    # Identical libraries (the same playlist submitted twice) would count twice.
    unique: list[Library] = []
    seen: set[frozenset[str]] = set()
    for lib in libraries:
        key = frozenset(t.track_id for t in lib.tracks)
        if key not in seen:
            seen.add(key)
            unique.append(
                Library(f"Library {ascii_uppercase[len(unique)]}", lib.tracks, lib.answers)
            )

    results: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model_version": MODEL_VERSION,
        "dataset": {"iems": len(candidates), "tracks": len(pool), "libraries": len(unique)},
        "reference_corpus": rep.reference_corpus_slope(),
        "ci_by_size": rep.ci_width_by_size(pool),
        "split_half": [r for r in (rep.split_half(lib) for lib in unique) if r],
        "genre_contrast": rep.genre_contrast(pool, corpus_genres()),
        "implementation": structure.implementation_check(
            candidates, target, CACHE_DIR / AUTOEQ_COMMIT / "results" / "RANKING.md"
        ),
        "sensitivity": [
            rec.sensitivity(candidates, target, "bass"),
            rec.sensitivity(candidates, target, "treble"),
        ],
        "ablation": rec.ablation(unique, candidates, target),
        "assumptions": rec.assumption_sensitivity(unique, candidates, target),
        "methods": rec.method_comparison(unique, candidates, target),
        "explanations": rec.explanation_audit(
            [fuse(music=None, answers=None)]
            + [fuse(music=build_profile(lib.tracks), answers=lib.answers) for lib in unique]
            + [rec.shifted_profile(bass_db=4), rec.shifted_profile(treble_db=-3)],
            candidates,
            target,
        ),
        "pca": structure.pca(candidates, target),
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "evaluation.json").write_text(
        json.dumps({k: _dump(v) for k, v in results.items()}, indent=2) + "\n", encoding="utf-8"
    )
    path = output / "evaluation.md"
    path.write_text(markdown(results), encoding="utf-8")
    return path


def _table(header: list[str], rows: list[list[Any]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join("—" if v is None else str(v) for v in row) + " |" for row in rows]
    return "\n".join(lines)


def markdown(r: dict[str, Any]) -> str:
    out = [
        "# Phase 2 evaluation",
        "",
        f"Generated {r['generated_at']} by `auralis evaluate` with `{r['model_version']}`. "
        f"Data: {r['dataset']['iems']} measured IEMs, {r['dataset']['tracks']} analysed "
        f"recordings, {r['dataset']['libraries']} listener libraries (anonymised).",
        "",
        "What this can and cannot show: without outcome data (which listeners liked which "
        "earphones) nothing here measures whether recommendations are *right*. It measures "
        "whether the pipeline is correct, stable, responsive and honest, and how much each "
        "assumption matters. See `research.md` section 6 for the study that would.",
        "",
        "## 1. Implementation check against published scores",
    ]
    impl = r["implementation"]
    if impl:
        out += [
            "",
            f"Auralis's Olive et al. in-ear statistics for {impl.compared} IEMs, compared with "
            f"the values AutoEq publishes for the same measurements ({impl.reference}):",
            "",
            _table(
                ["score r", "score MAE", "SD MAE (dB)", "slope MAE", "AAE MAE (dB)"],
                [[impl.score_r, impl.score_mae, impl.sd_mae, impl.slope_mae, impl.aae_mae]],
            ),
            "",
            "Differences in the score are rounding in the published table.",
        ]
    else:
        out += ["", "Skipped: AutoEq's ranking file isn't cached locally."]

    ref = r["reference_corpus"]
    out += [
        "",
        "## 2. Music representation",
        "",
        "### Reference corpus",
        "",
        f"The corpus's spectral decay between 110 Hz and 3.9 kHz is "
        f"{ref.slope_vs_pink_db_per_octave} dB/octave relative to pink noise, i.e. "
        f"{ref.psd_slope_db_per_octave} dB/octave as a power spectral density. "
        f"{ref.literature}",
        "",
        "### Sampling uncertainty by library size",
        "",
        "Median width of the 90 % bootstrap interval of the library balance (dB), random "
        "libraries drawn from all analysed recordings:",
        "",
    ]
    bands = ["sub_bass", "mid_bass", "lower_mids", "upper_mids", "presence", "lower_treble", "air"]
    out.append(
        _table(
            ["songs", *bands],
            [[row.songs, *(row.ci_width_db.get(b) for b in bands)] for row in r["ci_by_size"]],
        )
    )
    out += [
        "",
        "### Split-half reliability",
        "",
        "Correlation of the band-balance shape between random halves of one library, its "
        "Spearman–Brown correction to the full library (undefined when the halves don't "
        "agree on a shape), and the sampling noise of the full-library balance per band:",
        "",
        _table(
            [
                "library",
                "songs",
                "half r",
                "reliability",
                "sub-bass SD (dB)",
                "presence SD (dB)",
                "treble SD (dB)",
            ],
            [
                [
                    s.library,
                    s.songs,
                    s.half_correlation,
                    s.reliability,
                    s.per_band_sd_db["sub_bass"],
                    s.per_band_sd_db["presence"],
                    s.per_band_sd_db["lower_treble"],
                ]
                for s in r["split_half"]
            ],
        ),
        "",
        "A library close to typical music has little shape for its halves to agree on, and "
        "complementary halves deviate from the whole in opposite directions, so such "
        'libraries show negative correlations. That means "near the reference", not '
        '"unstable"; the per-band noise is the stability measure the model uses (it enters '
        "as the standard error of the library balance).",
    ]
    g = r["genre_contrast"]
    if g:
        out += [
            "",
            "### Does it separate kinds of music?",
            "",
            f"Reference-corpus recordings grouped by their (external) genre labels: "
            f"{g.group_a} ({g.songs_a} songs) versus {g.group_b} ({g.songs_b}). Median "
            f"sub-bass deviation {g.sub_bass_db[0]:+} vs {g.sub_bass_db[1]:+} dB (difference "
            f"{g.difference_db:+} dB, permutation p = {g.permutation_p}); air "
            f"{g.air_db[0]:+} vs {g.air_db[1]:+} dB. Music-only sub-bass targets: "
            f"{g.music_only_bass_db[0]:+} vs {g.music_only_bass_db[1]:+} dB.",
        ]

    out += ["", "## 3. Recommendation behaviour", ""]
    for s in r["sensitivity"]:
        out += [
            f"### Sensitivity: {s.dimension}",
            "",
            f"The listener's {s.dimension} target is moved by known amounts; the table shows "
            f"the mean measured {s.dimension} level (vs the reference) of the top 10. Spearman "
            f"ρ = {s.spearman}, monotonic: {'yes' if s.monotonic else 'no'}.",
            "",
            _table(
                ["target shift (dB)", "top-10 mean level (dB)", "top 3"],
                [[p.shift_db, p.top_mean_level_db, ", ".join(p.top_names)] for p in s.points],
            ),
            "",
        ]
    m = r["methods"]
    out += [
        "### Consistency with the published model",
        "",
        f"With no evidence, Auralis ranks by expected rating over the population's spread; "
        f"the published model ranks by the rating at the reference target. Kendall τ between "
        f"the two rankings: {m.reference_vs_published_kendall}; top-10 overlap "
        f"{m.reference_top10_vs_published}.",
        "",
        f"Top-10 overlap between the Olive-model ranking and a simpler band-RMS ranking on "
        f"the same profiles: {', '.join(str(v) for v in m.olive_vs_band_rms_top10)}.",
        "",
        "## 4. Ablation: music, answers, both",
        "",
        "Top-10 overlap (Jaccard) between rankings. 1.0 = the source changed nothing.",
        "",
        _table(
            [
                "library",
                "songs",
                "music vs reference",
                "answers vs reference",
                "combined vs answers",
                "combined vs music",
                "sub-bass target (music / answers / combined, dB)",
            ],
            [
                [
                    a.library,
                    a.songs,
                    a.music_vs_reference,
                    a.answers_vs_reference,
                    a.combined_vs_answers,
                    a.combined_vs_music,
                    " / ".join(f"{v:+.1f}" for v in a.bass_target_db.values()),
                ]
                for a in r["ablation"]
            ],
        ),
        "",
        "## 5. Sensitivity to assumptions",
        "",
        "One assumption changed at a time; mean and worst top-10 overlap with the default "
        "ranking across the libraries.",
        "",
        _table(
            ["assumption", "status", "value", "mean overlap", "worst overlap"],
            [
                [a.key, a.status, a.value, a.mean_top10_overlap, a.min_top10_overlap]
                for a in r["assumptions"]
            ],
        ),
    ]
    e = r["explanations"]
    out += [
        "",
        "## 6. Explanation audit",
        "",
        f"{e.recommendations} recommendations, {e.reasons} quantitative reasons re-derived "
        f"from the raw curves: {e.consistent} consistent "
        f"({100 * e.consistent / max(e.reasons, 1):.1f} %).",
    ]
    out += [f"- {p}" for p in e.problems]
    p = r["pca"]
    out += [
        "",
        "## 7. Structure of measured tunings (PCA)",
        "",
        f"Principal components of {p.iems} error curves (measurement minus reference, "
        "20 Hz–10 kHz):",
        "",
        _table(
            ["component", "variance", "cumulative", "shape", "r(bass shelf)", "r(tilt)"],
            [
                [
                    c.index,
                    c.variance_explained,
                    p.cumulative[i],
                    c.shape,
                    c.correlation_with_bass_shelf,
                    c.correlation_with_tilt,
                ]
                for i, c in enumerate(p.components)
            ],
        ),
        "",
    ]
    return "\n".join(out) + "\n"
