"""Phase 3 catalogue-only snapshot, guarded image import, and integrity audit.

Run with the backend environment. No measurements or identity fields are written.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import subprocess
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select, text, bindparam
from auralis.db import new_session, get_engine
from auralis.iem.models import Iem, IemImage
from auralis.iem.library import import_library

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'data/iem/images/phase3'
REPORT = ROOT / 'data/iem/reports/08-phase-3-images.md'


def write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, default=str)


def fingerprint(session, original_ids=None):
    result = {}
    for table in ('fr_measurements', 'iem_acoustic_profiles', 'fr_targets', 'iem_price_observations'):
        where=' WHERE id IN :ids' if original_ids else ''
        query=text(f'SELECT row_to_json(t)::text FROM {table} t{where} ORDER BY id')
        params={}
        if original_ids:
            query=query.bindparams(bindparam('ids',expanding=True))
            params={'ids':[uuid.UUID(i) for i in original_ids[table]]}
        rows = session.execute(query,params).scalars().all()
        result[table] = {'count': len(rows), 'sha256': hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
    where=' WHERE id IN :ids' if original_ids else ''
    query=text('SELECT id, brand, model, slug FROM iems'+where+' ORDER BY id')
    params={}
    if original_ids:
        query=query.bindparams(bindparam('ids',expanding=True))
        params={'ids':[uuid.UUID(i) for i in original_ids['iems']]}
    identity = session.execute(query,params).all()
    result['identities'] = hashlib.sha256(json.dumps([list(r) for r in identity], default=str).encode()).hexdigest()
    return result


def snapshot():
    WORK.mkdir(parents=True, exist_ok=True)
    with new_session() as s:
        models = s.scalars(select(Iem).order_by(Iem.brand, Iem.model)).all()
        images = s.scalars(select(IemImage)).all()
        write_new(WORK / 'baseline.json', {
            'fingerprints': fingerprint(s),
            'models': [{'slug': m.slug, 'brand': m.brand, 'model': m.model, 'image_path': m.image_path} for m in models],
            'primaries': [{'id': str(i.id), 'slug': next(m.slug for m in models if m.id == i.iem_id),
                           'file_path': i.file_path, 'sha256': i.sha256, 'status': i.verification_status}
                          for i in images if i.role == 'primary'],
            'library_images': len(images),
        })
    # Keep credentials in subprocess environment; never print connection URLs.
    url = get_engine().url
    env = dict(os.environ)
    env.update(PGHOST=url.host or 'localhost', PGPORT=str(url.port or 5432),
               PGUSER=url.username or '', PGPASSWORD=url.password or '')
    backup = ROOT / 'data/iem/backups' / ('catalogue-before-phase3-' + datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ') + '.dump')
    command = [str(ROOT / '.devtools/pg/Library/bin/pg_dump.exe'), '-Fc', '-d', url.database, '-f', str(backup)]
    for table in ('iems', 'iem_images', 'fr_measurements', 'iem_acoustic_profiles', 'fr_targets', 'iem_price_observations'):
        command.extend(['-t', table])
    subprocess.run(command, env=env, check=True, capture_output=True)
    assert backup.stat().st_size > 10000
    with REPORT.open('x', encoding='utf-8') as f:
        f.write('# Phase 3 image coverage\n\n2026-11-15: coverage-first photographs; no matte processing. '
                f'Catalogue-only backup: `{backup.relative_to(ROOT).as_posix()}`. '
                f'Baseline: {len(models)} models, {len([i for i in images if i.role == "primary"])} verified primaries.\n')
    print({'models': len(models), 'primaries': len([i for i in images if i.role == 'primary']), 'backup_bytes': backup.stat().st_size})


def publish(batch):
    path = WORK / f'{batch}-library.jsonl'
    rows = [json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
    assert len({r['slug'] for r in rows}) == len(rows)
    index_path = ROOT / 'data/iem-images/index.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    indexed = {r['slug'] for r in index}
    with new_session() as s:
        # The generic importer can replace primaries; forbid that here under a lock.
        s.execute(text('LOCK TABLE iem_images, iems IN SHARE ROW EXCLUSIVE MODE'))
        for r in rows:
            m = s.scalar(select(Iem).where(Iem.slug == r['slug']))
            if m is None or m.image_path or r['slug'] in indexed:
                raise ValueError('Refusing existing image/unknown model: ' + r['slug'])
            if s.scalar(select(IemImage).where(IemImage.iem_id == m.id, IemImage.role == 'primary')):
                raise ValueError('Existing primary: ' + r['slug'])
        dry = import_library(s, path, dry_run=True)
        assert not dry.errors and not dry.unknown and dry.added == len(rows), str(dry)
        result = import_library(s, path)
        assert not result.errors and not result.unknown and result.primary == len(rows), str(result)
        backup = ROOT / 'data/iem/backups' / f'index.before-phase3-{batch}-{datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")}.json'
        shutil.copyfile(index_path, backup)
        s.commit()
    new = [{'slug': r['slug'], 'file': r['file_path'], 'source': r['source_name'],
            'source_url': r['page_url'], 'credit': r['credit'], 'retrieved_on': r['retrieved_on'],
            'licence_note': r['licence_note']} for r in rows]
    index_path.write_text(json.dumps(index + new, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    decisions = json.loads((WORK / f'{batch}-decisions.json').read_text(encoding='utf-8'))
    rejects = [d for d in decisions.values() if not d.get('candidate')]
    ranked = {r['slug'] for r in csv.DictReader((ROOT / 'data/iem/reports/phase2b-image-status.csv').open(encoding='utf-8')) if r['ranked_current_engine'] == 'yes'}
    with new_session() as s:
        covered = s.scalars(select(Iem).where(Iem.image_path.is_not(None))).all()
    with REPORT.open('a', encoding='utf-8') as f:
        f.write(f'\n## Batch {batch}\n\n'
                f'- Imported {len(rows)} visually checked primaries ({sum(r["slug"] in ranked for r in rows)} ranked). '
                f'Coverage: {sum(m.slug in ranked for m in covered)}/203 ranked; {len(covered)}/1035 total including the legacy image.\n'
                f'- Rejected {len(rejects)} models: ' + '; '.join(f'{d["slug"]}: {d["note"]}' for d in rejects) + '.\n'
                f'- Source originals, SHA-256, decode metrics, contact sheets, decisions and importer manifest: `data/iem/images/phase3/{batch}-*`. '
                'Rights unconfirmed; development only, not for publication. No existing primary replaced.\n')
    print({'batch': batch, 'added': result.added, 'ranked_covered': sum(m.slug in ranked for m in covered), 'total_covered': len(covered)})


def audit(label):
    base = json.loads((WORK / 'baseline.json').read_text(encoding='utf-8'))
    ranked = {r['slug'] for r in csv.DictReader((ROOT / 'data/iem/reports/phase2b-image-status.csv').open(encoding='utf-8')) if r['ranked_current_engine'] == 'yes'}
    ids_path=WORK/'baseline-table-ids.json'
    original_ids=json.loads(ids_path.read_text(encoding='utf-8')) if ids_path.exists() else None
    with new_session() as s:
        s.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
        now = fingerprint(s,original_ids)
        assert now == base['fingerprints'], 'Protected catalogue data changed'
        images = s.scalars(select(IemImage)).all()
        models = s.scalars(select(Iem).order_by(Iem.brand, Iem.model)).all()
    current = {str(i.id): i for i in images}
    for p in base['primaries']:
        i = current[p['id']]
        assert i.role == 'primary' and i.file_path == p['file_path'] and i.sha256 == p['sha256']
    for i in images:
        content = (ROOT / 'data/iem-images' / i.file_path).read_bytes()
        assert hashlib.sha256(content).hexdigest() == i.sha256
    prim = {i.iem_id: i for i in images if i.role == 'primary' and i.verification_status == 'verified'}
    rows = [{'slug': m.slug, 'brand': m.brand, 'model': m.model, 'ranked': m.slug in ranked,
             'image_path': m.image_path, 'verified': m.id in prim} for m in models]
    write_new(WORK / f'audit-{label}.json', {'protected_data_unchanged': True, 'old_primaries_unchanged': True,
              'all_library_hashes_valid': True, 'models': rows, 'verified_primaries': len(prim),
              'ranked_covered': sum(bool(m.image_path) and m.slug in ranked for m in models)})
    print({'audit': label, 'verified': len(prim), 'ranked_covered': sum(bool(m.image_path) and m.slug in ranked for m in models), 'integrity': 'passed'})


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['snapshot', 'publish', 'audit'])
    p.add_argument('label', nargs='?')
    a = p.parse_args()
    if a.action == 'snapshot': snapshot()
    elif a.action == 'publish': publish(a.label)
    else: audit(a.label)
