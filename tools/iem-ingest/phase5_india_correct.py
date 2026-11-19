"""Correct only two observations created by this phase; preserve all rows."""
import csv,json
from sqlalchemy import select
from auralis.db import new_session
from auralis.iem.models import Iem,IemPriceObservation
from phase5_india import WORK,save,writecsv,append_report

with new_session() as s:
    bad=s.scalar(select(IemPriceObservation).where(IemPriceObservation.id=='7ebcd0b2-e061-4295-a89b-b26fd876510a'))
    used=s.scalar(select(IemPriceObservation).where(IemPriceObservation.id=='6d9a3dcb-2e60-452b-9069-ac51569e95bd'))
    original_ids={r['id'] for r in json.loads((WORK/'prices-baseline.json').read_text(encoding='utf-8'))}
    assert str(bad.id) not in original_ids and str(used.id) not in original_ids
    target=s.scalar(select(Iem).where(Iem.brand=='Tin HiFi',Iem.model=='T2 Plus'))
    before=[{'id':str(r.id),'iem_id':str(r.iem_id),'source':r.source,'source_url':r.source_url,'amount':str(r.amount)} for r in [bad,used]]
    save(WORK/'corrections-before.json',before)
    bad.iem_id=target.id
    used.source='HiFiNage (pre-owned; full box and accessories)'
    s.commit()
rows=list(csv.DictReader((WORK/'offers-hifinage.csv').open(encoding='utf-8')))
for r in rows:
    if r['model']=='T2':
        r.update(model=target.model,slug=target.slug,note='Corrected from T2 to exact T2 Plus. Duplicate retained to preserve no-deletion rule; not an additional independent offer.')
    if r['model']=='DM6':
        r.update(price_source=used.source,note='Pre-owned, full box and accessories; not a new unit. Condition explicitly stated by retailer.')
writecsv(WORK/'offers-hifinage.csv',rows)
append_report('\n### HiFiNage follow-up correction\n\n'
 'One new T2 observation was assigned to the sibling T2 Plus in error. Corrected its `iem_id` to the actual measured T2 Plus; '
 'the duplicate is retained under the no-deletion rule. The DM6 observation is explicitly labelled pre-owned in `source`. '
 'Only these phase-created price rows changed; baseline observations remain untouched. '
 'Corrected import manifest is `offers-hifinage.csv`; prior versions and row details are backed up in this task directory. '
 'Tightened Plus/edition and condition guards prevent further imports of these candidates.\n')
print({'corrected_model':str(bad.id),'condition_labelled':str(used.id),'rows_deleted':0})
