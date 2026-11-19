"""Worker processes.

Audio analysis is CPU-bound, so concurrency comes from processes, not threads. Each
process claims one job at a time; a side thread keeps its heartbeat fresh so stale-job
recovery can tell a slow job from a dead worker.
"""

from __future__ import annotations

import logging
import multiprocessing as mp
import os
import signal
import socket
import threading
import time
import traceback
from multiprocessing.synchronize import Event as EventType

from auralis.config import get_settings
from auralis.db import new_session
from auralis.jobs import queue, registry

log = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 20
REAP_EVERY_SECONDS = 60


def _heartbeat_loop(job: queue.ClaimedJob, worker_id: str, done: threading.Event) -> None:
    while not done.wait(HEARTBEAT_SECONDS):
        try:
            with new_session() as session:
                queue.heartbeat(session, job.id, worker_id)
        except Exception:
            log.exception("heartbeat failed for job %s", job.id)


def run_one(worker_id: str) -> bool:
    """Claim and run a single job. Returns False when the queue was empty."""
    with new_session() as session:
        job = queue.claim(session, worker_id)
    if job is None:
        return False

    registration = registry.get(job.kind)
    done = threading.Event()
    beat = threading.Thread(target=_heartbeat_loop, args=(job, worker_id, done), daemon=True)
    beat.start()
    started = time.perf_counter()
    retry_in: float | None
    try:
        if registration is None:
            raise registry.PermanentJobError(f"no handler registered for {job.kind!r}")
        registration.handler(job.payload, registry.JobContext(job=job, worker_id=worker_id))
    except Exception as exc:
        error = "".join(traceback.format_exception_only(exc)).strip()
        if isinstance(exc, registry.PermanentJobError) or job.is_last_attempt:
            retry_in = None
        elif isinstance(exc, registry.RetryJob):
            retry_in = exc.delay_seconds
        else:
            retry_in = queue.backoff_seconds(job.attempts)
        level = logging.WARNING if retry_in is not None else logging.ERROR
        log.log(
            level,
            "job %s %s failed (attempt %d): %s",
            job.kind,
            job.id,
            job.attempts,
            error,
            exc_info=not isinstance(exc, registry.PermanentJobError | registry.RetryJob),
        )
        with new_session() as session:
            queue.mark_failed(session, job, error, retry_in=retry_in)
        if retry_in is None and registration and registration.on_exhausted:
            try:
                registration.on_exhausted(job.payload, error)
            except Exception:
                log.exception("on_exhausted hook failed for job %s", job.id)
    else:
        with new_session() as session:
            queue.mark_succeeded(session, job.id)
        log.info("job %s %s done in %.1fs", job.kind, job.id, time.perf_counter() - started)
    finally:
        done.set()
    return True


def worker_loop(index: int, stop: EventType) -> None:
    settings = get_settings()
    registry.load_handlers()
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{index}"
    signal.signal(signal.SIGINT, signal.SIG_IGN)  # the parent coordinates shutdown
    log.info("worker %s ready", worker_id)
    last_reap = 0.0
    while not stop.is_set():
        try:
            if time.monotonic() - last_reap > REAP_EVERY_SECONDS:
                with new_session() as session:
                    if recovered := queue.requeue_stale(session, settings.job_stale_after_seconds):
                        log.warning("recovered %d stale jobs", recovered)
                last_reap = time.monotonic()
            if not run_one(worker_id):
                stop.wait(settings.worker_poll_seconds)
        except Exception:
            log.exception("worker loop error; backing off")
            stop.wait(5)
    log.info("worker %s stopped", worker_id)


def _child_main(index: int, stop: EventType, verbose: bool) -> None:
    from auralis.cli import _configure_logging

    _configure_logging(verbose)
    worker_loop(index, stop)


def run_workers(concurrency: int | None = None) -> None:
    settings = get_settings()
    count = max(1, concurrency or settings.worker_concurrency)
    settings.work_dir.mkdir(parents=True, exist_ok=True)
    ctx = mp.get_context("spawn")
    stop = ctx.Event()
    verbose = logging.getLogger().isEnabledFor(logging.DEBUG)
    processes = [
        ctx.Process(target=_child_main, args=(i, stop, verbose), name=f"auralis-worker-{i}")
        for i in range(count)
    ]
    for p in processes:
        p.start()
    log.info("started %d worker process(es); Ctrl+C to stop", count)
    try:
        while any(p.is_alive() for p in processes):
            for p in processes:
                p.join(timeout=1)
    except KeyboardInterrupt:
        log.info("stopping workers after their current job...")
        stop.set()
        for p in processes:
            p.join(timeout=120)
            if p.is_alive():
                p.terminate()
