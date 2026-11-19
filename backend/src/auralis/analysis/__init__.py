"""Audio analysis library.

Pure computation: no database, HTTP or job-queue imports. Layers, from facts to
interpretation::

    decode.py       audio file          -> PCM signal
    features.py     PCM signal          -> TrackFeatures      (measured)
    descriptors.py  TrackFeatures       -> TrackDescriptors   (heuristic, calibrated)
    curation.py     many tracks         -> weights, duplicates, outliers, clusters
    aggregate.py    curated tracks      -> MusicProfile       (listening representation)

A MusicProfile describes what a listener's music *contains*. It is deliberately not a
preference model; :mod:`auralis.sound_profile` decides how much (little) that
evidence says about preference.
"""
