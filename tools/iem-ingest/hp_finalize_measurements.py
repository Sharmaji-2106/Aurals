"""Resolve preflight spelling collisions without changing existing identities."""
import json
from hp_common import RAW, WORK, write_new, jsonl
from phase2b_bulk_superreview import slug

inventory=json.loads((RAW/'hp-source-inventory.json').read_text(encoding='utf-8'))
known={r['slug']:r for r in json.loads((WORK/'hp-baseline.json').read_text(encoding='utf-8'))['models']}
models={}
changes=[]
for source in inventory:
    path=RAW/(source['batch']+'-measurements.jsonl')
    rows=[json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
    for row in rows:
        old=(row['brand'],row['model'])
        if row['brand']=='SteelSeries' and row['model']=='Arctis 7P+':
            row['model']='Arctis 7P Plus'
        s=slug(row['brand'],row['model'])
        if s in known:
            row['brand'],row['model']=known[s]['brand'],known[s]['model']
        else:known[s]={'brand':row['brand'],'model':row['model'],'slug':s,'image_path':None}
        if old!=(row['brand'],row['model']):
            changes.append({'source_ref':row['source_ref'],'before':old,'after':(row['brand'],row['model'])})
            row['notes']+=' Canonical identity spelling; original name preserved above.'
        models[s]=known[s]
    backup=RAW/'normalization-v2'/path.name
    backup.parent.mkdir(parents=True,exist_ok=True)
    assert not backup.exists()
    path.rename(backup)
    jsonl(path,rows)
write_new(RAW/'hp-identity-normalization.json',changes)
path=WORK/'hp-photo-targets.json'
path.rename(RAW/'normalization-v2'/'hp-photo-targets.json')
write_new(path,list(models.values()))
print({'models':len(models),'normalized_spelling_rows':len(changes)})
