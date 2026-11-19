"""Broaden Phase 4 leads from read-only cached retailer/review inventories.

Does not write Phase 3 files. Every candidate remains subject to manual visual review.
"""
import csv
import json
import re
import urllib.parse
from hp_common import ROOT, WORK, CHECKOUT, write_new
from hp_photos import PRIORITY, key

def main():
    ms=json.loads((WORK/'hp-photo-targets.json').read_text(encoding='utf-8'))
    previous={r['slug']:r for r in json.loads((WORK/'hp-photo01-leads.json').read_text(encoding='utf-8'))}
    cached=ROOT/'data/iem/images/phase3'
    products=json.loads((cached/'eearphone-products.json').read_text(encoding='utf-8'))
    indexed=[(p,key(p['title']),key(p.get('vendor') or '')) for p in products if p.get('images')]
    entries=[]
    sources=[]
    for file in (cached/'reviews').glob('*.json'):
        payload=json.loads(file.read_text(encoding='utf-8'))
        for e in payload.get('entries',[]):
            path=urllib.parse.unquote(urllib.parse.urlsplit(e['page_url']).path).strip('/').split('/')[-1]
            entries.append((e,path,key(path)))
        sources.append({'file':file.relative_to(ROOT).as_posix(),'source':payload.get('source'),'entries':len(payload.get('entries',[]))})
    # Preserve exact RTINGS aliases supplied by AutoEq, including QC45/QC45 etc.
    rtings={}
    for r in csv.DictReader((CHECKOUT/'measurements/Rtings/name_index.tsv').open(encoding='utf-8-sig'),delimiter='\t'):
        if r['form']=='over-ear' and r['name']:
            rtings.setdefault(key(r['name']),set()).add(key(r['source_name']))
    out=[]
    for m in sorted(ms,key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug'])):
        full=key(m['brand']+' '+m['model']);brand=key(m['brand']);model=key(m['model'])
        choices=[]
        for p,title,vendor in indexed:
            if brand not in vendor and brand not in title:continue
            if model not in title:continue
            pre,tail=title.split(model,1)
            if pre not in ('','used',brand,'new','iem'):continue
            if re.match(r'^(?:[0-9]|v[0-9]|m[0-9]|ii|iii|iv|mk|pro|plus|ultra|x|dsp|se(?:[^a-z]|$)|s(?:[^a-z]|$)|c(?:[^a-z]|$))',tail):continue
            if re.search(r'earpads?|replacement|cableonly|caseonly',title,re.I):continue
            choices.append({'source':'e-earphone','title':p['title']+' [vendor: '+str(p.get('vendor'))+']','page_url':'https://www.e-earphone.jp/products/'+p['handle'],'kind':'feed','score':110,'images':[i['src'] for i in p['images'][:3]]})
        # Existing retailer feeds give cleaner images; RTINGS CDN has refused access.
        choices.extend(c for c in previous.get(m['slug'],{}).get('choices',[]) if c['source']!='RTINGS')
        for e,path,k in entries:
            alternatives={full}
            if m['brand']=='Final Audio':alternatives.add(key('Final '+m['model']))
            if m['brand']=='Audio-Technica':alternatives.add(key('Audio Technica '+m['model']))
            if m['brand']=='HIFIMAN':alternatives.add(key('HifiMan '+m['model']))
            if m['brand']=='Simgot Audio':alternatives.add(key('Simgot '+m['model']))
            for identity in alternatives:
                if identity not in k:continue
                pre,tail=k.split(identity,1)
                if pre not in ('','review','the','reviewthe','reviewof','reviewofthe'):continue
                if tail and not tail.startswith(('review','headphone','wireless','overear','onear','noise','closed','open','is','audiophile')):continue
                if any(t in tail for t in ('versus','comparison','vs','mkii','mkiii','2review')):continue
                choices.append({**e,'title':path.replace('-',' '),'kind':'article','score':100 if tail in ('','review') else 85})
                break
        unique={}
        # Retain retailer and distinct reviews as alternatives to blocked photos.
        for c in choices:unique.setdefault(c['page_url'],c)
        picked=[];counts={}
        for c in unique.values():
            count=counts.get(c['source'],0)
            if count>=2:continue
            counts[c['source']]=count+1
            picked.append(c)
        out.append({**m,'priority':bool(PRIORITY.search(m['brand']+' '+m['model'])),'choices':picked[:6]})
    write_new(WORK/'hp-photo02-leads.json',out)
    write_new(WORK/'hp-reused-source-inventories.json',{'retailer_file':(cached/'eearphone-products.json').relative_to(ROOT).as_posix(),'retailer_listings':len(products),'review_inventories':sources,'note':'Read only source reuse; no Phase 3 files modified.'})
    print({'models':len(out),'with_lead':sum(bool(m['choices']) for m in out),'priority_with_lead':sum(m['priority'] and bool(m['choices']) for m in out)},flush=True)

if __name__=='__main__':main()
