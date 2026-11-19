"""The community research job.

Shaped by two measurements and one rule.

The measurements: ranking all 203 earphones takes about half a second, and a
single Reddit search takes about twenty-three. So the analytical stages are
emitted as the burst they genuinely are, and the time belongs to the community
investigation. Retrieval is two-phase — search every product for post URLs,
then open all of those posts in one batched call — because the provider's
search returns posts without their replies, and the replies are where owners
actually say what they hear.

The rule: every step writes its own transaction before the next begins. There
is no event transport in this project, so progress is rows that the client
polls, exactly as the music pipeline does it. The useful consequence is that a
refresh mid-run replays what really happened instead of starting again, and a
crash leaves the work done so far intact.

Nothing here can change a recommendation. The ranking is read once, snapshotted
for continuity, and never written back.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.auth.models import User
from auralis.config import get_settings
from auralis.core.errors import DomainError
from auralis.db import session_scope
from auralis.iem.models import Iem
from auralis.jobs.queue import enqueue
from auralis.jobs.registry import JobContext, job_handler
from auralis.recommend.service import recommendations_for
from auralis.research import insights, queries
from auralis.research.events import emit
from auralis.research.models import ResearchRun
from auralis.research.provider import Discussion, ResearchUnavailable, SearchRequest, ThreadRequest
from auralis.research.providers import get_provider
from auralis.research.relevance import Product, body_fingerprint, judge
from auralis.research.store import store_product_evidence
from auralis.sound_profile.service import latest_sound_profile

log = logging.getLogger(__name__)

KIND_RESEARCH = "research.community"

#: How many ranked earphones the snapshot carries. Matches what the results
#: page asks for, so the sequence and the page cannot disagree about the list.
RANKING_SNAPSHOT_SIZE = 9

#: Reddit content belongs to the people who wrote it. Excerpts are kept short,
#: attributed and linked, for commentary and comparison.
LICENSE_NOTE = (
    "Quoted from a public Reddit discussion for commentary and comparison, with the "
    "author's name and a link to the original. Copyright remains with the author."
)
MAX_EXCERPT_CHARS = 320


def enqueue_research(session: Session, run_id: uuid.UUID, sound_profile_id: uuid.UUID) -> bool:
    """Queue a run. Returns False when one is already live for this profile."""
    return enqueue(
        session,
        KIND_RESEARCH,
        {"run_id": str(run_id)},
        # Database-enforced: the partial unique index on live dedupe keys means
        # a double submit cannot produce two runs for one profile.
        dedupe_key=f"research:{sound_profile_id}",
        priority=30,
        max_attempts=2,
    )


def _finish(
    run_id: uuid.UUID, status: str, *, code: str | None = None, message: str | None = None
) -> None:
    with session_scope() as s:
        run = s.get(ResearchRun, run_id)
        if run is None or run.is_terminal:
            return
        run.status = status
        run.error_code = code
        run.error_message = message[:500] if message else None
        run.finished_at = datetime.now(UTC)


def _give_up(payload: dict[str, Any], error: str) -> None:
    """Runs out of attempts. Without this the run would poll as live forever."""
    run_id = uuid.UUID(payload["run_id"])
    emit(run_id, "failed", {"code": "job_exhausted", "message": error[:200]})
    _finish(run_id, "failed", code="job_exhausted", message=error)


@job_handler(KIND_RESEARCH, on_exhausted=_give_up)
def research_community(payload: dict[str, Any], ctx: JobContext) -> None:
    run_id = uuid.UUID(payload["run_id"])
    settings = get_settings()
    started = datetime.now(UTC)

    with session_scope() as s:
        run = s.get(ResearchRun, run_id)
        if run is None or run.status not in ("queued", "running"):
            return
        run.status = "running"
        user = s.get(User, run.user_id)
        if user is None:
            return
        try:
            profile = latest_sound_profile(s, user)
            ranked = recommendations_for(s, user, limit=RANKING_SNAPSHOT_SIZE)
        except DomainError as exc:
            emit(run_id, "failed", {"code": exc.code, "message": str(exc)})
            _finish(run_id, "failed", code=exc.code, message=str(exc))
            return
        ranking: list[dict[str, Any]] = [
            {
                "slug": item.slug,
                "rank": item.rank,
                "brand": item.brand,
                "model": item.model,
                "mean": round(item.predicted_preference.mean, 2),
                "low": round(item.predicted_preference.low, 2),
                "high": round(item.predicted_preference.high, 2),
                "match": item.match,
            }
            for item in ranked.items
        ]
        # Snapshotted so the sequence and the results page agree across a
        # refresh. A copy of the engine's output, never a second opinion on it.
        run.ranking = ranking
        run.products_requested = min(settings.research_max_products, len(ranking))
        dimensions = len(profile.data.dimensions)

    # The analytical stages, recorded as the burst they are: the engine takes
    # roughly half a second to rank 203 earphones, so spreading these over time
    # would be the invented progress this design exists to avoid.
    emit(
        run_id,
        "profile_ready",
        {
            "model_version": ranked.sound_profile_version,
            "dimensions": dimensions,
        },
    )
    emit(
        run_id,
        "catalogue_loaded",
        {"measured": ranked.dataset.measurements, "sources": list(ranked.dataset.sources)},
    )
    emit(
        run_id,
        "candidates_scored",
        {"scored": ranked.dataset.measurements, "recommender": ranked.recommender},
    )
    emit(
        run_id,
        "ranking_ready",
        {"items": [{"slug": i["slug"], "rank": i["rank"], "mean": i["mean"]} for i in ranking]},
    )
    if ranking:
        first = ranking[0]
        emit(
            run_id,
            "winner_selected",
            {
                "slug": first["slug"],
                "brand": first["brand"],
                "model": first["model"],
                "mean": first["mean"],
            },
        )

    if not ranking:
        emit(run_id, "failed", {"code": "no_ranking", "message": "Nothing could be ranked."})
        _finish(run_id, "failed", code="no_ranking", message="Nothing could be ranked.")
        return

    targets = ranking[: settings.research_max_products]
    emit(
        run_id,
        "research_started",
        {"products": len(targets), "provider": settings.reddit_provider},
    )

    provider = get_provider()
    catalogue = _catalogue()

    # ---- phase one: search each product for candidate posts -----------------
    found: dict[str, list[Discussion]] = {}
    post_urls: list[str] = []
    seen_urls: set[str] = set()
    hard_failure: ResearchUnavailable | None = None

    for item in targets:
        slug = str(item["slug"])
        brand, model = str(item.get("brand", "")), str(item.get("model", ""))
        emit(run_id, "product_started", {"slug": slug, "brand": brand, "model": model})

        for query in queries.queries_for(brand, model, limit=settings.research_queries_per_product):
            emit(run_id, "query_issued", {"slug": slug, "query": query, "mode": "keyword_search"})
            try:
                posts = provider.search(
                    SearchRequest(
                        slug=slug,
                        query=query,
                        max_results=settings.research_max_posts_per_query,
                    )
                )
            except ResearchUnavailable as exc:
                log.info("research %s: search unavailable: %s", slug, exc)
                emit(
                    run_id,
                    "posts_found",
                    {"slug": slug, "found": 0, "kept": 0, "error": exc.code},
                )
                hard_failure = exc
                break

            kept = _keep_relevant(posts, slug=slug, brand=brand, model=model, catalogue=catalogue)
            found.setdefault(slug, []).extend(kept)
            for post in kept:
                if post.url not in seen_urls:
                    seen_urls.add(post.url)
                    post_urls.append(post.url)

            emit(
                run_id,
                "posts_found",
                {
                    "slug": slug,
                    "found": len(posts),
                    "kept": len(kept),
                    "rejected": len(posts) - len(kept),
                    "subreddits": sorted({p.subreddit for p in kept})[:8],
                    "titles": [p.title for p in kept if p.title][:4],
                },
            )

        if hard_failure is not None:
            break

    # ---- phase two: open those posts for their comment threads --------------
    threads: list[Discussion] = []
    comments_unavailable = False
    if post_urls and hard_failure is None:
        try:
            threads = provider.threads(
                ThreadRequest(
                    urls=tuple(post_urls),
                    max_comments_per_post=settings.research_max_comments_per_post,
                    max_depth=2,
                )
            )
        except ResearchUnavailable as exc:
            # Posts are already in hand; losing the comments is a partial
            # result, not a failed run.
            log.info("research: thread fetch unavailable: %s", exc)
            emit(
                run_id, "comments_read", {"posts": len(post_urls), "comments": 0, "error": exc.code}
            )
        else:
            got = sum(1 for d in threads if d.is_comment)
            # Reddit sometimes returns a post's page without its replies and
            # raises nothing at all, so an empty result is ambiguous. The posts
            # themselves report how many comments they have, which tells the
            # two cases apart: if replies were expected and none arrived, the
            # read was refused. Saying "no comments" there would turn a failure
            # on our side into a claim that nobody replied.
            expected = sum(
                p.num_comments or 0
                for posts in found.values()
                for p in posts
                if p.url in set(post_urls)
            )
            blocked = expected > 0 and got == 0
            if blocked:
                comments_unavailable = True
                log.info(
                    "research: expected ~%d comments across %d posts, received none",
                    expected,
                    len(post_urls),
                )
            emit(
                run_id,
                "comments_read",
                {
                    "posts": len(post_urls),
                    "comments": got,
                    "expected": expected or None,
                    "error": "comments_unavailable" if blocked else None,
                },
            )

    # ---- attribute comments, label, store -----------------------------------
    by_slug = _attribute(found, threads, catalogue=catalogue, targets=targets)

    total_sources = total_claims = with_evidence = 0
    label_model: str | None = None
    label_error: str | None = None

    for item in targets:
        slug = str(item["slug"])
        discussions = _dedupe(by_slug.get(slug, []))
        if not discussions:
            emit(run_id, "product_done", {"slug": slug, "sources": 0, "claims": 0})
            continue

        labelled: list[insights.Labelled] = []
        if insights.available():
            name = queries.display_name(str(item.get("brand", "")), str(item.get("model", "")))
            try:
                labelled = insights.label([_excerpt(d) for d in discussions], product=name)
                label_model = settings.llm_model
            except insights.LabellingUnavailable as exc:
                label_error = exc.code
        else:
            label_error = "llm_not_configured"

        sources, claims = store_product_evidence(
            slug=slug,
            run_id=run_id,
            discussions=discussions,
            labelled=labelled,
            license_note=LICENSE_NOTE,
            max_excerpt=MAX_EXCERPT_CHARS,
        )
        total_sources += sources
        total_claims += claims
        if sources:
            with_evidence += 1
        emit(run_id, "product_done", {"slug": slug, "sources": sources, "claims": claims})

    emit(
        run_id,
        "insights_ready",
        {"labelled": total_claims, "model": label_model, "error": label_error},
    )

    with session_scope() as s:
        run = s.get(ResearchRun, run_id)
        if run is not None:
            run.products_requested = len(targets)
            run.products_with_evidence = with_evidence
            run.sources_kept = total_sources
            run.claims_made = total_claims

    duration_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
    if hard_failure is not None and total_sources == 0:
        emit(
            run_id,
            "failed",
            {"code": hard_failure.code, "message": str(hard_failure), "stage": "search"},
        )
        _finish(run_id, "failed", code=hard_failure.code, message=str(hard_failure))
        return

    emit(
        run_id,
        "complete",
        {
            "duration_ms": duration_ms,
            "products_with_evidence": with_evidence,
            "sources": total_sources,
            "claims": total_claims,
        },
    )
    partial = (
        hard_failure is not None
        or comments_unavailable
        or with_evidence < len(targets)
        or label_error is not None
    )
    _finish(
        run_id,
        "partial" if partial else "succeeded",
        code=(
            hard_failure.code
            if hard_failure
            else ("comments_unavailable" if comments_unavailable else label_error)
        ),
        message=(str(hard_failure) if hard_failure else None),
    )


# --- helpers ----------------------------------------------------------------------------


def _catalogue() -> list[Product]:
    """Every product, so relevance can tell them apart."""
    with session_scope() as s:
        rows = s.execute(select(Iem.slug, Iem.brand, Iem.model)).all()
    return [Product(slug, brand, model) for slug, brand, model in rows]


def _keep_relevant(
    posts: list[Discussion], *, slug: str, brand: str, model: str, catalogue: list[Product]
) -> list[Discussion]:
    target = Product(slug, brand, model)
    out = []
    for post in posts:
        verdict = judge(
            title=post.title,
            body=post.body,
            subreddit=post.subreddit,
            is_comment=post.is_comment,
            target=target,
            catalogue=catalogue,
        )
        if verdict.keep:
            out.append(post)
        else:
            log.debug("research %s rejected %s: %s", slug, post.url, verdict.reason)
    return out


def _attribute(
    found: dict[str, list[Discussion]],
    threads: list[Discussion],
    *,
    catalogue: list[Product],
    targets: list[dict[str, Any]],
) -> dict[str, list[Discussion]]:
    """Assign each retrieved comment to the product its thread was found for.

    A comment inherits its post's context, so it is judged against the post
    title as well as its own text — that is how a reader understands "the bass
    is too much" under a post about one earphone.
    """
    out: dict[str, list[Discussion]] = {slug: list(v) for slug, v in found.items()}
    url_to_slug: dict[str, str] = {}
    url_to_title: dict[str, str | None] = {}
    for slug, posts in found.items():
        for post in posts:
            url_to_slug[post.url] = slug
            url_to_title[post.url] = post.title

    names = {str(t["slug"]): (str(t.get("brand", "")), str(t.get("model", ""))) for t in targets}

    for item in threads:
        if not item.is_comment:
            continue
        parent = item.parent_post_url or ""
        owner: str | None = url_to_slug.get(parent)
        if owner is None:
            # Match on the comment permalink's post segment when the parent URL
            # is reported differently from the search result's.
            owner = next(
                (s for url, s in url_to_slug.items() if _post_key(url) == _post_key(item.url)),
                None,
            )
        if owner is None:
            continue
        brand, model = names.get(owner, ("", ""))
        verdict = judge(
            title=url_to_title.get(parent) or url_to_title.get(item.url),
            body=item.body,
            subreddit=item.subreddit,
            is_comment=True,
            target=Product(owner, brand, model),
            catalogue=catalogue,
        )
        if verdict.keep:
            out.setdefault(owner, []).append(item)
    return out


def _post_key(url: str) -> str:
    """The post id out of a Reddit URL, so a comment can find its post."""
    parts = [p for p in url.split("/") if p]
    try:
        return parts[parts.index("comments") + 1]
    except (ValueError, IndexError):
        return url


def _dedupe(discussions: list[Discussion]) -> list[Discussion]:
    """One piece of evidence per distinct text, longest kept.

    Reddit quotes itself constantly; counting an echoed passage twice would
    overstate how many people actually said it.
    """
    best: dict[str, Discussion] = {}
    for d in sorted(discussions, key=lambda x: len(x.body), reverse=True):
        fingerprint = body_fingerprint(d.body)
        best.setdefault(fingerprint, d)
    seen_urls: set[str] = set()
    out: list[Discussion] = []
    for d in best.values():
        if d.url in seen_urls:
            continue
        seen_urls.add(d.url)
        out.append(d)
    return out


def _excerpt(d: Discussion) -> str:
    text = d.body.strip()
    if len(text) <= MAX_EXCERPT_CHARS:
        return text
    # Cut on a word boundary so a quote never ends mid-word.
    cut = text[:MAX_EXCERPT_CHARS].rsplit(" ", 1)[0]
    return f"{cut}…"
