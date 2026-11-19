"""Decode compressed audio to PCM using PyAV (bundled FFmpeg, no system install)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import av
import numpy as np
import numpy.typing as npt

ANALYSIS_SAMPLE_RATE = 44_100


class AudioDecodeError(Exception):
    """The file could not be decoded into usable audio."""


@dataclass(frozen=True, slots=True)
class AudioSignal:
    samples: npt.NDArray[np.float32]  # shape (2, n): left, right
    sample_rate: int
    source_codec: str | None
    source_sample_rate: int | None
    source_channels: int | None
    source_duration_s: float | None
    truncated: bool

    @property
    def duration_s(self) -> float:
        return float(self.samples.shape[1] / self.sample_rate)

    @property
    def mono(self) -> npt.NDArray[np.float32]:
        return np.asarray(self.samples.mean(axis=0), dtype=np.float32)


def _resampled(
    container: av.container.InputContainer, stream: av.AudioStream, rate: int
) -> Iterator[av.AudioFrame]:
    resampler = av.AudioResampler(format="fltp", layout="stereo", rate=rate)
    for frame in container.decode(stream):
        yield from resampler.resample(frame)
    yield from resampler.resample(None)  # flush buffered samples


def decode_audio(
    path: Path, *, sample_rate: int = ANALYSIS_SAMPLE_RATE, max_seconds: float | None = None
) -> AudioSignal:
    """Decode the first audio stream to stereo float32 at ``sample_rate``.

    Mono sources are duplicated to both channels. Decoding stops after
    ``max_seconds`` of output, so very long uploads cost bounded memory.
    """
    max_samples = int(max_seconds * sample_rate) if max_seconds else None
    chunks: list[npt.NDArray[np.float32]] = []
    produced = 0
    truncated = False
    try:
        with av.open(str(path)) as container:
            if not container.streams.audio:
                raise AudioDecodeError("file contains no audio stream")
            stream = container.streams.audio[0]
            codec = stream.codec_context.name
            duration = (
                float(stream.duration * stream.time_base)
                if stream.duration and stream.time_base
                else None
            )
            if duration is None and container.duration:
                duration = container.duration / av.time_base
            for out in _resampled(container, stream, sample_rate):
                arr = out.to_ndarray().astype(np.float32, copy=False)
                chunks.append(arr)
                produced += arr.shape[1]
                if max_samples is not None and produced >= max_samples:
                    truncated = True
                    break
            source = (codec, stream.rate, stream.channels, duration)
    except AudioDecodeError:
        raise
    except (av.error.FFmpegError, OSError, ValueError) as exc:
        raise AudioDecodeError(f"could not decode audio: {exc}") from exc

    if not chunks:
        raise AudioDecodeError("no audio frames decoded")
    samples = np.concatenate(chunks, axis=1)
    if max_samples is not None:
        samples = samples[:, :max_samples]
    if not np.all(np.isfinite(samples)):
        raise AudioDecodeError("decoded audio contains non-finite samples")
    return AudioSignal(
        samples=samples,
        sample_rate=sample_rate,
        source_codec=source[0],
        source_sample_rate=source[1],
        source_channels=source[2],
        source_duration_s=source[3],
        truncated=truncated,
    )
