"""Public review sitemap discovery: bulk exact-identity candidates, never approvals."""
import json
import re
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from phase3_images import WORK, ROOT, fetch, write_new, compact, keys, models

SITES = {
    'Audioreviews': 'https://www.audioreviews.org/sitemap_index.xml',
    'Audiofool': 'https://audiofool.reviews/sitemap.xml',
    'Audiophile Heaven': 'https://www.audiophile-heaven.com/sitemap_index.xml',
    'Prime Audio': 'https://primeaudio.org/sitemap_index.xml',
    'Headfonics': 'https://headfonics.com/sitemap_index.xml',
    'Headfonia': 'https://www.headfonia.com/sitemap_index.xml',
    'The Phonograph': 'https://www.thephonograph.net/sitemap_index.xml',
    'SoundGuys': 'https://www.soundguys.com/sitemap_index.xml',
    'The Headphone List': 'https://theheadphonelist.com/sitemap_index.xml',
}


def inventory():
    def one(pair):
        source, initial = pair
        pending, seen, entries, errors = [initial], set(), [], []
        while pending and len(seen) < 35:
            url = pending.pop(0)
            if url in seen: continue
            seen.add(url)
            try:
                root = ET.fromstring(fetch(url))
                if root.tag.endswith('sitemapindex'):
                    for e in root:
                        loc = e.find('{*}loc')
                        if loc is not None and re.search(r'(post|sitemap\.xml|sitemap-\d)',loc.text or ''):
                            if not any(t in loc.text for t in ('category','tag','author','video','news','image')):
                                pending.append(loc.text)
                else:
                    for entry in root:
                        loc = entry.find('{*}loc')
                        if loc is None: continue
                        pictures = []
                        for e in entry.findall('{*}image'):
                            iloc = e.find('{*}loc')
                            if iloc is not None and iloc.text: pictures.append(iloc.text)
                        entries.append({'source': source, 'page_url': loc.text, 'images': pictures})
            except Exception as e: errors.append({'url':url,'error':str(e)})
        write_new(WORK/'reviews'/(compact(source)+'.json'),{'source':source,'entries':entries,'errors':errors})
        return {'source':source,'pages':len(entries),'sitemaps':len(seen),'errors':len(errors)}
    with ThreadPoolExecutor(max_workers=5) as p: results=list(p.map(one,SITES.items()))
    write_new(WORK/'review-results.json',results)
    print(results,flush=True)


def match(batch,scope,relaxed=False):
    entries=[e for p in (WORK/'reviews').glob('*.json') for e in json.loads(p.read_text(encoding='utf-8'))['entries']]
    indexed=[]
    for e in entries:
        path=urllib.parse.unquote(urllib.parse.urlsplit(e['page_url']).path).strip('/').split('/')[-1]
        if e['source']=='AudioBudget': path=' '.join(urllib.parse.urlsplit(e['page_url']).path.strip('/').split('/')[-2:])
        indexed.append((e,path,keys(path)))
    leads=[]
    for m in models(scope):
        full=keys(m['brand']+' '+m['model'])
        alternatives={full}
        if m['brand']=='Final Audio': alternatives.add(compact('final '+m['model']))
        if m['brand']=='Shuoer': alternatives.add(compact('shuoer '+m['model']))
        if m['brand']=='Simgot' and m['model'].lower().startswith('audio '): alternatives.add(compact('Simgot '+m['model'][6:]))
        if m['brand']=='Tin HiFi': alternatives.add(compact('Tin Audio '+m['model']))
        if relaxed:
            aliases={'Campfire Audio':['Campfire'], 'Final Audio':['Final Audio Design','Final'],
                     'Tin HiFi':['Tin Audio','Linsoul Tin HiFi'], 'NS Audio':['NS Audio','NSAudio'],
                     'Hifiman':['HiFiMan'], 'Periodic Audio':['Periodic']}
            for alias in aliases.get(m['brand'],[]): alternatives.add(keys(alias+' '+m['model']))
        choices=[]
        for e,path,k in indexed:
            for identity in alternatives:
                if identity not in k: continue
                pre,tail=k.split(identity,1)
                if not relaxed and pre not in ('','review','the','reviewthe','reviewof','reviewofthe'): continue
                if relaxed and re.match(r'^(?:[0-9]|ii|iii|iv|pro|plus|se(?:review|edition)|dsp|xreview|sreview|mkii|mk2)',tail): continue
                if not relaxed and tail and not tail.startswith(('review','earphone','iem','headphone','in','is','an','a','the','wireless','truly','tws','news','unboxing')): continue
                # Avoid separate generations/revisions/editions and comparisons.
                if any(t in tail for t in ('versus','comparison','vs','mkii','mkiii')): continue
                choices.append({**e,'title':path.replace('-',' '),'kind':'article','score':100 if tail in ('','review') else 85})
                break
        choices.sort(key=lambda c:(-c['score'],c['source']))
        # Review distinct sites first; preserve additional choices for fallbacks.
        unique=[]
        for c in choices:
            if not any(x['source']==c['source'] for x in unique): unique.append(c)
        leads.append({**m,'choices':unique[:5]})
    write_new(WORK/f'{batch}-leads.json',leads)
    with (WORK/f'{batch}-titles.txt').open('x',encoding='utf-8') as f:
        for m in leads: f.write(m['slug']+': '+' | '.join(c['source']+': '+c['title'] for c in m['choices'][:3])+'\n')
    print({'models':len(leads),'with_review_lead':sum(bool(m['choices']) for m in leads)},flush=True)


if __name__=='__main__':
    import sys
    if sys.argv[1]=='inventory':inventory()
    else:match(sys.argv[2],sys.argv[3] if len(sys.argv)>3 else 'ranked','--relaxed' in sys.argv)
