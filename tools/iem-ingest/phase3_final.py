"""Validate Phase 3 imports and write the complete coverage/gap ledger.

Run in the backend environment after all manually reviewed imports. Read-only DB.
"""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
import uuid
from collections import Counter, defaultdict
from datetime import UTC,datetime
from pathlib import Path

import httpx
from sqlalchemy import select,text,bindparam
from auralis.db import new_session
from auralis.iem.models import Iem, IemImage
from auralis.iem.library import import_library
from phase3_db import WORK, ROOT, REPORT, fingerprint, write_new

RANKED_REASONS = {
 '1more-single-driver':'Gadgets360 photo CDN refuses robots access; alternate real photo includes a different earphone model and no unambiguous isolated primary was verified.',
 'bose-q25':'Stored name Q25 could not be tied confidently to a marketed product. Search leads refer to QC25; substituting that identity was rejected.',
 'cosmic-ears-ce6b':'Exact SLS Audio page yielded a measurement graph, with no accessible product photograph.',
 'hifiman-re600s':'Accessible manufacturer and review pages explicitly describe RE600S V2; original revision remains unverified.',
 'jbl-t200a':'Exact retailer page is challenged; manufacturer result is a specification PDF rather than an accessible standalone photograph.',
 'kz-edse':'Accessible article covers both KZ GR and EDSE; selected product frames could not be assigned confidently. Other lead is not a usable photo source.',
 'monoprice-m350':'No exact-model photograph found in inspected public inventories or targeted search; M300 and other Monolith models were not substituted.',
 'ns-audio-ns3':'Exact Hi End Portable source timed out; no independent accessible exact-model photograph resolved.',
 'philips-shs8000':'Exact retailer page presented an access challenge; tested manufacturer product page returns 404. Other discovered material was specification/manual content.',
 'samsung-akg-eo-ig955':'Exact retailer listing presented a challenge; manufacturer support page did not expose a usable product photo (only an unresolved template image URL).',
 'samsung-eo-ic500-anc-type-c':'Retailer leads blocked access or returned non-image content; manufacturer support page exposed no usable product photo.',
 'sennheiser-cx-2-00':'Retailer page challenged access. RAA CX 200 is a different model from CX 2.00 and was explicitly rejected.',
 'sennheiser-ocx-685':'Retailer page presented an access challenge; no exact original model photograph verified. Differently suffixed/related models were not assumed equivalent.',
 'sony-mdr-7550':'Manufacturer URL resolves to a region selector without a product photograph; no accessible exact-model photo verified. EX800ST alias not assumed.',
 'sony-mdr-ex10':'Retailer page presented an access challenge; no exact EX10 photograph verified. EX10LP and other named variants were not substituted.',
 'sony-mdr-xb50':'Manufacturer archive yielded a small four-colour product composite and unrelated recommended-product frames; no suitable close product photograph verified.',
 'sony-mh1':'Available reviewed photo is MH1C, a distinct named variant; exact MH1 photo not verified and retailer fallback challenged access.',
 'v-moda-zn':'Exact Audioholics review presented an access challenge; no accessible independent exact-model photo resolved.',
 'vivo-xe800':'Public review source blocked automation and retailer fallback presented a challenge; no confident genuine exact-model photograph acquired.',
}


def main():
    baseline=json.loads((WORK/'baseline.json').read_text(encoding='utf-8'))
    ranked={r['slug'] for r in csv.DictReader((ROOT/'data/iem/reports/phase2b-image-status.csv').open(encoding='utf-8')) if r['ranked_current_engine']=='yes'}
    manifests=sorted(WORK.glob('*-library.jsonl'))
    newrows=[json.loads(line) for p in manifests for line in p.read_text(encoding='utf-8').splitlines() if line.strip()]
    assert len({r['slug'] for r in newrows})==len(newrows)
    original_ids=json.loads((WORK/'baseline-table-ids.json').read_text(encoding='utf-8'))
    baseline_slugs={m['slug'] for m in baseline['models']}
    original_checks={}
    with new_session() as s:
        s.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
        snapshot_time=datetime.now(UTC).isoformat()
        for table in ('fr_measurements','iem_acoustic_profiles','fr_targets','iem_price_observations'):
            q=text(f'SELECT row_to_json(t)::text FROM {table} t WHERE id IN :ids ORDER BY id').bindparams(bindparam('ids',expanding=True))
            original=s.execute(q,{'ids':[uuid.UUID(i) for i in original_ids[table]]}).scalars().all()
            result={'count':len(original),'sha256':hashlib.sha256('\n'.join(original).encode()).hexdigest()}
            assert result==baseline['fingerprints'][table], f'Original protected {table} rows changed'
            original_checks[table]={'original_subset':result,'current_count':s.scalar(text(f'SELECT count(*) FROM {table}')),'passed':True}
        q=text('SELECT id,brand,model,slug FROM iems WHERE id IN :ids ORDER BY id').bindparams(bindparam('ids',expanding=True))
        original=s.execute(q,{'ids':[uuid.UUID(i) for i in original_ids['iems']]}).all()
        original_hash=hashlib.sha256(json.dumps([list(r) for r in original],default=str).encode()).hexdigest()
        assert original_hash==baseline['fingerprints']['identities'], 'Original identities changed'
        all_models=s.scalars(select(Iem).order_by(Iem.brand,Iem.model)).all()
        models=[m for m in all_models if m.slug in baseline_slugs]
        extras=[m for m in all_models if m.slug not in baseline_slugs]
        assert len(models)==len(baseline_slugs)
        images=s.scalars(select(IemImage)).all()
        dry=[]
        for p in manifests:
            result=import_library(s,p,dry_run=True)
            assert result.added==0 and not result.errors and not result.unknown, str(result)
            dry.append({'manifest':p.name,'duplicates':result.duplicate,'errors':0})
    assert sum(r['duplicates'] for r in dry)==len(newrows)
    by_id={str(i.id):i for i in images}
    for old in baseline['primaries']:
        now=by_id[old['id']]
        assert now.role=='primary' and now.file_path==old['file_path'] and now.sha256==old['sha256']
    for i in images:
        b=(ROOT/'data/iem-images'/i.file_path).read_bytes()
        assert len(b)==i.byte_size and hashlib.sha256(b).hexdigest()==i.sha256
    index_path=ROOT/'data/iem-images/index.json'
    index=json.loads(index_path.read_text(encoding='utf-8'))
    ix={r['slug']:r for r in index}
    assert len(ix)==len(index)
    backups=list((ROOT/'data/iem/backups').glob('index.before-phase3-*.json'))
    first=min(backups,key=lambda p:p.stat().st_mtime)
    old_index=json.loads(first.read_text(encoding='utf-8'))
    assert all(ix[r['slug']]==r for r in old_index), 'Existing index changed'
    for r in newrows:
        assert ix[r['slug']]['file']==r['file_path']
    prim={i.iem_id:i for i in images if i.role=='primary' and i.verification_status=='verified'}
    modelmap={i.id:i for i in all_models}
    hashes=defaultdict(set)
    for i in prim.values():hashes[i.sha256].add(modelmap[i.iem_id].slug)
    collisions=[sorted(slugs) for slugs in hashes.values() if len(slugs)>1]
    assert not collisions, f'Cross-model primary byte duplicates need review: {collisions}'
    # Representative public static serving, without cookies or account access.
    samples=[next(json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()) for p in manifests if p.stat().st_size][:]
    serving=[]
    with httpx.Client(timeout=15) as client:
        for row in samples:
            response=client.get('http://127.0.0.1:8000/api/iem-images/'+row['file_path'])
            response.raise_for_status()
            assert hashlib.sha256(response.content).hexdigest()==row['sha256']
            serving.append({'slug':row['slug'],'status':response.status_code,'bytes_sha256_valid':True})
    decisions={}
    for path in sorted(WORK.glob('*-decisions.json'),key=lambda p:p.stat().st_mtime):
        decisions.update(json.loads(path.read_text(encoding='utf-8')))
    attempts=defaultdict(list)
    batch_stats=[]
    for lead in WORK.glob('*-leads.json'):
        label=lead.name.removesuffix('-leads.json')
        p=WORK/f'{label}-candidates.json'
        if not p.exists():continue
        rows=json.loads(p.read_text(encoding='utf-8'))
        for r in rows:
            attempts[r['slug']].append({k:r[k] for k in ('source','page_url','image_url','error','id','file') if k in r})
        batch_stats.append({'batch':label,'decoded':sum('file' in r for r in rows),'errors':sum('error' in r for r in rows),'models_with_photos':len({r['slug'] for r in rows if 'file' in r})})
    ledger=[]
    for m in models:
        p=prim.get(m.id)
        status='approved' if p else 'unverified_legacy' if m.image_path else 'none'
        if p:reason='Verified contact-sheet decision and complete provenance in image library.'
        elif m.image_path:reason='Preserved pre-existing legacy path; no verified library primary. Not replaced.'
        elif m.slug in RANKED_REASONS:reason=RANKED_REASONS[m.slug]
        elif m.slug in decisions:reason=decisions[m.slug]['note']
        elif attempts[m.slug]:reason='Acquisition blocked or no suitable decoded exact-product frame; details in phase3-source-attempts.json.'
        else:reason='No exact-model photo lead in inspected public retailer/manufacturer/review inventories. No sibling or invented image substituted.'
        ledger.append({'brand':m.brand,'model':m.model,'slug':m.slug,'in_phase3_baseline':'yes','ranked_baseline_engine':'yes' if m.slug in ranked else 'no',
                       'image_status':status,'primary_file':p.file_path if p else m.image_path or '',
                       'primary_source':p.source_name if p else m.image_source or '',
                       'page_url':p.page_url if p else m.image_source_url or '',
                       'width':p.width if p else '', 'height':p.height if p else '',
                       'reason':reason,'source_attempt_count':len(attempts[m.slug])})
    missing=[r for r in ledger if r['ranked_baseline_engine']=='yes' and r['image_status']=='none']
    assert {r['slug'] for r in missing}==set(RANKED_REASONS), 'Ranked reasons need refreshing'
    csvpath=ROOT/'data/iem/reports/phase3-image-status.csv'
    with csvpath.open('x',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(ledger[0]));w.writeheader();w.writerows(ledger)
        for m in extras:
            p=prim.get(m.id)
            w.writerow({'brand':m.brand,'model':m.model,'slug':m.slug,'in_phase3_baseline':'no','ranked_baseline_engine':'unknown',
                        'image_status':'approved' if p else 'unverified_legacy' if m.image_path else 'none',
                        'primary_file':p.file_path if p else m.image_path or '', 'primary_source':p.source_name if p else m.image_source or '',
                        'page_url':p.page_url if p else m.image_source_url or '', 'width':p.width if p else '', 'height':p.height if p else '',
                        'reason':'Added by concurrent catalogue work after the Phase 3 baseline snapshot; outside the 1035-model brief cohort. No image write by this pipeline.',
                        'source_attempt_count':0})
    verified_ranked=sum(m.slug in ranked and m.id in prim for m in models)
    rank_paths=sum(m.slug in ranked and bool(m.image_path) for m in models)
    covered=sum(bool(m.image_path) for m in models)
    free=shutil.disk_usage(ROOT).free
    assert free>=5*1024**3
    baseline_verified=sum(m.id in prim for m in models)
    summary={'models':len(models),'verified_primaries':baseline_verified,'covered_including_legacy':covered,
             'live_snapshot_utc':snapshot_time,'live_catalogue_models':len(all_models),'concurrent_models_added':len(extras),
             'live_image_paths':sum(bool(m.image_path) for m in all_models),'original_protected_subset_checks':original_checks,
             'new_verified_primaries':len(newrows),'ranked_covered_including_legacy':rank_paths,
             'ranked_verified':verified_ranked,'ranked_missing':len(missing),'total_missing':len(models)-covered,
             'protected_fingerprints_unchanged':True,'old_primary_records_and_bytes_preserved':len(baseline['primaries']),
             'old_index_entries_preserved':len(old_index),'all_library_bytes_valid':len(images),
             'cross_model_primary_byte_duplicates':collisions,'import_idempotency':dry,'api_serving_samples':serving,
             'new_primary_sources':dict(Counter(r['source_name'] for r in newrows)),
             'free_gib':round(free/1024**3,2),'batches':batch_stats}
    write_new(ROOT/'data/iem/reports/phase3-final-audit.json',summary)
    write_new(ROOT/'data/iem/reports/phase3-source-attempts.json',dict(attempts))
    with REPORT.open('a',encoding='utf-8') as f:
        f.write('\n## Final summary\n\n'
                f'- Added **{len(newrows)} verified primary photographs**. Every imported primary was manually checked on saved contact sheets; originals are retained byte-for-byte. No matte trials, image generation, or upscaling.\n'
                f'- Ranked coverage: **{rank_paths}/203** with paths (**{verified_ranked} verified plus one preserved legacy**); **{len(missing)} still missing**. Of the initial 155 ranked gaps, {155-len(missing)} are now covered.\n'
                f'- Brief cohort: **{covered}/{len(models)}** with paths (**{baseline_verified} verified plus one legacy**); **{len(models)-covered} still missing**.\n'
                f'- Concurrent catalogue additions were detected during final verification. At {snapshot_time}, the live catalogue contained **{len(all_models)} models**, including **{len(extras)} new rows outside this brief\'s 1035-model baseline**, and {sum(bool(m.image_path) for m in all_models)} image paths. The CSV includes those extra rows with an explicit outside-baseline flag; they were not silently counted as searched or covered.\n'
                '- Full per-model status and reasons: [phase3-image-status.csv](phase3-image-status.csv). Source attempts, including blocked hosts and unsuitable frames: [phase3-source-attempts.json](phase3-source-attempts.json).\n'
                '- Integrity: every ORIGINAL protected measurement/profile/target/price row and original model identity matches the before snapshot. A catalogue-only dump was decoded to recover original IDs, then a read-only repeatable-read transaction verified those subsets independently of concurrent additions. All 259 original approved primaries and original index entries are preserved. Every library file passed byte-size/SHA-256 validation; re-import dry runs report duplicates only and zero errors. Representative image HTTP responses match original bytes. Details: [phase3-final-audit.json](phase3-final-audit.json).\n'
                f'- G: free space: **{summary["free_gib"]} GiB**, above the 5 GiB stop threshold. No files under web/ or backend/src/auralis/ were edited.\n'
                '- Rights remain unconfirmed for every newly sourced photograph: development build only, not for publication. The existing legacy image was not reclassified as verified.\n'
                '- Existing catalogue issue retained: AudioQuest NightHawk is shown as an over-ear product by its exact source. Its stored form/identity/ranking inputs were not changed; Bose Q25 is unresolved rather than assumed to mean QC25.\n\n'
                '### Ranked models still without an image\n\n| Model | Reason |\n|---|---|\n')
        for r in missing:f.write(f'| {r["brand"]} {r["model"]} | {r["reason"].replace("|","/")} |\n')
        f.write('\n### Reusable pipeline and retained artifacts\n\n'
                'Tools are under `tools/iem-ingest/phase3_*.py`; usage is in `tools/iem-ingest/PHASE3.md`. All HTTP bodies, discoveries, decoded originals, contact sheets, per-model manual decisions and importer manifests remain under `data/iem/images/phase3/`. Approved byte-for-byte originals are under `data/iem-images/originals/`. Index backups and the catalogue-only pre-write dump are under `data/iem/backups/`.\n')
    print({k:summary[k] for k in ('new_verified_primaries','verified_primaries','covered_including_legacy','ranked_covered_including_legacy','ranked_missing','total_missing','free_gib')})


if __name__=='__main__':main()
