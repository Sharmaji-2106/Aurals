"""Fallback exact-source pages plus broader review leads for remaining models."""
import json
import re
import urllib.parse
from collections import defaultdict
from hp_common import ROOT, WORK, write_new
from hp_photos import PRIORITY

def key(s):
    return re.sub('[^a-z0-9]','',s.casefold().replace('ω','ohm').replace('ohms','ohm').replace('&','and').replace('+','plus'))

ALIASES={'Logitech':['Logicool'],'Bowers & Wilkins':['Bowers Wilkins'],'Bang & Olufsen':['Bang Olufsen'],'ASTRO Gaming':['Astro'],'Final Audio':['Final','Final Audio Design'],'HIFIMAN':['Hifiman'],'Dan Clark Audio':['Dan Clark','MrSpeakers'],'PSB':['PSB Speakers'],'Beyerdynamic':['Beyer'],'Simgot Audio':['Simgot']}

def main():
    ms=json.loads((WORK/'hp-photo-targets.json').read_text(encoding='utf-8'))
    covered={r['slug'] for f in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,f.read_text(encoding='utf-8').splitlines())}
    previous={m['slug']:m for m in json.loads((WORK/'hp-photo03-leads.json').read_text(encoding='utf-8'))}
    tried=defaultdict(set)
    for f in WORK.glob('*-candidates.json'):
        for r in json.loads(f.read_text(encoding='utf-8')):tried[r['slug']].add(r.get('page_url'))
    rejected={}
    for f in WORK.glob('*-decisions.json'):
        for slug,d in json.loads(f.read_text(encoding='utf-8')).items():
            if not d.get('candidate'):rejected[slug]=d['note']
    entries=[]
    for path in (ROOT/'data/iem/images/phase3/reviews').glob('*.json'):
        data=json.loads(path.read_text(encoding='utf-8'))
        for e in data.get('entries',[]):
            tail=urllib.parse.unquote(urllib.parse.urlsplit(e['page_url']).path).strip('/').split('/')[-1]
            entries.append((e,tail,key(tail)))
    out=[]
    for m in sorted(ms,key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug'])):
        if m['slug'] in covered:continue
        choices=[c for c in previous[m['slug']]['choices'] if c['page_url'] not in tried[m['slug']]]
        if re.search(r'badge|thumbnail|too small',rejected.get(m['slug'],''),re.I):
            choices.extend({**c,'frame_offset':1} for c in previous[m['slug']]['choices'] if c['kind']=='article' and c['page_url'] in tried[m['slug']])
        forms={key(b+' '+m['model']) for b in [m['brand']]+ALIASES.get(m['brand'],[])}
        for e,path,k in entries:
            if e['page_url'] in tried[m['slug']]:continue
            for full in forms:
                if full not in k:continue
                pre,tail=k.split(full,1)
                if re.match(r'^(?:[0-9]|ii|iii|iv|mk|pro|plus|ultra|se(?:review|edition)|xreview|sreview)',tail):continue
                if any(t in path for t in ('earpad','headband','replacement','cable-only')):continue
                choices.append({**e,'title':path.replace('-',' '),'kind':'article','score':60,'discovery_note':'Broader review/comparison lead; photograph identity requires explicit visual review.'})
                break
        unique={}
        for c in choices:unique.setdefault(c['page_url'],c)
        out.append({**m,'choices':list(unique.values())[:6]})
    write_new(WORK/'hp-photo04-leads.json',out)
    print({'remaining_models':len(out),'with_fallback':sum(bool(m['choices']) for m in out)},flush=True)

if __name__=='__main__':main()
