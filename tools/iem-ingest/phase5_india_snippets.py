"""Use the brief's explicit first-party retailer search-snippet fallback.

Offline only. No requests are sent to a stopped host. Full card title, actual
ASIN link and non-MRP INR price must coexist in the same retailer result card.
"""
import json,re,hashlib,argparse
from decimal import Decimal
from collections import defaultdict,Counter
from phase5_india import ROOT,WORK,save,writecsv,norm
from phase5_india_search import Tree,exact_identity
from phase5_india_offers import FIELDS,title_reason

def extract(label):
    models=json.loads((WORK/f'catalogue-{label}.json').read_text(encoding='utf-8'))
    offers={};links={};rejects=[];pages=0
    for mp in (WORK/'raw/www.amazon.in').glob('*.json'):
        meta=json.loads(mp.read_text(encoding='utf-8'))
        if '/s?' not in meta['url'] or meta.get('status')!=200 or meta.get('error'):continue
        body=mp.with_suffix('.bin').read_bytes();root=Tree(body).root;pages+=1
        for node in root.find(lambda n:n.attrs.get('data-component-type')=='s-search-result'):
            asin=node.attrs.get('data-asin','')
            if not re.fullmatch('[A-Z0-9]{10}',asin):continue
            # First-party real product hyperlink must exist in the same card.
            anchors=list(node.find(lambda n:n.tag=='a' and ('/dp/'+asin) in n.attrs.get('href','')))
            if not anchors:continue
            tn=next(node.find(lambda n:n.attrs.get('data-cy')=='title-recipe'),None)
            if not tn:continue
            title=' '.join(tn.text().split())
            if title.endswith('...') or title.endswith('…'):continue
            matches=[m for m in models if exact_identity(m,title)]
            if not matches:continue
            # Exclude crossed-out listPrice/MRP, coupons, EMI and secondary cards.
            active=list(node.find(lambda n:'a-price' in n.attrs.get('class','').split() and
                'a-text-price' not in n.attrs.get('class','').split() and n.attrs.get('data-a-strike')!='true'))
            amounts=[]
            for n in active:
                off=next(n.find(lambda n:'a-offscreen' in n.attrs.get('class','').split()),None)
                if off:
                    mt=re.fullmatch(r'₹\s*([\d,]+(?:\.\d{1,2})?)',' '.join(off.text().split()))
                    if mt:amounts.append(Decimal(mt.group(1).replace(',','')))
            # One clear active price per card; unknown/conflicting values stay out.
            prices=set(amounts)
            for m in matches:
                c={**m,'title':title,'product_type':''};reason=title_reason(c)
                if reason:
                    rejects.append({'slug':m['slug'],'asin':asin,'title':title,'reason':reason});continue
                key=(m['slug'],asin)
                if len(prices)!=1 or next(iter(prices))<=0:
                    links[key]={'brand':m['brand'],'model':m['model'],'retailer':'Amazon India','url':'https://www.amazon.in/dp/'+asin,'price':'',
                        'reason':'First-party full-title/ASIN search card confirms link; active INR price absent or ambiguous','evidence_url':meta['url']}
                    continue
                price=next(iter(prices));when=meta['retrieved_at']
                ev=mp.with_suffix('.bin').relative_to(ROOT).as_posix()
                r={'brand':m['brand'],'model':m['model'],'price':f'{price:.2f}','currency':'INR','price_region':'IN',
                    'price_source':'Amazon India (own search-result snippet)','price_source_url':'https://www.amazon.in/dp/'+asin,
                    'price_observed_on':when[:10],'slug':m['slug'],'priority':m['priority'],
                    'variant':'ASIN '+asin+'; selected offer/colour/mic details as stated in full title','variant_id':asin,
                    'stock_status':'unknown; active search offer, postcode eligibility not checked',
                    'evidence_file':ev,'evidence_sha256':meta['sha256'],
                    'evidence_method':'Retailer-own cached public search result: full exact title + actual ASIN product hyperlink + single active INR price; brief-authorized blocked-page fallback',
                    'page_title':title,'note':'Product URL confirmed by retailer own exact-title/ASIN hyperlink. Detail-page HTML not retrieved after access block. Price observed in retailer search card. Evidence URL: '+meta['url']}
                if key not in offers or when>offers[key][0]:offers[key]=(when,r)
        if pages%50==0:print({'offline_search_pages':pages,'confirmed_snippet_offers':len(offers)},flush=True)
    rows=[v[1] for v in offers.values()]
    for k in offers:links.pop(k,None)
    writecsv(WORK/f'offers-own-snippets-{label}.csv',rows,FIELDS)
    writecsv(WORK/f'links-without-price-own-snippets-{label}.csv',list(links.values()),['brand','model','retailer','url','price','reason','evidence_url'])
    save(WORK/f'snippet-rejections-{label}.json',rejects)
    save(WORK/f'snippet-summary-{label}.json',{'pages':pages,'offers':len(rows),'models':len({r['slug'] for r in rows}),'links_without_price':len(links),
      'evidence_scope':'first-party retailer search results; detail pages not confirmed; never reported as detail-page evidence'})
    print({'offline_pages':pages,'offers':len(rows),'models':len({r['slug'] for r in rows}),'links_without_price':len(links)},flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('label',nargs='?',default='retail-final');a=p.parse_args();extract(a.label)
