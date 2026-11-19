"""Reject known in-ears mislabeled as over-ear upstream, before pending imports."""
import json
from hp_common import RAW, WORK, jsonl, write_new, append_report

wrong={'Sennheiser CX 400BT','Bose QuietComfort 20','Kiwi Ears KE4','Bose QuietControl 30','Samsung Gear IconX','Koss KDE250'}
removed=[]
for path in RAW.glob('*-measurements.jsonl'):
    rows=[json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
    rejected=[r for r in rows if r['brand']+' '+r['model'] in wrong]
    if not rejected:continue
    assert not (WORK/(path.name.replace('-measurements.jsonl','-import.json'))).exists()
    backup=RAW/'form-review'/path.name
    backup.parent.mkdir(parents=True,exist_ok=True)
    assert not backup.exists()
    path.rename(backup)
    jsonl(path,[r for r in rows if r not in rejected])
    rejection_path=RAW/path.name.replace('-measurements.jsonl','-rejections.json')
    prior=json.loads(rejection_path.read_text(encoding='utf-8'))
    rejection_path.rename(backup.parent/rejection_path.name)
    more=[{'name':r['brand']+' '+r['model'],'source_ref':r['source_ref'],'reason':'Upstream over-ear form is incorrect or unconfirmed: in-ear/earbud product, excluded from headphone ingestion.'} for r in rejected]
    removed.extend(more)
    write_new(rejection_path,prior+more)
write_new(RAW/'hp-form-rejections.json',removed)
p=WORK/'hp-photo-targets.json'
ms=json.loads(p.read_text(encoding='utf-8'))
p.rename(RAW/'form-review'/p.name)
write_new(p,[m for m in ms if m['brand']+' '+m['model'] not in wrong])
# Interrupted pre-write snapshots are retained, allowing a clean repeat of RTINGS.
for p in WORK.glob('hp-rtings-*.json'):
    assert p.name in ('hp-rtings-ranking-before.json','hp-rtings-dry-run.json'), p
    p.rename(RAW/'form-review'/p.name)
append_report('\nPreflight identity/form review: kept original marketed editions and impedances; resolved case/punctuation aliases and spelled Arctis 7P Plus explicitly to avoid collision with Arctis 7P. Rejected '+str(len(removed))+' mislabeled or unconfirmed in-ear/earbud curves from headphone directories. Audit: `data/iem/raw/hp-phase4/hp-form-rejections.json`; all original manifests retained in versioned backup folders.\n')
print({'misclassified_curves_rejected':len(removed)})
