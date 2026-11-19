"""India retail acquisition. All task artifacts stay in market/india; no app edits.

Run with backend/.venv/Scripts/python.exe, from backend, to use app DB settings.
"""
from __future__ import annotations
import argparse, csv, hashlib, html, json, os, re, shutil, subprocess, threading, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, UTC
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urljoin
import httpx

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'data/iem/market/india'
REPORT = ROOT / 'data/iem/reports/10-india-retail.md'
AGENT = 'AuralsCatalogueBot/1.0 (public retail research)'
STORES = {
 'headphonezone': ('Headphone Zone', 'https://www.headphonezone.in'),
 'conceptkart': ('ConceptKart', 'https://conceptkart.com'),
 'theaudiostore': ('The Audio Store', 'https://www.theaudiostore.in'),
 'hifinage': ('HiFiNage', 'https://hifinage.com'),
 'ooberpad': ('Ooberpad', 'https://www.ooberpad.com'),
 'avstore': ('AVStore', 'https://avstore.in'),
 'sony': ('Sony Center India', 'https://shopatsc.com'),
 'sennheiser': ('Sennheiser India', 'https://www.sennheiser-hearing.com/en-IN'),
}
LOCKS = {}; LAST = {}; GUARD = threading.Lock()

def guard():
    if shutil.disk_usage(ROOT).free < 5 * 1024**3:
        raise RuntimeError('G: below 5 GB; stopping')

def save(path, value):
    guard(); path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = WORK / 'backups' / (path.name + '.' + datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ'))
        backup.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(path, backup)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding='utf-8')

def writecsv(path, rows, fields=None):
    if path.exists():
        backup = WORK / 'backups' / (path.name + '.' + datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ'))
        backup.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(path, backup)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields or list(rows[0])); w.writeheader(); w.writerows(rows)

def append_report(text):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    if REPORT.exists():
        b = WORK / 'backups' / ('report.' + datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ') + '.md')
        b.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(REPORT, b)
    with REPORT.open('a', encoding='utf-8') as f: f.write(text)

def fetch(url):
    """Cache responses, stop at access blocks, serialize starts >=1.1s per host."""
    guard(); host = urlsplit(url).netloc.lower()
    key = hashlib.sha256(url.encode()).hexdigest()
    base = WORK / 'raw' / host / key
    meta = base.with_suffix('.json'); body = base.with_suffix('.bin')
    with GUARD: lock = LOCKS.setdefault(host, threading.Lock())
    with lock:
        if meta.exists():
            m = json.loads(meta.read_text(encoding='utf-8'))
            if m.get('error'): raise ValueError(m['error'])
            return body.read_bytes(), m
        stop = WORK / 'host-stops' / (host + '.json')
        if stop.exists():
            raise ValueError('host stopped after access block; no further requests')
        time.sleep(max(0, 1.1 - (time.monotonic() - LAST.get(host, 0))))
        LAST[host] = time.monotonic()
        base.parent.mkdir(parents=True, exist_ok=True)
        try:
            with httpx.Client(headers={'User-Agent': AGENT}, timeout=35, follow_redirects=False) as c:
                r = c.get(url)
            body.write_bytes(r.content)
            m = {'url': url, 'status': r.status_code, 'retrieved_at': datetime.now().astimezone().isoformat(),
                 'sha256': hashlib.sha256(r.content).hexdigest(), 'bytes': len(r.content)}
            if r.status_code in (301,302,307,308): m['redirect'] = urljoin(url, r.headers.get('location',''))
            if r.status_code >= 400: m['error'] = f'HTTP {r.status_code}'
            if any(x in r.text.lower() for x in ('cf-chl-widget','verify you are human','captcha challenge')):
                m['error'] = 'access challenge; no bypass'
            save(meta, m)
            if r.status_code in (401,403,429,503) or m.get('error')=='access challenge; no bypass':
                save(stop, m)
            if m.get('error'): raise ValueError(m['error'])
            return r.content, m
        except httpx.HTTPError as e:
            save(meta, {'url':url, 'error':type(e).__name__, 'retrieved_at':datetime.now().astimezone().isoformat()})
            raise ValueError(type(e).__name__) from e

def snapshot(label):
    from sqlalchemy import text
    from auralis.db import new_session, get_engine
    with new_session() as s:
        rows = s.execute(text('''SELECT i.id, i.brand, i.model, i.slug,
            array_agg(DISTINCT m.rig_family) AS rigs FROM iems i
            JOIN fr_measurements m ON m.iem_id=i.id GROUP BY i.id ORDER BY i.brand,i.model''')).mappings().all()
        models = []
        for r in rows:
            r = dict(r); r['id'] = str(r['id']); rigs = r['rigs']
            r['priority'] = 1 if 'iec60318-4' in rigs else 2 if 'iec60318-4-clone' in rigs else 3 if any((x or '').startswith('headphone:') for x in rigs) else 4
            models.append(r)
        # Stable row hashes allow concurrent additive imports; compare old rows by id later.
        protected = {}
        for table in ('fr_measurements','iem_acoustic_profiles','fr_targets'):
            protected[table] = dict(s.execute(text(f"SELECT id::text, md5(row_to_json(t)::text) FROM {table} t")).all())
        protected['identities'] = {r['id']:[r['brand'],r['model'],r['slug']] for r in models}
        prices = [dict(r) for r in s.execute(text('SELECT * FROM iem_price_observations')).mappings()]
        tables = s.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'iem_%' OR tablename IN ('iems','fr_measurements','fr_targets'))")).scalars().all()
    save(WORK / f'catalogue-{label}.json', models)
    save(WORK / f'protected-{label}.json', protected)
    save(WORK / f'prices-{label}.json', prices)
    if label == 'baseline':
        u = get_engine().url; env = dict(os.environ)
        env.update(PGHOST=u.host or 'localhost', PGPORT=str(u.port or 5432), PGUSER=u.username or '', PGPASSWORD=u.password or '')
        backup = WORK / 'backups' / ('catalogue-before-india-' + datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ') + '.dump')
        backup.parent.mkdir(parents=True, exist_ok=True)
        command = [str(ROOT / '.devtools/pg/Library/bin/pg_dump.exe'), '-Fc','-d',u.database,'-f',str(backup)]
        for t in tables: command.extend(['-t',t])
        subprocess.run(command, env=env, check=True, capture_output=True)
        assert backup.stat().st_size > 10000
        append_report('# India retail coverage — Phase 5\n\n' + datetime.now().astimezone().isoformat() +
          f'\n\nCatalogue-only backup: `{backup.relative_to(ROOT).as_posix()}`. Snapshot: {len(models)} measured models. '
          'Only price observations will be added; no source, identity, image or application files changed. '
          '“The Audio Card” is interpreted as The Audio Store (https://www.theaudiostore.in/); no exact shop by the supplied name was established.\n')
    print({'snapshot':label,'models':len(models),'priorities':{p:sum(r['priority']==p for r in models) for p in range(1,5)}}, flush=True)

def feeds():
    def store(item):
        key,(name,origin)=item; products=[]; pages=[]; error=None
        for n in range(1,41):
            url=f'{origin}/products.json?limit=250&page={n}'
            try:
                data,meta=fetch(url)
                if meta.get('redirect'):
                    data,meta=fetch(meta['redirect'])
                batch=json.loads(data)['products']
            except (ValueError,KeyError) as e: error=str(e); break
            pages.append(meta); products.extend(batch)
            if not batch: break
        save(WORK / f'feed-{key}.json',{'retailer':name,'origin':origin,'pages':pages,'products':products,'error':error})
        print({'retailer':name,'products':len(products),'error':error},flush=True)
    with ThreadPoolExecutor(max_workers=5) as pool: list(pool.map(store,STORES.items()))

@lru_cache(maxsize=32768)
def norm(s):
    s=html.unescape(s).lower().replace('×',' x ').replace('α',' alpha ')
    s=re.sub(r'(\d)\.(\d)',r'\1dot\2',s)
    s=re.sub(r'[^a-z0-9]+',' ',s).strip()
    return re.sub(r'(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])',' ',s)

def candidates(label):
    models=json.loads((WORK/f'catalogue-{label}.json').read_text(encoding='utf-8'))
    products=[]
    for path in WORK.glob('feed-*.json'):
        d=json.loads(path.read_text(encoding='utf-8'))
        if not d.get('origin'): continue
        for p in d['products']: products.append((d,p,norm(p['title']),norm(p.get('vendor',''))))
    rows=[]
    aliases={'ultimate ears':['ultimate ears','ue'],'fiio':['fiio'],'tin':['tin hifi','tinhifi','tin'],'7hz':['7hz','7 hz'],'salnotes':['salnotes','7hz'],'jvc':['jvc'],'final':['final','final audio'],'audio':['audio technica'],'64':['64 audio'],'mee':['mee audio'],'bang':['bang olufsen'],'simgot':['simgot']}
    for m in sorted(models,key=lambda r:(r['priority'],r['brand'],r['model'])):
        bn=norm(m['brand']); mn=norm(m['model']); full=norm(m['brand']+' '+m['model'])
        for d,p,title,vendor in products:
            makers=aliases.get(bn,[bn]); brandok=any((' '+b+' ') in (' '+vendor+' ') or (' '+b+' ') in (' '+title+' ') for b in makers)
            if not brandok: continue
            # Whole model token sequence only. No fuzzy matches or erased generation suffixes.
            if (' '+mn+' ') not in (' '+title+' ') and full!=title: continue
            rows.append({'slug':m['slug'],'brand':m['brand'],'model':m['model'],'priority':m['priority'],
              'retailer':d['retailer'],'url':d['origin']+'/products/'+p['handle'],
              'title':p['title'],'product_type':p.get('product_type',''),'vendor':p.get('vendor',''),
              'variants':p.get('variants',[]),'handle':p['handle']})
    save(WORK/f'candidates-{label}.json',rows)
    print({'candidates':len(rows),'models':len({r['slug'] for r in rows})},flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['snapshot','feeds','candidates']);p.add_argument('label',nargs='?',default='baseline');a=p.parse_args()
    {'snapshot':lambda:snapshot(a.label),'feeds':feeds,'candidates':lambda:candidates(a.label)}[a.action]()
