"""Cautious, cached public-source acquisition and image quality inspection."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import time
import urllib.parse
import urllib.robotparser
from collections import defaultdict
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
import imagehash
from PIL import Image, ImageFilter, ImageStat
from selectolax.lexbor import LexborHTMLParser

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/iem/raw"
CANDIDATES = ROOT / "data/iem/images/candidates"
REPORTS = ROOT / "data/iem/reports"
AGENT = "AuralsCatalogueBot/1.0 (research prototype)"
LAST_REQUEST: dict[str, float] = defaultdict(float)


class Blocked(Exception):
    pass


def cached_get(url: str) -> bytes:
    """Fetch once, respecting robots and a two-second per-host gap."""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https":
        raise Blocked("only HTTPS sources are allowed")
    host = parsed.netloc.lower()
    key = hashlib.sha256(url.encode()).hexdigest()
    folder = RAW / host
    body = folder / f"{key}.bin"
    metadata = body.with_suffix(".json")
    if body.exists():
        if metadata.exists():
            saved = json.loads(metadata.read_text(encoding="utf-8"))
            if saved.get("blocked"):
                raise Blocked(saved["blocked"])
        return body.read_bytes()
    if parsed.path != "/robots.txt":
        robots_url = f"https://{host}/robots.txt"
        try:
            robots = cached_get(robots_url).decode("utf-8", "replace")
        except (httpx.HTTPError, Blocked):
            raise Blocked(f"robots.txt unavailable for {host}") from None
        parser = urllib.robotparser.RobotFileParser()
        parser.parse(robots.splitlines())
        if not parser.can_fetch(AGENT, url):
            raise Blocked(f"robots.txt disallows {url}")
    wait = max(0.0, 2.0 - (time.monotonic() - LAST_REQUEST[host]))
    time.sleep(wait)
    LAST_REQUEST[host] = time.monotonic()
    with httpx.Client(headers={"User-Agent": AGENT}, timeout=30, follow_redirects=False) as client:
        response = client.get(url)
    blocked_reason = None
    if response.status_code in (401, 403, 429, 503):
        blocked_reason = f"{host} returned {response.status_code}; no retry"
    # RFC 9309: robots.txt 4xx means no rules exist for this origin.
    if parsed.path == "/robots.txt" and response.status_code in (400, 404, 410):
        folder.mkdir(parents=True, exist_ok=True)
        body.write_bytes(b"")
        return b""
    if response.headers.get("content-type", "").startswith("text/html"):
        lower = response.content.lower()
        if b"verify you are human" in lower or b"cf-chl-widget" in lower:
            blocked_reason = f"{host} presented a challenge page"
    folder.mkdir(parents=True, exist_ok=True)
    body.write_bytes(response.content)
    metadata.write_text(json.dumps({
        "url": url, "fetched_on": date.today().isoformat(),
        "status": response.status_code, "content_type": response.headers.get("content-type"),
        "bytes": len(response.content), "blocked": blocked_reason,
    }, indent=2), encoding="utf-8")
    if blocked_reason:
        raise Blocked(blocked_reason)
    response.raise_for_status()
    return response.content


def image_metrics(content: bytes) -> dict[str, object]:
    with Image.open(io.BytesIO(content)) as original:
        original.load()  # force a complete decode, including truncated-file checks
        image = original.convert("RGB")
        width, height = image.size
        small = image.copy()
        small.thumbnail((512, 512))
        edges = small.filter(ImageFilter.FIND_EDGES).convert("L")
        sharpness = ImageStat.Stat(edges).var[0]
        # Edge cleanliness is a heuristic, not a watermark detector.
        corners = [image.crop((0, 0, min(30, width), min(30, height))),
                   image.crop((max(0, width-30), 0, width, min(30, height)))]
        backdrop = sum(ImageStat.Stat(c).stddev[0] for c in corners) / len(corners)
        pixels = width * height
        aspect_fit = min(width, height) / max(width, height)
        # JPEG's first luminance quantization coefficient is DC (IJG base 16).
        # It gives only a rough encoder-quality estimate; custom quantization
        # tables and later recompression can make it misleading.
        jpeg_quality = None
        if original.format == "JPEG" and getattr(original, "quantization", None):
            dc = original.quantization[0][0]
            scale = 100 * dc / 16
            jpeg_quality = round(max(1, min(100, (200 - scale) / 2 if scale <= 100
                                                    else 5000 / scale)))
        score = round(25 * math.log10(max(pixels, 1)) + min(sharpness, 200) / 8
                      - backdrop / 4 + 5 * aspect_fit + (jpeg_quality or 0) / 12, 2)
        return {"width": width, "height": height, "format": original.format,
                "byte_size": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                "perceptual_hash": str(imagehash.phash(image)), "sharpness_heuristic": round(sharpness, 2),
                "corner_variation_heuristic": round(backdrop, 2),
                "aspect_ratio": round(width / height, 4),
                "square_card_fit_heuristic": round(aspect_fit, 4),
                "jpeg_quality_estimate_heuristic": jpeg_quality,
                "watermark_text_status": "requires visual review",
                "quality_score_heuristic": score}


def shopify_products(url: str) -> list[dict]:
    payload = json.loads(cached_get(url))
    return payload["products"]


def catalogue() -> None:
    """Cache consecutive public Shopify pages and a compact searchable product index."""
    products = []
    for page in range(1, 9):
        url = f"https://www.linsoul.com/products.json?limit=250&page={page}"
        try:
            batch = shopify_products(url)
        except (httpx.HTTPError, Blocked) as exc:
            print(f"page {page}: {exc}")
            break
        products.extend(batch)
        print(f"page {page}: {len(batch)}")
        if len(batch) < 250:
            break
    output = ROOT / "data/iem/processed/linsoul-products.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(f"refusing to overwrite {output}")
    output.write_text(json.dumps(products, ensure_ascii=False), encoding="utf-8")
    print(f"products: {len(products)}")


MEASUREMENT_PILOT = {
    "Kiwi Ears Cadenza": ("Kiwi Ears", "Cadenza", None),
    "Moondrop Blessing 3": ("Moondrop", "Blessing 3", None),
    "AFUL Performer 5": ("AFUL", "Performer 5", None),
    "KZ Castor (off-off-off-off)": ("KZ", "Castor", "all switches off"),
    "Elysian Pilgrim": ("Elysian", "Pilgrim", None),
    "Unique Melody MEST Mk2": ("Unique Melody", "MEST Mk2", None),
    "SoftEars RSV": ("Softears", "RSV", None),
    "ThieAudio Hype 4": ("Thieaudio", "Hype 4", None),
    "DUNU Titan S2": ("Dunu", "Titan S2", None),
    "CCA CRA": ("CCA", "CRA", None),
    "TANGZU Wan'er S.G": ("Tangzu", "Wan'er S.G", None),
}


def measurements() -> None:
    """Normalize selected 711-clone curves from a pinned AutoEq source dump."""
    commit = "7ae0f56d53074872b028649617a22bbb4232feb7"
    prefix = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{commit}/measurements/Super%20Review"
    index = list(csv.DictReader(io.StringIO(cached_get(f"{prefix}/name_index.tsv").decode("utf-8-sig")), delimiter="\t"))
    rows = []
    for source_name, (brand, model, variant) in MEASUREMENT_PILOT.items():
        matches = [r for r in index if r["name"] == source_name and r["form"] == "in-ear" and r["rig"] == "711"]
        if not matches:
            print(f"unresolved measurement: {source_name}")
            continue
        path = f"measurements/Super Review/data/in-ear/{source_name}.csv"
        url = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{commit}/{urllib.parse.quote(path)}"
        try:
            source = cached_get(url).decode("utf-8-sig")
            points = []
            for item in csv.reader(io.StringIO(source)):
                if len(item) >= 2:
                    try:
                        points.append([float(item[0]), float(item[1])])
                    except ValueError:
                        pass
            if len(points) < 20:
                raise ValueError("too few numeric points")
            rows.append({"brand": brand, "model": model, "variant": variant,
                "source": "Super Review (via AutoEq)", "source_url": matches[0]["url"],
                "rig": "711", "rig_family": "iec60318-4-clone",
                "form": "in-ear", "source_ref": f"AutoEq@{commit}:{path}",
                "retrieved_at": datetime.now(UTC).isoformat(),
                "license": "Super Review measurement, via AutoEq; numerical redistribution terms unconfirmed.",
                "notes": "AutoEq numeric CSV of Super Review 711-clone measurement; original channel links in index.",
                "points": points})
            print(f"normalized {source_name}: {len(points)} points")
        except (httpx.HTTPError, Blocked, ValueError) as exc:
            print(f"unresolved measurement {source_name}: {exc}")
    target = ROOT / "data/iem/processed/measurements-pilot.jsonl"
    if target.exists():
        raise FileExistsError(f"refusing to overwrite {target}")
    target.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    print(f"normalized records: {len(rows)}")


def survey() -> None:
    """Probe several extraction routes on public first-party pages."""
    cases = {
        "shopify_json": "https://www.linsoul.com/products.json?limit=250",
        "retailer_html": "https://www.linsoul.com/collections/best-sellers",
        "review_html": "https://www.linsoul.com/pages/about-us",
        "autoeq_index": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/7ae0f56d53074872b028649617a22bbb4232feb7/measurements/Super%20Review/name_index.tsv",
    }
    records = []
    for label, url in cases.items():
        started = time.monotonic()
        try:
            data = cached_get(url)
            count = (len(json.loads(data).get("products", [])) if label == "shopify_json"
                     else len(LexborHTMLParser(data).css("a")) if label.endswith("html")
                     else len(data.splitlines()))
            result = {"strategy": label, "url": url, "status": "ok", "bytes": len(data),
                      "records_or_links": count, "seconds": round(time.monotonic()-started, 2)}
        except (httpx.HTTPError, Blocked, ValueError) as exc:
            result = {"strategy": label, "url": url, "status": str(exc),
                      "seconds": round(time.monotonic()-started, 2)}
        records.append(result)
        print(result)
    REPORTS.mkdir(parents=True, exist_ok=True)
    target = REPORTS / "tool-probe.json"
    if target.exists():
        raise FileExistsError(f"refusing to overwrite {target}")
    target.write_text(json.dumps(records, indent=2), encoding="utf-8")


def images() -> None:
    """Acquire original CDN images for a hand-selected pilot from public Shopify JSON."""
    products = json.loads((ROOT / "data/iem/processed/linsoul-products.json").read_text(encoding="utf-8"))
    selected = set(json.loads((ROOT / "data/iem/processed/image-pilot-slugs.json").read_text(encoding="utf-8")))
    REPORTS.mkdir(parents=True, exist_ok=True)
    records = []
    for product in products:
        title = product.get("title", "")
        if product.get("handle") not in selected:
            continue
        image_urls = [item["src"] for item in product.get("images", []) if item.get("src")]
        # Shopify products.json exposes canonical CDN originals, avoiding thumbnail srcsets.
        for image_url in image_urls[:3]:
            parsed = urllib.parse.urlsplit(image_url)
            clean = urllib.parse.urlunsplit(("https", parsed.netloc, parsed.path, "", ""))
            try:
                content = cached_get(clean)
                metrics = image_metrics(content)
                slug = product["handle"]
                folder = CANDIDATES / slug
                folder.mkdir(parents=True, exist_ok=True)
                suffix = Path(parsed.path).suffix.lower() or ".jpg"
                local = folder / f"{metrics['sha256'][:16]}{suffix}"
                if not local.exists():
                    local.write_bytes(content)
                records.append({"title": title, "handle": slug, "page_url":
                    f"https://www.linsoul.com/products/{slug}", "image_url": clean,
                    "file": str(local.relative_to(ROOT)), **metrics})
            except (httpx.HTTPError, Blocked, ValueError, OSError) as exc:
                records.append({"title": title, "image_url": clean, "error": str(exc)})
    target = REPORTS / "image-probe.json"
    if target.exists():
        raise FileExistsError(f"refusing to overwrite {target}")
    target.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"{len(records)} candidate records")


def validate() -> None:
    """Check that all pilot originals still match their recorded bytes and decode."""
    records = json.loads((REPORTS / "image-probe.json").read_text(encoding="utf-8"))
    checked = 0
    for row in records:
        if "file" not in row:
            continue
        content = (ROOT / row["file"]).read_bytes()
        actual = image_metrics(content)
        for key in ("sha256", "width", "height", "format", "byte_size"):
            if actual[key] != row[key]:
                raise ValueError(f"{row['file']}: {key} changed")
        checked += 1
    print(f"validated {checked} original image candidates")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("survey", "catalogue", "measurements", "images", "validate"))
    command = parser.parse_args().command
    log_path = ROOT / "logs/ingestion/intake.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = datetime.now(UTC)
    status = "ok"
    try:
        {"survey": survey, "catalogue": catalogue, "measurements": measurements,
         "images": images, "validate": validate}[command]()
    except Exception:
        status = "error"
        raise
    finally:
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"command": command, "started_at": started.isoformat(),
                "finished_at": datetime.now(UTC).isoformat(), "status": status}) + "\n")
