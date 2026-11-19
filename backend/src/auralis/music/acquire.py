"""Download -> decode -> extract for one YouTube video, with temporary audio only."""

from __future__ import annotations

import logging
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from auralis.analysis.decode import decode_audio
from auralis.analysis.features import TrackFeatures, extract
from auralis.config import get_settings
from auralis.music.youtube import TrackMeta, download_audio

log = logging.getLogger(__name__)

# Long tracks are analysed on their first ten minutes; the long-term spectrum has
# converged well before that and memory stays bounded.
MAX_ANALYSED_SECONDS = 600.0


@dataclass(frozen=True, slots=True)
class AcquiredAnalysis:
    features: TrackFeatures
    meta: TrackMeta
    codec: str | None
    bitrate_kbps: float | None
    download_seconds: float
    analysis_seconds: float


def fetch_and_extract(video_id: str) -> AcquiredAnalysis:
    """The downloaded file lives only inside a temporary directory for this call."""
    settings = get_settings()
    settings.work_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="track-", dir=settings.work_dir) as tmp:
        started = time.perf_counter()
        audio = download_audio(video_id, Path(tmp))
        downloaded = time.perf_counter()
        signal = decode_audio(audio.path, max_seconds=MAX_ANALYSED_SECONDS)
        features = extract(signal)
        finished = time.perf_counter()
    log.info(
        "analysed %s in %.1fs (download %.1fs)", video_id, finished - started, downloaded - started
    )
    return AcquiredAnalysis(
        features=features,
        meta=audio.meta,
        codec=audio.codec,
        bitrate_kbps=audio.bitrate_kbps,
        download_seconds=round(downloaded - started, 2),
        analysis_seconds=round(finished - downloaded, 2),
    )
