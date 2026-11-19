"""Browse a newly discovered public legacy-photo catalogue, using exact names only."""
import json
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from selectolax.lexbor import LexborHTMLParser
from hp_common import WORK, write_new
from hp_photos import fetch, PRIORITY
from hp_fallback_photos import key, ALIASES

origin='https://www.headphonereviews.org'
links=json.loads((WORK/'hp-headphonereviews-browse.json').read_text(encoding='utf-8'))
urls=sorted({urllib.parse.urljoin(origin,u) for t,u in links if u.startswith('/category/') and not any(s in u for s in ('earbud','true_wireless','bone_conduction'))})
def one(u):
    try:
        page=LexborHTMLParser(fetch(u))
        return {'url':u,'entries':[(a.text().strip(),urllib.parse.urljoin(origin,a.attributes['href'])) for a in page.css('a[href]') if a.attributes['href'].startswith('/headphone/')],'error':None}
    except Exception as e:return {'url':u,'entries':[],'error':str(e)}
with ThreadPoolExecutor(max_workers=4) as pool:inventory=list(pool.map(one,urls))
write_new(WORK/'hp-headphonereviews-inventory-v2.json',inventory)
entries={u:t for r in inventory for t,u in r['entries'] if t}
ms=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}|{m['slug'] for m in ms if m['image_path']}
tried={r.get('page_url') for p in WORK.glob('*-candidates.json') for r in json.loads(p.read_text(encoding='utf-8'))}
out=[]
for m in ms:
    if m['slug'] in covered:continue
    forms={key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}
    if m['brand']=='Grado':forms.add(key('Grado Labs '+m['model']))
    cs=[]
    for u,t in entries.items():
        name=key(urllib.parse.unquote(urllib.parse.urlsplit(u).path).replace('/headphone/',''))
        if u not in tried and (name in forms or key(t) in forms):
            cs.append({'source':'HeadphoneReviews.org','title':t,'page_url':u,'kind':'article','score':110})
    # Confirmed pinned alias: the stored Void PRO RGB is the Wireless model.
    if m['slug']=='corsair-void-pro-rgb':
        cs=[{'source':'TechRadar','title':'Corsair Void PRO RGB Wireless (explicit pinned source-name alias)','page_url':'https://www.techradar.com/reviews/corsair-void-pro-rgb-wireless','kind':'article','score':120,'discovery_note':'Rtings name_index.tsv lines 413-414 map source_name Corsair Void PRO RGB Wireless to normalized Corsair Void PRO RGB.'}]
    if cs:out.append({**m,'choices':cs})
out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
write_new(WORK/'hp-photo15-leads.json',out)
print({'legacy_inventory_links':len(entries),'new_targets':len(out)},flush=True)
