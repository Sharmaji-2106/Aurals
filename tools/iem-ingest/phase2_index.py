"""Mirror verified library primaries into the app's approved image index."""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
INDEX = ROOT / "data/iem-images/index.json"
BACKUPS = ROOT / "data/iem/backups"


def run(batch: int) -> None:
    rows = [json.loads(line) for line in (DATA / f"phase2-batch{batch}-library-final.jsonl")
            .read_text(encoding="utf-8").splitlines()]
    primaries = [row for row in rows if row["role"] == "primary"]
    if len({row["slug"] for row in primaries}) != len(primaries):
        raise ValueError("more than one primary per model")
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    present = {row["slug"]: row for row in index}
    new = []
    for row in primaries:
        entry = {"slug": row["slug"], "file": row["file_path"],
                 "source": row["source_name"], "source_url": row["page_url"],
                 "credit": row["credit"], "retrieved_on": row["retrieved_on"],
                 "licence_note": row["licence_note"]}
        if row["slug"] in present:
            if present[row["slug"]] != entry:
                raise ValueError(f"existing index entry differs: {row['slug']}")
            continue
        new.append(entry)
    if not new:
        print("index already up to date")
        return
    backup = BACKUPS / f"index.before-phase2-batch{batch}-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.json"
    shutil.copyfile(INDEX, backup)
    INDEX.write_text(json.dumps(index + new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print({"added": len(new), "total": len(index) + len(new), "backup": str(backup)})


if __name__ == "__main__":
    import sys
    run(int(sys.argv[1]))
