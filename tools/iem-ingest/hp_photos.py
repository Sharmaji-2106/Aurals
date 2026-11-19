"""Phase 4 photo discovery and manual contact-sheet staging, isolated from Phase 3."""
import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from selectolax.lexbor import LexborHTMLParser
from intake import image_metrics
from hp_common import ROOT, RAW, WORK, jsonl, space, write_new
from phase2_images import SOURCES
import phase3_images as network

# Reuse the established ordinary HTTP implementation with isolated process globals.
network.RAW = RAW / 'http'
fetch = network.fetch

def key(value):
    value = value.casefold().replace('&','and').replace('+','plus').replace('ohms','ohm')
    value = value.replace('hifiman','hifiman').replace('final audio','final').replace('audio technica','audio-technica')
    return re.sub('[^a-z0-9]','',value)

PRIORITY = re.compile(r'^(?:Sony (?:WH-|ULT)|Bose QuietComfort|Sennheiser (?:Momentum|HD (?:450|560|599|600|650|660|800))|Audio-Technica ATH-M|AKG K(?:371|361|702|240)|Beyerdynamic DT (?:770|880|990)|Apple AirPods Max|Marshall |JBL (?:Tune|Live)|boAt |Skullcandy |HyperX Cloud|Logitech G|Philips SHP|HIFIMAN (?:HE400se|Sundara|Edition XS|Ananda)|Focal |Koss |Grado SR)',re.I)

def feeds():
    origins = {'Headphone Zone':'https://www.headphonezone.in','Headphones.com':'https://headphones.com','Audio46':'https://audio46.com','Thomann':'https://www.thomannmusic.com','HiFi Headphones UK':'https://www.hifiheadphones.co.uk','JBL India':'https://in.jbl.com','Beyerdynamic India':'https://europe.beyerdynamic.com','HiFi-Passion':'https://hifi-passion.de','Meze Audio':'https://mezeaudio.com','Dan Clark Audio':'https://danclarkaudio.com','HiFiGo':'https://hifigo.com'}
    def one(item):
        name,origin=item
        products=[]
        error=None
        try:
            for page in range(1,18):
                value=json.loads(fetch(f'{origin}/products.json?limit=250&page={page}'))
                chunk=value['products']
                products.extend(chunk)
                if len(chunk)<250:break
        except Exception as exc:error=str(exc)
        write_new(WORK/'feeds'/(key(name)+'.json'),{'source':name,'origin':origin,'products':products,'error':error})
        return {'source':name,'products':len(products),'error':error}
    with ThreadPoolExecutor(max_workers=5) as pool:results=list(pool.map(one,origins.items()))
    write_new(WORK/'hp-feed-results.json',results)
    print(results,flush=True)

def products():
    rows=[]
    for name,(file,origin) in SOURCES.items():
        path=ROOT/'data/iem/processed'/file
        if not path.exists():continue
        payload=json.loads(path.read_text(encoding='utf-8'))
        rows.extend((name,origin,p) for p in (payload['products'] if isinstance(payload,dict) else payload))
    for file in (WORK/'feeds').glob('*.json'):
        payload=json.loads(file.read_text(encoding='utf-8'))
        rows.extend((payload['source'],payload['origin'],p) for p in payload['products'])
    return rows

def discover(batch):
    models=json.loads((WORK/'hp-photo-targets.json').read_text(encoding='utf-8'))
    ps=products()
    reviews=[]
    try:
        page=LexborHTMLParser(fetch('https://www.rtings.com/headphones/index'))
        for a in page.css('a[href]'):
            href=a.attributes['href']
            if re.match(r'^/headphones/reviews/[^/]+/[^/]+$',href):
                title=a.text().strip()
                brand=href.split('/')[-2].replace('-',' ')
                if not key(title).startswith(key(brand)):title=brand+' '+title
                reviews.append((title,'https://www.rtings.com'+href))
    except Exception as exc:print('RTINGS index:',str(exc),flush=True)
    all_names={key(m['brand']+' '+m['model']):m for m in models}
    leads=[]
    for m in sorted(models,key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug'])):
        full=key(m['brand']+' '+m['model'])
        choices=[]
        for title,url in reviews:
            if key(title)==full:
                choices.append({'source':'RTINGS','title':title,'page_url':url,'kind':'review','score':110})
        for source,origin,p in ps:
            title=p.get('title','')
            if not p.get('images') or re.search(r'\b(replacement|earpads?|ear pads?|cable|headband|stand|case|adapter|headphone bag)\b',title,re.I):continue
            t=key(title)
            if full not in t:continue
            pos=t.index(full)
            if t[:pos] not in ('','new','openbox','b stock','used','refurbished'):continue
            tail=t[pos+len(full):]
            # Prevent base model from matching a sibling or named edition/generation.
            if re.match(r'^(?:ii|iii|iv|mk|pro|plus|ultra|se|[0-9]|bt|wireless|x\b|s\b|anniversary|limited|classic|fazor|stealth|nano|carbon|max)',tail):continue
            if any(t.startswith(other) and len(other)>len(full) for other in all_names):continue
            score=105 if not tail else 90
            if source=='Headphone Zone':score+=2
            choices.append({'source':source,'title':title,'page_url':origin+'/products/'+p['handle'],'kind':'feed','score':score,'images':[i['src'] for i in p['images'][:3]]})
        # Identical listings can be present in old and refreshed feeds.
        unique={}
        for c in sorted(choices,key=lambda c:-c['score']):unique.setdefault(c['page_url'],c)
        leads.append({**m,'priority':bool(PRIORITY.search(m['brand']+' '+m['model'])),'choices':list(unique.values())[:4]})
    write_new(WORK/f'{batch}-leads.json',leads)
    print({'models':len(leads),'with_lead':sum(bool(m['choices']) for m in leads),'priority_with_lead':sum(m['priority'] and bool(m['choices']) for m in leads)},flush=True)

def download(batch,offset,limit,choices,frames=1):
    models=json.loads((WORK/f'{batch}-leads.json').read_text(encoding='utf-8'))
    already={r['slug'] for f in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,f.read_text(encoding='utf-8').splitlines())}
    models=[m for m in models if m['choices'] and m['slug'] not in already][offset:offset+limit]
    label=f'{batch}-{offset:04}'
    def one(m):
        results=[]
        for n,c in enumerate(m['choices'][:choices],1):
            try:
                if c['kind'] in ('review','article'):
                    page=LexborHTMLParser(fetch(c['page_url']))
                    title=page.css_first('h1')
                    page_title=title.text().strip() if title else c['title']
                    image=page.css_first('meta[property="og:image"]')
                    urls=[image.attributes['content']] if image else []
                    if c['kind']=='article':
                        urls.extend(c.get('images',[]))
                        for img in page.css('article img, .entry-content img, main img, .post-content img'):
                            attrs=img.attributes
                            u=attrs.get('data-src') or attrs.get('data-lazy-src') or attrs.get('src') or ''
                            if u and not u.startswith('data:'):urls.append(urllib.parse.urljoin(c['page_url'],u))
                        urls=list(dict.fromkeys(u.strip() for u in urls if u))
                        urls=[u for u in urls if not re.search(r'(graph|frequency|measurement|logo|banner|avatar|rating|award|signature|donat|paypal|facebook|instagram|youtube|FR-|FR\.|\.svg|\.gif)',u,re.I)]
                        begin=c.get('frame_offset',0)
                        urls=urls[begin:begin+frames]
                else:urls=c['images'][:frames];page_title=c['title']
                for j,url in enumerate(urls):
                    url='https:'+url if url.startswith('//') else url.replace('http://','https://',1)
                    body=fetch(url)
                    metrics=image_metrics(body)
                    ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp','AVIF':'.avif'}.get(metrics['format'])
                    if not ext:raise ValueError('Unsupported image format')
                    if min(metrics['width'],metrics['height'])<120:raise ValueError('Image too small')
                    target=WORK/'candidates'/m['slug']/(metrics['sha256'][:20]+ext)
                    target.parent.mkdir(parents=True,exist_ok=True)
                    if not target.exists():
                        with target.open('xb') as f:f.write(body)
                    results.append({'id':f'{m["slug"]}:{n}:{j}','slug':m['slug'],'brand':m['brand'],'model':m['model'],'source':c['source'],'title':c['title'],'page_title':page_title,'page_url':c['page_url'],'image_url':url,'file':target.relative_to(ROOT).as_posix(),'retrieved_on':datetime.now(UTC).date().isoformat(),**metrics})
            except Exception as exc:results.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':str(exc)})
        return results
    rows=[]
    with ThreadPoolExecutor(max_workers=5) as pool:
        for i,done in enumerate(as_completed([pool.submit(one,m) for m in models]),1):
            rows.extend(done.result())
            if i%50==0:print({'processed':i,'photos':sum('file' in r for r in rows)},flush=True)
    rows.sort(key=lambda r:(not bool(PRIORITY.search(r['slug'].replace('-',' '))),r['slug'],r.get('id','')))
    write_new(WORK/f'{label}-candidates.json',rows)
    print({'batch':label,'models':len(models),'photos':sum('file' in r for r in rows),'errors':sum('error' in r for r in rows)},flush=True)

def sheets(batch):
    rows=[r for r in json.loads((WORK/f'{batch}-candidates.json').read_text(encoding='utf-8')) if 'file' in r]
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
    small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
    outputs=[]
    for n,start in enumerate(range(0,len(rows),30),1):
        canvas=Image.new('RGB',(2100,1920),'#d7dce2');d=ImageDraw.Draw(canvas)
        for j,r in enumerate(rows[start:start+30]):
            x,y=(j%5)*420,(j//5)*320
            with Image.open(ROOT/r['file']) as img:art=img.convert('RGBA')
            art.thumbnail((406,236))
            panel=Image.new('RGBA',(410,240),'white')
            panel.alpha_composite(art,((410-art.width)//2,(240-art.height)//2))
            canvas.paste(panel.convert('RGB'),(x+5,y+53))
            d.text((x+5,y+2),f'{start+j+1}. '+r['slug'][:44],font=font,fill='black')
            d.text((x+5,y+25),r['source']+': '+r['page_title'][:44],font=small,fill='black')
            d.text((x+5,y+295),f'{r["id"].split(":")[-2:]} {r["width"]}x{r["height"]}',font=small,fill='black')
        path=WORK/f'{batch}-sheet-{n:02}.jpg'
        with path.open('xb') as f:canvas.save(f,format='JPEG',quality=90)
        outputs.append(path.relative_to(ROOT).as_posix())
    write_new(WORK/f'{batch}-sheets.json',outputs)
    print({'sheets':len(outputs),'candidates':len(rows)})

def stage(batch):
    decisions=json.loads((WORK/f'{batch}-decisions.json').read_text(encoding='utf-8'))
    candidates={r['id']:r for r in json.loads((WORK/f'{batch}-candidates.json').read_text(encoding='utf-8')) if 'file' in r}
    manifest=[]
    for slug,d in decisions.items():
        if not d.get('candidate'):continue
        r=candidates[d['candidate']]
        assert r['slug']==slug
        # Importer's existing approved library root; a private phase4 namespace.
        target=ROOT/'data/iem-images/phase4'/slug/Path(r['file']).name
        body=(ROOT/r['file']).read_bytes()
        assert hashlib.sha256(body).hexdigest()==r['sha256']
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():assert target.read_bytes()==body
        else:
            with target.open('xb') as f:f.write(body)
        manifest.append({'slug':slug,'file_path':target.relative_to(ROOT/'data/iem-images').as_posix(),'role':'primary',**{k:r[k] for k in ('width','height','format','byte_size','sha256','perceptual_hash','page_url','image_url','retrieved_on')},'source_name':r['source'],'credit':f'{r["source"]} product photograph; photographer unknown','licence_note':'Rights unconfirmed. Development build only; not for publication.','verification_status':'verified','verification_method':f'Manual visual check of {batch} contact sheets and exact source listing identity','verification_note':d['note'],'processing_notes':'Original bytes retained; no matte, render or image generation.'})
    jsonl(WORK/f'{batch}-library.jsonl',manifest)
    print({'staged':len(manifest),'rejected':sum(not d.get('candidate') for d in decisions.values())})

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['feeds','discover','download','sheets','stage']);p.add_argument('batch',nargs='?')
    p.add_argument('--offset',type=int,default=0);p.add_argument('--limit',type=int,default=200);p.add_argument('--choices',type=int,default=1);p.add_argument('--frames',type=int,default=1)
    a=p.parse_args()
    if a.action=='feeds':feeds()
    elif a.action=='discover':discover(a.batch)
    elif a.action=='download':download(a.batch,a.offset,a.limit,a.choices,a.frames)
    elif a.action=='sheets':sheets(a.batch)
    else:stage(a.batch)
