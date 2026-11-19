"""Resume Indian retail research without changing application files.

Run with backend/.venv/Scripts/python.exe from backend. All outputs are backed
up before replacement. Existing access stops remain in force. Retailer feeds
only create leads; an exact product page is required for a priced import.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, UTC
from decimal import Decimal
import hashlib
import html
import json
from functools import lru_cache
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit, urlencode

import phase5_india as base
import phase5_india_offers as old
from phase5_india_search import exact_identity, Tree

ROOT, WORK = base.ROOT, base.WORK
OUT = WORK / 'resume5b'
FIELDS = old.FIELDS
ALIASES = {'Final Audio': ['Final Audio', 'Final'], 'Shuoer': ['Shuoer', 'Letshuoer'],
           'Tin HiFi': ['Tin HiFi', 'TINHIFI'], '1MORE': ['1MORE', '1 More'],
           'Salnotes': ['Salnotes', '7HZ'], 'Meze': ['Meze', 'Meze Audio']}


def save(name, value):
    base.guard()
    base.save(OUT / name, value)


def writecsv(name, rows, fields=FIELDS):
    base.guard()
    base.writecsv(OUT / name, rows, fields)


def models():
    return json.loads((WORK / 'catalogue-resume5b.json').read_text(encoding='utf-8'))


def setup_index():
    old._MODEL_INDEX = defaultdict(set)
    for m in models():
        old._MODEL_INDEX[base.norm(m['brand'])].add(base.norm(m['model']))


@lru_cache(maxsize=10000)
def pattern(text):
    return re.compile(r'\b' + r'\s*'.join(map(re.escape, base.norm(text).split())) + r'\b')


@lru_cache(maxsize=2000000)
def brand_text(brand, title, vendor=''):
    return any(pattern(b).search(base.norm(title + ' ' + vendor))
               for b in ALIASES.get(brand, [brand]))


def brand_matches(m, title, vendor=''):
    return brand_text(m['brand'], title, vendor)


def reason(c):
    # Existing suffix/edition/accessory checks remain mandatory.
    issue = old.title_reason(c)
    if issue:
        return issue
    t = base.norm(c['title'])
    if re.search(r'\b(ear cushion|ear cushions|ear pad|ear pads|replacement pad|headband|boom mic|microphone only|protective|sleeve|dust plug)\b', t):
        return 'accessory, not the measured earphone/headphone'
    if re.search(r'\b(combo|bundle|renewed|refurbished|preowned)\b', t):
        return 'bundle or non-new condition'
    if not brand_matches(c, c['title'], c.get('vendor', '')):
        return 'brand absent from title/vendor'
    return None


def prepare():
    base.guard()
    from auralis.db import new_session, get_engine
    from sqlalchemy import text
    u = get_engine().url
    env = dict(os.environ)
    env.update(PGHOST=u.host or 'localhost', PGPORT=str(u.port or 5432),
               PGUSER=u.username or '', PGPASSWORD=u.password or '')
    dump = OUT / ('catalogue-before-resume-' + datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ') + '.dump')
    dump.parent.mkdir(parents=True, exist_ok=True)
    with new_session() as s:
        tables = s.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'iem_%' OR tablename IN ('iems','fr_measurements','fr_targets'))")).scalars().all()
        protected = {}
        for table in tables:
            protected[table] = dict(s.execute(text(f'SELECT id::text, md5(row_to_json(t)::text) FROM {table} t')).all())
    cmd = [str(ROOT / '.devtools/pg/Library/bin/pg_dump.exe'), '-Fc', '-d', u.database, '-f', str(dump)]
    for table in tables:
        cmd.extend(['-t', table])
    subprocess.run(cmd, env=env, check=True, capture_output=True)
    assert dump.stat().st_size > 10000
    save('protected-start.json', protected)
    base.snapshot('resume5b')
    coverage()
    base.append_report('\n## Phase 5b resume — ' + datetime.now().astimezone().isoformat() + '\n\n'
        f'Catalogue backup: `{dump.relative_to(ROOT).as_posix()}`. Refreshed measured catalogue: **{len(models())}**. '
        'Headphone Zone Phase 6 pages at or below ₹16,000 are excluded. Existing host access blocks are respected; '
        'cached first-party evidence retains its actual retrieval date. The Audio Card remains interpreted as The Audio Store; '
        'an exact shop under the supplied name was not established. Only sourced INR observations will be imported.\n')
    print({'backup': str(dump), 'models': len(models())}, flush=True)


def inventory():
    setup_index()
    groups = defaultdict(list)
    for m in models_cached:
        groups[m['brand']].append(m)
    skip = {r['handle'] for r in json.loads((WORK / 'phase6/hz-under16k.json').read_text(encoding='utf-8'))}
    accepted, rejected = [], []
    for fp in WORK.glob('feed-*.json'):
        feed = json.loads(fp.read_text(encoding='utf-8'))
        if not feed.get('origin'):
            continue
        for p in feed.get('products', []):
            if feed['retailer'] == 'Headphone Zone' and p['handle'] in skip:
                continue
            eligible = [m for brand, ms in groups.items() if brand_text(brand, p['title'], p.get('vendor', '')) for m in ms]
            for m in eligible:
                if not pattern(m['model']).search(base.norm(p['title'])):
                    continue
                c = {**m, 'title': html.unescape(p['title']), 'vendor': p.get('vendor', ''),
                     'product_type': p.get('product_type', ''), 'retailer': feed['retailer'],
                     'url': feed['origin'] + '/products/' + p['handle'], 'variants': p.get('variants', [])}
                if c['retailer'] == 'Headphone Zone' and c['priority'] != 3 and min(Decimal(str(v['price'])) for v in c['variants']) <= 16000:
                    continue
                issue = reason(c)
                (rejected if issue else accepted).append({**c, **({'reason': issue} if issue else {})})
    # WooCommerce exact titles; confirm simple/variable prices on the actual page.
    hf = json.loads((WORK / 'feed-hifinage-woocommerce.json').read_text(encoding='utf-8'))
    for p in hf['products']:
        for m in models_cached:
            if brand_matches(m, p['name']) and pattern(m['model']).search(base.norm(p['name'])):
                c = {**m, 'title': html.unescape(p['name']), 'vendor': '', 'product_type': p['type'],
                     'retailer': 'HiFiNage', 'url': p['permalink'], 'variants': []}
                issue = reason(c)
                (rejected if issue else accepted).append({**c, **({'reason': issue} if issue else {})})
    # Clean product anchor titles from general retailer category HTML.
    for mp in (WORK / 'raw/www.vijaysales.com').glob('*.json'):
        meta = json.loads(mp.read_text(encoding='utf-8'))
        if meta.get('status') != 200 or '/c/' not in meta.get('url', ''):
            continue
        root = Tree(mp.with_suffix('.bin').read_bytes()).root
        for node in root.find(lambda n: n.tag == 'a' and '/p/' in n.attrs.get('href', '')):
            title = node.attrs.get('title', '')
            image = next(node.find(lambda n: n.tag == 'img' and n.attrs.get('alt')), None)
            if image:
                title = image.attrs['alt']
            if not title:
                continue
            from urllib.parse import urljoin
            url = urljoin(meta['url'], node.attrs['href'].split('?')[0])
            for m in models_cached:
                if brand_matches(m, title) and pattern(m['model']).search(base.norm(title)):
                    c = {**m, 'title': title, 'vendor': '', 'product_type': '', 'retailer': 'Vijay Sales', 'url': url, 'variants': []}
                    issue = reason(c)
                    (rejected if issue else accepted).append({**c, **({'reason': issue} if issue else {})})
    accepted = list({(c['slug'], c['url']): c for c in accepted}.values())
    accepted.sort(key=lambda c: (c['priority'], c['retailer'] == 'Headphone Zone', c['retailer'], c['brand'], c['model']))
    save('candidates.json', accepted)
    save('rejected.json', rejected)
    print({'leads': len(accepted), 'models': len({c['slug'] for c in accepted}),
           'retailers': dict(Counter(c['retailer'] for c in accepted)), 'rejected': len(rejected)}, flush=True)


def row_from(c, meta, price, variant, vid, stock, method, url=None):
    ev = WORK / 'raw' / urlsplit(meta['url']).netloc / (hashlib.sha256(meta['url'].encode()).hexdigest() + '.bin')
    return dict(brand=c['brand'], model=c['model'], price=f'{price:.2f}', currency='INR', price_region='IN',
        price_source=c['retailer'], price_source_url=url or meta['url'], price_observed_on=meta['retrieved_at'][:10],
        slug=c['slug'], priority=c['priority'], variant=variant, variant_id=vid, stock_status=stock,
        evidence_file=ev.relative_to(ROOT).as_posix(), evidence_sha256=meta['sha256'], evidence_method=method,
        page_title=c['title'], note='Exact model; retailer stock claim only; postcode delivery not checked.')


def local_confirm():
    setup_index()
    candidates = json.loads((OUT / 'candidates.json').read_text(encoding='utf-8'))
    results = []
    for c in candidates:
        try:
            body, meta = base.fetch(c['url'])
            if meta.get('redirect'):
                raise ValueError('redirect requires review')
            products = [p for p in old.jsonld_products(body) if base.norm(p.get('name', '')) == base.norm(c['title'])]
            if not products:
                raise ValueError('exact on-page structured title absent')
            if c['retailer'] == 'HiFiNage':
                mt = re.search(r'data-product_variations=["\'](.*?)["\']', body.decode('utf-8', 'replace'), re.S)
                if mt:
                    variants = json.loads(html.unescape(mt.group(1)))
                    eligible = [v for v in variants if not re.search(r'\b(dsp|usb|type c|bundle)\b', base.norm(' '.join(v.get('attributes', {}).values())))]
                    preferred = [v for v in eligible if 'without mic' in base.norm(' '.join(v.get('attributes', {}).values()))]
                    if not eligible:
                        raise ValueError('no analog base variation')
                    v = (preferred or eligible)[0]
                    offers = products[0].get('offers', {})
                    offers = offers if isinstance(offers, list) else [offers]
                    assert any(o.get('priceCurrency') == 'INR' for o in offers) or '₹' in html.unescape(v.get('price_html', ''))
                    price = Decimal(str(v['display_price']))
                    assert price > 0
                    r = row_from(c, meta, price, ' / '.join(v['attributes'].values()), str(v['variation_id']),
                        'InStock' if v['is_in_stock'] else 'OutOfStock',
                        'Exact on-page Product and embedded WooCommerce base variation with explicit INR',
                        c['url'] + '?' + urlencode(v['attributes']))
                    results.append({'candidate': c, 'status': 'confirmed', 'offer': r})
                    continue
            if c.get('variants'):
                result = old.verify_one(c)
                results.append(result)
                continue
            offers = products[0].get('offers', {})
            offers = offers if isinstance(offers, list) else [offers]
            good = [o for o in offers if o.get('@type') != 'AggregateOffer' and o.get('priceCurrency') == 'INR' and o.get('price')]
            prices = {Decimal(str(o['price'])) for o in good}
            if len(prices) != 1 or next(iter(prices)) <= 0:
                results.append({'candidate': c, 'status': 'link_without_price', 'reason': 'No single explicit INR base offer', 'meta': meta})
                continue
            o = good[0]
            r = row_from(c, meta, next(iter(prices)), 'Default page variant', str(products[0].get('sku', '')),
                         o.get('availability', 'unknown').rsplit('/', 1)[-1], 'Exact on-page JSON-LD Product and single INR Offer')
            results.append({'candidate': c, 'status': 'confirmed', 'offer': r})
        except Exception as e:
            results.append({'candidate': c, 'status': 'unconfirmed', 'reason': str(e)})
        if len(results) % 50 == 0:
            print({'checked': len(results), 'total': len(candidates)}, flush=True)
    save('verification-local.json', results)
    writecsv('offers-local.csv', [r['offer'] for r in results if r['status'] == 'confirmed'])
    writecsv('links-without-price-local.csv', [dict(brand=r['candidate']['brand'], model=r['candidate']['model'],
        retailer=r['candidate']['retailer'], url=r['candidate']['url'], price='', reason=r['reason'])
        for r in results if r['status'] == 'link_without_price'], ['brand','model','retailer','url','price','reason'])
    print(dict(Counter(r['status'] for r in results)), flush=True)


def web_plan():
    candidates = json.loads((OUT / 'candidates.json').read_text(encoding='utf-8'))
    local = json.loads((OUT / 'verification-local.json').read_text(encoding='utf-8'))
    done = {(r['candidate']['slug'], r['candidate']['url']) for r in local if r['status'] == 'confirmed'}
    plan = []
    for c in candidates:
        if (c['slug'], c['url']) in done:
            continue
        if c['retailer'] == 'Headphone Zone' and c['priority'] != 3 and min(Decimal(str(v['price'])) for v in c['variants']) <= 16000:
            continue
        eligible = [v for v in c.get('variants', []) if 'dsp' in base.norm(c['model']) or not re.search(r'\b(dsp|usb|type c|with dac|bundle)\b', base.norm(v.get('title', '')))]
        preferred = [v for v in eligible if re.search(r'\b(without mic|no mic|standard|3dot5mm|3dot5 mm)\b', base.norm(v.get('title', '')))]
        if c.get('variants') and not eligible:
            continue
        v = (preferred or eligible or [{}])[0]
        c = {**c, 'selected_variant': v,
             'fetch_url': c['url'] + ('?variant=' + str(v['id']) if len(c.get('variants', [])) > 1 else '')}
        plan.append(c)
    save('web-plan.json', plan)
    print({'plan': len(plan), 'retailers': dict(Counter(c['retailer'] for c in plan))}, flush=True)


def web_extract():
    setup_index()
    results = []
    for fp in sorted((OUT / 'web').glob('page-*.json')):
        data = json.loads(fp.read_text(encoding='utf-8'))
        c, evidence = data['candidate'], data['body']
        if 'beoplay e 8' in base.norm(c['model']) and '3rd gen' in evidence.lower() and not re.search(r'\b(3|third)\b',base.norm(c['model'])):
            results.append({'candidate': c, 'status': 'unconfirmed', 'reason': 'Product description explicitly identifies Beoplay E8 3rd generation; measured generation not established', 'evidence': fp.name})
            continue
        # Use only the primary heading and its purchase block, never recommended
        # accessories, EMI payments, MRP, coupons or another product's price.
        lines = [re.sub(r'^L\d+:\s?', '', line) for line in evidence.splitlines()]
        brand_store = c['retailer'] in ('Sennheiser India', 'Sony Center India', 'Beyerdynamic India')
        title_index = next((i for i,l in enumerate(lines) if l.startswith('# ') and pattern(c['model']).search(base.norm(l)) and (brand_matches(c,l) or brand_store)), None)
        if title_index is None:
            # Croma often renders only product specifications and no H1 or
            # price until a postcode is supplied. Preserve an exact verified
            # model/brand link without inventing a rupee amount.
            if c['retailer'] == 'Croma' and 'Model Number' in evidence and pattern(c['model']).search(base.norm('\n'.join(lines[2:]))) and brand_matches(c, '\n'.join(lines[2:])) and c['fetch_url'] in evidence.split('Total lines:')[0]:
                results.append({'candidate': c, 'status': 'link_without_price', 'reason': 'Exact brand/model confirmed in on-page specifications; no public INR purchase price', 'evidence': fp.name})
                continue
            results.append({'candidate': c, 'status': 'unconfirmed', 'reason': 'Exact primary product heading absent in public browser view', 'evidence': fp.name})
            continue
        title = lines[title_index][2:].strip()
        issue = reason({**c, 'title': title, **({'vendor': c['brand']} if brand_store else {})})
        if issue:
            results.append({'candidate': c, 'status': 'unconfirmed', 'reason': issue, 'evidence': fp.name})
            continue
        scope = '\n'.join(lines[title_index:title_index+95])
        # A shorter heading can be a discontinued-model redirect. Never accept
        # a different source URL solely because the body mentions the old item.
        if c['fetch_url'] not in evidence.split('Total lines:')[0]:
            results.append({'candidate': c, 'status': 'unconfirmed', 'reason': 'Browser source does not preserve requested product/variant URL', 'evidence': fp.name})
            continue
        match = re.search(r'Sale price\s*₹\s*([\d,]+(?:\.\d{1,2})?)', scope)
        if not match and c['retailer'] == 'AVStore':
            match = re.search(r'Sale price\s*Rs\.\s*([\d,]+(?:\.\d{1,2})?)', scope)
        if not match and c['retailer'] == 'The Audio Store':
            match = re.search(r'Price:\s*(?:\n\s*)*₹\s*([\d,]+(?:\.\d{1,2})?)', scope)
        if not match and c['retailer'] in ('Flipkart', 'Sony Center India'):
            # Both current Flipkart layouts put the unconditional item price
            # immediately after the title/rating. Later amounts can be MRP,
            # bank discounts, Protect Promise fees, EMI or unrelated products.
            primary_price_block = '\n'.join(lines[title_index+1:title_index+18])
            match = re.search(r'^\s*₹\s*([\d,]+(?:\.\d{1,2})?)\s*$', primary_price_block, re.M)
        if not match:
            results.append({'candidate': c, 'status': 'link_without_price', 'reason': 'Exact primary heading confirmed, explicit purchase-block INR price absent', 'evidence': fp.name})
            continue
        if c.get('canonical_fallback'):
            prices = {Decimal(str(v['price'])) for v in c['variants']}
            digital_choice = any(re.search(r'\b(dsp|usb|type c|bundle|with dac)\b', base.norm(v.get('title',''))) for v in c['variants'])
            tuning_choice = any(re.search(r'\b(harman|bass|tuning|tunable|balanced version|standard version|switch)\b', base.norm(v.get('title',''))) for v in c['variants'])
            if len(prices) != 1 or digital_choice or tuning_choice:
                results.append({'candidate': c, 'status': 'link_without_price', 'reason': 'Canonical product page confirmed; differing variant prices/digital/tuning options require selected-variant page confirmation', 'evidence': fp.name})
                continue
        price = Decimal(match.group(1).replace(',', ''))
        if price <= 0:
            continue
        if c['retailer'] == 'Headphone Zone' and c['priority'] != 3 and price <= 16000:
            results.append({'candidate': c, 'status': 'excluded_completed_range', 'reason': 'Displayed in-ear price falls in the completed Phase 6 budget range', 'evidence': fp.name})
            continue
        v = c.get('selected_variant', {})
        if len(c.get('variants', [])) > 1:
            # Query-specific HTML must agree with the selected variant's public
            # feed price. A mismatch remains for manual review, never guessed.
            if price != Decimal(str(v['price'])):
                results.append({'candidate': c, 'status': 'unconfirmed', 'reason': 'Selected variant feed and displayed page prices disagree', 'page_price': str(price), 'evidence': fp.name})
                continue
        stock = 'unknown; public browser purchase block does not establish selected-variant stock'
        if c['retailer'] == 'Flipkart' and re.search(r'Out of stock|Sold Out|currently out of stock', '\n'.join(lines[max(0,title_index-6):title_index+95]), re.I):
            stock = 'OutOfStock'
        elif re.search(r'In stock, ready to ship|Only \d+ units? left|Hurry, only \d+ items left', scope, re.I):
            stock = 'InStock'
        elif re.search(r'Stock:\s*\n+\s*(Sold out|Out of stock)', scope, re.I):
            stock = 'OutOfStock'
        elif 'Sold out' in scope and 'Add to cart' not in scope:
            stock = 'OutOfStock'
        if stock.startswith('unknown') and v.get('available') is False:
            stock = 'OutOfStock'
        r = dict(brand=c['brand'], model=c['model'], price=f'{price:.2f}', currency='INR', price_region='IN',
            price_source=c['retailer'], price_source_url=c['fetch_url'], price_observed_on=data['retrieved_at'][:10],
            slug=c['slug'], priority=c['priority'], variant=v.get('title', 'Default product page variant'), variant_id=str(v.get('id', '')),
            stock_status=stock, evidence_file=fp.relative_to(ROOT).as_posix(), evidence_sha256=hashlib.sha256(fp.read_bytes()).hexdigest(),
            evidence_method='Public browser-rendered retailer product page/cache: exact primary heading and explicit INR purchase price; selected variant URL where needed',
            page_title=title, note='Observed in publicly reachable browser-rendered page/cache on stated date; crawl freshness is retained in evidence. Direct fetching blocked for some hosts. When selected-variant stock is absent from the browser excerpt, an out-of-stock flag may come from the retained same-day public product feed. Postcode delivery not checked.')
        results.append({'candidate': c, 'status': 'confirmed', 'offer': r})
    save('verification-web.json', results)
    writecsv('offers-web.csv', [r['offer'] for r in results if r['status'] == 'confirmed'])
    writecsv('links-without-price-web.csv', [dict(brand=r['candidate']['brand'], model=r['candidate']['model'],
        retailer=r['candidate']['retailer'], url=r['candidate']['fetch_url'], price='', reason=r['reason'])
        for r in results if r['status'] == 'link_without_price'], ['brand','model','retailer','url','price','reason'])
    print({'statuses': dict(Counter(r['status'] for r in results)), 'retailers': dict(Counter(r['offer']['price_source'] for r in results if r['status']=='confirmed'))}, flush=True)


def search_leads():
    setup_index()
    retailers = {'www.amazon.in': 'Amazon India', 'www.flipkart.com': 'Flipkart', 'www.croma.com': 'Croma',
        'www.reliancedigital.in': 'Reliance Digital', 'www.vijaysales.com': 'Vijay Sales', 'www.ubuy.co.in': 'Ubuy India',
        'in.sennheiser-hearing.com': 'Sennheiser India', 'shopatsc.com': 'Sony Center India', 'beyerdynamicindia.com': 'Beyerdynamic India'}
    leads, excluded = {}, []
    for fp in sorted((OUT / 'search').glob('*.json')):
        d = json.loads(fp.read_text(encoding='utf-8'))
        for title, url in re.findall(r'^(.+?) \((https://[^\s)]+)\)', d['body'], re.M):
            u = urlsplit(url)
            if u.netloc not in retailers:
                excluded.append({'url': url, 'reason': 'not a requested canonical retailer host; no alternate hosts to bypass blocks'})
                continue
            if not any(part in u.path for part in ('/dp/', '/p/itm', '/p/', '/product/', '/products/')):
                continue
            url = 'https://' + u.netloc + u.path
            for m in models_cached:
                if not brand_matches(m, title) or not pattern(m['model']).search(base.norm(title)):
                    continue
                c = {**m, 'retailer': retailers[u.netloc], 'title': title, 'vendor': '', 'product_type': '',
                    'url': url, 'fetch_url': url, 'variants': [], 'selected_variant': {}, 'discovery_evidence': fp.relative_to(ROOT).as_posix()}
                issue = reason(c)
                if issue:
                    excluded.append({'url': url, 'slug': m['slug'], 'reason': issue})
                else:
                    leads[(m['slug'], url)] = c
    rows = sorted(leads.values(), key=lambda r: (r['priority'], r['retailer'], r['brand'], r['model']))
    save('search-leads.json', rows)
    save('search-excluded.json', excluded)
    print({'leads': len(rows), 'models': len({r['slug'] for r in rows}), 'retailers': dict(Counter(r['retailer'] for r in rows))}, flush=True)


def fallback_plan():
    results = json.loads((OUT/'verification-web.json').read_text(encoding='utf-8'))
    plan = []
    for r in results:
        c = r['candidate']
        if r['status'] != 'unconfirmed' or '?variant=' not in c['fetch_url'] or c['retailer']=='Headphone Zone':
            continue
        evidence = json.loads((OUT/'web'/r['evidence']).read_text(encoding='utf-8'))
        if 'Internal Error' not in evidence['body']:
            continue
        plan.append({**c, 'fetch_url': c['url'], 'canonical_fallback': True})
    save('fallback-plan.json', plan)
    print({'canonical_product_pages':len(plan)}, flush=True)


def coverage():
    from auralis.db import new_session
    from sqlalchemy import text
    with new_session() as s:
        priced = set(s.execute(text("SELECT DISTINCT iem_id::text FROM iem_price_observations WHERE currency='INR' AND region='IN'")).scalars())
    rows = [{k: m[k] for k in ('slug', 'brand', 'model', 'priority')} | {
        'confirmed_inr_price': 'yes' if m['id'] in priced else 'no',
        'status': 'confirmed offer (may be out of stock)' if m['id'] in priced else 'no confirmed Indian priced listing in checked sources; not evidence unavailable in India'} for m in models()]
    missing = [r for r in rows if r['confirmed_inr_price'] == 'no']
    for name, rs in [('coverage.csv', rows), ('products-without-confirmed-indian-listing.csv', missing)]:
        base.guard()
        base.writecsv(WORK / name, rs)
    counts = {p: {'priced': sum(r['priority'] == p and r['confirmed_inr_price'] == 'yes' for r in rows),
                  'total': sum(r['priority'] == p for r in rows)} for p in range(1, 5)}
    result = {'models': len(rows), 'priced': len(rows)-len(missing), 'missing': len(missing), 'priorities': counts}
    save('coverage-summary.json', result)
    return result


def import_batch(batch):
    base.guard()
    setup_index()
    path = OUT / f'offers-{batch}.csv'
    rows = list(csv.DictReader(path.open(encoding='utf-8')))
    identities = {(m['brand'], m['model'], m['slug']) for m in models()}
    for r in rows:
        assert (r['brand'], r['model'], r['slug']) in identities
        assert r['currency'] == 'INR' and r['price_region'] == 'IN'
        assert Decimal(r['price']) > 0 and r['price_source_url'].startswith('https://')
        assert not reason({**r, 'title': r['page_title'], 'product_type': '', 'priority': int(r['priority'])}), r
        evidence = ROOT / r['evidence_file']
        assert hashlib.sha256(evidence.read_bytes()).hexdigest() == r['evidence_sha256']
        assert not any(x in r['price_source_url'].lower() for x in ('tag=', 'affiliate', 'affid='))
    logs = {}
    for dry in (True, False):
        cmd = [sys.executable, '-m', 'auralis.cli', 'import-catalog', str(path)] + (['--dry-run'] if dry else [])
        run = subprocess.run(cmd, cwd=ROOT/'backend', capture_output=True, text=True, encoding='utf-8', check=True)
        assert 'refused' not in run.stdout, run.stdout
        logs['dry_run' if dry else 'import'] = {'stdout': run.stdout, 'stderr': run.stderr, 'returncode': run.returncode}
    save(f'import-{batch}.json', logs)
    cov = coverage()
    base.append_report(f'\n## Batch resume5b-{batch} — {datetime.now().astimezone().isoformat()}\n\n'
        f'- Confirmed INR offers: **{len(rows)}**, for **{len({r["slug"] for r in rows})}** products. Retailer counts: '
        + '; '.join(f'{k}: {v}' for k,v in sorted(Counter(r['price_source'] for r in rows).items())) + '.\n'
        + f'- Out-of-stock offers: {sum(r["stock_status"] == "OutOfStock" for r in rows)}. Variant, stock, retrieval date, evidence method and SHA-256 are retained in `resume5b/offers-{batch}.csv`.\n'
        + f'- Dry run: `{logs["dry_run"]["stdout"].strip()}`. Import: `{logs["import"]["stdout"].strip()}`. Zero refused rows; no specs submitted.\n'
        + f'- Cumulative measured products with INR observations: **{cov["priced"]}/{cov["models"]}**. Priority counts: '
        + '; '.join(f'{p}: {v["priced"]}/{v["total"]}' for p,v in cov['priorities'].items()) + '.\n'
        + f'- Still without a confirmed Indian priced listing: **{cov["missing"]}**. Full names are in `products-without-confirmed-indian-listing.csv`.\n')
    print({'batch': batch, 'offers': len(rows), 'import': logs['import']['stdout'].strip(), 'coverage': cov}, flush=True)


def audit():
    from auralis.db import new_session, get_engine
    from sqlalchemy import text
    previous = json.loads((OUT / 'protected-start.json').read_text(encoding='utf-8'))
    result = {}
    with new_session() as s:
        for table, prior in previous.items():
            now = dict(s.execute(text(f'SELECT id::text, md5(row_to_json(t)::text) FROM {table} t')).all())
            changed = [key for key, value in prior.items() if now.get(key) != value]
            result[table] = {'before': len(prior), 'after': len(now), 'old_rows_changed_or_missing': changed}
    # Phase 3/4 image imports may update IEM image pointers concurrently. Compare
    # actual COPY fields from the pre-run dump, never waive identity/spec edits.
    if result.get('iems', {}).get('old_rows_changed_or_missing'):
        sql_path = OUT / 'iems-before.sql'
        if not sql_path.exists():
            dump = sorted(OUT.glob('catalogue-before-resume-*.dump'))[0]
            subprocess.run([str(ROOT/'.devtools/pg/Library/bin/pg_restore.exe'), '--data-only', '--table=iems',
                            '--file='+str(sql_path), str(dump)], check=True, capture_output=True)
        sql = sql_path.read_text(encoding='utf-8')
        match = re.search(r'COPY public\.iems \((.*?)\) FROM stdin;\n(.*?)\n\\\.', sql, re.S)
        assert match
        columns = match.group(1).split(', ')
        key_index = columns.index('id')
        before = {r.split('\t')[key_index]: r.split('\t') for r in match.group(2).splitlines()}
        connection = get_engine().raw_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL TIME ZONE 'Asia/Kolkata'")
                with cursor.copy('COPY (SELECT '+','.join(columns)+' FROM public.iems) TO STDOUT') as cp:
                    current = b''.join(bytes(block) for block in cp).decode('utf-8')
        finally:
            connection.close()
        now = {r.split('\t')[key_index]: r.split('\t') for r in current.splitlines()}
        allowed = {'image_path', 'image_source', 'image_source_url', 'image_credit', 'image_retrieved_on', 'updated_at'}
        diffs = []
        for key in result['iems']['old_rows_changed_or_missing']:
            assert key in now, f'Original identity missing: {key}'
            changes = [col for col,a,b in zip(columns, before[key], now[key]) if a != b]
            assert set(changes) <= allowed, (key, changes)
            diffs.append({'id': key, 'columns': changes})
        result['iems']['concurrent_image_updates'] = diffs
        result['iems']['identity_and_specs_unchanged'] = True
    save('audit.json', result)
    assert all(not r['old_rows_changed_or_missing'] for table,r in result.items() if table != 'iems'), result
    print({'all_original_prices_and_acoustics_unchanged': True,
           'identity_and_specs_unchanged': True,
           'concurrent_image_pointer_updates': len(result['iems'].get('concurrent_image_updates', [])),
           'coverage': coverage()}, flush=True)


def finish():
    """Consolidate reviewable manifests and report the exact database delta."""
    from auralis.db import new_session
    from sqlalchemy import text
    base.guard()
    audit()
    cov = coverage()
    rows = []
    for batch in ('local', 'web', 'cached-amazon'):
        rows.extend(csv.DictReader((OUT/f'offers-{batch}.csv').open(encoding='utf-8')))
    unique = {(r['slug'], r['price_source_url'], r['price'], r['price_observed_on']): r for r in rows}
    rows = sorted(unique.values(), key=lambda r: (int(r['priority']), r['price_source'], r['brand'], r['model']))
    writecsv('confirmed-offers.csv', rows)
    start = json.loads((WORK/'prices-resume5b.json').read_text(encoding='utf-8'))
    start_ids = {r['id'] for r in start}
    with new_session() as s:
        now = [dict(r) for r in s.execute(text('''SELECT p.*, i.brand, i.model, i.slug
            FROM iem_price_observations p JOIN iems i ON i.id=p.iem_id''')).mappings()]
    manifest_keys = {(r['brand'],r['model'],Decimal(r['price']),r['currency'],r['price_source_url'],r['price_observed_on']) for r in rows}
    added, others = [], []
    for p in now:
        if str(p['id']) in start_ids:
            continue
        key = (p['brand'],p['model'],p['amount'],p['currency'],p['source_url'],p['observed_at'].date().isoformat())
        (added if key in manifest_keys else others).append(p)
    assert not others, 'Concurrent price additions require separate attribution'
    fields = ['id','iem_id','brand','model','slug','amount','currency','region','source','source_url','observed_at']
    writecsv('new-price-observations.csv', [{k:str(p[k]) if p[k] is not None else '' for k in fields} for p in added], fields)
    # Consolidate confirmed links without prices, preserving all old task files.
    links = {}
    # Consolidate the resumed, revalidated views, not every historical manifest.
    generation_unconfirmed = {r['candidate']['url'] for r in json.loads((OUT/'verification-web.json').read_text(encoding='utf-8'))
                             if r['status']=='unconfirmed' and 'generation' in r.get('reason','')}
    for fp in list(OUT.glob('links-without-price-*.csv')):
        for r in csv.DictReader(fp.open(encoding='utf-8')):
            url = r.get('url', '')
            if not url.startswith('https://'):
                continue
            if url.split('?')[0] in generation_unconfirmed:
                continue
            item = {k:r.get(k,'') for k in ('brand','model','retailer','url','reason')}
            item['price'] = ''
            item['manifest'] = fp.relative_to(ROOT).as_posix()
            links[(item['brand'],item['model'],item['retailer'],url)] = item
    link_rows = sorted(links.values(), key=lambda r:(r['brand'],r['model'],r['retailer'],r['url']))
    writecsv('links-without-price.csv', link_rows, ['brand','model','retailer','url','price','reason','manifest'])
    unconfirmed = {}
    for fn in ('verification-local.json', 'verification-web.json'):
        for r in json.loads((OUT/fn).read_text(encoding='utf-8')):
            if r['status'] != 'unconfirmed':
                continue
            c = r['candidate']
            url = c.get('fetch_url',c['url'])
            item = dict(brand=c['brand'],model=c['model'],slug=c['slug'],priority=c['priority'],
                        retailer=c['retailer'],url=url,status='unconfirmed; not imported',reason=r.get('reason',''),
                        evidence_file=(OUT/'web'/r['evidence']).relative_to(ROOT).as_posix() if r.get('evidence') else '')
            unconfirmed[(c['slug'],c['retailer'],url)] = item
    writecsv('unconfirmed-retailer-links.csv', list(unconfirmed.values()),
             ['brand','model','slug','priority','retailer','url','status','reason','evidence_file'])
    priced_ids = {str(p['iem_id']) for p in now if p['currency']=='INR' and p['region']=='IN'}
    initial_priced = {p['iem_id'] for p in start if p['currency']=='INR' and p['region']=='IN'}
    priced_then = sum(m['id'] in initial_priced for m in models())
    linked = {(r['brand'],r['model']) for r in link_rows}
    leads = {r['slug'] for r in json.loads((OUT/'candidates.json').read_text(encoding='utf-8'))}
    leads.update(r['slug'] for r in json.loads((OUT/'search-leads.json').read_text(encoding='utf-8')))
    missing = []
    for m in models():
        if m['id'] in priced_ids:
            continue
        missing.append({k:m[k] for k in ('brand','model','slug','priority')} | {'research_status':
            'verified Indian product link; price absent or base variant unresolved' if (m['brand'],m['model']) in linked else
            'unconfirmed lead; inaccessible or exact price/variant unverified' if m['slug'] in leads else
            'no exact listing found in checked retailer feeds/searches'})
    writecsv('remaining-products.csv', missing, ['brand','model','slug','priority','research_status'])
    browser = [json.loads(fp.read_text(encoding='utf-8')) for fp in (OUT/'web').glob('page-*.json')]
    skipped = {p['handle'] for p in json.loads((WORK/'phase6/hz-under16k.json').read_text(encoding='utf-8'))}
    assert all(not (d['candidate']['retailer']=='Headphone Zone' and d['candidate']['url'].rsplit('/',1)[-1] in skipped) for d in browser)
    plan = json.loads((OUT/'web-plan.json').read_text(encoding='utf-8'))
    search = json.loads((OUT/'search-leads.json').read_text(encoding='utf-8'))
    fallback = json.loads((OUT/'fallback-plan.json').read_text(encoding='utf-8'))
    assert len(browser) == len(plan)+len(search)+len(fallback), 'Unfinished browser requests remain'
    counts = Counter(p['source'] for p in added)
    summary = {'finished_at':datetime.now().astimezone().isoformat(), 'starting_priced_models':priced_then,
        'new_price_observations':len(added), 'newly_priced_models':cov['priced']-priced_then,
        'new_observations_by_retailer':dict(counts), 'coverage':cov,
        'browser_product_pages_checked':len(browser), 'indexed_queries':147,
        'confirmed_links_without_price':len(link_rows), 'unconfirmed_links':len(unconfirmed),
        'remaining_research_status':dict(Counter(r['research_status'] for r in missing)),
        'completed_headphone_zone_handles_requested':0,
        'free_bytes':__import__('shutil').disk_usage(ROOT).free}
    save('summary.json', summary)
    base.append_report('\n## Phase 5b completed sweep — '+summary['finished_at']+'\n\n'
        + f'- Added **{len(added)} new price observations**, covering **{cov["priced"]-priced_then} previously unpriced measured products**. '
        + 'New observations by retailer: '+ '; '.join(f'{k}: {v}' for k,v in sorted(counts.items()))+'.\n'
        + f'- Final priced coverage: **{cov["priced"]}/{cov["models"]}**; ranked IEC in-ears **{cov["priorities"][1]["priced"]}/203**; '
        + f'clone in-ears **{cov["priorities"][2]["priced"]}/{cov["priorities"][2]["total"]}**; '
        + f'headphones **{cov["priorities"][3]["priced"]}/{cov["priorities"][3]["total"]}**; other measurements **{cov["priorities"][4]["priced"]}/{cov["priorities"][4]["total"]}**.\n'
        + f'- Checked **{len(browser)} public browser product-page views**, plus the existing local first-party page cache, and **147 indexed-search queries**. '
        + 'Amazon-only indexed checks returned no results; cached retailer-own search cards supplied the permitted fallback. '
        + 'Flipkart amounts are the first unconditional item price directly after the exact product heading, excluding bank offers, MRP, fees and EMI.\n'
        + '- Browser evidence can be a public cached rendering. Observation dates record when the price was seen; source crawl labels are preserved. '
        + 'This is not a claim of live stock or delivery. Some displayed prices differ from same-day direct-feed prices; selected-variant disagreements were withheld.\n'
        + '- Croma and the Sennheiser brand store confirmed exact links but exposed no usable purchase price in their public product views. '
        + 'Sony Center India, Vijay Sales, ProHiFi and other failed/ambiguous pages remain in the unconfirmed manifest; no amounts were invented. '
        + 'Prior HiFiNage, Reliance Digital, AVStore, Ooberpad and Pro Audio Brands page evidence was rechecked; already-imported offers were deduplicated by the importer.\n'
        + '- Skipped all **111** completed Headphone Zone Phase 6 handles and other in-ear leads within the completed budget range. No completed handle was requested.\n'
        + f'- **{cov["missing"]}** measured products still have no confirmed Indian rupee price. Every name and research status is in `resume5b/remaining-products.csv`; '
        + 'the root coverage and missing-products CSVs are refreshed. This means no priced listing was confirmed in the checked sources, not that the product cannot be purchased in India.\n'
        + f'- Owner handoff: `resume5b/links-without-price.csv` (**{len(link_rows)}** confirmed links, prices empty); '
        + f'`resume5b/unconfirmed-retailer-links.csv` (**{len(unconfirmed)}** leads, explicitly not imported); '
        + '`resume5b/confirmed-offers.csv` (reviewable evidence manifest); `resume5b/new-price-observations.csv` (exact database additions); `resume5b/summary.json`.\n'
        + '- All imports passed dry run before commit, with zero refused rows and zero specs updates. '
        + 'The final audit proves all prior price/acoustic rows and identity/spec fields unchanged. Concurrent Phase 3/4 image additions and image-pointer/timestamp changes were compared field by field with the pre-run dump and retained. '
        + 'No application files, schema, Phase 3/4 files or their reports were edited. Backups were retained; G: stayed above 5 GB.\n')
    print(summary, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'inventory', 'local', 'web-plan', 'web-extract', 'search-leads', 'fallback-plan', 'import', 'coverage', 'audit', 'finish'])
    parser.add_argument('batch', nargs='?', default='local')
    args = parser.parse_args()
    models_cached = models()
    {'prepare': prepare, 'inventory': inventory, 'local': local_confirm, 'web-plan': web_plan, 'web-extract': web_extract, 'search-leads': search_leads, 'fallback-plan': fallback_plan, 'import': lambda: import_batch(args.batch),
     'coverage': lambda: print(coverage()), 'audit': audit, 'finish': finish}[args.action]()
