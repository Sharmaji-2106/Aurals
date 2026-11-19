"""FastAPI application factory."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from auralis.config import get_settings
from auralis.core.errors import DomainError
from auralis.db import new_session
from auralis.iem.images import DATA_DIR
from auralis.music.router import router as music_router
from auralis.music.service import InvalidSubmission
from auralis.profiles.router import router as account_router
from auralis.questionnaire.router import router as questionnaire_router
from auralis.recommend.router import router as recommend_router
from auralis.research.router import router as research_router
from auralis.reviews.router import router as reviews_router
from auralis.sound_profile.router import router as sound_profile_router
from auralis.store.router import router as store_router
from auralis.tuning.router import router as tuning_router

log = logging.getLogger(__name__)

IEM_IMAGE_DIR = DATA_DIR

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-auralis-client"


class CsrfHeaderMiddleware(BaseHTTPMiddleware):
    """Require a custom header on state-changing requests.

    Browsers can't attach custom headers to cross-site form posts, and a cross-origin
    fetch with one needs a CORS preflight this API never approves. Together with
    SameSite=Lax cookies this closes CSRF without token plumbing.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if (
            request.method in UNSAFE_METHODS
            and request.url.path.startswith("/api/")
            and request.headers.get(CSRF_HEADER) != "web"
        ):
            return _error(403, "csrf", "Missing client header.")
        return await call_next(request)


def _error(status: int, code: str, message: str, **extra: object) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message, **extra}}
    )


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Auralis API",
        version="0.1.0",
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.add_middleware(CsrfHeaderMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=2048)

    # Product photographs, served from the gathering that records where each
    # one came from. Starlette resolves inside this directory only, so a
    # crafted path cannot reach the rest of the disk; the importer additionally
    # refuses any entry whose file is not already inside it.
    if IEM_IMAGE_DIR.is_dir():
        app.mount(
            "/api/iem-images",
            StaticFiles(directory=IEM_IMAGE_DIR),
            name="iem-images",
        )

    @app.exception_handler(InvalidSubmission)
    async def invalid_submission(_: Request, exc: InvalidSubmission) -> JSONResponse:
        return _error(
            exc.status_code, exc.code, exc.message, problems=[p.model_dump() for p in exc.problems]
        )

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"loc": [str(p) for p in err["loc"]], "message": err["msg"]} for err in exc.errors()
        ]
        return _error(422, "validation_error", "Some fields are invalid.", fields=fields)

    @app.get("/api/health", tags=["meta"])
    def health() -> dict[str, str]:
        with new_session() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok"}

    for router in (
        account_router,
        music_router,
        questionnaire_router,
        sound_profile_router,
        recommend_router,
        research_router,
        reviews_router,
        tuning_router,
        store_router,
    ):
        app.include_router(router)
    return app


app = create_app()
