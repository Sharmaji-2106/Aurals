"""Required general electronics retailers and Ubuy: real page links and INR only."""
import json,hashlib,re,argparse
from concurrent.futures import ThreadPoolExecutor
from collections import Counter,defaultdict
from decimal import Decimal
from urllib.parse import urljoin,urlsplit
from phase5_india import ROOT,WORK,fetch,save,writecsv,norm
from phase5_india_search import Tree,exact_identity,key
from phase5_india_offers import FIELDS,jsonld_products,review

CATEGORIES={
 'Vijay Sales':['https://www.vijaysales.com/c/earphones','https://www.vijaysales.com/c/truly-wireless-earbuds','https://www.vijaysales.com/c/headphones'],
 'Reliance Digital':['https://www.reliancedigital.in/collection/samsung-headphones','https://www.reliancedigital.in/collection/black-friday-sale-sony-tws-earphones-251124','https://www.reliancedigital.in/collection/sennheiser-headphones','https://www.reliancedigital.in/collection/jbl-headphones'],
 'Croma':['https://www.croma.com/sennheiser-products/bp/b-0337','https://www.croma.com/sony-products/bp/b-0261'],
 'Ubuy India':['https://www.ubuy.co.in/search/?q=etymotic+er2xr'],
}
SEEDS={
 'Croma':['https://www.croma.com/sennheiser-ie-200-wired-earphone-without-mic-3-5mm-connector-in-ear-black-/p/316623','https://www.croma.com/sony-wf-1000xm5-tws-earbuds-with-active-noise-cancellation-ipx4-water-resistant-quick-charge-silver-/p/301585'],
 'Ubuy India':['https://www.ubuy.co.in/product/2F7VWE6-etymotic-research-er2xr-extended-response-high-performance-in-ear-earphones-detachable-dynamic-drivers-noise-isolating-high-accuracy-robust-low-freque'],
 'Reliance Digital':['https://www.reliancedigital.in/product/samsung-galaxy-buds-2-true-wireless-earbuds-black-lgakxu','https://www.reliancedigital.in/product/samsung-galaxy-buds-3-pro-true-wireless-buds-gray-lyre9m-7960698','https://www.reliancedigital.in/product/sony-wf-c700n-truly-wireless-noise-canceling-in-ear-bluetooth-earbud-headphones-with-mic-and-ipx4-water-resistance-black-ljwv5g'],
}

def discover():
    models=json.loads((WORK/'catalogue-latest.json').read_text(encoding='utf-8'))
    def run(item):
        retailer,urls=item;results=[];leads={}
        def add(title,url):
            if not url.startswith('https://'):return
            for m in models:
                if exact_identity(m,title):
                    leads[(m['slug'],url)]={**{k:m[k] for k in ('brand','model','slug','priority')},'retailer':retailer,
                        'title':title,'url':url,'product_type':'','vendor':'','variants':[]}
        for url in urls:
            try:
                b,meta=fetch(url)
                if meta.get('redirect'):b,meta=fetch(meta['redirect'])
                root=Tree(b).root;links=0
                for a in root.find(lambda n:n.tag=='a'):
                    href=a.attrs.get('href','')
                    if not any(s in href for s in ['/product/','/p/','/catalog/product/']):continue
                    title=a.attrs.get('title','') or a.text().strip()
                    if not title or len(title)<5:
                        img=next(a.find(lambda n:n.tag=='img'),None)
                        title=img.attrs.get('alt','') if img else ''
                    if title:add(title,urljoin(meta['url'],href.split('?')[0]));links+=1
                results.append({'url':url,'meta':meta,'product_anchors':links})
            except Exception as e:results.append({'url':url,'status':'unconfirmed','reason':str(e)})
        for url in SEEDS.get(retailer,[]):
            try:
                b,meta=fetch(url)
                if meta.get('redirect'):b,meta=fetch(meta['redirect'])
                products=jsonld_products(b)
                for p in products:add(p.get('name',''),meta['url'])
                if not products:
                    h=next(Tree(b).root.find(lambda n:n.tag=='h1'),None)
                    if h:add(' '.join(h.text().split()),meta['url'])
                results.append({'url':url,'meta':meta,'seed':True,'Product_objects':len(products)})
            except Exception as e:results.append({'url':url,'status':'unconfirmed','reason':str(e),'seed':True})
        save(WORK/('discovery-'+retailer.lower().replace(' ','-')+'.json'),results)
        return list(leads.values())
    with ThreadPoolExecutor(max_workers=4) as pool:leads=[r for group in pool.map(run,CATEGORIES.items()) for r in group]
    save(WORK/'candidates-general.json',leads);review('general')
    print({'general_retailer_candidates':len(leads)},flush=True)

def confirm():
    candidates=json.loads((WORK/'review-general.json').read_text(encoding='utf-8'))['accepted_candidates']
    groups=defaultdict(list)
    for r in candidates:groups[r['retailer']].append(r)
    def run(item):
        retailer,rs=item;results=[]
        for c in sorted(rs,key=lambda r:(r['priority'],r['brand'],r['model'])):
            try:
                b,meta=fetch(c['url']);ps=jsonld_products(b)
                ps=[p for p in ps if exact_identity(c,p.get('name',''))]
                if not ps:
                    root=Tree(b).root;h=next(root.find(lambda n:n.tag=='h1'),None)
                    if not h or not exact_identity(c,h.text()):raise ValueError('exact on-page product title absent')
                    results.append({'candidate':c,'status':'link_without_price','reason':'exact H1 verified but no unambiguous INR Offer','meta':meta});continue
                p=ps[0];offer=p.get('offers',{})
                if isinstance(offer,list):offer=offer[0] if len(offer)==1 else {}
                if offer.get('@type')=='AggregateOffer' or offer.get('priceCurrency')!='INR' or not offer.get('price'):
                    results.append({'candidate':c,'status':'link_without_price','reason':'exact product verified; no single INR Offer','meta':meta});continue
                price=Decimal(str(offer['price']))
                if price<=0:raise ValueError('placeholder price')
                ev=WORK/'raw'/urlsplit(c['url']).netloc/(hashlib.sha256(c['url'].encode()).hexdigest()+'.bin')
                row={'brand':c['brand'],'model':c['model'],'price':f'{price:.2f}','currency':'INR','price_region':'IN',
                    'price_source':retailer,'price_source_url':c['url'],'price_observed_on':meta['retrieved_at'][:10],
                    'slug':c['slug'],'priority':c['priority'],'variant':p.get('color','Default page variant'),'variant_id':p.get('sku',''),
                    'stock_status':offer.get('availability','unknown').rsplit('/',1)[-1],'evidence_file':ev.relative_to(ROOT).as_posix(),
                    'evidence_sha256':meta['sha256'],'evidence_method':'Exact on-page Product JSON-LD with single INR Offer',
                    'page_title':p['name'],'note':'Listed item price. Ubuy prices exclude shipping/customs where stated; postcode delivery not checked.'}
                results.append({'candidate':c,'status':'confirmed','offer':row,'meta':meta})
            except Exception as e:results.append({'candidate':c,'status':'unconfirmed','reason':str(e)})
        return results
    with ThreadPoolExecutor(max_workers=4) as pool:results=[r for group in pool.map(run,groups.items()) for r in group]
    save(WORK/'verification-general.json',results);writecsv(WORK/'offers-general.csv',[r['offer'] for r in results if r['status']=='confirmed'],FIELDS)
    links=[{'brand':r['candidate']['brand'],'model':r['candidate']['model'],'retailer':r['candidate']['retailer'],'url':r['candidate']['url'],'price':'','reason':r['reason']} for r in results if r['status']=='link_without_price']
    writecsv(WORK/'links-without-price-general.csv',links,['brand','model','retailer','url','price','reason'])
    print({'general':dict(Counter(r['status'] for r in results))},flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['discover','confirm']);a=p.parse_args();globals()[a.action]()
