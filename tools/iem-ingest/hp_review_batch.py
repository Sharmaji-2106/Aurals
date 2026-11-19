"""Record explicit, manually reviewed contact-sheet tiles; no automatic approvals."""
import argparse
import json
from collections import defaultdict
from hp_common import WORK, write_new

def main():
    p=argparse.ArgumentParser()
    p.add_argument('batch')
    p.add_argument('--tiles',required=True,help='One-based tile numbers explicitly approved after viewing sheets')
    p.add_argument('--notes',help='Optional JSON mapping of rejected slug to precise reason')
    a=p.parse_args()
    rows=json.loads((WORK/f'{a.batch}-candidates.json').read_text(encoding='utf-8'))
    images=[r for r in rows if 'file' in r]
    numbers=[int(n) for n in a.tiles.split(',') if n]
    selected={images[n-1]['slug']:(n,images[n-1]) for n in numbers}
    assert len(selected)==len(numbers),'Multiple primary choices for one identity'
    notes=json.loads((WORK/a.notes).read_text(encoding='utf-8')) if a.notes else {}
    grouped=defaultdict(list)
    for r in rows:grouped[r['slug']].append(r)
    decisions={}
    for slug, candidates in grouped.items():
        if slug in selected:
            n,r=selected[slug]
            decisions[slug]={'slug':slug,'candidate':r['id'],'note':f'Manual visual check of {a.batch} contact sheets, tile {n}: exact product, generation and source identity agree; retained original photograph.'}
        else:
            titles=list(dict.fromkeys(r.get('page_title',r.get('title','')) for r in candidates if 'file' in r))
            errors=list(dict.fromkeys(r['error'] for r in candidates if r.get('error')))
            reason=notes.get(slug)
            if not reason:
                reason=('No physical photograph acquired: '+' | '.join(errors)) if not titles else ('Manual review did not establish an exact-model physical headphone photo; observed source identities/frames: '+' | '.join(titles))
            decisions[slug]={'slug':slug,'candidate':None,'note':reason}
    write_new(WORK/f'{a.batch}-decisions.json',decisions)
    print({'batch':a.batch,'approved':len(selected),'rejected':len(decisions)-len(selected)})

if __name__=='__main__':main()
