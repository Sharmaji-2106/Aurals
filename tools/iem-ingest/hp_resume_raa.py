"""Bulk exact-model RAA photograph discovery, using the public product inventory."""
import json
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from selectolax.lexbor import LexborHTMLParser
from hp_common import WORK, write_new
from hp_photos import fetch, PRIORITY
from hp_fallback_photos import key, ALIASES

def main():
    models=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
    covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}
    entries=json.loads((WORK/'hp-raa-products.json').read_text(encoding='utf-8'))
    indexed={key(t):(t,urllib.parse.urljoin('https://reference-audio-analyzer.pro',u)) for t,u in entries}
    matches=[]
    for m in models:
        if m['image_path'] or m['slug'] in covered:continue
        variants=[key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])]
        match=next((indexed[k] for k in variants if k in indexed),None)
        if match:matches.append((m,match))
    def one(item):
        m,(title,url)=item
        try:
            page=LexborHTMLParser(fetch(url))
            heading=page.css_first('h1')
            name=heading.text().strip() if heading else title
            urls=[urllib.parse.urljoin(url,n.attributes['src']) for n in page.css('img[src]') if '/report/hp/' in n.attributes['src'] and not n.attributes['src'].endswith('.svg')]
            return {**m,'choices':[{'source':'Reference Audio Analyzer','title':name,'page_url':url,'kind':'feed','score':110,'images':list(dict.fromkeys(urls))[:2]}] if urls else [],'source_inventory_name':title}
        except Exception as e:return {**m,'choices':[],'error':str(e),'page_url':url}
    with ThreadPoolExecutor(max_workers=4) as pool:out=list(pool.map(one,matches))
    out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
    write_new(WORK/'hp-photo06-leads.json',out)
    print({'matched':len(matches),'with_photos':sum(bool(m['choices']) for m in out),'errors':sum('error'in m for m in out)},flush=True)

if __name__=='__main__':main()
