"""``auralis`` command-line entry point."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path


def _configure_logging(verbose: bool) -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="auralis")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    worker = sub.add_parser("worker", help="run background job workers")
    worker.add_argument("--concurrency", type=int, default=None)

    cal = sub.add_parser("calibrate", help="rebuild descriptor calibration from a corpus")
    cal.add_argument("corpus", type=Path)
    cal.add_argument("--output", type=Path, default=None)

    fr = sub.add_parser("import-fr", help="import a raw IEM frequency-response measurement")
    fr.add_argument("csv", type=Path, help="two columns: frequency_hz, db (header optional)")
    fr.add_argument("--brand", required=True)
    fr.add_argument("--model", required=True)
    fr.add_argument("--source", required=True, help="who measured it, e.g. a reviewer or lab")
    fr.add_argument("--source-url", default=None)
    fr.add_argument("--rig", default=None, help="e.g. 'IEC 60318-4 (711) coupler'")
    fr.add_argument("--license", default=None, help="terms under which the data may be used")

    data = sub.add_parser(
        "import-autoeq",
        help="import Harman targets and oratory1990 in-ear data (pinned AutoEq commit)",
    )
    data.add_argument("--limit", type=int, default=None, help="stop after N measurements")

    catalog = sub.add_parser(
        "import-catalog", help="import sourced prices and specs for measured IEMs (CSV)"
    )
    catalog.add_argument("csv", type=Path)
    catalog.add_argument("--dry-run", action="store_true")

    seed = sub.add_parser(
        "seed-reviews", help="load curated review collections from data/reviews/*.json"
    )
    seed.add_argument("--directory", type=Path, default=None)

    images = sub.add_parser(
        "import-iem-images",
        help="point the catalogue at gathered product photographs (data/iem-images/index.json)",
    )
    images.add_argument("--directory", type=Path, default=None)

    drivers = sub.add_parser(
        "build-iem-drivers",
        help="read driver configurations from saved retailer listings into data/iem/drivers.json",
    )
    drivers.add_argument(
        "--data", type=Path, default=Path(__file__).resolve().parents[3] / "data" / "iem"
    )
    drivers_in = sub.add_parser(
        "import-iem-drivers", help="fill iems.driver_config from data/iem/drivers.json"
    )
    drivers_in.add_argument(
        "--file",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "data" / "iem" / "drivers.json",
    )
    drivers_in.add_argument("--dry-run", action="store_true")

    batch = sub.add_parser("import-iem-batch", help="import normalized IEM FR JSONL")
    batch.add_argument("jsonl", type=Path)
    batch.add_argument("--dry-run", action="store_true")

    library = sub.add_parser("import-iem-library", help="import approved multi-image JSONL")
    library.add_argument("jsonl", type=Path)
    library.add_argument("--dry-run", action="store_true")

    products = sub.add_parser(
        "import-products",
        help="list products (with a shop listing and photo) that have no measurement yet",
    )
    products.add_argument("jsonl", type=Path)
    products.add_argument("--dry-run", action="store_true")

    ev = sub.add_parser("evaluate", help="run the Phase 2 evaluation and write a report")
    ev.add_argument("--output", type=Path, default=Path("../docs/phase2"))

    sub.add_parser(
        "rebuild-profiles",
        help="rebuild every user's music and sound profile with the current models",
    )

    args = parser.parse_args(argv)
    _configure_logging(args.verbose)

    if args.command == "worker":
        from auralis.jobs.worker import run_workers

        run_workers(args.concurrency)
    elif args.command == "import-autoeq":
        from auralis.db import session_scope
        from auralis.iem.datasets import import_oratory1990_inear, import_targets

        with session_scope() as s:
            print(f"targets added: {import_targets(s)}")
        with session_scope() as s:
            report = import_oratory1990_inear(s, limit=args.limit)
        print(
            f"measurements imported: {report.imported}, already stored: "
            f"{report.skipped_duplicate}, other rigs: {report.skipped_rig}, "
            f"failed: {len(report.failed)}"
        )
        for line in report.failed:
            print(f"  {line}")
    elif args.command == "import-catalog":
        from auralis.db import session_scope
        from auralis.iem.catalog import import_catalog

        with session_scope() as s:
            result = import_catalog(s, args.csv, dry_run=args.dry_run)
        prefix = "would update/add" if args.dry_run else "updated/added"
        print(f"specs {prefix}: {result.updated}, prices {prefix}: {result.prices}")
        for line in result.errors:
            print(f"  refused {line}")
    elif args.command == "seed-reviews":
        from auralis.db import session_scope
        from auralis.reviews.seed import load_all

        with session_scope() as s:
            loaded = load_all(s, args.directory)
        for slug, sources, claims in loaded:
            print(f"{slug}: {sources} source(s), {claims} quoted passage(s)")
    elif args.command == "import-iem-images":
        from auralis.db import session_scope
        from auralis.iem.images import load_index

        with session_scope() as s_img:
            updated, unknown = load_index(s_img, args.directory)
        print(f"{updated} earphone(s) now have a photograph")
        for slug in unknown:
            print(f"  not in the catalogue: {slug}")
    elif args.command == "build-iem-drivers":
        import json as _json

        from auralis.db import session_scope
        from auralis.iem.drivers import build_index

        with session_scope() as s_drv:
            index, built = build_index(s_drv, args.data)
        out = args.data / "drivers.json"
        if out.exists():
            backup = out.with_name(f"drivers.before-{index['generated_on']}.json")
            if not backup.exists():
                out.replace(backup)
        out.write_text(_json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(
            f"{built.products} products, {built.with_listing} with a saved listing, "
            f"{built.recorded} recorded, {len(built.disagreed)} where listings disagree, "
            f"{built.unreadable} unreadable -> {out}"
        )
    elif args.command == "import-iem-drivers":
        from auralis.db import session_scope
        from auralis.iem.drivers import import_index

        with session_scope() as s_drv:
            imported = import_index(s_drv, args.file, dry_run=args.dry_run)
        print(
            f"filled {imported.filled}, kept {imported.kept} hand-entered, "
            f"{len(imported.missing)} unknown slugs"
        )
    elif args.command == "import-iem-batch":
        from auralis.db import session_scope
        from auralis.iem.batch import import_measurements

        with session_scope() as s:
            batch_result = import_measurements(s, args.jsonl, dry_run=args.dry_run)
        print(batch_result)
    elif args.command == "import-iem-library":
        from auralis.db import session_scope
        from auralis.iem.library import import_library

        with session_scope() as s:
            library_result = import_library(s, args.jsonl, dry_run=args.dry_run)
        print(library_result)
    elif args.command == "import-products":
        from auralis.db import session_scope
        from auralis.iem.products import import_products

        with session_scope() as s:
            products_result = import_products(s, args.jsonl, dry_run=args.dry_run)
        print(products_result)
    elif args.command == "evaluate":
        from auralis.evaluation.report import run as evaluate

        print(f"wrote {evaluate(args.output)}")
    elif args.command == "rebuild-profiles":
        from auralis.tools.rebuild import rebuild_all

        music, sound = rebuild_all()
        print(f"rebuilt {music} music profile(s) and {sound} sound profile(s)")
    elif args.command == "calibrate":
        from auralis.tools.calibrate import run

        print(f"wrote {run(args.corpus, args.output)}")
    elif args.command == "import-fr":
        from auralis.iem.importer import import_csv

        measurement_id = import_csv(
            args.csv,
            brand=args.brand,
            model=args.model,
            source=args.source,
            source_url=args.source_url,
            rig=args.rig,
            license=args.license,
        )
        print(f"imported measurement {measurement_id}")


if __name__ == "__main__":
    main()
