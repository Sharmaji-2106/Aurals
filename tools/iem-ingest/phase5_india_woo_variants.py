"""Verify WooCommerce's actual embedded base variant prices on cached pages."""
import json,re,html,hashlib
from decimal import Decimal
from urllib.parse import urlencode,urlsplit
from phase5_india import WORK,ROOT,fetch,writecsv,save,norm
from phase5_india_offers import FIELDS,jsonld_products

source=json.loads((WORK/'verification-hifinage.json').read_text(encoding='utf-8'))
offers=[];checks=[]
for r in source:
    if r['status']!='link_without_price':continue
    c=r['candidate'];b,meta=fetch(c['url']);t=b.decode('utf-8','replace')
    mt=re.search(r'data-product_variations=["\'](.*?)["\']',t,re.S)
    if not mt:checks.append({'slug':c['slug'],'status':'no embedded variations'});continue
    variants=json.loads(html.unescape(mt.group(1)))
    preferred=[v for v in variants if 'without mic' in norm(' '.join(v.get('attributes',{}).values()))]
    v=(preferred or variants)[0];price=Decimal(str(v['display_price']))
    # Confirm the page explicitly uses INR; never infer currency from geography.
    ps=jsonld_products(b)
    def inr(p):
        o=p.get('offers',{});o=o if isinstance(o,list) else [o]
        return any(x.get('priceCurrency')=='INR' for x in o)
    assert any(inr(p) for p in ps) or '₹' in html.unescape(v.get('price_html',''))
    assert price>0
    evidence=WORK/'raw'/urlsplit(c['url']).netloc/(hashlib.sha256(c['url'].encode()).hexdigest()+'.bin')
    row={'brand':c['brand'],'model':c['model'],'price':f'{price:.2f}','currency':'INR','price_region':'IN',
        'price_source':'HiFiNage','price_source_url':c['url']+'?'+urlencode(v['attributes']),
        'price_observed_on':meta['retrieved_at'][:10],'slug':c['slug'],'priority':c['priority'],
        'variant':' / '.join(f'{k.removeprefix("attribute_")}: {val}' for k,val in v['attributes'].items()),
        'variant_id':v['variation_id'],'stock_status':'InStock' if v['is_in_stock'] else 'OutOfStock',
        'evidence_file':evidence.relative_to(ROOT).as_posix(),'evidence_sha256':meta['sha256'],
        'evidence_method':'Exact on-page Product + embedded WooCommerce variation display_price; explicit INR from page Offer',
        'page_title':c['title'],'note':'First listed variant, preferring without mic. Warranty option is stated in variant when present; shipping not checked.'}
    offers.append(row);checks.append({'slug':c['slug'],'variant':v,'page_meta':meta})
writecsv(WORK/'offers-hifinage-variants.csv',offers,FIELDS);save(WORK/'verification-hifinage-variants.json',checks)
print({'on_page_variant_offers':len(offers)})
