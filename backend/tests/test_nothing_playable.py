"""The message a listener sees when a submission has nothing to analyse."""

from collections import Counter

from auralis.music.pipeline import nothing_playable


def test_a_playlist_of_long_mixes_says_so_and_what_to_do() -> None:
    message = nothing_playable(Counter({"too_long": 48}), max_minutes=20)
    assert "All 48 tracks are longer than 20 minutes" in message
    assert "individual songs" in message


def test_mixed_reasons_are_counted_in_words() -> None:
    message = nothing_playable(
        Counter({"too_long": 3, "unavailable": 2, "duplicate": 1}), max_minutes=20
    )
    assert message.startswith("None of the 6 tracks could be analysed:")
    assert "3 longer than 20 minutes" in message
    assert "2 unavailable" in message
    assert "1 repeated" in message


def test_no_reasons_falls_back_to_the_plain_message() -> None:
    assert nothing_playable(Counter(), max_minutes=20) == "None of the tracks could be analysed."
