"""Stage only explicitly reviewed PDF photographs with exact extraction provenance."""
import hashlib
import json
import sys
from pathlib import Path
from hp_common import ROOT, WORK, jsonl

batch=sys.argv[1] if len(sys.argv)>1 else 'hp-photo17-0000'
decisions=json.loads((WORK/f'{batch}-decisions.json').read_text(encoding='utf-8'))
candidates={r['id']:r for r in json.loads((WORK/f'{batch}-candidates.json').read_text(encoding='utf-8')) if 'file'in r}
rows=[]
for slug,d in decisions.items():
    if not d.get('candidate'):continue
    r=candidates[d['candidate']];assert r['slug']==slug
    target=ROOT/'data/iem-images/phase4'/slug/Path(r['file']).name
    body=(ROOT/r['file']).read_bytes();assert hashlib.sha256(body).hexdigest()==r['sha256']
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():assert target.read_bytes()==body
    else:
        with target.open('xb') as f:f.write(body)
    note=f'Embedded raster object {r["pdf_image_name"]}, page {r["pdf_page"]}, source PDF SHA-256 {r["pdf_sha256"]}. Extracted with pypdf 7.1.0; full source PDF retained in hp-phase4/http. No page render, tracing, retouching, matte or image generation.'
    if r.get('pdf_original_image_file'):
        note+=' Original embedded JPEG2000 retained at '+r['pdf_original_image_file']+' (SHA-256 '+r['pdf_original_image_sha256']+'). Lossless PNG display copy has identical decoded pixel bytes, checked during extraction.'
    rows.append({'slug':slug,'file_path':target.relative_to(ROOT/'data/iem-images').as_posix(),'role':'primary',**{k:r[k] for k in ('width','height','format','byte_size','sha256','perceptual_hash','page_url','image_url','retrieved_on')},'source_name':r['source'],'credit':r['source']+' published product photograph; photographer unknown','licence_note':'Rights unconfirmed. Development build only; not for publication.','verification_status':'verified','verification_method':f'Manual visual inspection of {batch} contact sheets distinguishes real product photography from vector/manual diagrams and other models.','verification_note':d['note']+' '+note,'processing_notes':note})
jsonl(WORK/f'{batch}-library.jsonl',rows)
print({'staged_pdf_photographs':len(rows)})
