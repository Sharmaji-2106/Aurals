"""Shared acoustic vocabulary and frequency-response processing.

This package is the contract between the music side (what a listener's library
contains) and the IEM side (what a measured earphone does). Both describe sound
with the same :data:`~auralis.acoustics.bands.BANDS`, so the recommendation layer can
compare them dimension by dimension.
"""
