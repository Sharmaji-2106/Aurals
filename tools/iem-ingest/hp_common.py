"""Phase 4 paths and write-once artifacts; no shared working files are modified."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'data/iem/images/phase4'
RAW = ROOT / 'data/iem/raw/hp-phase4'
PIN = '7ae0f56d53074872b028649617a22bbb4232feb7'
CHECKOUT = ROOT / 'data/iem/raw/hp-autoeq-pin'
REPORT = ROOT / 'data/iem/reports/09-phase-4-headphones.md'

def space():
    if shutil.disk_usage(ROOT).free < 5 * 1024**3:
        raise RuntimeError('STOP: G: below 5 GB free')

def write_new(path, value):
    space()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, default=str)

def jsonl(path, rows):
    space()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, default=str) + '\n')

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()

def append_report(value):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open('a', encoding='utf-8') as f:
        f.write(value)
