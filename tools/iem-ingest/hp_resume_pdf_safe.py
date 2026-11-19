"""Resume PDF extraction in separate processes, checkpointed with 30-second limits."""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from hp_common import ROOT, WORK, write_new, append_report

if (WORK/'hp-photo17-0000-candidates.json').exists():
    print({'pdf_candidates':'already completed; retained without overwrite'})
    sys.exit(0)

jobs=[(m,n,c) for m in json.loads((WORK/'hp-photo17-leads.json').read_text(encoding='utf-8')) for n,c in enumerate(m['choices'],1)]
def one(index):
    path=WORK/f'hp-photo17-extract-{index:03}.json'
    if path.exists():return json.loads(path.read_text(encoding='utf-8'))
    m,n,c=jobs[index]
    try:
        p=subprocess.run([sys.executable,str(ROOT/'tools/iem-ingest/hp_pdf_worker.py'),str(index)],cwd=ROOT,capture_output=True,text=True,timeout=30)
        if p.returncode:raise RuntimeError(p.stderr[-500:])
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception as e:
        rows=[{'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':'Isolated PDF extraction unavailable: '+str(e)}]
        write_new(path,rows);return rows

rows=[]
with ThreadPoolExecutor(max_workers=6) as pool:
    for n,f in enumerate(as_completed([pool.submit(one,i) for i in range(len(jobs))]),1):
        rows.extend(f.result())
        if n%20==0:print({'pdf_documents_completed':n,'raster_candidates':sum('file'in r for r in rows)},flush=True)
rows.sort(key=lambda r:(r['slug'],r.get('id','')))
write_new(WORK/'hp-photo17-0000-candidates.json',rows)
append_report('\nPDF acquisition used isolated processes with 30-second per-document limits and individual checkpoint ledgers `hp-photo17-extract-*.json`; all source bytes and extracted objects were retained.\n')
print({'pdf_documents':len(jobs),'raster_objects':sum('file'in r for r in rows),'errors':sum('error'in r for r in rows)},flush=True)
