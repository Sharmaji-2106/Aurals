"""Combine feed and review discoveries, prioritizing requested makers locally."""
import json
from phase3_images import WORK, models, write_new

BRANDS=['Moondrop','Truthear','Tanchjim','7Hz','KZ','CCA','Simgot','Kiwi Ears','Letshuoer','Shuoer','Dunu','FiiO','Thieaudio','Sennheiser','Shure','Sony','Apple','Samsung','Etymotic','Final Audio']

review={r['slug']:r for r in json.loads((WORK/'catalogue-reviews-leads.json').read_text(encoding='utf-8'))}
feeds={r['slug']:r for r in json.loads((WORK/'catalogue-feeds-leads.json').read_text(encoding='utf-8'))}
out=[]
for m in models('all'):
    if m['ranked']:continue
    f=[c for c in feeds.get(m['slug'],{}).get('choices',[]) if c['kind']=='feed']
    r=review.get(m['slug'],{}).get('choices',[])
    # Exact retailer titles first; otherwise photographs from a dedicated review.
    choices=[c for c in f if c['score']>=100]+r+[c for c in f if c['score']<100]
    unique=[]
    for c in choices:
        if not any(x['page_url']==c['page_url'] for x in unique):unique.append(c)
    if unique:out.append({**m,'choices':unique[:4]})
out.sort(key=lambda m:(BRANDS.index(m['brand']) if m['brand'] in BRANDS else 999,m['brand'].lower(),m['model'].lower()))
write_new(WORK/'bulk-plan.json',out)
for n,start in enumerate(range(0,len(out),120),1):
    write_new(WORK/f'bulk{n:02}-leads.json',out[start:start+120])
print({'unranked_with_leads':len(out),'batches':(len(out)+119)//120})
