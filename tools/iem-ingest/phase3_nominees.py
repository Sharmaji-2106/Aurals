"""Build primary-first contact sheets, with no approval implied by nomination."""
import json
import sys
from phase3_images import WORK, write_new, sheets

batch=sys.argv[1]
rows=json.loads((WORK/f'{batch}-candidates.json').read_text(encoding='utf-8'))
valid=[r for r in rows if 'file' in r and min(r['width'],r['height'])>=100 and max(r['width'],r['height'])>=250]
grouped={}
for r in valid:grouped.setdefault(r['slug'],[]).append(r)
if len(sys.argv)>2:
    wanted=set(sys.argv[2:])
    nominees=[r for r in valid if r['slug'] in wanted]
    label=batch+'-alternates'
else:
    nominees=[rs[0] for rs in grouped.values()]
    label=batch+'-primary'
write_new(WORK/f'{label}-candidates.json',nominees)
write_new(WORK/f'{label}-nominees.json',{r['slug']:r['id'] for r in nominees})
with (WORK/f'{label}-identity.txt').open('x',encoding='utf-8') as f:
    for r in nominees:f.write(f'{r["id"]} | {r["page_title"]} | {r["page_url"]}\n')
sheets(label)
