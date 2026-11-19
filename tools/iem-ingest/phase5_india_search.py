"""Public Amazon/Flipkart searches and exact product-page price confirmation."""
from __future__ import annotations
import argparse, html, json, re, hashlib
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import quote_plus, urlsplit, urljoin
from decimal import Decimal
from functools import lru_cache
from phase5_india import ROOT,WORK,fetch,save,writecsv,norm
from phase5_india_offers import FIELDS,jsonld_products,review,title_reason

class Node:
    def __init__(self,tag='',attrs=None,parent=None):self.tag=tag;self.attrs=attrs or {};self.parent=parent;self.children=[]
    def text(self):return ' '.join(c if isinstance(c,str) else c.text() for c in self.children)
    def find(self,predicate):
        if predicate(self):yield self
        for c in self.children:
            if isinstance(c,Node):yield from c.find(predicate)
    def byid(self,ident):return next(self.find(lambda n:n.attrs.get('id')==ident),None)

class Tree(HTMLParser):
    VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self,body):
        super().__init__(convert_charrefs=True);self.root=Node();self.current=self.root
        self.feed(body.decode('utf-8','replace'))
    def handle_starttag(self,tag,attrs):
        node=Node(tag,dict(attrs),self.current);self.current.children.append(node)
        if tag not in self.VOID:self.current=node
    def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        cur=self.current
        while cur.parent:
            if cur.tag==tag:self.current=cur.parent;break
            cur=cur.parent
    def handle_data(self,data):self.current.children.append(data)

def key(s):return re.sub(r'[^a-z0-9]','',html.unescape(s).lower())

@lru_cache(maxsize=10000)
def model_pattern(s):return re.compile(r'\b'+r'\s*'.join(re.escape(x) for x in s.split())+r'\b')

def exact_identity(m,title):
    """Search heuristic only; page match and edition review still mandatory."""
    b=norm(m['brand']); md=norm(m['model']); t=norm(title)
    return bool(model_pattern(b).search(t)) and len(md)>=2 and bool(model_pattern(md).search(t))

def search_cards(body,site):
    root=Tree(body).root;cards=[]
    if site=='amazon':
        for n in root.find(lambda n:n.attrs.get('data-component-type')=='s-search-result'):
            asin=n.attrs.get('data-asin','')
            image=next(n.find(lambda n:n.tag=='img' and 's-image' in n.attrs.get('class','').split()),None)
            title=image.attrs.get('alt','').strip() if image else ''
            if not title:
                title_node=next(n.find(lambda n:n.attrs.get('data-cy')=='title-recipe'),None)
                title=title_node.text().strip() if title_node else ''
            if not asin or not title:continue
            cards.append({'title':title,'url':'https://www.amazon.in/dp/'+asin})
    else:
        seen=set()
        for n in root.find(lambda n:n.tag=='a' and '/p/itm' in n.attrs.get('href','')):
            href=n.attrs['href'].split('?')[0]
            if href in seen:continue
            title=n.attrs.get('title') or n.text().strip()
            if not title:
                img=next(n.find(lambda n:n.tag=='img'),None)
                if img:title=img.attrs.get('alt','')
            if title:
                cards.append({'title':title,'url':urljoin('https://www.flipkart.com',href)});seen.add(href)
    return cards

def searches(label,mode):
    models=json.loads((WORK/f'catalogue-{label}.json').read_text(encoding='utf-8'))
    if mode=='ranked':queries=list(dict.fromkeys(m['brand']+' '+m['model'] for m in models if m['priority']==1))
    elif mode=='headphones':queries=list(dict.fromkeys(m['brand']+' '+m['model'] for m in models if m['priority']==3))
    elif mode=='all':queries=list(dict.fromkeys(m['brand']+' '+m['model'] for m in models))
    elif mode=='headphone-brands':queries=list(dict.fromkeys(m['brand']+' headphones' for m in models if m['priority']==3))
    else:queries=list(dict.fromkeys(m['brand']+' earphones' for m in models))
    def run(site):
        results=[];leads={}
        for i,q in enumerate(queries):
            url=('https://www.amazon.in/s?k=' if site=='amazon' else 'https://www.flipkart.com/search?q=')+quote_plus(q)
            try:
                body,meta=fetch(url);cards=search_cards(body,site)
                if meta.get('redirect'):raise ValueError('search redirect; not followed')
                results.append({'query':q,'url':url,'cards':len(cards),'status':'searched','meta':meta})
                for c in cards:
                    for m in models:
                        if exact_identity(m,c['title']):
                            k=(m['slug'],c['url'])
                            leads[k]={**{k:m[k] for k in ('slug','brand','model','priority')},'retailer':'Amazon India' if site=='amazon' else 'Flipkart',
                              'url':c['url'],'title':c['title'],'product_type':'','vendor':'','variants':[],'search_url':url}
            except Exception as e:
                results.append({'query':q,'url':url,'status':'unconfirmed','reason':str(e)})
                if 'host stopped' in str(e) or '429' in str(e) or '403' in str(e):
                    for remaining in queries[i+1:]:results.append({'query':remaining,'status':'not_requested_host_blocked'})
                    break
            if (i+1)%25==0:print({'site':site,'mode':mode,'queries':i+1,'total':len(queries),'leads':len(leads)},flush=True)
        save(WORK/f'search-{site}-{label}-{mode}.json',results)
        return list(leads.values())
    with ThreadPoolExecutor(max_workers=2) as pool:leads=[r for group in pool.map(run,['amazon','flipkart']) for r in group]
    batch=f'{label}-{mode}'
    save(WORK/f'candidates-search-{batch}.json',leads)
    review('search-'+batch)
    print({'mode':mode,'leads':len(leads)},flush=True)

def confirm_one(c):
    try:
        body,meta=fetch(c['url'])
        if meta.get('redirect'):
            target=meta['redirect'];original=urlsplit(c['url']);dest=urlsplit(target)
            asin=re.search(r'/dp/([A-Z0-9]{10})',original.path)
            if c['retailer']=='Amazon India' and dest.netloc==original.netloc and asin and ('/dp/'+asin.group(1)) in dest.path:
                target='https://'+dest.netloc+dest.path
                body,meta=fetch(target)
            else:return {'candidate':c,'status':'unconfirmed','reason':'redirect does not preserve same-shop product identity','meta':meta}
        if meta.get('redirect'):return {'candidate':c,'status':'unconfirmed','reason':'second redirect not followed','meta':meta}
        if c['retailer']=='Amazon India':
            tree=Tree(body).root;title=tree.byid('productTitle')
            if title is None:return {'candidate':c,'status':'unconfirmed','reason':'productTitle absent; possible block','meta':meta}
            title=' '.join(title.text().split())
            if not exact_identity(c,title):return {'candidate':c,'status':'unconfirmed','reason':'page does not contain exact brand/model','page_title':title,'meta':meta}
            reason=title_reason({**c,'title':title})
            if reason:return {'candidate':c,'status':'unconfirmed','reason':'full on-page title: '+reason,'page_title':title,'meta':meta}
            # Candidate title and page title must identify the same exact item.
            search_title=c['title'].rstrip('.… ')
            if key(c['title'])!=key(title) and not ((c['title'].endswith('...') or c['title'].endswith('…')) and key(title).startswith(key(search_title))):
                return {'candidate':c,'status':'unconfirmed','reason':'search title differs from page title; manual review required','page_title':title,'meta':meta}
            price_nodes=[]
            for ident in ('corePriceDisplay_desktop_feature_div','corePrice_feature_div','apex_desktop'):
                scope=tree.byid(ident)
                if scope:
                    price_nodes=list(scope.find(lambda n:'a-offscreen' in n.attrs.get('class','').split() and '₹' in n.text()))
                    if price_nodes:break
            prices=[]
            for n in price_nodes:
                text=' '.join(n.text().split())
                mt=re.fullmatch(r'₹\s*([\d,]+(?:\.\d{1,2})?)',text)
                if mt:prices.append(Decimal(mt.group(1).replace(',','')))
            availability=tree.byid('availability') or tree.byid('availabilityInsideBuyBox_feature_div')
            state=' '.join(availability.text().split()) if availability else 'unknown; delivery not checked'
            # First displayed main buy-box price, never a crossed-out MRP from listPrice.
            if not prices:return {'candidate':c,'status':'link_without_price','reason':'exact product confirmed; no primary buy-box rupee price','page_title':title,'meta':meta}
            price=prices[0]
            variant=[]
            for ident in ('variation_color_name','variation_style_name','variation_size_name'):
                n=tree.byid(ident)
                if n:
                    selected=next(n.find(lambda n:'selection' in n.attrs.get('class','').split()),None)
                    if selected:variant.append(' '.join(selected.text().split()))
            variant=' / '.join(variant) or 'Default product ASIN'
        else:
            products=jsonld_products(body)
            products=[p for p in products if exact_identity(c,p.get('name',''))]
            if not products:return {'candidate':c,'status':'unconfirmed','reason':'exact brand/model absent from page Product data','meta':meta}
            p=products[0];title=p['name']
            reason=title_reason({**c,'title':title})
            if reason:return {'candidate':c,'status':'unconfirmed','reason':'full on-page title: '+reason,'page_title':title,'meta':meta}
            if key(title)!=key(c['title']):return {'candidate':c,'status':'unconfirmed','reason':'page title differs; manual review required','page_title':title,'meta':meta}
            offer=p.get('offers',{})
            if isinstance(offer,list):offer=offer[0] if offer else {}
            if offer.get('priceCurrency')!='INR' or not offer.get('price'):
                return {'candidate':c,'status':'link_without_price','reason':'exact product confirmed; no INR Offer price','page_title':title,'meta':meta}
            price=Decimal(str(offer['price']));state=offer.get('availability','unknown').rsplit('/',1)[-1]
            variant=p.get('color','') or 'Default listing'
        if price<=0:raise ValueError('zero/negative price placeholder')
        evidence=WORK/'raw'/urlsplit(meta['url']).netloc/(hashlib.sha256(meta['url'].encode()).hexdigest()+'.bin')
        row={'brand':c['brand'],'model':c['model'],'price':f'{price:.2f}','currency':'INR','price_region':'IN',
          'price_source':c['retailer'],'price_source_url':c['url'],'price_observed_on':meta['retrieved_at'][:10],
          'slug':c['slug'],'priority':c['priority'],'variant':variant,'variant_id':c['url'].rsplit('/',1)[-1],
          'stock_status':state,'evidence_file':evidence.relative_to(ROOT).as_posix(),'evidence_sha256':meta['sha256'],
          'evidence_method':'Exact page productTitle + primary buy-box INR price' if c['retailer']=='Amazon India' else 'Exact on-page JSON-LD Product/INR Offer',
          'page_title':title,'note':'Displayed listing price; delivery/import charges and postcode eligibility not verified.'}
        return {'candidate':c,'status':'confirmed','offer':row,'meta':meta}
    except Exception as e:return {'candidate':c,'status':'unconfirmed','reason':str(e)}

def confirms(label):
    rows=json.loads((WORK/f'review-search-{label}.json').read_text(encoding='utf-8'))['accepted_candidates']
    groups=defaultdict(list)
    for r in rows:groups[r['retailer']].append(r)
    def run(item):
        name,rs=item;result=[]
        for i,r in enumerate(rs):
            result.append(confirm_one(r))
            if (i+1)%20==0:print({'retailer':name,'checked':i+1,'total':len(rs)},flush=True)
        return result
    with ThreadPoolExecutor(max_workers=2) as pool:results=[r for group in pool.map(run,groups.items()) for r in group]
    save(WORK/f'verification-search-{label}.json',results)
    writecsv(WORK/f'offers-search-{label}.csv',[r['offer'] for r in results if r['status']=='confirmed'],FIELDS)
    links=[{'brand':r['candidate']['brand'],'model':r['candidate']['model'],'retailer':r['candidate']['retailer'],
      'url':r['candidate']['url'],'price':'','reason':r['reason']} for r in results if r['status']=='link_without_price']
    writecsv(WORK/f'links-without-price-search-{label}.csv',links,['brand','model','retailer','url','price','reason'])
    print({'batch':label,'statuses':dict(Counter(r['status'] for r in results))},flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['search','confirm']);p.add_argument('label',nargs='?',default='baseline');p.add_argument('--mode',choices=['brands','headphone-brands','ranked','headphones','all'],default='ranked');a=p.parse_args()
    if a.action=='search':searches(a.label,a.mode)
    else:confirms(a.label)
