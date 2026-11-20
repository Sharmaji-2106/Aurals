"""Production launcher: runs both the Auralis background worker and Uvicorn API."""

from __future__ import annotations

import contextlib
import logging
import os
import signal
import subprocess
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("auralis.launcher")


def main() -> None:
    port = os.environ.get("PORT", "8080")
    concurrency = os.environ.get("AURALIS_WORKER_CONCURRENCY", "2")
    log.info("Starting Auralis Worker (concurrency=%s) and API (port=%s)...", concurrency, port)

    # Launch worker in background
    worker_cmd = [sys.executable, "-m", "auralis.cli", "worker", "--concurrency", str(concurrency)]
    worker_proc = subprocess.Popen(worker_cmd)  # noqa: S603
    log.info("Worker started (PID %d)", worker_proc.pid)

    # Launch Uvicorn in foreground
    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "auralis.main:app",
        "--host",
        "0.0.0.0",  # noqa: S104
        "--port",
        str(port),
    ]
    api_proc = subprocess.Popen(api_cmd)  # noqa: S603
    log.info("API server started (PID %d)", api_proc.pid)

    def shutdown(signum: int, frame: object) -> None:
        log.info("Shutting down worker and API...")
        for p in (worker_proc, api_proc):
            with contextlib.suppress(Exception):
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        api_ret = api_proc.poll()
        if api_ret is not None:
            log.error("API process exited with code %s; shutting down worker", api_ret)
            worker_proc.terminate()
            sys.exit(api_ret)

        worker_ret = worker_proc.poll()
        if worker_ret is not None:
            log.warning("Worker process exited with code %s; restarting...", worker_ret)
            worker_proc = subprocess.Popen(worker_cmd)  # noqa: S603

        time.sleep(1)


if __name__ == "__main__":
    main()
