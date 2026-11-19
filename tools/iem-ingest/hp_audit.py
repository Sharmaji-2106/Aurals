"""Read-only final audit of owned rows, pinned bytes, photos, rankings and gaps."""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from sqlalchemy import select
from auralis.db import new_session
from auralis.iem.models import Iem, FrMeasurement, IemImage, IemAcousticProfile
from auralis.iem.importer import checksum
from hp_common import CHECKOUT, ROOT, RAW, WORK, append_report, space, write_new
from hp_db import audit, ranking

def main():
    space()
    protected=audit()
    base=json.loads((WORK/'hp-baseline.json').read_text(encoding='utf-8'))
    base_ids={m['id'] for m in base['models']}
    expected={r['source_ref']:r for f in RAW.glob('*-measurements.jsonl') for r in map(json.loads,f.read_text(encoding='utf-8').splitlines())}
    manifests={r['slug']:r for f in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,f.read_text(encoding='utf-8').splitlines())}
    models=json.loads((WORK/'hp-headphone-catalogue.json').read_text(encoding='utf-8'))
    compared=[]
    for path in WORK.glob('*-comparison.json'):
        d=json.loads(path.read_text())
        assert d['passed']
        compared.append(path.name)
    final=ranking()
    assert final==json.loads((WORK/'hp-ranking-baseline.json').read_text()),'Final ranking changed'
    write_new(WORK/'hp-ranking-final.json',final)
    counts=Counter();families=Counter();forms=Counter();missing_profiles=[]
    with new_session() as s:
        rows=s.scalars(select(FrMeasurement).where(FrMeasurement.rig_family.like('headphone:%'))).all()
        for m in rows:
            source=expected[m.source_ref]
            assert m.form in ('over-ear','on-ear') and m.rig_family.startswith('headphone:')
            assert source['points']==m.raw_points and checksum(source['points'])==m.checksum
            assert source['source_url']==m.source_url and source['rig']==m.rig and source['notes']==m.notes
            relative=m.source_ref.split(':measurements/',1)[1]
            path=CHECKOUT/'measurements'/relative
            points=[[float(r[0]),float(r[1])] for r in csv.reader(path.open(encoding='utf-8-sig')) if len(r)>1 and r[0]!='frequency']
            assert points==m.raw_points, m.source_ref
            profiles=s.scalars(select(IemAcousticProfile).where(IemAcousticProfile.measurement_id==m.id)).all()
            assert len(profiles)==1 and profiles[0].target_name is None
            counts[m.source]+=1;families[(m.source,m.rig_family)]+=1;forms[m.form]+=1
        for slug,r in manifests.items():
            m=s.scalar(select(Iem).where(Iem.slug==slug))
            assert m and m.image_path==r['file_path']
            images=s.scalars(select(IemImage).where(IemImage.iem_id==m.id,IemImage.role=='primary')).all()
            assert len(images)==1
            image=images[0]
            assert image.verification_status=='verified' and image.sha256==r['sha256']
            b=(ROOT/'data/iem-images'/r['file_path']).read_bytes()
            assert len(b)==r['byte_size'] and hashlib.sha256(b).hexdigest()==r['sha256']
        current=s.scalars(select(Iem).join(FrMeasurement).where(FrMeasurement.rig_family.like('headphone:%')).distinct()).all()
        new_models=sum(str(m.id) not in base_ids for m in current)
        preexisting_images={m.slug:m.image_path for m in current if str(m.id) in base_ids and m.image_path}
    candidates=defaultdict(list);decisions=defaultdict(list);leads=defaultdict(set)
    for p in WORK.glob('*-candidates.json'):
        for r in json.loads(p.read_text(encoding='utf-8')):candidates[r['slug']].append(r)
    for p in WORK.glob('*-decisions.json'):
        for slug,r in json.loads(p.read_text(encoding='utf-8')).items():
            if not r.get('candidate'):decisions[slug].append(r['note'])
    for p in WORK.glob('*-leads.json'):
        for r in json.loads(p.read_text(encoding='utf-8')):
            leads[r['slug']].update(c['page_url'] for c in r.get('choices',[]))
    gaps=[]
    for m in models:
        slug=m['slug']
        if slug in manifests or slug in preexisting_images:continue
        attempted={r.get('page_url') for r in candidates[slug]}
        notes=list(dict.fromkeys(decisions[slug]))
        errors=list(dict.fromkeys(r['error'] for r in candidates[slug] if r.get('error')))
        if notes:reason='Rejected after visual review: '+' | '.join(notes)
        elif errors:reason='Source acquisition blocked/unavailable: '+' | '.join(errors)
        elif leads[slug]:reason='No verified exact-model photograph from discovered source pages.'
        else:reason='No exact-model lead in the cached retailer/review inventories or tested manufacturer archives; no sibling substituted.'
        gaps.append({**m,'reason':reason,'source_pages_discovered':len(leads[slug]),'source_pages_attempted':len(attempted),'unattempted_pages':len(leads[slug]-attempted)})
    with (WORK/'hp-photo-gaps.csv').open('x',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['slug','brand','model','image_path','reason','source_pages_discovered','source_pages_attempted','unattempted_pages']);w.writeheader();w.writerows(gaps)
    result={'headphones_added':new_models,'headphone_identities':len(current),'measurements_added':len(rows),'photos_added':len(manifests),'pre_existing_headphone_photos_retained':len(preexisting_images),'photo_gaps':len(gaps),'measurement_counts_by_source':dict(counts),'measurement_counts_by_source_and_rig':[{'source':s,'rig_family':r,'count':n} for (s,r),n in sorted(families.items())],'forms':dict(forms),'owned_original_bytes_match_pin':True,'headphones_have_only_untargeted_profiles':True,'all_photo_hashes_and_primaries_valid':True,'all_fixed_profile_rankings_identical':True,'ranked_items_per_profile':{k:len(v) for k,v in final.items()},'batches_compared':compared,**protected}
    write_new(WORK/'hp-final-audit.json',result)
    append_report('\n## Final summary\n\n'+f'- Added **{new_models} headphone identities** and **{len(rows)} frequency-response measurements** from {len(counts)} sources; headphone catalogue contains {len(current)} identities. All rig families begin `headphone:` and every imported curve has exactly one untargeted processed profile.\n'+f'- Added **{len(manifests)} photographs**, individually checked on retained contact sheets. Existing approved photographs were not replaced. Original image bytes, hashes, provenance, decisions and manifests are retained in the private phase4 namespaces. Rights unconfirmed.\n'+f'- **{len(gaps)} headphone identities still lack an approved photo.** This remains incomplete photo coverage; no claim of a photograph for every headphone. Per-model reasons and attempted/discovered source counts: `data/iem/images/phase4/hp-photo-gaps.csv`.\n'+'- All four fixed listener profiles retain the identical '+str(next(iter(result['ranked_items_per_profile'].values())))+' ranked in-ear items, scores, source references and order. Every import had its own catalogue-only backup, dry run and ranking comparison. Pre-existing identities and acoustic rows are unchanged; imported raw numeric points exactly match the pinned CSV bytes after CSV parsing.\n'+'- Legacy sources lack original graph URLs in the pin; their exact pinned numeric path and documented HMS II.3 rig are retained, with the missing graph URL disclosed in notes. Crinacle has 359 headphone index names but no raw numeric CSVs; these were not synthesized. Invalid curves and upstream misclassified in-ears are rejected in source ledgers.\n'+'- Web/backend source, Phase 3 outputs and Indian retail files were not modified. Library files reside only in `data/iem-images/phase4/`, required by the unchanged library importer. All other Phase 4 artifacts are in its assigned working/raw paths plus `tools/iem-ingest/hp_*.py`.\n'+'- Final evidence: `data/iem/images/phase4/hp-final-audit.json`; source and rig counts follow.\n\n| Source | Rig family | Measurements |\n|---|---|---:|\n'+''.join(f'| {s} | {r} | {n} |\n' for (s,r),n in sorted(families.items())))
    print({k:v for k,v in result.items() if k in ('headphones_added','headphone_identities','measurements_added','photos_added','photo_gaps','all_fixed_profile_rankings_identical')})

if __name__=='__main__':main()
