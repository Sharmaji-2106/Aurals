"""Exact review inventories and untried previous alternatives, without search crawlers."""
import json
import re
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from selectolax.lexbor import LexborHTMLParser
from hp_common import WORK, write_new
from hp_photos import fetch, PRIORITY
from hp_fallback_photos import key, ALIASES

BRANDS={'brands-s-se':'Sennheiser','brands-st-x':'Sony','brands-a-i':'Beyerdynamic','brands-philips':'Philips','brand-superlux':'Superlux','akg':'AKG','hifiman':'HIFIMAN','focal':'Focal','audeze':'Audeze','grado':'Grado','audio-technica':'Audio-Technica','fostex':'Fostex','koss':'Koss'}

def main():
    models=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
    covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}
    covered.update(m['slug'] for m in models if m['image_path'])
    # Reserve successful RAA leads for photo06, avoiding duplicate candidates.
    covered.update(m['slug'] for m in json.loads((WORK/'hp-photo06-leads.json').read_text(encoding='utf-8')) if m['choices'])
    tried=defaultdict(set)
    for p in WORK.glob('*-candidates.json'):
        for r in json.loads(p.read_text(encoding='utf-8')):tried[r['slug']].add(r.get('page_url'))
    alternatives=defaultdict(list)
    for batch in ('hp-photo01','hp-photo02','hp-photo03','hp-photo04'):
        for m in json.loads((WORK/f'{batch}-leads.json').read_text(encoding='utf-8')):
            alternatives[m['slug']].extend(c for c in m['choices'] if c['page_url'] not in tried[m['slug']] and c['source']!='RTINGS')
    urls=json.loads((WORK/'hp-inventory-diyaudioheaven.wordpress.com.json').read_text(encoding='utf-8'))
    inventory=[]
    for u in urls:
        path=urllib.parse.unquote(urllib.parse.urlsplit(u).path).strip('/').split('/')
        if len(path)<3 or path[0]!='measurements':continue
        brand=BRANDS.get(path[1],path[1])
        model=path[-1].replace('ω',' ohm').replace('-',' ')
        inventory.append((u,key(brand+' '+model),key(model)))
    out=[]
    for m in models:
        if m['slug'] in covered:continue
        forms={key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}
        choices=[]
        for u,full,model in inventory:
            if full in forms or key(m['model'])==model:
                choices.append({'source':'DIY Audio Heaven','title':m['brand']+' '+m['model'],'page_url':u,'kind':'article','score':110,'discovery_note':'Exact model path match; source heading and photograph still require visual review.'})
        choices.extend(alternatives[m['slug']])
        unique={}
        for c in choices:unique.setdefault(c['page_url'],c)
        if unique:out.append({**m,'choices':list(unique.values())})
    out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
    write_new(WORK/'hp-photo07-leads.json',out)
    write_new(WORK/'hp-diy-inventory-matches.json',inventory)
    print({'targets':len(out),'diy_targets':sum(any(c['source']=='DIY Audio Heaven' for c in m['choices']) for m in out),'choices':sum(len(m['choices']) for m in out)},flush=True)

if __name__=='__main__':main()
