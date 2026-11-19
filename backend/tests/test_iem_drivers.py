from auralis.iem.drivers import category, read_drivers


def kinds(text: str) -> dict[str, int | None] | None:
    r = read_drivers(text)
    return r.counts if r else None


def test_compact_configuration():
    assert kinds("Tribrid 2DD + 4BA + 2EST in-ear monitor") == {
        "dynamic": 2,
        "balanced_armature": 4,
        "electrostatic": 2,
    }
    assert kinds("Configuration 1DD+4BA, 5 drivers per side") == {
        "dynamic": 1,
        "balanced_armature": 4,
    }


def test_spelled_out_configuration():
    assert kinds("1 Dynamic Driver + 4 Balanced Armature Drivers per side") == {
        "dynamic": 1,
        "balanced_armature": 4,
    }
    assert kinds("Dual dynamic drivers in a push-pull layout") == {"dynamic": 2}


def test_driver_size_is_not_a_count():
    # "10mm dynamic" names one 10 mm driver, not ten drivers.
    assert kinds("A 10mm dynamic driver with an LCP diaphragm") == {"dynamic": 1}
    assert kinds("1 x 10mm DD + 2 x BA") == {"dynamic": 1, "balanced_armature": 2}


def test_incomplete_configuration_is_ignored():
    # Trails off into something unreadable: not trusted as the whole configuration.
    r = read_drivers("1DD + 2BA + 2 Micro-PZT bone thing")
    assert r is None or r.strength == "prose"


def test_spec_line():
    assert kinds("Driver: 14.5mm planar magnetic driver. Impedance: 16 ohm") == {"planar": 1}


def test_prose_comparisons_are_not_read_as_contents():
    # Mentions armatures only to contrast with them: not a hybrid.
    assert kinds("Unlike balanced armatures, its dynamic driver moves real air.") is None
    assert kinds("A hybrid with a dynamic driver and balanced armatures.") == {
        "dynamic": None,
        "balanced_armature": None,
    }


def test_bass_is_not_an_armature():
    assert kinds("2 bass ports and a 10mm dynamic driver") == {"dynamic": 1}


def test_category():
    assert category({"dynamic"}) == "dynamic"
    assert category({"planar"}) == "planar"
    assert category({"dynamic", "balanced_armature"}) == "hybrid"
    assert category({"electrostatic"}) is None
    assert category(set()) is None


def test_half_a_hybrid_is_not_the_whole():
    # One element given a count, the other only in prose: a hybrid, counts unknown.
    assert kinds("A hybrid: a 10mm dynamic driver and a single balanced armature.") == {
        "balanced_armature": None,
        "dynamic": None,
    }
    # Same, but nothing says it is a hybrid: unknown rather than a guess.
    assert kinds("Pairs a 10mm dynamic driver with a single balanced armature.") is None


def test_named_armature_makers_count_as_armatures():
    assert kinds("Hybrid design: dual dynamic drivers with 8 Knowles BA") == {
        "balanced_armature": None,
        "dynamic": None,
    }
