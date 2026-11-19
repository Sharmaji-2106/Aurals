"""Acquire explicit source pages, including reviewed corrections to this run's photos."""
import argparse
import json
import re
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from selectolax.lexbor import LexborHTMLParser
from hp_common import ROOT, WORK, write_new
from hp_photos import fetch
from intake import image_metrics

def main():
    p=argparse.ArgumentParser();p.add_argument('batch');p.add_argument('--frames',type=int,default=3);a=p.parse_args()
    models=json.loads((WORK/f'{a.batch}-leads.json').read_text(encoding='utf-8'))
    out=[]
    for m in models:
        for n,c in enumerate(m['choices'],1):
            try:
                page=LexborHTMLParser(fetch(c['page_url']))
                heading=page.css_first('h1')
                title=heading.text().strip() if heading else c['title']
                imgs=[x.attributes['content'] for x in page.css('meta') if x.attributes.get('property')=='og:image' and x.attributes.get('content')]
                imgs.extend(x.attributes.get('data-src') or x.attributes.get('src') for x in page.css('img'))
                imgs=list(dict.fromkeys(urllib.parse.urljoin(c['page_url'],u) for u in imgs if u and not u.startswith('data:') and not re.search(r'(logo|avatar|banner|award|rating|graph|frequency|donat|paypal|\.svg|\.gif)',u,re.I)))
                for j,u in enumerate(imgs[:a.frames]):
                    try:
                        body=fetch(u);metrics=image_metrics(body)
                        if min(metrics['width'],metrics['height'])<120:continue
                        ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp','AVIF':'.avif'}[metrics['format']]
                        path=WORK/'candidates'/m['slug']/(metrics['sha256'][:20]+ext)
                        path.parent.mkdir(parents=True,exist_ok=True)
                        if not path.exists():
                            with path.open('xb') as f:f.write(body)
                        out.append({'id':f'{m["slug"]}:{n}:{j}',**{k:m[k] for k in ('slug','brand','model')},'source':c['source'],'title':c['title'],'page_title':title,'page_url':c['page_url'],'image_url':u,'file':path.relative_to(ROOT).as_posix(),'retrieved_on':datetime.now(UTC).date().isoformat(),**metrics})
                    except Exception as e:out.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':str(e)})
            except Exception as e:out.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':str(e)})
    write_new(WORK/f'{a.batch}-candidates.json',out)
    print({'batch':a.batch,'photos':sum('file'in r for r in out),'errors':sum('error'in r for r in out)})

if __name__=='__main__':main()
