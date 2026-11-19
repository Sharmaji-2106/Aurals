"""Additional Indian retailer feeds and non-Shopify on-page confirmation."""
import json,re,html,hashlib,argparse
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from collections import Counter
from phase5_india import ROOT,WORK,fetch,save,writecsv,norm
from phase5_india_offers import FIELDS,jsonld_products,review

def hifinage(label='hifinage-latest'):
    products=[];pages=[];error=None
    for n in range(1,20):
        u='https://hifinage.com/wp-json/wc/store/v1/products?per_page=100'+('' if n==1 else '&page='+str(n))
        try:
            b,m=fetch(u);batch=json.loads(b)
            if not isinstance(batch,list):raise ValueError('not product array')
            products.extend(batch);pages.append(m)
            if not batch:break
        except Exception as e:error=str(e);break
    save(WORK/'feed-hifinage-woocommerce.json',{'retailer':'HiFiNage','products':products,'pages':pages,'error':error})
    models=json.loads((WORK/'catalogue-latest.json').read_text(encoding='utf-8'));rows=[]
    aliases={'Final Audio':'Final','Shuoer':'Letshuoer','Tin HiFi':'Tin HiFi'}
    for m in models:
        for p in products:
            t=norm(p['name']); model=norm(m['model']);brand=norm(aliases.get(m['brand'],m['brand']))
            if (' '+model+' ') in (' '+t+' ') and brand in t:
                rows.append({**{k:m[k] for k in ('brand','model','slug','priority')},'retailer':'HiFiNage','title':html.unescape(p['name']),
                  'url':p['permalink'],'product_type':p['type'],'vendor':'','variants':[],'feed_price':p['prices'],
                  'feed_stock':p.get('is_in_stock')})
    save(WORK/f'candidates-{label}.json',rows);review(label)
    print({'HiFiNage_products':len(products),'candidates':len(rows),'error':error},flush=True)

def confirm_hifinage(label='hifinage-latest'):
    candidates=json.loads((WORK/f'review-{label}.json').read_text(encoding='utf-8'))['accepted_candidates']
    results=[]
    for c in sorted(candidates,key=lambda r:(r['priority'],r['brand'],r['model'])):
        try:
            b,meta=fetch(c['url']);ps=jsonld_products(b)
            ps=[p for p in ps if norm(p.get('name',''))==norm(c['title'])]
            if not ps:raise ValueError('exact Product JSON-LD title absent')
            p=ps[0];o=p.get('offers',{})
            if isinstance(o,list):o=o[0] if len(o)==1 else {}
            if o.get('@type')=='AggregateOffer' or c['product_type']=='variable':
                results.append({'candidate':c,'status':'link_without_price','reason':'variant price range; exact base variant not confirmed','meta':meta});continue
            if o.get('priceCurrency')!='INR' or not o.get('price'):
                results.append({'candidate':c,'status':'link_without_price','reason':'no INR Offer price','meta':meta});continue
            price=Decimal(str(o['price']));fp=c['feed_price']
            if fp['currency_code']!='INR' or price!=Decimal(fp['price'])/(10**fp['currency_minor_unit']):raise ValueError('feed and on-page INR price differ')
            if price<=0:raise ValueError('zero placeholder price')
            evidence=WORK/'raw'/urlsplit(c['url']).netloc/(hashlib.sha256(c['url'].encode()).hexdigest()+'.bin')
            row={'brand':c['brand'],'model':c['model'],'price':f'{price:.2f}','currency':'INR','price_region':'IN',
             'price_source':'HiFiNage','price_source_url':c['url'],'price_observed_on':meta['retrieved_at'][:10],
             'slug':c['slug'],'priority':c['priority'],'variant':'Default simple product','variant_id':str(p.get('sku','')),
             'stock_status':o.get('availability','unknown').rsplit('/',1)[-1],'evidence_file':evidence.relative_to(ROOT).as_posix(),
             'evidence_sha256':meta['sha256'],'evidence_method':'Exact on-page WooCommerce Product/INR Offer matched with public store API',
             'page_title':c['title'],'note':'New simple product; postcode delivery not checked.'}
            results.append({'candidate':c,'status':'confirmed','offer':row,'meta':meta})
        except Exception as e:results.append({'candidate':c,'status':'unconfirmed','reason':str(e)})
    save(WORK/f'verification-{label}.json',results)
    writecsv(WORK/f'offers-{label}.csv',[r['offer'] for r in results if r['status']=='confirmed'],FIELDS)
    links=[{'brand':r['candidate']['brand'],'model':r['candidate']['model'],'retailer':'HiFiNage','url':r['candidate']['url'],'price':'','reason':r['reason']} for r in results if r['status']=='link_without_price']
    writecsv(WORK/f'links-without-price-{label}.csv',links,['brand','model','retailer','url','price','reason'])
    print({'hifinage':dict(Counter(r['status'] for r in results))},flush=True)

def more_feeds():
    from phase5_india import STORES,feeds
    # New origins only. Blocked origins are never retried via alternate hostnames.
    STORES.clear();STORES.update({
      'sony':('Sony Center India','https://shopatsc.com'),
      'hangoutaudio':('Hangout Audio','https://hangout.audio'),
      'audiouniverse':('Audio Universe','https://audiouniverse.in'),
      'prohifi':('ProHiFi','https://prohifi.in'),
    });feeds()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['hifinage','confirm-hifinage','more-feeds']);a=p.parse_args()
    {'hifinage':hifinage,'confirm-hifinage':confirm_hifinage,'more-feeds':more_feeds}[a.action]()
