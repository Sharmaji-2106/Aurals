"""Exact-name matching to RAA's public, measured-product photograph catalogue.

The inventory is the public wired/in-ear filter rendered by its ordinary UI.
The photo adapter never reads or imports measurement curves.
"""
import json
import sys
from phase3_images import WORK, models, write_new, keys

label,scope=sys.argv[1:3]
indexed={keys(t):(t,u) for t,u in json.loads((WORK/'raa-products.json').read_text(encoding='utf-8')) if 'title-report.php?id=' in u}
out=[]
for m in models(scope):
    if scope=='all' and m['ranked']:continue
    key=keys(m['brand']+' '+m['model'])
    choices=[]
    if key in indexed:
        t,u=indexed[key]
        choices.append({'source':'Reference Audio Analyzer','title':t,'page_url':u,'kind':'raa','score':110})
    if choices:out.append({**m,'choices':choices})
write_new(WORK/f'{label}-leads.json',out)
print({'scope':scope,'exact_photo_leads':len(out),'models':[m['slug'] for m in out] if scope=='ranked' else ''})
