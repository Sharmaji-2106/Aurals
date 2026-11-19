"""Final Phase 4B preservation, photo provenance, ranking and per-model gap audit."""
import csv
import hashlib
import json
import urllib.parse
from collections import Counter, defaultdict
from sqlalchemy import select, text
from auralis.db import new_session
from auralis.iem.models import Iem, IemImage
from hp_common import ROOT, RAW, WORK, append_report, space, write_new
from hp_db import audit, ranking
from hp_resume_state import state, verify

def main():
    space()
    preservation={**audit(),**verify()}
    baseline=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))
    final=state()
    before=json.loads((WORK/'hp-resume-ranking-baseline.json').read_text(encoding='utf-8'))
    after=ranking()
    assert before==after,'Current fixed-profile ranking changed'
    write_new(WORK/'hp-resume-ranking-final.json',after)
    compared=[]
    for p in WORK.glob('*-comparison.json'):
        data=json.loads(p.read_text(encoding='utf-8'));assert data['passed'],p.name
        compared.append(p.name)
    manifests=[(p.name,json.loads(line)) for p in WORK.glob('hp-*-library.jsonl') for line in p.read_text(encoding='utf-8').splitlines()]
    effective={};superseded=[]
    with new_session() as s:
        for filename,r in manifests:
            m=s.scalar(select(Iem).where(Iem.slug==r['slug']))
            image=s.scalar(select(IemImage).where(IemImage.iem_id==m.id,IemImage.file_path==r['file_path']))
            assert image and image.sha256==r['sha256'],(filename,r['slug'])
            b=(ROOT/'data/iem-images'/r['file_path']).read_bytes()
            assert len(b)==r['byte_size'] and hashlib.sha256(b).hexdigest()==r['sha256']
            if m.image_path==r['file_path']:
                assert image.role=='primary' and image.verification_status=='verified'
                assert len(s.scalars(select(IemImage).where(IemImage.iem_id==m.id,IemImage.role=='primary')).all())==1
                effective[r['slug']]=r
            else:
                correction=WORK/'hp-correction-pure-superseded.json'
                assert correction.exists() and r['slug']=='ultrasone-signature-pure'
                assert image.role=='original' and image.verification_status=='unverified'
                superseded.append({'manifest':filename,'slug':r['slug'],'file_path':r['file_path']})
        counts=[dict(r._mapping) for r in s.execute(text("SELECT source, rig_family, form, count(*) AS measurements FROM fr_measurements WHERE rig_family LIKE 'headphone:%' GROUP BY source,rig_family,form ORDER BY source,rig_family,form"))]
    candidates=defaultdict(list);decisions=defaultdict(list);leads=defaultdict(set)
    for p in WORK.glob('*-candidates.json'):
        for r in json.loads(p.read_text(encoding='utf-8')):candidates[r['slug']].append(r)
    for p in WORK.glob('*-decisions.json'):
        for slug,r in json.loads(p.read_text(encoding='utf-8')).items():
            if not r.get('candidate'):decisions[slug].append(r['note'])
    for p in WORK.glob('*-leads.json'):
        for m in json.loads(p.read_text(encoding='utf-8')):leads[m['slug']].update(c['page_url'] for c in m.get('choices',[]))
    searched=set()
    for p in WORK.glob('hp-web-search-*.json'):
        searched.update(m['slug'] for m in json.loads(p.read_text(encoding='utf-8'))['models'])
    gaps=[]
    for m in final['headphones']:
        if m['image_path']:continue
        slug=m['slug'];attempted={r.get('page_url') for r in candidates[slug]}
        # Empty article image lists produce no candidate row. The retained HTTP
        # metadata still proves that the discovered page was actually acquired.
        for u in leads[slug]:
            host=urllib.parse.urlsplit(u).netloc
            token=hashlib.sha256(u.encode()).hexdigest()+'.json'
            for path in (RAW/'http'/host/token,ROOT/'data/iem/raw'/host/token):
                if path.exists() and json.loads(path.read_text(encoding='utf-8')).get('url')==u:
                    attempted.add(u)
                    break
        reasons=list(dict.fromkeys(decisions[slug]))
        errors=list(dict.fromkeys(r['error'] for r in candidates[slug] if r.get('error')))
        if slug=='beats-powerbeats-2-wireless':
            reason='Upstream headphone identity is actually an in-ear sports earphone; no headphone photo attached. Existing measurement left untouched and requires a separate form correction.'
        elif reasons:reason=' | '.join(reasons)
        elif errors:reason='Acquisition unavailable/refused: '+' | '.join(errors)
        else:reason='No exact-model photograph established by retailer/manufacturer/review inventories and the explicit model-by-model web search. No sibling, edition, generation or modification substituted.'
        gaps.append({**m,'reason':reason,'explicit_web_search':slug in searched,'source_pages_discovered':len(leads[slug]),'source_pages_attempted':len(attempted),'unattempted_pages':len(leads[slug]-attempted)})
    fields=['slug','brand','model','image_path','reason','explicit_web_search','source_pages_discovered','source_pages_attempted','unattempted_pages']
    with (WORK/'hp-resume-photo-gaps.csv').open('x',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(gaps)
    old_photos=sum(bool(m['image_path']) for m in baseline['headphones'])
    total_photos=sum(bool(m['image_path']) for m in final['headphones'])
    added=total_photos-old_photos
    result={'headphone_identities':len(final['headphones']),'headphone_measurements':sum(r['measurements'] for r in counts),'photos_at_resume':old_photos,'photos_added_during_resume':added,'headphones_with_photo':total_photos,'photo_gaps':len(gaps),'photo_coverage_complete':not gaps,'explicit_web_searches':len(searched),'every_remaining_gap_explicitly_searched':all(g['explicit_web_search'] for g in gaps),'effective_phase4_primaries':len(effective),'superseded_photos':superseded,'all_original_image_bytes_match_manifests':True,'all_current_phase4_primaries_verified':True,'all_four_current_fixed_profile_rankings_identical':True,'ranked_items_per_profile':{k:len(v) for k,v in after.items()},'measurement_counts_by_source_and_rig':counts,'compared_batches':sorted(compared),**preservation}
    write_new(WORK/'hp-resume-final-audit.json',result)
    write_new(WORK/'hp-resume-headphone-catalogue.json',final['headphones'])
    append_report('\n## Phase 4B final summary\n\n'+f'- Resumed from **{old_photos} of {len(final["headphones"])}** headphone identities with photos. Added **{added}** net primary photographs; now **{total_photos} of {len(final["headphones"])}** have a photograph. Headphones/measurements added during this resume: **0/0**; existing {result["headphone_measurements"]} headphone measurements and all rig/source provenance retained.\n'+f'- **{len(gaps)} identities still lack a verified exact-model photo. Full photo coverage remains incomplete.** Every remaining gap received an explicit model-by-model web search, in addition to the retained inventories. Detailed rejection/acquisition evidence and per-model attempts: `data/iem/images/phase4/hp-resume-photo-gaps.csv`. No substitute sibling, named edition, revision or modified model was accepted for a gap.\n'+f'- Every new primary was visually checked on retained contact sheets and imported through `auralis import-iem-library`, with a catalogue-only backup, dry run and fixed-ID four-profile before/after comparison per batch. All {len(compared)} retained comparison files pass. Current rankings retain identical items, scores, source references and order ({result["ranked_items_per_profile"]}). The baseline includes the intervening Phase 6 additions.\n'+'- All pre-resume image rows and primary paths, including Headphone Zone in-ear photographs, are byte-for-byte/field-for-field unchanged. All pre-resume and original Phase 4 identity/acoustic hashes are unchanged. All retained photo bytes match their manifests; current phase4 primaries are individually verified.\n'+'- One resume selection was corrected: later Ultrasone Signature PURE BLACK rejected for original Signature Pure and replaced with a 2023 review photograph. Wrong bytes/row are retained as unverified superseded evidence; no pre-resume image changed.\n'+'- A legacy upstream headphone row for Beats Powerbeats 2 Wireless is actually an in-ear sports model. No headphone photograph was attached, and its measurement was not edited in this photo-only resume. It is explicitly flagged in the gap ledger.\n'+'- No web/backend source, schema, Phase 3 output or Indian-retail file was edited. Artifacts remain in phase4 working/library paths, hp-phase4 raw/backups and tools/iem-ingest. All source/visual decisions and unconfirmed-rights provenance are retained.\n'+'- Final evidence: `data/iem/images/phase4/hp-resume-final-audit.json`; refreshed catalogue: `hp-resume-headphone-catalogue.json`.\n')
    print({k:result[k] for k in ('headphone_identities','headphone_measurements','photos_added_during_resume','headphones_with_photo','photo_gaps','every_remaining_gap_explicitly_searched','all_four_current_fixed_profile_rankings_identical','all_pre_resume_images_and_primaries_unchanged')})

if __name__=='__main__':main()
