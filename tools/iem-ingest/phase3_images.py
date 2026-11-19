"""Bulk public photo discovery, cached fetching, contact sheets and manual staging.

Intake environment only. Never auto-approves: stage requires explicit candidate
IDs in a human-reviewed decisions file. All network bodies stay in this workspace.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import threading
import time
import urllib.parse
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont
from selectolax.lexbor import LexborHTMLParser
from intake import image_metrics
from phase2_images import SOURCES

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'data/iem/images/phase3'
RAW = WORK / 'http'
AGENT = 'AuralisPhotoResearch/1.0 (development catalogue)'
LOCKS = {}
LAST = {}
GUARD = threading.Lock()
CLIENTS = {}


def write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)


def fetch(url, robots=True):
    """Cached ordinary HTTP, no challenge retries, >=0.6 seconds per host.

    Redirect destinations get their own robots and rate checks. An existing Phase
    2 cache is reused with status/block metadata honored, including blocked bodies.
    """
    if shutil.disk_usage(ROOT).free < 5 * 1024**3:
        raise RuntimeError('STOP: G: below 5 GB free')
    u = urllib.parse.urlsplit(url)
    if u.scheme != 'https': raise ValueError('HTTPS required')
    key = hashlib.sha256(url.encode()).hexdigest()
    folder = RAW / u.netloc
    path = folder / (key + '.bin')
    meta = path.with_suffix('.json')
    old = ROOT / 'data/iem/raw' / u.netloc / path.name
    if not path.exists() and old.exists():
        path = old
        meta = old.with_suffix('.json')
    if path.exists():
        m = json.loads(meta.read_text(encoding='utf-8')) if meta.exists() else {}
        status = m.get('status', 200)
        if m.get('blocked') or status in (401,403,429,503):
            raise ValueError(m.get('blocked') or f'HTTP {status}')
        if 300 <= status < 400 and m.get('location'):
            return fetch(urllib.parse.urljoin(url, m['location']))
        if status >= 400: raise ValueError(f'HTTP {status}: {url}')
        return path.read_bytes()
    host_stop = folder / 'access-blocked.json'
    if host_stop.exists():
        raise ValueError('Source previously blocked automated access; no further network requests: '+u.netloc)
    if robots and u.path != '/robots.txt':
        rb = fetch(f'https://{u.netloc}/robots.txt', False).decode('utf-8', 'replace')
        parser = urllib.robotparser.RobotFileParser()
        parser.parse(rb.splitlines())
        if not parser.can_fetch(AGENT, url): raise ValueError('robots.txt disallows ' + url)
    with GUARD:
        lock = LOCKS.setdefault(u.netloc, threading.Lock())
    with lock:
        # A second worker might have just downloaded this URL.
        if path.exists(): return fetch(url, robots)
        time.sleep(max(0, .6 - (time.monotonic() - LAST.get(u.netloc, 0))))
        LAST[u.netloc] = time.monotonic()
        with GUARD:
            client = CLIENTS.setdefault(u.netloc, None)
            if client is None:
                client = httpx.Client(headers={'User-Agent': AGENT}, timeout=25, follow_redirects=False)
                CLIENTS[u.netloc] = client
        response = client.get(url)
        body = response.content
        status = response.status_code
        if u.path == '/robots.txt' and status in (400,404,410):
            body, status = b'', 200
        lower = body.lower() if 'text/html' in response.headers.get('content-type','') else b''
        blocked = 'public access challenge; no bypass' if any(t in lower for t in (b'verify you are human', b'cf-chl-widget', b'just a moment...')) else None
        folder.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as f: f.write(body)
        write_new(meta, {'url': url, 'status': status, 'blocked': blocked,
                        'location': response.headers.get('location'),
                        'retrieved_on': datetime.now(UTC).isoformat()})
        if blocked or status in (401,429,503) or (status==403 and ('text/html' in response.headers.get('content-type','') or u.path=='/robots.txt')):
            if not host_stop.exists():
                write_new(host_stop,{'url':url,'status':status,'reason':blocked or 'HTTP access refusal; stop this host'})
    if blocked: raise ValueError(blocked)
    if 300 <= status < 400: return fetch(urllib.parse.urljoin(url, response.headers['location']))
    if status >= 400: raise ValueError(f'HTTP {status}: {url}')
    return body


def compact(s):
    return re.sub('[^a-z0-9]', '', s.lower())


def keys(s):
    s = s.lower().replace('&', 'and').replace('+', ' plus ')
    s = re.sub(r'[-_]', ' ', s)
    s = re.sub(r'\b(final audio)\b', 'final', s)
    s = re.sub(r'\b(shuoer)\b', 'letshuoer', s)
    return compact(s)


EXTRA = {
    'KeepHiFi': 'https://keephifi.com', 'NiceHCK': 'https://nicehck.com',
    'HiFi Headphones UK': 'https://www.hifiheadphones.co.uk',
    'HiFi-Passion': 'https://hifi-passion.de', '1MORE': 'https://usa.1more.com',
    'Campfire Audio': 'https://www.campfireaudio.com', 'Dan Clark Audio': 'https://danclarkaudio.com',
    'Meze Audio': 'https://mezeaudio.com', 'Noble Audio': 'https://nobleaudio.com',
    '64 Audio': 'https://www.64audio.com', 'SoundMAGIC': 'https://soundmagicheadphones.com',
    'Periodic Audio': 'https://periodicaudio.com', 'Hidizs': 'https://www.hidizs.net',
    'Dunu': 'https://www.dunu-topsound.com', 'EarFun': 'https://www.myearfun.com',
}


def feeds():
    def one(item):
        name, origin = item
        products, error = [], None
        try:
            for page in range(1, 13):
                b = json.loads(fetch(f'{origin}/products.json?limit=250&page={page}'))
                chunk = b['products']
                products.extend(chunk)
                if len(chunk) < 250: break
        except Exception as e: error = str(e)
        write_new(WORK / 'feeds' / (compact(name) + '.json'), {'source': name, 'origin': origin, 'products': products, 'error': error})
        return {'source': name, 'products': len(products), 'error': error}
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(one, EXTRA.items()))
    write_new(WORK / 'feed-results.json', results)
    print({'sources': len(results), 'products': sum(r['products'] for r in results), 'blocked_or_unavailable': sum(bool(r['error']) for r in results)}, flush=True)


def models(scope):
    baseline = json.loads((WORK / 'baseline.json').read_text(encoding='utf-8'))
    approved = {r['slug'] for p in WORK.glob('*-library.jsonl') for r in map(json.loads, p.read_text(encoding='utf-8').splitlines())}
    ranked = {r['slug'] for r in csv.DictReader((ROOT / 'data/iem/reports/phase2b-image-status.csv').open(encoding='utf-8')) if r['ranked_current_engine'] == 'yes'}
    rows = [dict(r, ranked=r['slug'] in ranked) for r in baseline['models'] if not r['image_path'] and r['slug'] not in approved]
    if scope == 'ranked': rows = [r for r in rows if r['ranked']]
    return sorted(rows, key=lambda r: (not r['ranked'], r['brand'].lower(), r['model'].lower()))


def discover(batch, scope):
    products = []
    for source, (file, origin) in SOURCES.items():
        payload = json.loads((ROOT / 'data/iem/processed' / file).read_text(encoding='utf-8'))
        products.extend((source, origin, p) for p in (payload['products'] if isinstance(payload, dict) else payload))
    for file in (WORK / 'feeds').glob('*.json'):
        payload = json.loads(file.read_text(encoding='utf-8'))
        products.extend((payload['source'], payload['origin'], p) for p in payload['products'])
    page = LexborHTMLParser(fetch('https://www.rtings.com/headphones/index'))
    reviews = []
    for a in page.css('a[href]'):
        href = a.attributes['href']
        if re.match(r'^/headphones/reviews/[^/]+/[^/]+$', href) and '/best/' not in href:
            title = a.text().strip()
            brand = href.split('/')[-2].replace('-', ' ')
            if not keys(title).startswith(keys(brand)):
                title = brand + ' ' + title
            reviews.append((title, 'https://www.rtings.com' + href))
    leads = []
    for m in models(scope):
        full = keys(m['brand'] + ' ' + m['model'])
        choices = []
        for title, url in reviews:
            if keys(title) == full:
                choices.append({'source': 'RTINGS', 'title': title, 'page_url': url, 'score': 110, 'kind': 'review'})
        model = compact(m['model'])
        brands = [compact(m['brand'])]
        if m['brand'] == 'Final Audio': brands += ['final']
        if m['brand'] == 'Shuoer': brands += ['letshuoer']
        if m['brand'] == 'Simgot' and model.startswith('audio'): model = model[5:]
        for source, origin, product in products:
            title = product.get('title', '')
            t = compact(title)
            if not product.get('images'): continue
            if re.search(r'\b(replacement|eartips|ear tips|earpads|cable only|upgrade cable|case only|ear pads|adapter)\b', title, re.I): continue
            for brand in brands:
                if brand not in t: continue
                rest = t.replace(brand, '', 1)
                pos = rest.find(model)
                if pos < 0 or rest[:pos] not in ('', 'audio', 'new', 'meteor', 'gems', 'audioiem'): continue
                tail = rest[pos + len(model):]
                if re.match(r'^(?:ii|iii|iv|mk|pro|plus|ultra|se|[0-9])', tail): continue
                if len(model) < 3 and rest != model: continue
                score = 105 if rest == model else 100 if not tail else 80
                choices.append({'source': source, 'title': title, 'page_url': origin + '/products/' + product['handle'],
                                'score': score, 'kind': 'feed', 'images': [i['src'] for i in product['images'][:3]]})
                break
        choices.sort(key=lambda c: -c['score'])
        leads.append({**m, 'choices': choices[:4]})
    write_new(WORK / f'{batch}-leads.json', leads)
    with (WORK / f'{batch}-titles.txt').open('x', encoding='utf-8') as f:
        for m in leads:
            f.write(f'{m["slug"]}: ' + ' | '.join(c['source'] + ': ' + c['title'] for c in m['choices'][:2]) + '\n')
    print({'batch': batch, 'models': len(leads), 'with_lead': sum(bool(m['choices']) for m in leads), 'rtings': sum(any(c['source']=='RTINGS' for c in m['choices']) for m in leads)})


def download(batch, choices=2):
    leads = json.loads((WORK / f'{batch}-leads.json').read_text(encoding='utf-8'))
    def one(m):
        result = []
        number = 0
        for c in m['choices'][:choices]:
            try:
                if c['kind'] == 'review':
                    p = LexborHTMLParser(fetch(c['page_url']))
                    meta = p.css_first('meta[property="og:image"]')
                    title = p.css_first('h1')
                    if not meta: raise ValueError('No public preview image')
                    urls = [meta.attributes['content']]
                    page_title = title.text().strip() if title else ''
                elif c['kind'] == 'raa':
                    p = LexborHTMLParser(fetch(c['page_url']))
                    title = p.css_first('title')
                    page_title = title.text().strip() if title else c['title']
                    urls = []
                    for n in p.css('img[src], a[href]'):
                        value = n.attributes.get('src') or n.attributes.get('href') or ''
                        if '/report/hp/' in value and re.search(r'/\d+\.(?:jpg|png|jpeg)$',value,re.I):
                            urls.append(urllib.parse.urljoin(c['page_url'],value))
                    urls = list(dict.fromkeys(urls))[:2]
                    if not urls: raise ValueError('No public product photograph in report')
                elif c['kind'] == 'article':
                    p = LexborHTMLParser(fetch(c['page_url']))
                    title = p.css_first('h1')
                    page_title = title.text().strip() if title else c['title']
                    meta = p.css_first('meta[property="og:image"]')
                    urls = [meta.attributes['content']] if meta and meta.attributes.get('content') else []
                    for script in p.css('script[type="application/ld+json"]'):
                        try:
                            pending = [json.loads(script.text())]
                            while pending:
                                obj = pending.pop()
                                if isinstance(obj,list): pending.extend(obj)
                                elif isinstance(obj,dict):
                                    if obj.get('@type') in ('Product','Article','NewsArticle','BlogPosting','Review'):
                                        values = obj.get('image',[])
                                        values = values if isinstance(values,list) else [values]
                                        for value in values:
                                            if isinstance(value,str): urls.append(value)
                                            elif isinstance(value,dict) and value.get('url'): urls.append(value['url'])
                                    pending.extend(v for v in obj.values() if isinstance(v,(dict,list)))
                        except (ValueError,TypeError): pass
                    for img in p.css('article img, .entry-content img, main img, .post-content img') or p.css('img'):
                        attrs = img.attributes
                        url = attrs.get('data-src') or attrs.get('data-lazy-src') or attrs.get('src') or ''
                        if url and not url.startswith('data:'):
                            urls.append(urllib.parse.urljoin(c['page_url'],url))
                    urls.extend(c.get('images', []))
                    urls = [u.strip() for u in urls]
                    urls = list(dict.fromkeys(urls))
                    urls = [u for u in urls if not re.search(r'(graph|frequency|measurement|logo|banner|avatar|rating|award|signature|donat|paypal|facebook|instagram|youtube|pantheonsite|FR-|FR\.|\.svg|\.gif)',u,re.I)]
                    # Spread review frames past the initial unboxing sequence.
                    urls = [urls[i] for i in (0,3,6) if i < len(urls)]
                    if not urls: raise ValueError('No public article photograph')
                else:
                    urls = c['images'][:2]
                    page_title = c['title']
                for url in urls:
                    number += 1
                    url = url.strip()
                    url = 'https:' + url if url.startswith('//') else url
                    if url.startswith('http://'): url = 'https://' + url[7:]
                    try:
                        b = fetch(url)
                        metrics = image_metrics(b)
                    except Exception as exc:
                        result.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'image_url':url,'error':str(exc)})
                        continue
                    ext = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp', 'AVIF': '.avif'}.get(metrics['format'], '.img')
                    target = WORK / 'candidates' / m['slug'] / (metrics['sha256'][:20] + ext)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists():
                        with target.open('xb') as f: f.write(b)
                    result.append({'id': f'{m["slug"]}:{number}', 'slug': m['slug'], 'brand': m['brand'], 'model': m['model'],
                                   'source': c['source'], 'title': c['title'], 'page_title': page_title,
                                   'page_url': c['page_url'], 'image_url': url, 'file': target.relative_to(ROOT).as_posix(),
                                   'retrieved_on': datetime.now(UTC).date().isoformat(), **metrics})
            except Exception as e:
                result.append({'slug': m['slug'], 'source': c['source'], 'page_url': c['page_url'], 'error': str(e)})
        return result
    rows = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        for i, future in enumerate(as_completed([pool.submit(one,m) for m in leads]), 1):
            rows.extend(future.result())
            if i % 50 == 0: print({'models_processed': i, 'images': sum('file' in r for r in rows)}, flush=True)
    rows.sort(key=lambda r: (r['slug'], r.get('id','')))
    write_new(WORK / f'{batch}-candidates.json', rows)
    print({'batch': batch, 'models_with_images': len({r['slug'] for r in rows if 'file' in r}), 'images': sum('file' in r for r in rows), 'errors': sum('error' in r for r in rows)}, flush=True)


def sheets(batch):
    rows = [r for r in json.loads((WORK / f'{batch}-candidates.json').read_text(encoding='utf-8')) if 'file' in r]
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
    small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    outputs = []
    for n, start in enumerate(range(0, len(rows), 30), 1):
        canvas = Image.new('RGB', (2100, 1920), '#d7dce2')
        d = ImageDraw.Draw(canvas)
        for j, r in enumerate(rows[start:start+30]):
            x,y = (j%5)*420, (j//5)*320
            with Image.open(ROOT / r['file']) as img:
                img.load()
                art = img.convert('RGBA')
            art.thumbnail((406,240))
            panel = Image.new('RGBA',(410,240),'white')
            panel.alpha_composite(art,((410-art.width)//2,(240-art.height)//2))
            canvas.paste(panel.convert('RGB'),(x+5,y+51))
            d.text((x+5,y+2),r['id'][:43],fill='black',font=font)
            d.text((x+5,y+25),r['source']+' '+r['title'][:37],fill='black',font=small)
            d.text((x+5,y+294),f'{r["width"]}x{r["height"]}',fill='black',font=small)
        path = WORK / f'{batch}-sheet-{n:02}.jpg'
        with path.open('xb') as f: canvas.save(f,format='JPEG',quality=90)
        outputs.append(path.relative_to(ROOT).as_posix())
    write_new(WORK / f'{batch}-sheets.json', outputs)
    print({'sheets': len(outputs), 'candidates': len(rows)})


def stage(batch):
    decisions = json.loads((WORK / f'{batch}-decisions.json').read_text(encoding='utf-8'))
    rows = {r['id']: r for r in json.loads((WORK / f'{batch}-candidates.json').read_text(encoding='utf-8')) if 'file' in r}
    manifest = []
    for slug, d in decisions.items():
        if not d.get('candidate'): continue
        r = rows[d['candidate']]
        assert r['slug'] == slug
        target = ROOT / 'data/iem-images/originals' / slug / Path(r['file']).name
        target.parent.mkdir(parents=True, exist_ok=True)
        b = (ROOT / r['file']).read_bytes()
        assert hashlib.sha256(b).hexdigest() == r['sha256']
        if target.exists(): assert target.read_bytes() == b
        else:
            with target.open('xb') as f: f.write(b)
        manifest.append({
            'slug': slug, 'file_path': target.relative_to(ROOT/'data/iem-images').as_posix(),
            'role': 'primary', **{k:r[k] for k in ('width','height','format','byte_size','sha256','perceptual_hash','page_url','image_url','retrieved_on')},
            'source_name': r['source'], 'credit': f'{r["source"]} product photograph; photographer unknown',
            'licence_note': 'Rights were not confirmed. Development build only, not for publication.',
            'verification_status': 'verified', 'verification_method': f'Manual visual inspection of {batch} contact sheet and exact source listing title',
            'verification_note': d['note'], 'processing_notes': 'Source original retained byte-for-byte; no matte or other processing.',
        })
    with (WORK / f'{batch}-library.jsonl').open('x',encoding='utf-8') as f:
        for row in manifest: f.write(json.dumps(row,ensure_ascii=False)+'\n')
    print({'batch': batch, 'primaries_staged': len(manifest), 'rejected': sum(not d.get('candidate') for d in decisions.values())})


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action',choices=['feeds','discover','download','sheets','stage'])
    p.add_argument('batch',nargs='?')
    p.add_argument('--scope',default='ranked',choices=['ranked','all'])
    p.add_argument('--choices',type=int,default=2)
    a = p.parse_args()
    if a.action == 'feeds': feeds()
    elif a.action == 'discover': discover(a.batch,a.scope)
    elif a.action == 'download': download(a.batch,a.choices)
    elif a.action == 'sheets': sheets(a.batch)
    else: stage(a.batch)
