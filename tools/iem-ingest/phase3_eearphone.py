"""Public Japanese retailer used listings: original photographs of older models."""
import json
import re
from phase3_images import WORK, fetch, write_new, models, compact, keys


def catalogue():
    products=[]
    seen=set()
    for page in range(1,81):
        chunk=json.loads(fetch(f'https://www.e-earphone.jp/products.json?limit=250&page={page}'))['products']
        for p in chunk:
            if p['id'] not in seen:
                products.append({k:p.get(k) for k in ('id','title','vendor','handle','images')})
                seen.add(p['id'])
        if page%20==0:print({'pages':page,'listings':len(products)},flush=True)
        if len(chunk)<250:break
    write_new(WORK/'eearphone-products.json',products)
    print({'listings':len(products),'with_images':sum(bool(p.get('images')) for p in products)},flush=True)


def match(label,scope):
    products=json.loads((WORK/'eearphone-products.json').read_text(encoding='utf-8'))
    indexed=[]
    for p in products:
        if not p.get('images'):continue
        indexed.append((p,compact(p['title']),keys(p.get('vendor') or '')))
    out=[]
    for m in models(scope):
        if scope=='all' and m['ranked']:continue
        brand=keys(m['brand'])
        if brand=='shuoer':brand='letshuoer'
        model=compact(m['model'])
        if m['brand']=='Simgot' and model.startswith('audio'):model=model[5:]
        choices=[]
        for p,title,vendor in indexed:
            if brand not in vendor and brand not in keys(p['title']):continue
            if model not in title:continue
            pre,tail=title.split(model,1)
            if pre not in ('','used',compact(m['brand']),'new','iem'):continue
            if re.match(r'^(?:[0-9]|v[0-9]|m[0-9]|ii|iii|iv|mk|pro|plus|ultra|x|dsp|se(?:[^a-z]|$)|s(?:[^a-z]|$)|c(?:[^a-z]|$))',tail):continue
            if any(t in p['title'].lower() for t in ('case only','cable only','earpad','replacement')):continue
            choices.append({'source':'e-earphone','title':p['title']+' [vendor: '+str(p.get('vendor'))+']',
                            'page_url':'https://www.e-earphone.jp/products/'+p['handle'],
                            'kind':'feed','score':100,'images':[i['src'] for i in p['images'][:3]]})
        if choices:out.append({**m,'choices':choices[:3]})
    write_new(WORK/f'{label}-leads.json',out)
    with (WORK/f'{label}-titles.txt').open('x',encoding='utf-8') as f:
        for m in out:f.write(m['slug']+': '+m['choices'][0]['title']+'\n')
    print({'scope':scope,'models_with_listings':len(out)},flush=True)


if __name__=='__main__':
    import sys
    if sys.argv[1]=='catalogue':catalogue()
    else:match(sys.argv[2],sys.argv[3])
