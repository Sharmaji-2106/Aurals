# Resume after the usage-limit stop

Your last turn ended at ~15:00 because the account hit its usage limit, in the middle of
image batch 2 (contact sheets and matte trials exist under `data/iem/reports/`, but
batch 2 was not imported: the approved index has 38 entries; the DB has 232 IEMs, 240
measurements, 451 profiles, 37 verified primaries; the 211 oratory1990 rows unchanged).

1. First, check batch 2's state on disk and finish it (review → import → ranking check).
2. Then follow the **owner decision in `data/iem/briefs/phase-2b-bulk.md`** — it
   supersedes the conflicting parts of `phase-2.md`. In short: different measurement
   standards are accepted (kept identifiable, unranked by the current engine); ingest
   several hundred more IEMs in bulk from crinacle (711 and B&K 4620) and Super Review
   via the pinned AutoEq repo, then any other documented in-ear source; and an approved
   image for every IEM in the database. All Phase 1 ground rules still apply.

**Work efficiently — the usage budget is finite:**
- Write bulk scripts that process hundreds of models per run (normalise, match,
  import, download, decode, hash, score, build contact sheets) instead of stepping
  through models interactively.
- Keep console output small (counts and paths, not data dumps). Write details to files.
- Spend your visual attention where it matters: contact sheets of ~30 for every primary.
- `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` are now set — your last command failed on
  a cp1252 console encoding error.
- Append to `06-phase-2-progress.md` after every batch, so the work survives another stop.

Finish with `07-final.md` as specified in `phase-2.md` and `phase-2b-bulk.md`.
