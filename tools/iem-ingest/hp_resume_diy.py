"""Extract actual DIY Audio Heaven JPEG photos, plus exact punctuation aliases."""
import json
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from selectolax.lexbor import LexborHTMLParser
from hp_common import WORK, write_new
from hp_photos import fetch, PRIORITY
from hp_fallback_photos import key, ALIASES

def main():
    models=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
    manifests=[r for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())]
    covered={r['slug'] for r in manifests}|{m['slug'] for m in models if m['image_path']}
    ms={m['slug']:m for m in models}
    existing={key(ms[r['slug']]['brand']+' '+ms[r['slug']]['model']):r for r in manifests}
    inventory=json.loads((WORK/'hp-diy-inventory-matches.json').read_text(encoding='utf-8'))
    out=[]
    for m in models:
        if m['slug'] in covered:continue
        forms={key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}
        cs=[]
        for k in forms:
            if k in existing:
                r=existing[k]
                cs.append({'source':r['source_name'],'title':m['brand']+' '+m['model'],'page_url':r['page_url'],'kind':'feed','score':120,'images':[r['image_url']],'discovery_note':'Exact punctuation/brand alias of a visually approved identical product. No generation, impedance or edition suffix removed.'})
                break
        for u,full,model in inventory:
            if full in forms or key(m['model'])==model:
                cs.append({'source':'DIY Audio Heaven','title':m['brand']+' '+m['model'],'page_url':u,'kind':'diy','score':110})
        if cs:out.append({**m,'choices':cs})
    def one(m):
        cs=[]
        for c in m['choices']:
            if c['kind']!='diy':cs.append(c);continue
            try:
                page=LexborHTMLParser(fetch(c['page_url']))
                imgs=[]
                for n in page.css('img[src]'):
                    src=n.attributes['src']
                    if not re.search(r'\.jpe?g(?:\?|$)',src,re.I):continue
                    if 'wp-content/uploads/' not in src:continue
                    imgs.append(urllib.parse.urljoin(c['page_url'],src))
                if imgs:cs.append({**c,'kind':'feed','images':list(dict.fromkeys(imgs))[:4]})
            except Exception as e:m.setdefault('errors',[]).append(str(e))
        return {**m,'choices':cs}
    with ThreadPoolExecutor(max_workers=4) as pool:out=list(pool.map(one,out))
    out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
    write_new(WORK/'hp-photo09-leads.json',out)
    print({'targets':len(out),'photo_leads':sum(bool(m['choices']) for m in out)},flush=True)

if __name__=='__main__':main()
