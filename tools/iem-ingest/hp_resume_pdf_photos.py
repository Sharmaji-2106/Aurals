"""Extract retained original raster objects from exact-model public product PDFs.

No page rendering, tracing, image generation or retouching. Every extracted object
still requires a contact-sheet decision distinguishing photographs from diagrams.
"""
import io
import json
import logging
import re
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from hp_common import ROOT, RAW, WORK, write_new
from hp_photos import fetch, PRIORITY
from hp_fallback_photos import key
from intake import image_metrics
sys.path.insert(0,str(RAW/'pdf-tooling'))
from pypdf import PdfReader
logging.getLogger('pypdf').setLevel(logging.ERROR)

def main():
    ms=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
    covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}|{m['slug'] for m in ms if m['image_path']}
    aliases=json.loads((WORK/'hp-pinned-photo-aliases.json').read_text(encoding='utf-8'))
    entries={}
    for p in list(WORK.glob('hp-web-search-*.json'))+list(WORK.glob('hp-web-single-*.json')):
        for e in json.loads(p.read_text(encoding='utf-8'))['entries']:
            if re.search(r'\.pdf(?:\?|$)',e['url'],re.I):entries.setdefault(e['url'],e)
    leads=[]
    for m in ms:
        if m['slug']in covered:continue
        fs={f for f in aliases.get(m['slug'],[]) if f}|{key(m['brand']+' '+m['model'])}
        cs=[]
        for u,e in entries.items():
            name=key(e['title']+' '+urllib.parse.unquote(u))
            if any(f in name for f in fs):
                cs.append({'source':urllib.parse.urlsplit(u).netloc,'title':e['title'],'page_url':u,'kind':'pdf','score':100})
        if cs:leads.append({**m,'choices':cs[:2]})
    leads.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
    write_new(WORK/'hp-photo17-leads.json',leads)
    def one(m):
        out=[]
        for n,c in enumerate(m['choices'],1):
            try:
                b=fetch(c['page_url']);reader=PdfReader(io.BytesIO(b));count=0
                for page_num,page in enumerate(reader.pages[:5],1):
                    for j,obj in enumerate(page.images):
                        body=obj.data;metrics=image_metrics(body)
                        if min(metrics['width'],metrics['height'])<150:continue
                        ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp','AVIF':'.avif'}.get(metrics['format'])
                        if not ext:continue
                        path=WORK/'candidates'/m['slug']/(metrics['sha256'][:20]+ext)
                        path.parent.mkdir(parents=True,exist_ok=True)
                        if not path.exists():
                            with path.open('xb') as f:f.write(body)
                        out.append({'id':f'{m["slug"]}:{n}:{page_num}-{j}',**{k:m[k] for k in ('slug','brand','model')},'source':c['source'],'title':c['title'],'page_title':c['title'],'page_url':c['page_url'],'image_url':c['page_url']+f'#page={page_num}','pdf_page':page_num,'pdf_image_name':obj.name,'pdf_sha256':__import__('hashlib').sha256(b).hexdigest(),'file':path.relative_to(ROOT).as_posix(),'retrieved_on':datetime.now(UTC).date().isoformat(),**metrics})
                        count+=1
                        if count>=10:break
                    if count>=10:break
            except Exception as e:out.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':str(e)})
        return out
    rows=[]
    with ThreadPoolExecutor(max_workers=6) as pool:
        for done in as_completed([pool.submit(one,m) for m in leads]):rows.extend(done.result())
    rows.sort(key=lambda r:(r['slug'],r.get('id','')))
    write_new(WORK/'hp-photo17-0000-candidates.json',rows)
    print({'pdf_targets':len(leads),'raster_objects':sum('file'in r for r in rows),'acquisition_errors':sum('error'in r for r in rows)},flush=True)

if __name__=='__main__':main()
