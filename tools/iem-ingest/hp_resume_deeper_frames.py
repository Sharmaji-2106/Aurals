"""Try article-body alternatives when reviewed first frames were not usable primaries."""
import json
from collections import defaultdict
from hp_common import WORK, write_new
from hp_photos import PRIORITY

ms=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}|{m['slug'] for m in ms if m['image_path']}
acquired=defaultdict(set)
for batch in ('hp-photo12-0000','hp-photo13-0000'):
    for r in json.loads((WORK/f'{batch}-candidates.json').read_text(encoding='utf-8')):
        if 'file'in r:acquired[r['slug']].add(r['page_url'])
old={}
for batch in ('hp-photo12','hp-photo13'):
    for m in json.loads((WORK/f'{batch}-leads.json').read_text(encoding='utf-8')):old[m['slug']]=m
out=[]
for m in ms:
    if m['slug']in covered or not acquired[m['slug']]:continue
    choices=[{**c,'frame_offset':1} for c in old[m['slug']]['choices'] if c['page_url']in acquired[m['slug']] and c['kind']=='article']
    if choices:out.append({**m,'choices':choices[:2]})
out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
write_new(WORK/'hp-photo16-leads.json',out)
print({'targets':len(out),'article_pages':sum(len(m['choices']) for m in out)},flush=True)
