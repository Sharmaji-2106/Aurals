"""Import every ORM model so ``Base.metadata`` is complete (used by Alembic and tests)."""

from auralis.auth.models import AuthSession, User
from auralis.db import Base
from auralis.iem.models import FrMeasurement, Iem, IemAcousticProfile, IemPriceObservation
from auralis.jobs.models import Job
from auralis.music.models import (
    MusicProfile,
    MusicSubmission,
    SubmissionSource,
    SubmissionTrack,
    Track,
    TrackAnalysis,
)
from auralis.profiles.models import Profile
from auralis.questionnaire.models import QuestionnaireResponse
from auralis.research.models import ResearchEvent, ResearchRun
from auralis.reviews.models import ReviewClaim, ReviewSource
from auralis.sound_profile.models import SoundProfile
from auralis.tuning.models import TuningSession

__all__ = [
    "AuthSession",
    "Base",
    "FrMeasurement",
    "Iem",
    "IemAcousticProfile",
    "IemPriceObservation",
    "Job",
    "MusicProfile",
    "MusicSubmission",
    "Profile",
    "QuestionnaireResponse",
    "ResearchEvent",
    "ResearchRun",
    "ReviewClaim",
    "ReviewSource",
    "SoundProfile",
    "SubmissionSource",
    "SubmissionTrack",
    "Track",
    "TrackAnalysis",
    "TuningSession",
    "User",
]
