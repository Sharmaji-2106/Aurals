"""Conservative model review, on-page offer verification, import, and audit."""
from __future__ import annotations
import argparse, csv, html, json, re, subprocess, sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from datetime import datetime, UTC
from phase5_india import ROOT, WORK, REPORT, fetch, save, writecsv, append_report, norm, snapshot

FIELDS=['brand','model','price','currency','price_region','price_source','price_source_url','price_observed_on',
        'slug','priority','variant','variant_id','stock_status','evidence_file','evidence_sha256','evidence_method','page_title','note']

_MODEL_INDEX=None
def longer_model(r,t):
    global _MODEL_INDEX
    if _MODEL_INDEX is None:
        path=WORK/'catalogue-latest.json'
        if not path.exists():path=WORK/'catalogue-baseline.json'
        _MODEL_INDEX=defaultdict(set)
        for m in json.loads(path.read_text(encoding='utf-8')):_MODEL_INDEX[norm(m['brand'])].add(norm(m['model']))
    current=norm(r['model'])
    for other in _MODEL_INDEX[norm(r['brand'])]:
        if len(other)<=len(current) or current.replace(' ','')==other.replace(' ',''):continue
        if re.search(r'\b'+r'\s*'.join(re.escape(x) for x in other.split())+r'\b',t):
            # A different longer named model on the same page is unsafe to attach
            # to this shorter identity, including accessory multi-model lists.
            return other
    return None

def title_reason(r):
    t=norm(r['title']); model=norm(r['model']); typ=norm(r['product_type'])
    match=re.search(r'\b'+r'\s*'.join(re.escape(x) for x in model.split())+r'\b',t)
    rest=t[match.end():] if match else t
    reason=None
    if not match:
        reason='whole exact model sequence absent; substring lead only'
    elif longer_model(r,t):
        reason='title names a longer/different measured model: '+longer_model(r,t)
    elif any(s in typ for s in ('cable','accessor','eartip','earpad','bundle','case')):
        reason='accessory or bundle product category'
    elif re.search(r'\b(replacement|filter|nozzle|compatible|eartips|ear tips|earbud tips|earphone tips|ear pads|earpads|headband for|adapter|adaper|module|case|cover|for apple|mount|holder|earrings|bracelet|beads|twinpack|monitoring system|phono|cartridge|b stock|upgrade cable|upgraded cable)\b',t):
        reason='accessory title'
    elif 'cable' in t and match and t.find('cable')<match.start():
        reason='cable is sold for the named model; not the earphone itself'
    elif 'cable' in t and (re.search(r'\bcable for\b',t) or not re.search(r'\b(iem|iem s|earphone|earphones|earbuds|headphones|headset)\b',t)):
        reason='cable-only accessory title'
    elif '+' in r['title'] and re.search(r'\b(dac|amp|btr11|ja11|jm12|macaron|highway|ap6|protocol)\b',t):
        reason='bundle with separate electronics'
    elif re.search(r'\b(unboxed|demo|open box|opened box|pre owned|unused|without box|like new|testing warranty|refurbished)\b',t):
        reason='used/demo condition excluded from base retail offers'
    elif re.search(r'^\s*(ii|iii|iv|v|x|2|3|4|5|10|2dot0|2r|3r|2025|2024|2023|2022|2021|mk|mk\d+|mkii|mkiii|mkiv|pro|professional|plus|max|ae|se|sv|dlc|ultra|s2|bass|legend|red|blue2|snow|emerald|jest|studio|2nd|gamefidelity|lite|lm|utg|ultima|core|live|fe|bt|wireless|mg|creator|anniversary)\b',rest):
        reason='different generation/edition suffix'
    elif ('dsp' in t or 'type c' in t or 'usb c' in t) and not ('dsp' in model or 'type c' in model or 'usb c' in model):
        reason='digital DSP/USB variant not the measured analog base model'
    elif 'headphone zone x' in t or 'audiocular x' in t:
        reason='retailer collaboration edition, base equivalence unconfirmed'
    elif model=='cra' and 'cra+' in r['title'].lower():
        reason='CRA+ is different from CRA'
    elif model=='fh3' and 'snowsky' in t:
        reason='Snowsky FH3 Lumi is not FiiO FH3'
    elif model=='x crinacle zero' and '(red)' in r['title'].lower():
        reason='Zero RED is different from original Zero'
    elif model=='wan er s g' and 'edition red' in t:
        reason='collaboration edition unconfirmed'
    elif model=='spaceship' and ('ssr' in t or 'ssp' in t):
        reason='Super Spaceship SSR/SSP is not Spaceship'
    elif model=='x hbb' and ('hades' in t or 'khan' in t):
        reason='Hades/Khan are not original QKZ x HBB'
    elif 'new version' in t:
        reason='revision equivalence with measured model unconfirmed'
    elif 'neckband' in t and model=='e60':
        reason='E60 wireless neckband listing conflicts with measured ENACFIRE E60 true wireless identity'
    elif norm(r['brand'])=='oneplus' and 'nord' in t and 'nord' not in model:
        reason='Nord subseries is not OnePlus Buds base model'
    elif 'gen 2' in t or 'generation 2' in t or '2 nd gen' in t or 'special edition' in t or 'mecha edition' in t:
        reason='named generation/edition equivalence unconfirmed'
    elif model=='fh 3' and 'lumi' in t:
        reason='FH3 Lumi is not original FiiO FH3'
    elif r['priority']==3 and re.search(r'\b(earbuds|true wireless|in ear)\b',t):
        reason='earbud/in-ear listing is not measured headphone identity'
    elif re.search(r'^\s*(s|b|c|d|i|e|r|xbt|classic|nano|organic|unveiled|stealth|le|master|codex|mclaren|music creator|d 1|007)\b',rest):
        reason='different headphone suffix/edition'
    elif re.search(r'^\s*m\s*\d',rest):
        reason='different M-series revision suffix'
    elif 'headphone and amplifier' in t or 'headphones and amplifier' in t:
        reason='headphone bundled with separate amplifier'
    elif 'condenser microphone' in t and ('pack' in t or 'with' in t):
        reason='microphone/headphone bundle'
    elif norm(r['brand'])=='sennheiser' and model=='hd 4':
        reason='HD 4 is an incomplete family identity, exact sibling not established'
    elif norm(r['brand'])=='1 more' and model=='triple driver' and 'wireless' in t:
        reason='wireless neckband is not wired Triple Driver'
    elif norm(r['brand'])=='nothing' and 'cmf' in t:
        reason='CMF product is not Nothing Ear'
    elif model=='ath m 50' and re.search(r'ath\s*m\s*50\s*x',t):
        reason='ATH-M50x/streaming variants are not original ATH-M50'
    elif model=='shangri la' and 'mini shangri' in t:
        reason='Mini Shangri-La is not original Shangri-La'
    return reason

def review(label):
    rows=json.loads((WORK/f'candidates-{label}.json').read_text(encoding='utf-8'))
    good=[]; bad=[]
    for r in rows:
        reason=title_reason(r)
        if reason: bad.append({**r,'decision':'rejected','reason':reason})
        else: good.append({**r,'decision':'candidate','reason':'whole model token sequence; accessory, bundle, revision guards passed; needs on-page confirmation'})
    save(WORK/f'review-{label}.json',{'accepted_candidates':good,'rejected':bad})
    print({'accepted_candidates':len(good),'models':len({r['slug'] for r in good}),'rejected':len(bad)},flush=True)

def jsonld_products(body):
    text=body.decode('utf-8','replace')
    result=[]
    def walk(v):
        if isinstance(v,list):
            for x in v:walk(x)
        elif isinstance(v,dict):
            if v.get('@type') in ('Product','ProductGroup'):result.append(v)
            for key in ('@graph','hasVariant'):
                if key in v:walk(v[key])
    for match in re.finditer(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',text,re.S|re.I):
        try:walk(json.loads(match.group(1)))
        except (ValueError,TypeError):pass
    return result

def verify_one(r):
    try:
        body,meta=fetch(r['url'])
        if meta.get('redirect'):
            # Only follow same-shop redirects. Retired-model redirects often target collections.
            from urllib.parse import urlsplit
            target=meta['redirect']
            if urlsplit(target).netloc != urlsplit(r['url']).netloc or '/products/' not in target:
                return {'candidate':r,'status':'unconfirmed','reason':'redirect is not a same-shop product page','meta':meta}
            body,meta=fetch(target)
        products=jsonld_products(body)
        matches=[p for p in products if norm(p.get('name',''))==norm(r['title'])]
        if not matches:return {'candidate':r,'status':'unconfirmed','reason':'exact product title not present in page Product structured data','meta':meta}
        variants=r.get('variants',[])
        # Shopify listing order defines the base variant. Prefer explicit no-mic/standard
        # analog option if the first is USB/DSP or includes an extra component.
        eligible=[v for v in variants if ('dsp' in norm(r['model']) or not re.search(r'\b(dsp|type c|usb|with dac|bundle)\b',norm(v.get('title',''))))]
        if not eligible:return {'candidate':r,'status':'unconfirmed','reason':'no confirmed analog/base variant in feed','meta':meta}
        preferred=[v for v in eligible if re.search(r'\b(without mic|no mic|standard|3dot5mm|3dot5 mm)\b',norm(v.get('title','')))]
        variant=(preferred or eligible)[0]
        vid=str(variant['id']); offers=[]
        for p in matches:
            o=p.get('offers',[])
            if isinstance(o,dict):o=[o]
            for item in o:
                if item.get('@type')=='AggregateOffer':continue
                if len(variants)==1 or ('variant='+vid) in (item.get('url','')+item.get('@id','')):
                    offers.append(item)
        offers=[o for o in offers if o.get('priceCurrency')=='INR' and o.get('price') is not None]
        if not offers:
            return {'candidate':r,'status':'link_without_price','reason':'exact page confirmed; selected base variant has no INR Offer price','meta':meta}
        prices={Decimal(str(o['price'])) for o in offers}
        if len(prices)!=1:return {'candidate':r,'status':'unconfirmed','reason':'conflicting on-page prices for selected variant','meta':meta}
        price=next(iter(prices))
        if price<=0:return {'candidate':r,'status':'link_without_price','reason':'zero placeholder price; exact page only','meta':meta}
        if Decimal(str(variant['price']))!=price:
            return {'candidate':r,'status':'unconfirmed','reason':'feed and product page prices disagree','meta':meta}
        states={o.get('availability','').rsplit('/',1)[-1] for o in offers}
        stock=next(iter(states)) if len(states)==1 else 'conflicting/unknown'
        url=meta['url']+'?variant='+vid
        key=__import__('hashlib').sha256(meta['url'].encode()).hexdigest()
        evidence=WORK/'raw'/__import__('urllib.parse',fromlist=['urlsplit']).urlsplit(meta['url']).netloc/(key+'.bin')
        row={'brand':r['brand'],'model':r['model'],'price':f'{price:.2f}','currency':'INR','price_region':'IN',
            'price_source':r['retailer'],'price_source_url':url,'price_observed_on':meta['retrieved_at'][:10],
            'slug':r['slug'],'priority':r['priority'],'variant':variant.get('title',''),'variant_id':vid,
            'stock_status':stock,'evidence_file':evidence.relative_to(ROOT).as_posix(),'evidence_sha256':meta['sha256'],
            'evidence_method':'exact product page JSON-LD Product/Offer + matching Shopify base variant ID and INR price',
            'page_title':r['title'],'note':'Base variant = first listed eligible analog option, preferring no mic/standard/3.5mm. Stock is retailer claim; delivery not checked.'}
        return {'candidate':r,'status':'confirmed','offer':row,'meta':meta}
    except Exception as e:return {'candidate':r,'status':'unconfirmed','reason':str(e)}

def confirm(label,priority):
    d=json.loads((WORK/f'review-{label}.json').read_text(encoding='utf-8'))
    rows=[r for r in d['accepted_candidates'] if r['priority']==priority]
    # One worker per retailer, serial requests per host, <=1 request/second.
    groups=defaultdict(list)
    for r in rows:groups[r['retailer']].append(r)
    def run(item):
        name,rs=item; result=[]
        for i,r in enumerate(rs):
            result.append(verify_one(r))
            if (i+1)%20==0:print({'retailer':name,'priority':priority,'checked':i+1,'total':len(rs)},flush=True)
        return result
    with ThreadPoolExecutor(max_workers=6) as pool:results=[r for group in pool.map(run,groups.items()) for r in group]
    batch=f'{label}-p{priority}'
    save(WORK/f'verification-{batch}.json',results)
    offers=[r['offer'] for r in results if r['status']=='confirmed']
    writecsv(WORK/f'offers-{batch}.csv',offers,FIELDS)
    links=[]
    for r in results:
        if r['status']=='link_without_price':
            c=r['candidate'];links.append({'brand':c['brand'],'model':c['model'],'retailer':c['retailer'],'url':c['url'],'price':'','reason':r['reason']})
    writecsv(WORK/f'links-without-price-{batch}.csv',links,['brand','model','retailer','url','price','reason'])
    print({'batch':batch,'offers':len(offers),'links_without_price':len(links),'statuses':dict(Counter(r['status'] for r in results))},flush=True)

def coverage():
    from sqlalchemy import text
    from auralis.db import new_session
    with new_session() as s:
        ids=set(s.execute(text("SELECT DISTINCT iem_id::text FROM iem_price_observations WHERE currency='INR' AND region='IN'")).scalars())
    models=json.loads((WORK/'catalogue-latest.json' if (WORK/'catalogue-latest.json').exists() else WORK/'catalogue-baseline.json').read_text(encoding='utf-8'))
    rows=[{**{k:r[k] for k in ('slug','brand','model','priority')},'confirmed_inr_price':'yes' if r['id'] in ids else 'no',
           'status':'confirmed offer (may be out of stock)' if r['id'] in ids else 'no confirmed Indian priced listing in checked sources; not evidence unavailable in India'} for r in models]
    writecsv(WORK/'coverage.csv',rows)
    missing=[r for r in rows if r['confirmed_inr_price']=='no']
    writecsv(WORK/'products-without-confirmed-indian-listing.csv',missing)
    return rows,missing

def import_batch(batch):
    path=WORK/f'offers-{batch}.csv'
    rows=list(csv.DictReader(path.open(encoding='utf-8')))
    allowed=[];quarantine=[]
    for r in rows:
        reason=title_reason({**r,'title':r['page_title'],'product_type':'','priority':int(r['priority'])})
        if reason:quarantine.append({'offer':r,'reason':reason})
        else:allowed.append(r)
    if quarantine:
        save(WORK/f'quarantined-{batch}.json',quarantine)
        rows=allowed;writecsv(path,rows,FIELDS)
    assert all(r['currency']=='INR' and r['price_region']=='IN' and r['price_source_url'].startswith('https://') for r in rows)
    logs={}
    for dry in (True,False):
        cmd=[sys.executable,'-m','auralis.cli','import-catalog',str(path)]
        if dry:cmd.append('--dry-run')
        run=subprocess.run(cmd,cwd=ROOT/'backend',capture_output=True,text=True,encoding='utf-8',check=True)
        assert 'refused' not in run.stdout, run.stdout
        logs['dry_run' if dry else 'import']={'stdout':run.stdout,'stderr':run.stderr,'returncode':run.returncode}
    save(WORK/f'import-{batch}.json',logs)
    cov,missing=coverage()
    append_report(f'\n## Batch {batch} — {datetime.now().astimezone().isoformat()}\n\n'
      f'- Confirmed on-page INR offers: **{len(rows)}**, for **{len({r["slug"] for r in rows})}** products. Retailer counts: '+
      '; '.join(f'{k}: {v}' for k,v in sorted(Counter(r['price_source'] for r in rows).items()))+'.\n'+
      f'- Out-of-stock offers: {sum(r["stock_status"]=="OutOfStock" for r in rows)}. Stock, variant IDs, exact titles, observation dates and raw-page hashes are in `offers-{batch}.csv`.\n'+
      f'- Dry run then real `auralis import-catalog`: `{logs["dry_run"]["stdout"].strip()}` / `{logs["import"]["stdout"].strip()}`. Zero refused rows; specs untouched.\n'+
      f'- Cumulative models with confirmed INR observations: **{len(cov)-len(missing)}/{len(cov)}**. By priority: '+
      '; '.join(f'{p}: {sum(r["priority"]==p and r["confirmed_inr_price"]=="yes" for r in cov)}/{sum(r["priority"]==p for r in cov)}' for p in range(1,5))+'.\n'+
      f'- Still without a confirmed Indian priced listing: **{len(missing)}**; full product names are in `data/iem/market/india/products-without-confirmed-indian-listing.csv` (backed up before each refresh).\n')
    print({'batch':batch,'offers':len(rows),'coverage':len(cov)-len(missing),'missing':len(missing),'import':logs['import']['stdout'].strip()},flush=True)

def audit():
    from sqlalchemy import text
    from auralis.db import new_session
    base=json.loads((WORK/'protected-baseline.json').read_text(encoding='utf-8'))
    with new_session() as s:
        results={}
        for table,previous in base.items():
            if table=='identities':
                now={str(r[0]):list(r[1:]) for r in s.execute(text('SELECT id,brand,model,slug FROM iems'))}
            else:now=dict(s.execute(text(f'SELECT id::text, md5(row_to_json(t)::text) FROM {table} t')))
            assert all(now.get(k)==v for k,v in previous.items()), f'Protected original rows changed: {table}'
            results[table]={'original_rows':len(previous),'current_rows':len(now),'original_rows_unchanged':True}
        prior=json.loads((WORK/'prices-baseline.json').read_text(encoding='utf-8'))
        prices={str(r['id']):dict(r) for r in s.execute(text('SELECT * FROM iem_price_observations')).mappings()}
        assert all(json.loads(json.dumps(prices[r['id']],default=str))==r for r in prior)
    cov,missing=coverage()
    save(WORK/'audit.json',{'protected':results,'prior_prices_unchanged':True,'priced_models':len(cov)-len(missing),'uncovered':len(missing)})
    print({'protected_original_rows_unchanged':True,'prior_prices_unchanged':True,'priced_models':len(cov)-len(missing)},flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['review','confirm','import','coverage','audit']);p.add_argument('label',nargs='?',default='baseline');p.add_argument('--priority',type=int,default=1);a=p.parse_args()
    {'review':lambda:review(a.label),'confirm':lambda:confirm(a.label,a.priority),'import':lambda:import_batch(a.label),'coverage':coverage,'audit':audit}[a.action]()
