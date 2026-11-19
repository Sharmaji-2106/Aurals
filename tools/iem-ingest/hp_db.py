"""Guarded Phase 4 CLI imports, catalogue-only backups and fixed-profile comparisons."""
import argparse
import json
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('MKL_NUM_THREADS','1')
import subprocess
import sys
import uuid
from collections import Counter
from datetime import UTC, datetime
from concurrent.futures import ProcessPoolExecutor
from sqlalchemy import select, text
from auralis.db import get_engine, new_session
from auralis.iem.models import Iem, IemImage, FrMeasurement
from auralis.recommend.base import Constraints
from auralis.recommend.service import recommend
from auralis.sound_profile.fusion import SoundProfileData
from auralis.sound_profile.models import SoundProfile
from hp_common import ROOT, WORK, RAW, REPORT, append_report, digest, space, write_new

TABLES = ('iems','iem_images','fr_measurements','iem_acoustic_profiles','fr_targets','iem_price_observations')

def rank_one(key):
    with new_session() as s:
        if key == 'sample':
            sample = json.loads((ROOT/'web/src/components/book/sample-match.json').read_text())
            data = SoundProfileData.model_validate(sample['sound']['data'])
        else:
            profile = s.get(SoundProfile,uuid.UUID(key))
            if profile is None: raise ValueError('Missing fixed listener '+key)
            data = SoundProfileData.model_validate(profile.profile)
        result = recommend(s, data, Constraints(), limit=10000)
        return [{'slug':i.slug,'score':i.predicted_preference.mean,'source_ref':i.measurement.source_ref} for i in result.items]

def ranking():
    reference = json.loads((ROOT/'data/iem/reports/ranking-phase2b-hiend-after.json').read_text())
    with ProcessPoolExecutor(max_workers=4) as pool:
        output = dict(zip(reference,pool.map(rank_one,reference)))
    assert len(output) == 4
    return output

def protected(s):
    result = {}
    # Per-row hashes tolerate other runs adding images/prices while preserving identities and acoustics.
    for table in ('fr_measurements','iem_acoustic_profiles','fr_targets'):
        rows = s.execute(text(f'SELECT id, row_to_json(t)::text FROM {table} t')).all()
        result[table] = {str(r[0]):digest(r[1]) for r in rows}
    rows = s.execute(text('SELECT id, brand, model, slug FROM iems')).all()
    result['identities'] = {str(r[0]):digest(list(r)) for r in rows}
    return result

def baseline():
    WORK.mkdir(parents=True, exist_ok=True)
    with new_session() as s:
        ms = s.scalars(select(Iem).order_by(Iem.brand,Iem.model)).all()
        write_new(WORK/'hp-baseline.json',{'models':[{'id':str(m.id),'slug':m.slug,'brand':m.brand,'model':m.model,'image_path':m.image_path} for m in ms], 'protected':protected(s)})
    write_new(WORK/'hp-ranking-baseline.json',ranking())
    append_report('# Phase 4 headphones\n\nPinned AutoEq: `7ae0f56d53074872b028649617a22bbb4232feb7`. Working artifacts: `data/iem/images/phase4/`; raw source, normalized batches and backups: `data/iem/raw/hp-*`. No web, schema or backend source edits. Baseline: '+str(len(ms))+' identities. Ranking uses the same four listener profiles and compares every item, score, provenance and order exactly.\n')
    print({'baseline_models':len(ms)})

def backup(batch):
    space()
    url = get_engine().url
    env = dict(os.environ)
    env.update(PGHOST=url.host or 'localhost', PGPORT=str(url.port or 5432),PGUSER=url.username or '',PGPASSWORD=url.password or '')
    path = RAW/'backups'/f'{batch}-{datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")}.dump'
    path.parent.mkdir(parents=True,exist_ok=True)
    cmd = [str(ROOT/'.devtools/pg/Library/bin/pg_dump.exe'),'-Fc','-d',url.database,'-f',str(path)]
    for table in TABLES: cmd.extend(['-t',table])
    subprocess.run(cmd,env=env,check=True,capture_output=True)
    assert path.stat().st_size > 10000
    return path.relative_to(ROOT).as_posix()

def audit():
    before = json.loads((WORK/'hp-baseline.json').read_text())['protected']
    with new_session() as s: now = protected(s)
    changed = {table:[key for key,val in old.items() if now[table].get(key)!=val] for table,old in before.items()}
    assert not any(changed.values()), repr(changed)
    return {'pre_existing_acoustic_rows_and_identities_unchanged': True}

def run_cli(command,path,dry=False):
    args = [sys.executable,'-m','auralis.cli',command,str(path)]
    if dry: args.append('--dry-run')
    result = subprocess.run(args,cwd=ROOT/'backend',text=True,capture_output=True,check=True)
    output = result.stdout.strip()
    if 'errors=[]' not in output or ('unknown=' in output and 'unknown=[]' not in output):
        raise RuntimeError('Importer rejected batch: '+output+' '+result.stderr)
    return output

def import_batch(batch,photos=False):
    path = WORK/f'{batch}-library.jsonl' if photos else RAW/f'{batch}-measurements.jsonl'
    rows = [json.loads(l) for l in path.read_text(encoding='utf-8').splitlines() if l]
    assert rows
    if photos:
        with new_session() as s:
            for row in rows:
                m = s.scalar(select(Iem).where(Iem.slug==row['slug']))
                assert m and not m.image_path, 'Existing primary/unknown: '+row['slug']
                assert s.scalar(select(FrMeasurement.id).where(FrMeasurement.iem_id==m.id,FrMeasurement.rig_family.like('headphone:%')))
    else:
        assert all(r['rig_family'].startswith('headphone:') and r['form'] in ('over-ear','on-ear') for r in rows)
    before = ranking()
    write_new(WORK/f'{batch}-ranking-before.json',before)
    with new_session() as s:
        old_slugs = set(s.scalars(select(Iem.slug)).all())
        old_count = s.scalar(text('select count(*) from fr_measurements'))
    command = 'import-iem-library' if photos else 'import-iem-batch'
    dry = run_cli(command,path,True)
    write_new(WORK/f'{batch}-dry-run.json',{'result':dry})
    saved = backup(batch)
    actual = run_cli(command,path)
    # Save the result immediately so interrupted verification is recoverable.
    write_new(WORK/f'{batch}-import.json',{'result':actual,'backup':saved})
    after = ranking()
    write_new(WORK/f'{batch}-ranking-after.json',after)
    comparison = {'passed':before==after,'profiles':{k:{'before':len(before[k]),'after':len(after[k]),'identical':before[k]==after[k]} for k in before},**audit()}
    write_new(WORK/f'{batch}-comparison.json',comparison)
    assert comparison['passed'], 'Ranking changed'
    with new_session() as s:
        new_slugs=set(s.scalars(select(Iem.slug)).all())-old_slugs
        added_curves=s.scalar(text('select count(*) from fr_measurements'))-old_count
    rejected = []
    rejection_path=RAW/f'{batch}-rejections.json'
    if rejection_path.exists(): rejected=json.loads(rejection_path.read_text(encoding='utf-8'))
    decisions=WORK/f'{batch}-decisions.json'
    if photos and decisions.exists(): rejected=[v for v in json.loads(decisions.read_text()).values() if not v.get('candidate')]
    append_report(f'\n## Batch {batch}\n\n- Headphones added: {len(new_slugs)}; measurements added: {added_curves}; photographs added: {len(rows) if photos else 0}. '+('Source/rig families: '+str(dict(Counter((r['source'],r['rig_family']) for r in rows))) if not photos else 'Source counts: '+str(dict(Counter(r['source_name'] for r in rows))))+f'.\n- Import: `{actual}`. Catalogue-only backup: `{saved}`.\n- Rejections: {len(rejected)}; '+str(dict(Counter(r.get('reason',r.get('note','unspecified')) for r in rejected)))+f'. Full records: `{rejection_path.relative_to(ROOT).as_posix() if not photos else decisions.relative_to(ROOT).as_posix()}`.\n- Fixed-ID ranking comparison: **PASS**; all four complete rankings identical (items, scores, source_ref and order). Pre-existing identity/acoustic hashes unchanged. Evidence: `data/iem/images/phase4/{batch}-comparison.json`.\n')
    print({'batch':batch,'import':actual,'new_models':len(new_slugs),'ranking':'identical'})

def catalogue():
    with new_session() as s:
        ms=s.scalars(select(Iem).join(FrMeasurement).where(FrMeasurement.rig_family.like('headphone:%')).distinct().order_by(Iem.brand,Iem.model)).all()
        write_new(WORK/'hp-headphone-catalogue.json',[{'slug':m.slug,'brand':m.brand,'model':m.model,'image_path':m.image_path} for m in ms])
    print({'headphones':len(ms)})

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('action',choices=['baseline','import','photos','catalogue','audit'])
    p.add_argument('batch',nargs='?')
    a=p.parse_args()
    if a.action=='baseline':baseline()
    elif a.action=='catalogue':catalogue()
    elif a.action=='audit':print(audit())
    else:import_batch(a.batch,a.action=='photos')
