"""Local PostgreSQL for development without Docker.

Looks for PostgreSQL binaries in ``.devtools/pg`` (created with
``conda create -p .devtools/pg -c conda-forge postgresql``) or on PATH, and keeps
the cluster in ``.devtools/pgdata``. If you have Docker, ``docker compose up db``
is the equivalent and you don't need this script.

Usage: python scripts/devdb.py {init|start|stop|status}
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / ".devtools" / "pgdata"
LOG_FILE = ROOT / ".devtools" / "postgres.log"
PORT = os.environ.get("AURALIS_DEVDB_PORT", "5432")
USER = "auralis"
PASSWORD = os.environ.get("AURALIS_DEVDB_PASSWORD", "auralis")
DATABASES = ("auralis", "auralis_test")


def _bin(name: str) -> str:
    exe = f"{name}.exe" if os.name == "nt" else name
    for candidate in (
        ROOT / ".devtools" / "pg" / "Library" / "bin" / exe,  # conda-forge on Windows
        ROOT / ".devtools" / "pg" / "bin" / exe,  # conda-forge on Linux/macOS
    ):
        if candidate.exists():
            return str(candidate)
    found = shutil.which(name)
    if not found:
        sys.exit(f"Could not find `{name}`. Install PostgreSQL or see README (Local database).")
    return found


def _run(*args: str, env: dict[str, str] | None = None, check: bool = True) -> int:
    return subprocess.run(args, check=check, env=env).returncode


def init() -> None:
    if (DATA_DIR / "PG_VERSION").exists():
        print(f"Cluster already initialised at {DATA_DIR}")
    else:
        DATA_DIR.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".pw") as pw:
            pw.write(PASSWORD)
        try:
            _run(
                _bin("initdb"), "-D", str(DATA_DIR), "-U", USER, "--pwfile", pw.name,
                "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C",
            )
        finally:
            os.unlink(pw.name)
    start()
    env = {**os.environ, "PGPASSWORD": PASSWORD}
    for db in DATABASES:
        exists = subprocess.run(
            [_bin("psql"), "-h", "localhost", "-p", PORT, "-U", USER, "-d", "postgres", "-tAc",
             f"SELECT 1 FROM pg_database WHERE datname = '{db}'"],
            check=True, capture_output=True, text=True, env=env,
        ).stdout.strip()
        if not exists:
            _run(_bin("psql"), "-h", "localhost", "-p", PORT, "-U", USER, "-d", "postgres",
                 "-c", f'CREATE DATABASE "{db}"', env=env)
            print(f"Created database {db}")


def start() -> None:
    if status(quiet=True) == 0:
        print("PostgreSQL is already running")
        return
    # The server inherits pg_ctl's stdio handles; detach them so callers piping our
    # output (e.g. `devdb.py start | tail`) don't hang until the server exits.
    code = subprocess.run(
        [_bin("pg_ctl"), "-D", str(DATA_DIR), "-l", str(LOG_FILE), "-o", f"-p {PORT}", "-w", "start"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode
    if code != 0:
        sys.exit(f"PostgreSQL failed to start; see {LOG_FILE}")
    print(f"PostgreSQL running on localhost:{PORT} (data: {DATA_DIR})")


def stop() -> None:
    _run(_bin("pg_ctl"), "-D", str(DATA_DIR), "-m", "fast", "stop", check=False)


def status(quiet: bool = False) -> int:
    result = subprocess.run(
        [_bin("pg_ctl"), "-D", str(DATA_DIR), "status"], capture_output=True, text=True
    )
    if not quiet:
        print(result.stdout.strip() or result.stderr.strip())
    return result.returncode


if __name__ == "__main__":
    commands = {"init": init, "start": start, "stop": stop, "status": status}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]]()
