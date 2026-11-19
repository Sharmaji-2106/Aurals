"""Bulk public review sitemap discovery. Never downloads search-result pages."""
import json
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from selectolax.lexbor import LexborHTMLParser
from hp_common import WORK, write_new
from hp_photos import fetch, PRIORITY
from hp_fallback_photos import key, ALIASES

def inventory(host):
    maps=json.loads((WORK/f'hp-inventory-{host}.json').read_text(encoding='utf-8'))
    maps=[u for u in maps if re.search(r'sitemap-(?:20[01][0-9]|202[0-6])-\d\d.xml$',u)]
    def one(u):
        try:return {'sitemap':u,'urls':[x.text() for x in LexborHTMLParser(fetch(u)).css('loc')]}
        except Exception as e:return {'sitemap':u,'urls':[],'error':str(e)}
    rows=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(one,u) for u in maps]):
            rows.append(future.result())
            if len(rows)%75==0:print({'host':host,'maps_done':len(rows)},flush=True)
    write_new(WORK/f'hp-review-inventory-{host}.json',rows)
    return host,rows

def main():
    with ThreadPoolExecutor(max_workers=2) as pool:inventories=dict(pool.map(inventory,['www.whathifi.com','www.techradar.com']))
    models=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
    covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}
    covered.update(m['slug'] for m in models if m['image_path'])
    for b in ('hp-photo06','hp-photo07'):
        covered.update(m['slug'] for m in json.loads((WORK/f'{b}-leads.json').read_text(encoding='utf-8')) if m['choices'])
    entries=[]
    for host,maps in inventories.items():
        for u in {u for row in maps for u in row['urls']}:
            if '/review' not in u:continue
            tail=urllib.parse.unquote(urllib.parse.urlsplit(u).path).strip('/').split('/')[-1]
            entries.append((host,u,key(tail)))
    out=[]
    for m in models:
        if m['slug'] in covered:continue
        forms={key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}
        cs=[]
        for host,u,k in entries:
            if any(k in (f,f+'review',f+'reviewuk',f+'reviewus') for f in forms):
                cs.append({'source':'What Hi-Fi?' if host=='www.whathifi.com' else 'TechRadar','title':m['brand']+' '+m['model'],'page_url':u,'kind':'article','score':100})
        if cs:out.append({**m,'choices':cs})
    out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
    write_new(WORK/'hp-photo08-leads.json',out)
    print({'inventory_urls':len(entries),'new_targets':len(out)},flush=True)

if __name__=='__main__':main()
