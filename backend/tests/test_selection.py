from auralis.music.selection import Candidate, evenly_spaced, is_altered, select, title_key
from auralis.music.youtube import TrackMeta


def cand(
    video_id: str,
    title: str | None = "Song",
    channel: str | None = "Artist",
    duration: float | None = 200,
    reason: str | None = None,
) -> Candidate:
    return Candidate(TrackMeta(video_id, title, channel, duration, reason), 0)


def run(candidates: list[Candidate], max_tracks: int = 100) -> list[tuple[str, bool, str | None]]:
    return [
        (d.candidate.meta.video_id, d.selected, d.reason)
        for d in select(candidates, min_seconds=30, max_seconds=1200, max_tracks=max_tracks)
    ]


def test_title_key_ignores_upload_noise() -> None:
    a = title_key("Daft Punk - Get Lucky (Official Audio) ft. Pharrell", "Daft Punk")
    b = title_key("Daft Punk - Get Lucky [HD] ft. Pharrell", "DaftPunkVEVO")
    assert a == b
    topic = title_key("Get Lucky", "Daft Punk - Topic")
    assert topic == title_key("Get Lucky (Official Video)", "Daft Punk")


def test_live_versions_are_distinct() -> None:
    assert title_key("Song (Live)", "Artist") != title_key("Song", "Artist")


def test_altered_uploads_are_detected() -> None:
    assert is_altered("Song (Sped Up)")
    assert is_altered("song slowed + reverb")
    assert is_altered("SONG - BASS BOOSTED")
    assert is_altered("Song 1 Hour Loop")
    assert not is_altered("Speed of Sound")
    assert not is_altered("Reverberation")


def test_selection_rules() -> None:
    decisions = run(
        [
            cand("aaaaaaaaaaa", "Song A"),
            cand("aaaaaaaaaaa", "Song A"),  # exact repeat: dropped silently
            cand("bbbbbbbbbbb", "Song A (Official Video)"),  # same song, other upload
            cand("ccccccccccc", "Intro", duration=12),
            cand("ddddddddddd", "DJ Mix", duration=3 * 3600),
            cand("eeeeeeeeeee", None, reason="private"),
            cand("fffffffffff", "Song B (nightcore)"),
            cand("ggggggggggg", "Song C", duration=None),
        ]
    )
    assert decisions == [
        ("aaaaaaaaaaa", True, None),
        ("bbbbbbbbbbb", False, "duplicate"),
        ("ccccccccccc", False, "too_short"),
        ("ddddddddddd", False, "too_long"),
        ("eeeeeeeeeee", False, "private"),
        ("fffffffffff", False, "altered_version"),
        ("ggggggggggg", True, None),
    ]


def test_large_playlists_are_sampled_evenly() -> None:
    candidates = [cand(f"{i:011d}", f"Song {i}") for i in range(50)]
    decisions = run(candidates, max_tracks=10)
    selected = [vid for vid, ok, _ in decisions if ok]
    assert len(selected) == 10
    assert selected[0] == f"{0:011d}"
    assert selected[-1] == f"{49:011d}"
    assert sum(reason == "sampled_out" for _, _, reason in decisions) == 40


def test_evenly_spaced() -> None:
    assert evenly_spaced(5, 10) == [0, 1, 2, 3, 4]
    assert evenly_spaced(10, 1) == [0]
    assert evenly_spaced(10, 0) == []
    assert evenly_spaced(100, 3) == [0, 50, 99]
