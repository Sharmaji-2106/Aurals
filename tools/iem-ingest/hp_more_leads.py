"""Additional exact-model leads: impedance symbols, retailer brands, review aliases."""
import json
import re
import urllib.parse
from hp_common import ROOT, WORK, write_new
from hp_photos import PRIORITY

def key(s):
    s=s.casefold().replace('ω','ohm').replace('ohms','ohm').replace('&','and').replace('+','plus')
    return re.sub('[^a-z0-9]','',s)

aliases={'Logitech':['Logicool'],'Bowers & Wilkins':['Bowers Wilkins'],'Bang & Olufsen':['Bang Olufsen'],'ASTRO Gaming':['Astro'],'Final Audio':['Final','Final Audio Design'],'HIFIMAN':['Hifiman'],'Dan Clark Audio':['Dan Clark','MrSpeakers'],'Audioquest':['AudioQuest'],'PSB':['PSB Speakers'],'Beyerdynamic':['Beyer'],'Simgot Audio':['Simgot']}
ms=json.loads((WORK/'hp-photo-targets.json').read_text(encoding='utf-8'))
old={m['slug']:m for m in json.loads((WORK/'hp-photo02-leads.json').read_text(encoding='utf-8'))}
ps=json.loads((ROOT/'data/iem/images/phase3/eearphone-products.json').read_text(encoding='utf-8'))
products=[(p,key(p['title']),key(p.get('vendor') or '')) for p in ps if p.get('images')]
entries=[]
for path in (ROOT/'data/iem/images/phase3/reviews').glob('*.json'):
    value=json.loads(path.read_text(encoding='utf-8'))
    for e in value.get('entries',[]):
        tail=urllib.parse.unquote(urllib.parse.urlsplit(e['page_url']).path).strip('/').split('/')[-1]
        entries.append((e,tail,key(tail)))
out=[]
for m in sorted(ms,key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug'])):
    brands=[m['brand']]+aliases.get(m['brand'],[])
    bkeys=[key(b) for b in brands]
    model=key(m['model']);choices=[]
    for p,title,vendor in products:
        if not any(b in vendor or b in title for b in bkeys):continue
        if model not in title:continue
        pre,tail=title.split(model,1)
        if pre not in ['','used','new','iem']+bkeys:continue
        if re.match(r'^(?:[0-9]|v[0-9]|m[0-9]|ii|iii|iv|mk|pro|plus|ultra|x|dsp|se(?:[^a-z]|$)|s(?:[^a-z]|$)|c(?:[^a-z]|$))',tail):continue
        if re.search(r'earpads?|replacement|cableonly|caseonly',title,re.I):continue
        choices.append({'source':'e-earphone','title':p['title']+' [vendor: '+str(p.get('vendor'))+']','page_url':'https://www.e-earphone.jp/products/'+p['handle'],'kind':'feed','score':110,'images':[i['src'] for i in p['images'][:3]]})
    for e,path,k in entries:
        alternatives={key(b+' '+m['model']) for b in brands}
        for full in alternatives:
            if full not in k:continue
            pre,tail=k.split(full,1)
            if pre not in ('','review','the','reviewthe','reviewof','reviewofthe'):continue
            if tail and not tail.startswith(('review','headphone','wireless','overear','onear','noise','closed','open','is','audiophile')):continue
            if any(t in tail for t in ('versus','comparison','vs','mkii','mkiii','2review')):continue
            choices.append({**e,'title':path.replace('-',' '),'kind':'article','score':100})
            break
    previous={c['page_url'] for c in old[m['slug']]['choices']}
    novel=[c for c in choices if c['page_url'] not in previous]
    # Keep new sources ahead of previously attempted ones; fallback pages from photo02 remain.
    merged=novel+old[m['slug']]['choices']
    unique={}
    for c in merged:unique.setdefault(c['page_url'],c)
    out.append({**m,'priority':bool(PRIORITY.search(m['brand']+' '+m['model'])),'choices':list(unique.values())[:8],'new_leads':len(novel)})
write_new(WORK/'hp-photo03-leads.json',out)
print({'models':len(out),'with_lead':sum(bool(m['choices']) for m in out),'newly_found_models':sum(bool(m['choices']) and not old[m['slug']]['choices'] for m in out),'models_new_options':sum(bool(m['new_leads']) for m in out)},flush=True)
