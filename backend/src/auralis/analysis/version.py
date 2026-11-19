"""Version identifiers stored with every derived artefact.

Bump ANALYZER_VERSION when feature extraction changes in a way that alters stored
values; tracks analysed with an older version are re-analysed on demand.
"""

from typing import Final

ANALYZER_VERSION: Final = "analyzer/1"
DESCRIPTORS_VERSION: Final = "descriptors/1"
MUSIC_PROFILE_VERSION: Final = "music-profile/2"
