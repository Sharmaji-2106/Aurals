"""Manufacturer archives and exact manually found review pages for unresolved models."""
import json
from hp_common import WORK, write_new
from hp_photos import PRIORITY

ms=json.loads((WORK/'hp-photo-targets.json').read_text(encoding='utf-8'))
covered={r['slug'] for f in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,f.read_text(encoding='utf-8').splitlines())}
seeds={
    'koss-kph30i':[('Koss','https://koss.com/products/kph30i'),('iLounge','https://www.ilounge.com/index.php/reviews/entry/koss-kph30i-on-ear-headphones')],
    'sennheiser-hd-600':[('SoundGuys','https://www.soundguys.com/sennheiser-hd-600-review-86269/'),('Audioholics','https://www.audioholics.com/headphone-reviews/sennheiser-hd-600-headphone-review')],
    'bose-quietcomfort-ultra':[('SoundGuys','https://www.soundguys.com/bose-quietcomfort-ultra-headphones-review-103901/')],
}
out=[]
for m in sorted(ms,key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug'])):
    if m['slug'] in covered:continue
    choices=[{'source':source,'page_url':url,'title':m['brand']+' '+m['model'],'kind':'article','score':100} for source,url in seeds.get(m['slug'],[])]
    if m['brand']=='Sony' and m['model'].startswith(('MDR-','WH-')) and '(' not in m['model']:
        choices.append({'source':'Sony Japan','page_url':'https://www.sony.jp/headphone/products/'+m['model']+'/','title':m['brand']+' '+m['model'],'kind':'article','score':100,'discovery_note':'Manufacturer URL pattern; model title and photograph must be confirmed.'})
    if m['brand']=='Audio-Technica' and m['model'].startswith('ATH-') and '(' not in m['model']:
        choices.append({'source':'Audio-Technica Japan','page_url':'https://www.audio-technica.co.jp/product/'+m['model'],'title':m['brand']+' '+m['model'],'kind':'article','score':100,'discovery_note':'Manufacturer archive URL pattern; model title and photograph must be confirmed.'})
    if m['brand']=='Koss' and '(' not in m['model']:
        handle=m['model'].lower().replace(' ','-')
        choices.append({'source':'Koss','page_url':'https://koss.com/products/'+handle,'title':m['brand']+' '+m['model'],'kind':'article','score':100,'discovery_note':'Official product URL pattern; title and photograph require confirmation.'})
    if choices:out.append({**m,'choices':choices})
write_new(WORK/'hp-photo05-leads.json',out)
print({'manufacturer_and_seed_targets':len(out)})
