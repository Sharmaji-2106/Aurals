"""Run the whole stack locally: database, API, workers and web app.

Usage:
    python scripts/dev.py up [--no-web]   start everything in the background
    python scripts/dev.py down            stop what `up` started
    python scripts/dev.py status          show what is running
    python scripts/dev.py logs            print the tail of each log

Logs go to .devtools/logs/. Process ids are tracked in .devtools/dev-pids.json so
`down` stops exactly the process trees it started and nothing else.

The API and worker run under a small supervisor that restarts them when backend
source files change. (uvicorn's own reloader relies on console Ctrl+C events on
Windows, which don't reach background processes.)
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEVTOOLS = ROOT / ".devtools"
LOGS = DEVTOOLS / "logs"
PIDS = DEVTOOLS / "dev-pids.json"
IS_WINDOWS = os.name == "nt"
BACKEND_SRC = ROOT / "backend" / "src"

SERVICES: dict[str, dict[str, object]] = {
    "api": {
        "cwd": ROOT / "backend",
        "cmd": ["uv", "run", "--no-sync", "uvicorn", "auralis.main:app", "--host", "127.0.0.1",
                "--port", "8000"],
        "watch": BACKEND_SRC,
        "health": "http://127.0.0.1:8000/api/health",
    },
    "worker": {
        "cwd": ROOT / "backend",
        "cmd": ["uv", "run", "--no-sync", "auralis", "worker"],
        "watch": BACKEND_SRC,
        # Restarts interrupt running jobs; recover them quickly in development.
        "env": {"AURALIS_JOB_STALE_AFTER_SECONDS": "90"},
    },
    "web": {
        "cwd": ROOT / "web",
        # Next directly, not through npm: on Windows the npm launcher exits once the
        # server is up, so tracking its pid would lose the process we actually started.
        "cmd": ["node", str(ROOT / "web" / "node_modules" / "next" / "dist" / "bin" / "next"), "dev"],
        "health": "http://127.0.0.1:3000/",
    },
}


def _load() -> dict[str, dict[str, str | int]]:
    """Tracked processes as {name: {"pid", "image"}}; older formats are ignored.

    A bare pid is not enough to identify a process: after a reboot the number is
    reused, and killing it would hit whatever now owns it. Entries without a
    recorded image name are treated as stale rather than as ours.
    """
    if not PIDS.exists():
        return {}
    raw = json.loads(PIDS.read_text())
    return {
        name: entry
        for name, entry in raw.items()
        if isinstance(entry, dict) and "pid" in entry and "image" in entry
    }


def _image(pid: int) -> str | None:
    """The executable name of a running process, or None when it isn't running."""
    if IS_WINDOWS:
        out = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
            capture_output=True, text=True,
        )
        rows = list(csv.reader(out.stdout.splitlines()))
        return rows[0][0] if rows and len(rows[0]) > 1 and rows[0][1] == str(pid) else None
    out = subprocess.run(["ps", "-p", str(pid), "-o", "comm="], capture_output=True, text=True)
    return Path(out.stdout.strip()).name or None


def _ours(entry: dict[str, str | int]) -> bool:
    """True only when that pid is still the process we started."""
    return _image(int(entry["pid"])) == entry["image"]


def _kill_tree(pid: int) -> None:
    if IS_WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try:
            os.killpg(pid, signal.SIGTERM)
        except OSError:
            pass


def _spawn(cmd: list[str], cwd: Path, log_path: Path | None, env: dict[str, str]) -> subprocess.Popen[bytes]:
    exe = shutil.which(cmd[0]) or cmd[0]
    kwargs: dict[str, object] = {}
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        kwargs["start_new_session"] = True
    stdout = open(log_path, "ab") if log_path else None  # noqa: SIM115 - owned by the child
    return subprocess.Popen(  # type: ignore[call-overload,no-any-return]
        [exe, *cmd[1:]], cwd=cwd, stdout=stdout, stderr=subprocess.STDOUT if stdout else None,
        stdin=subprocess.DEVNULL, env=env, **kwargs,
    )


def _snapshot(directory: Path) -> dict[Path, int]:
    return {p: p.stat().st_mtime_ns for p in directory.rglob("*.py")}


def supervise(name: str) -> None:
    """Run a service and restart its whole process tree when sources change."""
    spec = SERVICES[name]
    watch = Path(str(spec["watch"]))
    env = {**os.environ, **spec.get("env", {})}  # type: ignore[dict-item]
    cmd = [str(c) for c in spec["cmd"]]  # type: ignore[attr-defined]
    while True:
        state = _snapshot(watch)
        proc = _spawn(cmd, Path(str(spec["cwd"])), None, env)
        while proc.poll() is None:
            time.sleep(1)
            if _snapshot(watch) != state:
                print(f"[dev] change detected; restarting {name}", flush=True)
                _kill_tree(proc.pid)
                proc.wait()
                break
        else:
            print(f"[dev] {name} exited with code {proc.returncode}; waiting for a change", flush=True)
            while _snapshot(watch) == state:
                time.sleep(1)


def up(with_web: bool) -> None:
    if os.environ.get("AURALIS_SKIP_DEVDATABASE") == "1":
        print("Skipping local PostgreSQL startup (AURALIS_SKIP_DEVDATABASE=1)")
    else:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "devdb.py"), "start"], check=True)
    subprocess.run(["uv", "run", "alembic", "upgrade", "head"], cwd=ROOT / "backend", check=True,
                   shell=IS_WINDOWS)
    LOGS.mkdir(parents=True, exist_ok=True)
    tracked = {k: v for k, v in _load().items() if _ours(v)}
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
    for name, spec in SERVICES.items():
        if name == "web" and not with_web:
            continue
        if name in tracked:
            print(f"{name:<7} already running (pid {tracked[name]['pid']})")
            continue
        log = LOGS / f"{name}.log"
        if spec.get("watch"):
            cmd = [sys.executable, str(Path(__file__).resolve()), "_supervise", name]
        else:
            cmd = [str(c) for c in spec["cmd"]]  # type: ignore[attr-defined]
        proc = _spawn(cmd, Path(str(spec["cwd"])), log, env)
        tracked[name] = {"pid": proc.pid, "image": _image(proc.pid) or Path(cmd[0]).name}
        print(f"{name:<7} started (pid {proc.pid}) -> {log}")
    PIDS.write_text(json.dumps(tracked, indent=2))

    for name, spec in SERVICES.items():
        url = spec.get("health")
        if name not in tracked or not url:
            continue
        for _ in range(120):
            try:
                with urllib.request.urlopen(str(url), timeout=5):
                    print(f"{name:<7} ready at {str(url).rsplit('/api', 1)[0]}")
                    break
            except Exception:
                time.sleep(1)
        else:
            print(f"{name:<7} did not become ready; check {LOGS / (name + '.log')}")


def down() -> None:
    for name, entry in _load().items():
        if _ours(entry):
            _kill_tree(int(entry["pid"]))
            print(f"{name:<7} stopped (pid {entry['pid']})")
        else:
            print(f"{name:<7} not running (pid {entry['pid']} belongs to something else now)")
    PIDS.unlink(missing_ok=True)


def status() -> None:
    tracked = _load()
    for name in SERVICES:
        entry = tracked.get(name)
        state = f"running (pid {entry['pid']})" if entry and _ours(entry) else "stopped"
        print(f"{name:<7} {state}")
    subprocess.run([sys.executable, str(ROOT / "scripts" / "devdb.py"), "status"])


def logs() -> None:
    for name in SERVICES:
        path = LOGS / f"{name}.log"
        if path.exists():
            print(f"==> {name} <==")
            print("\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[-15:]))


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["_supervise"] and len(args) == 2:
        supervise(args[1])
    elif args[:1] == ["up"]:
        up(with_web="--no-web" not in args)
    elif args[:1] in (["down"], ["status"], ["logs"]):
        {"down": down, "status": status, "logs": logs}[args[0]]()
    else:
        sys.exit(__doc__)
