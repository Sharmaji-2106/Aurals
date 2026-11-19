from decimal import Decimal

from auralis.recommend.base import Constraints, Price, driver_category
from auralis.recommend.service import _bracket


def price(amount: int, currency: str = "INR") -> Price:
    return Price(amount=Decimal(amount), currency=currency, source="test", observed_at=None)


def test_bracket_from_the_listeners_budget():
    c = Constraints(budget_min=Decimal(0), budget_max=Decimal(10_000), currency="INR")
    assert _bracket(c, price(1_290)) == ("INR", Decimal(5_000), Decimal(10_000), "budget")


def test_bracket_respects_a_higher_minimum():
    c = Constraints(budget_min=Decimal(7_000), budget_max=Decimal(10_000), currency="INR")
    assert _bracket(c, None) == ("INR", Decimal(7_000), Decimal(10_000), "budget")


def test_bracket_from_the_top_pick_without_a_budget():
    c = Constraints(currency="INR")
    assert _bracket(c, price(6_999)) == ("INR", Decimal(5_000), Decimal(10_000), "top_pick")


def test_no_bracket_for_an_unpriced_pick_or_unknown_currency():
    c = Constraints()
    assert _bracket(c, None) is None
    assert _bracket(c, price(50, "EUR")) is None


def test_driver_category():
    assert driver_category(None) is None
    assert driver_category({"dynamic": 1}) == "dynamic"
    assert driver_category({"dynamic": 1, "balanced_armature": 4}) == "hybrid"
    assert driver_category({"category": "planar", "kinds": ["planar"]}) == "planar"
    assert driver_category({"electrostatic": 2}) is None
    assert driver_category({"notes": "unknown"}) is None


def test_wireless_earbuds_are_recognised_by_name():
    from auralis.recommend.standing import is_wireless

    for brand, model in [
        ("JBL", "Free X"),
        ("Sony", "WF-1000XM5"),
        ("Samsung", "Galaxy Buds2 Pro"),
        ("Sennheiser", "CX 400BT"),
        ("Jabra", "Elite 75t"),
        ("AKG", "N400"),
    ]:
        assert is_wireless(brand, model), model
    for brand, model in [
        ("TFZ", "T2 Galaxy"),
        ("Moondrop", "Quarks DSP"),
        ("Sennheiser", "IE 200"),
        ("Bose", "QuietComfort 20"),
        ("Truthear", "Pure"),
    ]:
        assert not is_wireless(brand, model), model


def test_standing_is_bounded_and_explained():
    from auralis.recommend.standing import STANDING_POINTS, standing

    unknown = standing("no-such-iem", stores=0)
    assert unknown.points == 0
    assert unknown.mentions == []
    stocked = standing("no-such-iem", stores=5)
    assert stocked.points == round(STANDING_POINTS * 0.4, 2)
    assert 0 <= standing("simgot-ew300", stores=3).points <= STANDING_POINTS


def test_retail_prices_beat_snippets():
    from auralis.recommend.service import _retail

    assert _retail("Headphone Zone", "https://www.headphonezone.in/products/x")
    assert not _retail("Amazon India (own search-result snippet)", None)
    assert not _retail("HiFiNage (pre-owned; full box and accessories)", None)
    assert not _retail("Headphone Zone", "https://www.headphonezone.in/products/x-ex-demo-unit")


def test_genre_picks_round_robin_and_cap():
    from auralis.music.picks import MAX_SONGS, picks, urls_for

    assert urls_for([]) == []
    hip = urls_for(["hip_hop"])
    assert hip
    assert all(u.startswith("https://www.youtube.com/watch?v=") for u in hip)
    both = urls_for(["hip_hop", "pop"])
    # Each genre is represented from the first songs on.
    assert both[0] == hip[0]
    assert both[1].endswith(picks()["pop"][0]["video_id"])
    assert len(urls_for(list(picks()))) <= MAX_SONGS
