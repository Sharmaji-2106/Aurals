"""Sequential source batches; each has its own backup and full ranking comparison."""
import json
import subprocess
import sys
from hp_common import ROOT, RAW, WORK, append_report

sources=json.loads((RAW/'hp-source-inventory.json').read_text(encoding='utf-8'))
for source in sources:
    if (WORK/(source['batch']+'-comparison.json')).exists():
        continue
    if not source['measurements']:
        append_report(f'\n## Batch {source["batch"]}\n\nNo import: {source["rejected"]} indexed headphone names have no raw numeric CSV in the pin. No EQ or plot inference, no DB write; ranking unchanged. See `data/iem/raw/hp-phase4/{source["batch"]}-rejections.json`.\n')
        continue
    subprocess.run([sys.executable,str(ROOT/'tools/iem-ingest/hp_db.py'),'import',source['batch']],cwd=ROOT/'backend',check=True)
subprocess.run([sys.executable,str(ROOT/'tools/iem-ingest/hp_db.py'),'catalogue'],cwd=ROOT/'backend',check=True)
