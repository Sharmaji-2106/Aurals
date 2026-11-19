"""Second-pass individual searches for models with no exact grouped-search lead."""
import json
import re
import urllib.parse
from hp_common import WORK, write_new
from hp_photos import PRIORITY
from hp_fallback_photos import key
from hp_resume_web_leads import EXCLUDE, BAD, GOOD

out=[]
for p in WORK.glob('hp-web-single-*.json'):
    v=json.loads(p.read_text(encoding='utf-8'));m=v['models'][0]
    aliases=json.loads((WORK/'hp-pinned-photo-aliases.json').read_text(encoding='utf-8')).get(m['slug'],[])
    fs={f for f in aliases if f}|{key(m['brand']+' '+m['model'])}
    cs=[]
    for e in v['entries']:
        u=e['url'];host=urllib.parse.urlsplit(u).netloc
        if EXCLUDE.search(host) or BAD.search(e['title']) or re.search(r'\.(pdf|csv|txt|zip)(?:\?|$)',u):continue
        keys=[key(e['title']),key(urllib.parse.unquote(urllib.parse.urlsplit(u).path))]
        matched=False
        for f in fs:
            for k in keys:
                if f not in k:continue
                tail=k.split(f,1)[1]
                if re.match(r'^(?:[0-9]|ii|iii|iv|mk|pro|plus|ultra|wireless|bt|anc|nano|stealth|remaster|classic|limited|edition)',tail):continue
                matched=True
        if not matched:continue
        score=(100 if any(h in host for h in GOOD) else 80)+(10 if key(m['brand']) in key(host) else 0)
        cs.append({'source':host.removeprefix('www.'),'title':e['title'],'page_url':u,'kind':'article','score':score,'discovery_note':'Individual model search; result retained in '+p.name+'; exact model still requires visual review.'})
    cs.sort(key=lambda c:-c['score']);seen=set();distinct=[]
    for c in cs:
        host=urllib.parse.urlsplit(c['page_url']).netloc
        if host in seen:continue
        seen.add(host);distinct.append(c)
    out.append({**m,'choices':distinct[:4]})
out.sort(key=lambda m:(not bool(PRIORITY.search(m['brand']+' '+m['model'])),m['slug']))
write_new(WORK/'hp-photo13-leads.json',out)
print({'individual_search_targets':len(out),'with_new_leads':sum(bool(m['choices']) for m in out),'pages':sum(len(m['choices']) for m in out)},flush=True)
