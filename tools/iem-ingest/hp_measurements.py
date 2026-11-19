"""Normalize all documented headphone directories from the existing AutoEq pin.

Run using backend's Python. Raw numeric CSVs are preserved without EQ/plot inference.
Marketed editions and impedance ratings remain identities; measured operating
conditions and pad changes are variants. Missing source metadata is disclosed.
"""
import csv
import json
import re
import urllib.parse
from collections import Counter, defaultdict
from datetime import UTC, datetime

from auralis.acoustics.fr import validate_points
from hp_common import CHECKOUT, PIN, RAW, WORK, jsonl, write_new
from phase2b_bulk_superreview import identity, slug

PRIORITY = ['oratory1990', 'Rtings', 'Innerfidelity', 'Headphone.com Legacy', 'Super Review']
RIGS = {
    'GRAS 43AG': 'gras-43ag', 'GRAS 43AG-7': 'gras-43ag-7',
    'GRAS 45BC-10': 'gras-45bc-10', 'GRAS 45BC': 'gras-45bc',
    'GRAS 43AC': 'gras-43ac', 'GRAS RA0045': 'gras-ra0045',
    'HMS II.3': 'hms-ii-3', 'Bruel & Kjaer 5128': 'bk-5128',
    'KB501x + 711': 'kb501x-711', 'KB006x + 711': 'kb006x-711',
    'KB500x + 711': 'kb500x-711', '711': '711', 'EARS + 711': 'ears-711',
}
CONDITION = re.compile(r'\b(anc|a[n ]?nc|noise cancel|passive|active|powered|power on|power off|wired|wireless|bluetooth|usb|analog|analogue|eq|equaliz|preset|bass boost|bass slider|bass setting|bass switch|bass port|filters?|pads?|earpads?|ear pads?|sample|unit|serial|s\/n|s.n.|sn |averag|left|right|mode|on|off|position|perforated|fenestrated|velours?|leather|pleather|balanced cable|single ended|foam|damping|modded|modification|stock|seal|glasses|fresh|worn|new cushions|old cushions|dekoni|brainwavz|yaxi|no eq|with |without |volume|vrm|personal|calibrat|connection|firmware|tape|cotton|tissue)\b', re.I)
ON_EAR = re.compile(r'^(?:Koss (?:Porta Pro|Sporta Pro|KPH|KSC|KTX|UR10)|Grado |Alessandro |Sennheiser (?:HD 2[0-9](?:\b|[- ])|PX |PX[0-9]|HD 100\b)|AKG (?:K4[0-9][0-9]|K 4[0-9][0-9]|Y[345]0)|Sony (?:WH-CH[45]|WH-H800|MDR-ZX[136]|MDR-XB[23456]|MDR-V150)|Marshall Major|JBL (?:Tune [456]|Live [345])|Beats (?:Solo|EP\b)|Bose (?:SoundLink On-Ear|SoundTrue On-Ear|On-Ear)|Audio-Technica ATH-(?:ES|EW|ON)|Beyerdynamic DT (?:1350|TX))', re.I)

def product_name(name):
    variants = []
    def replace(m):
        s = m.group(1)
        # Impedance, model years, edition names and generations are product identities.
        if CONDITION.search(s) and not re.fullmatch(r'\d+\s*(?:ohm|Ω)', s, re.I):
            variants.append(s)
            return ''
        return m.group(0)
    base = re.sub(r'\(([^()]*)\)', replace, name)
    return re.sub(r'\s+', ' ', base).strip(), '; '.join(variants) or None

def main():
    known = {r['slug']:r for r in json.loads((WORK/'hp-baseline.json').read_text())['models']}
    manufacturers = []
    for line in (CHECKOUT/'dbtools/manufacturers.tsv').read_text(encoding='utf-8-sig').splitlines():
        cells = line.split('\t')
        if cells and cells[0]:
            manufacturers.extend((alias, cells[0]) for alias in cells if alias)
    manufacturers.sort(key=lambda p: -len(p[0]))
    def split(name):
        for alias, canonical in manufacturers:
            if name.casefold().startswith(alias.casefold()+' '):
                brand, model = canonical, name[len(alias)+1:]
                old = known.get(slug(brand,model))
                return (old['brand'],old['model']) if old else (brand,model)
        return identity(name, known)
    dirs = sorted((CHECKOUT/'measurements').iterdir(), key=lambda d:(PRIORITY.index(d.name) if d.name in PRIORITY else 99,d.name))
    audit = []
    for d in dirs:
        files = list((d/'data/over-ear').rglob('*.csv')) + list((d/'data/on-ear').rglob('*.csv'))
        if not files and not (d/'name_index.tsv').exists(): continue
        index = list(csv.DictReader((d/'name_index.tsv').open(encoding='utf-8-sig'), delimiter='\t')) if (d/'name_index.tsv').exists() else []
        groups = defaultdict(list)
        for r in index:
            if r['form'] in ('over-ear','on-ear') and r['name']: groups[r['name']].append(r)
        rows, skipped = [], []
        for file in sorted(files):
            name = file.stem
            metadata = next((v for k,v in groups.items() if k.casefold()==name.casefold()), [])
            if d.name in ('Innerfidelity','Headphone.com Legacy'):
                rigs, graph_urls = ['HMS II.3'], []
            else:
                # RTINGS stores each rig in its own folder, not an average across rigs.
                metadata = [r for r in metadata if file.parent.name not in RIGS or r['rig'].strip() == file.parent.name]
                rigs = sorted({r['rig'].strip() for r in metadata})
                graph_urls = sorted({r['url'] for r in metadata if r.get('url')})
            reason = None
            if len(rigs) != 1 or rigs[0] not in RIGS:
                reason = 'Undocumented/ambiguous rig: '+repr(rigs)
            try:
                points = [[float(r[0]),float(r[1])] for r in csv.reader(file.open(encoding='utf-8-sig')) if len(r)>1 and r[0] != 'frequency']
                validate_points(points)
            except (ValueError, OSError) as exc:
                reason = 'Invalid numeric CSV; no repair: '+str(exc)
            base, variant = product_name(name)
            brand, model = split(base)
            if not brand or not model: reason = 'Unresolved identity'
            if reason:
                skipped.append({'name':name,'path':file.relative_to(CHECKOUT).as_posix(),'reason':reason})
                continue
            relative = file.relative_to(CHECKOUT).as_posix()
            rig = rigs[0]
            form = 'on-ear' if '/on-ear/' in relative or ON_EAR.search(base) else 'over-ear'
            notes = f'AutoEq normalized label: {name}. '
            if graph_urls:
                notes += 'Original graph URL(s): ' + ' | '.join(graph_urls) + '. '
            else:
                notes += f'Original graph URL unavailable in pin. Rig documented in dbtools/{"innerfidelity" if d.name=="Innerfidelity" else "headphonecom"}_crawler.py; original graph processing discontinued upstream. '
            notes += 'Upstream form over-ear includes supra-aural models; known on-ear families classified explicitly. All headphone families are excluded from in-ear ranking.'
            rows.append({'brand':brand,'model':model,'source':d.name+' (via AutoEq)',
                'source_url':'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/'+PIN+'/'+urllib.parse.quote(relative),
                'rig':rig,'rig_family':'headphone:'+RIGS[rig],'form':form,'variant':variant,
                'source_ref':f'AutoEq@{PIN}:{relative}', 'retrieved_at':datetime.now(UTC).isoformat(),
                'license':f'{d.name} measurements redistributed by AutoEq; underlying numerical reuse rights unconfirmed.',
                'notes':notes,'points':points})
        # Index entries without numeric curves, especially crinacle, are never synthesized.
        available = {f.stem.casefold() for f in files}
        skipped.extend({'name':name,'reason':'No raw numeric headphone CSV in pinned source; no curve inferred from EQ or graph.'} for name in groups if name.casefold() not in available)
        if not rows and not skipped: continue
        key = re.sub('[^a-z0-9]+','-',d.name.lower()).strip('-')
        jsonl(RAW/f'hp-{key}-measurements.jsonl', rows)
        write_new(RAW/f'hp-{key}-rejections.json', skipped)
        audit.append({'source':d.name,'batch':'hp-'+key,'measurements':len(rows),'identities':len({slug(r['brand'],r['model']) for r in rows}), 'rig_families':dict(Counter(r['rig_family'] for r in rows)), 'forms':dict(Counter(r['form'] for r in rows)), 'rejected':len(skipped)})
    write_new(RAW/'hp-source-inventory.json', audit)
    print(json.dumps(audit, indent=2))

if __name__ == '__main__': main()
