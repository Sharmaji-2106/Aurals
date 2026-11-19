"""Use pinned source-name aliases to discover exact marketed products, never fuzzy substitutions."""
import csv
import json
import re
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from selectolax.lexbor import LexborHTMLParser
from hp_common import ROOT, WORK, CHECKOUT, write_new
from hp_photos import products, fetch, PRIORITY
from hp_fallback_photos import key, ALIASES

def main():
    ms=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))['headphones']
    manifests=[r for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())]
    covered={r['slug'] for r in manifests}|{m['slug'] for m in ms if m['image_path']}
    aliases=defaultdict(set)
    for p in CHECKOUT.glob('measurements/*/name_index.tsv'):
        for r in csv.DictReader(p.open(encoding='utf-8-sig'),delimiter='\t'):
            if r.get('form') not in ('over-ear','on-ear') or not r.get('name') or not r.get('source_name'):continue
            aliases[key(r['name'])].add(key(r['source_name']))
    forms={m['slug']:{key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}|aliases[key(m['brand']+' '+m['model'])] for m in ms}
    verified={}
    for r in manifests:
        for k in forms[r['slug']]:verified.setdefault(k,r)
    tried=defaultdict(set)
    for p in WORK.glob('*-candidates.json'):
        for r in json.loads(p.read_text(encoding='utf-8')):tried[r['slug']].add(r.get('page_url'))
    entries=[]
    for p in (ROOT/'data/iem/images/phase3/reviews').glob('*.json'):
        for e in json.loads(p.read_text(encoding='utf-8')).get('entries',[]):
            name=urllib.parse.unquote(urllib.parse.urlsplit(e['page_url']).path).strip('/').split('/')[-1]
            entries.append((key(name),e))
    ps=products()
    # e-earphone listing vendor spelling and full exact model aliases help match Japanese used inventory.
    ps.extend(('e-earphone','https://www.e-earphone.jp',p) for p in json.loads((ROOT/'data/iem/images/phase3/eearphone-products.json').read_text(encoding='utf-8')))
    for m in ms:
        if m['slug'] in covered:continue
        m['choices']=[]
        fs=forms[m['slug']]
        for f in fs:
            if f in verified:
                r=verified[f]
                m['choices'].append({'source':r['source_name'],'title':m['brand']+' '+m['model'],'page_url':r['page_url'],'kind':'feed','score':130,'images':[r['image_url']],'discovery_note':'Pinned AutoEq name_index explicitly documents this source-name alias of the same model.'})
                break
        for source,origin,p in ps:
            if not p.get('images'):continue
            title=p.get('title','');k=key(title)
            if any(t in k for t in ('replacement','earpad','headband','cable','earcushion','adapter','earphonecase')):continue
            url=origin+'/products/'+p['handle']
            if url in tried[m['slug']]:continue
            if any(k in (f,f+'headphones',f+'headphone',f+'wirelessheadphones',f+'openbackheadphones',f+'closedbackheadphones',f+'overearheadphones',f+'gamingheadset') for f in fs):
                m['choices'].append({'source':source,'title':title,'page_url':url,'kind':'feed','score':110,'images':[i['src'] for i in p['images'][:2]]})
        for k,e in entries:
            if e['page_url'] in tried[m['slug']]:continue
            if any(k in (f,f+'review',f+'headphonereview',f+'headphonesreview','review'+f,'reviewofthe'+f,'the'+f+'review') for f in fs):
                m['choices'].append({**e,'title':m['brand']+' '+m['model'],'kind':'article','score':100,'discovery_note':'Exact pinned source-name alias matched review URL; must visually verify generation.'})
        unique={}
        for c in m['choices']:unique.setdefault(c['page_url'],c)
        m['choices']=list(unique.values())[:4]
    out=[m for m in ms if m.get('choices')]
    out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
    write_new(WORK/'hp-photo11-leads.json',out)
    write_new(WORK/'hp-pinned-photo-aliases.json',{m['slug']:sorted(forms[m['slug']]) for m in ms})
    print({'new_targets':len(out),'pages':sum(len(m['choices']) for m in out)},flush=True)

if __name__=='__main__':main()
