"""One isolated PDF extraction job; parent enforces a document time limit."""
import hashlib
import io
import json
import logging
import sys
from pathlib import Path
from datetime import UTC, datetime
from hp_common import ROOT, RAW, WORK, write_new
from hp_photos import fetch
from intake import image_metrics
sys.path.insert(0,str(RAW/'pdf-tooling'))
from pypdf import PdfReader
logging.getLogger('pypdf').setLevel(logging.ERROR)

leads_path=Path(sys.argv[2]) if len(sys.argv)>2 else WORK/'hp-photo17-leads.json'
label=sys.argv[3] if len(sys.argv)>3 else 'hp-photo17'
jobs=[(m,n,c) for m in json.loads(leads_path.read_text(encoding='utf-8')) for n,c in enumerate(m['choices'],1)]
index=int(sys.argv[1]);m,n,c=jobs[index];rows=[]
try:
    b=fetch(c['page_url']);reader=PdfReader(io.BytesIO(b));count=0
    for page_num,page in enumerate(reader.pages[:5],1):
        for j,obj in enumerate(page.images):
            body=obj.data;metrics=image_metrics(body)
            if min(metrics['width'],metrics['height'])<150:continue
            original_object={}
            if metrics['format']=='JPEG2000':
                from PIL import Image
                original_sha=hashlib.sha256(body).hexdigest()
                original_path=RAW/'embedded-pdf-images'/(original_sha+'.jp2')
                original_path.parent.mkdir(parents=True,exist_ok=True)
                if original_path.exists():assert original_path.read_bytes()==body
                else:
                    with original_path.open('xb') as f:f.write(body)
                source=Image.open(io.BytesIO(body));source.load()
                stream=io.BytesIO();source.save(stream,format='PNG');body=stream.getvalue()
                decoded=Image.open(io.BytesIO(body));decoded.load()
                assert source.mode==decoded.mode and source.tobytes()==decoded.tobytes()
                original_object={'pdf_original_image_file':original_path.relative_to(ROOT).as_posix(),'pdf_original_image_sha256':original_sha,'lossless_format_conversion':'JPEG2000 to PNG; decoded pixel bytes identical'}
                metrics=image_metrics(body)
            ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp','AVIF':'.avif'}.get(metrics['format'])
            if not ext:continue
            path=WORK/'candidates'/m['slug']/(metrics['sha256'][:20]+ext)
            path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():assert hashlib.sha256(path.read_bytes()).hexdigest()==metrics['sha256']
            else:
                with path.open('xb') as f:f.write(body)
            rows.append({'id':f'{m["slug"]}:{n}:{page_num}-{j}',**{k:m[k] for k in ('slug','brand','model')},'source':c['source'],'title':c['title'],'page_title':c['title'],'page_url':c['page_url'],'image_url':c['page_url']+f'#page={page_num}','pdf_page':page_num,'pdf_image_name':obj.name,'pdf_sha256':hashlib.sha256(b).hexdigest(),'file':path.relative_to(ROOT).as_posix(),'retrieved_on':datetime.now(UTC).date().isoformat(),**original_object,**metrics})
            count+=1
            if count>=10:break
        if count>=10:break
    if not rows:rows.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':'No embedded raster object at least 150 pixels wide and high in first five pages; no page rendering or diagram tracing.'})
except Exception as e:rows.append({'slug':m['slug'],'source':c['source'],'page_url':c['page_url'],'error':str(e)})
write_new(WORK/f'{label}-extract-{index:03}.json',rows)
