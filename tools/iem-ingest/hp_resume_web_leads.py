"""Turn retained web-tool discoveries into exact-model photo leads for manual review."""
import json
import re
import urllib.parse
from collections import defaultdict
from hp_common import WORK, write_new
from hp_photos import PRIORITY
from hp_fallback_photos import key, ALIASES

EXCLUDE=re.compile(r'(?:youtube|youtu\.be|reddit|facebook|instagram|tiktok|pinterest|rtings|audiowords|mandrillis|zelpio|speakerranking|amazon|ebay|aliexpress|manuals|manualslib|manualzz|scribd|researchgate)',re.I)
BAD=re.compile(r'\b(?:replacement|earpads?|ear\s+pads?|cushions?|headband|cables?|adapter|manual|frequency response|measurements|ranked|versus|vs\.?|comparison)\b',re.I)
GOOD=['headphonecheck.com','soundguys.com','trustedreviews.com','techradar.com','whathifi.com','majorhifi.com','theheadphonelist.com','audiophile-heaven.com','diyaudioheaven.wordpress.com','headfonia.com','headfonics.com','audio46.com','headphones.com','bloom-audio.com','musicteck.com','headphonezone.in','jbl.com','koss.com','sony.jp','audio-technica.co.jp','beyerdynamic.com','sennheiser.com','logitechg.com','head-fi.org','stereophile.com','innerfidelity.com']

def main():
    ms=json.loads((WORK/'hp-web-targets.json').read_text(encoding='utf-8'))
    covered={r['slug'] for p in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,p.read_text(encoding='utf-8').splitlines())}
    aliases=json.loads((WORK/'hp-pinned-photo-aliases.json').read_text(encoding='utf-8'))
    entries={}
    queried=set()
    for p in sorted(WORK.glob('hp-web-search-*.json')):
        v=json.loads(p.read_text(encoding='utf-8'))
        queried.update(m['slug'] for m in v['models'])
        for e in v['entries']:entries.setdefault(e['url'],e)
    assert queried=={m['slug'] for m in ms}
    tried=defaultdict(set)
    for p in WORK.glob('*-candidates.json'):
        for r in json.loads(p.read_text(encoding='utf-8')):tried[r['slug']].add(r.get('page_url'))
    out=[]
    for m in ms:
        if m['slug'] in covered:continue
        fs={k for k in aliases.get(m['slug'],[]) if k}
        fs.add(key(m['brand']+' '+m['model']))
        cs=[]
        for u,e in entries.items():
            host=urllib.parse.urlsplit(u).netloc
            if EXCLUDE.search(host) or u in tried[m['slug']] or re.search(r'\.(?:pdf|txt|csv|zip)(?:\?|$)',u):continue
            if BAD.search(e['title']):continue
            t=key(e['title']);path=key(urllib.parse.unquote(urllib.parse.urlsplit(u).path))
            matched=[]
            for f in fs:
                for k in (t,path):
                    if f not in k:continue
                    tail=k.split(f,1)[1]
                    if re.match(r'^(?:[0-9]|ii|iii|iv|mk|pro|plus|ultra|wireless|bt|anc|nano|stealth|remaster|classic|limited|edition|se(?:review|headphone))',tail):continue
                    matched.append(f)
            if not matched:continue
            score=100 if any(h in host for h in GOOD) else 80
            if key(m['brand']) in key(host):score+=10
            if 'review' in u:score+=3
            if any(t==f or t==f+'review' for f in matched):score+=5
            source=host.removeprefix('www.')
            cs.append({'source':source,'title':e['title'],'page_url':u,'kind':'article','score':score,'discovery_note':'Model-by-model web tool discovery; original result retained in hp-web-search files. Exact source model and photo require manual review.'})
        cs.sort(key=lambda c:-c['score'])
        distinct=[];seen=set()
        for c in cs:
            host=urllib.parse.urlsplit(c['page_url']).netloc
            if host in seen:continue
            seen.add(host);distinct.append(c)
        out.append({**m,'choices':distinct[:4]})
    write_new(WORK/'hp-photo12-leads.json',out)
    write_new(WORK/'hp-web-discovery-audit.json',{'queried_models':len(queried),'unique_source_urls':len(entries),'remaining_targets':len(out),'targets_with_new_exact_leads':sum(bool(m['choices']) for m in out),'no_exact_lead':[m['slug'] for m in out if not m['choices']]})
    print({'queried_models':len(queried),'unique_source_urls':len(entries),'new_targets':sum(bool(m['choices']) for m in out),'pages':sum(len(m['choices']) for m in out)},flush=True)

if __name__=='__main__':main()
