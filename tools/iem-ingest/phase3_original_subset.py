"""Read the pre-Phase-3 dump to distinguish concurrent additions from changes.

pg_restore writes a read-only SQL artifact; it does NOT connect to a database.
Only original public catalogue IDs are selected for preservation fingerprints.
"""
import hashlib
import json
import re
import subprocess
import uuid

from sqlalchemy import bindparam,text
from auralis.db import new_session
from phase3_db import ROOT,WORK,write_new

dump=next((ROOT/'data/iem/backups').glob('catalogue-before-phase3-*.dump'))
sql=WORK/'baseline-catalogue-data-readonly.sql'
if not sql.exists():
    subprocess.run([str(ROOT/'.devtools/pg/Library/bin/pg_restore.exe'),'--data-only','--file',str(sql),str(dump)],check=True,capture_output=True)
ids={}
table=None
with sql.open(encoding='utf-8') as f:
    for line in f:
        match=re.match(r'COPY public\.(\w+) \((.+)\) FROM stdin;',line)
        if match:
            table=match[1];columns=match[2].split(', ')
            idcol=columns.index('id')
            ids[table]=[]
        elif line.rstrip()=='\\.':table=None
        elif table:ids[table].append(line.rstrip('\n').split('\t')[idcol])
write_new(WORK/'baseline-table-ids.json',ids)
before=json.loads((WORK/'baseline.json').read_text(encoding='utf-8'))['fingerprints']
checks={}
with new_session() as s:
    for table in ('fr_measurements','iem_acoustic_profiles','fr_targets','iem_price_observations'):
        query=text(f'SELECT row_to_json(t)::text FROM {table} t WHERE id IN :ids ORDER BY id').bindparams(bindparam('ids',expanding=True))
        rows=s.execute(query,{'ids':[uuid.UUID(i) for i in ids[table]]}).scalars().all()
        actual={'count':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
        checks[table]={'original_subset':actual,'before':before[table],'passed':actual==before[table],
                       'current_count':s.scalar(text(f'SELECT count(*) FROM {table}'))}
    query=text('SELECT id,brand,model,slug FROM iems WHERE id IN :ids ORDER BY id').bindparams(bindparam('ids',expanding=True))
    identities=s.execute(query,{'ids':[uuid.UUID(i) for i in ids['iems']]}).all()
    actual=hashlib.sha256(json.dumps([list(r) for r in identities],default=str).encode()).hexdigest()
    checks['identities']={'original_count':len(identities),'current_count':s.scalar(text('SELECT count(*) FROM iems')),
                          'sha256':actual,'passed':actual==before['identities']}
write_new(WORK/'original-subset-audit.json',checks)
print({k:{'passed':v['passed'],'current_count':v['current_count']} for k,v in checks.items()})
if not all(v['passed'] for v in checks.values()):raise SystemExit('Original catalogue subset changed; inspect audit before reporting')
