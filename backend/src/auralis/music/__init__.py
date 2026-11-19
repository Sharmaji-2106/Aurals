"""Music ingestion: YouTube sources -> tracks -> analysis jobs -> music profile.

``youtube.py`` is the only module that talks to YouTube, ``pipeline.py`` holds the
job handlers, ``service.py`` the request-side logic and ``router.py`` the HTTP layer.
"""
