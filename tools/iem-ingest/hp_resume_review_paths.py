"""Resolve documented old review URL structures from the retained public inventories."""
import json
import re
import urllib.parse
from hp_common import WORK, write_new
from hp_photos import PRIORITY
from hp_fallback_photos import key, ALIASES

models=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}
covered.update(m['slug'] for m in models if m['image_path'])
for b in ('hp-photo08','hp-photo09'):
    covered.update(m['slug'] for m in json.loads((WORK/f'{b}-leads.json').read_text(encoding='utf-8')) if m['choices'])
entries=[]
for host in ('www.whathifi.com','www.techradar.com'):
    maps=json.loads((WORK/f'hp-review-inventory-{host}.json').read_text(encoding='utf-8'))
    for u in {u for row in maps for u in row['urls']}:
        path=urllib.parse.unquote(urllib.parse.urlsplit(u).path).strip('/').split('/')
        if '/review' not in u:continue
        if path[-1]=='review':
            path=path[:-1]
            if host=='www.whathifi.com':name=' '.join(path[-2:])
            else:name=re.sub(r'-\d{5,}$','',path[-1])
        else:name=path[-1]
        entries.append((host,u,key(name)))
out=[]
for m in models:
    if m['slug'] in covered:continue
    forms={key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}
    cs=[]
    for host,u,k in entries:
        for f in forms:
            if k in (f,f+'review',f+'headphones',f+'openbackheadphones',f+'onear',f+'overear',f+'gamingheadset'):
                cs.append({'source':'What Hi-Fi?' if host=='www.whathifi.com' else 'TechRadar','title':m['brand']+' '+m['model'],'page_url':u,'kind':'article','score':110})
                break
    if cs:out.append({**m,'choices':cs})
out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
write_new(WORK/'hp-photo10-leads.json',out)
print({'new_targets':len(out),'pages':sum(len(m['choices']) for m in out)},flush=True)
