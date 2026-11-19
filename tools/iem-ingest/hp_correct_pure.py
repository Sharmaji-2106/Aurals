"""Correct this run's later PURE BLACK photo without deleting any retained row or bytes."""
import json
from sqlalchemy import select
from auralis.db import new_session
from auralis.iem.models import Iem, IemImage
from hp_common import WORK, append_report, write_new
from hp_db import ranking, backup, run_cli, audit
from hp_resume_state import verify

def main():
    batch='hp-correction-pure'
    manifest=WORK/f'{batch}-library.jsonl'
    row=json.loads(manifest.read_text(encoding='utf-8').strip())
    original=json.loads((WORK/'hp-photo04-0000-library.jsonl').read_text(encoding='utf-8').splitlines()[0])
    all_old=[json.loads(l) for l in (WORK/'hp-photo04-0000-library.jsonl').read_text(encoding='utf-8').splitlines()]
    old=next(r for r in all_old if r['slug']==row['slug'])
    with new_session() as s:
        m=s.scalar(select(Iem).where(Iem.slug==row['slug']))
        image=s.scalar(select(IemImage).where(IemImage.iem_id==m.id,IemImage.role=='primary'))
        assert m.image_path==old['file_path'] and image.sha256==old['sha256']
        old_id=image.id
        old_metadata={c.name:str(getattr(image,c.name)) for c in image.__table__.columns}
    write_new(WORK/f'{batch}-superseded.json',{'slug':row['slug'],'old_manifest':old,'old_row':old_metadata,'reason':'Manufacturer confirms PURE BLACK is a later evolution with changed hardware and tuning; reject for original Signature Pure. Replacement is visually verified from a 2023 review.'})
    before=ranking();write_new(WORK/f'{batch}-ranking-before.json',before)
    dry=run_cli('import-iem-library',manifest,True);write_new(WORK/f'{batch}-dry-run.json',{'result':dry})
    saved=backup(batch)
    actual=run_cli('import-iem-library',manifest)
    with new_session() as s:
        image=s.get(IemImage,old_id)
        assert image.sha256==old['sha256'] and image.role=='original'
        image.verification_status='unverified'
        image.verification_note='Rejected exact-model association: photograph depicts later Signature PURE BLACK, not original Signature Pure. Retained only as superseded provenance; never a display primary.'
        s.commit()
    write_new(WORK/f'{batch}-import.json',{'result':actual,'backup':saved,'superseded_image_id':str(old_id)})
    after=ranking();write_new(WORK/f'{batch}-ranking-after.json',after)
    result={'passed':before==after,**audit(),**verify()}
    write_new(WORK/f'{batch}-comparison.json',result);assert result['passed']
    append_report(f'\n## Batch {batch} — exact-model correction\n\n- Headphones/measurements added: 0; replacement photographs added: 1; net new photo coverage: 0. Original 2023 Signature Pure now uses the visually reviewed Kajetblog photograph. The earlier PURE BLACK selection is a later hardware/tuning revision and is rejected; its row and bytes remain as unverified superseded provenance, never a primary. Only the photo added by this resume run was corrected; no pre-resume photograph changed.\n- Import: `{actual}`; dry run passed. Catalogue backup before writes: `{saved}`.\n- All four fixed-ID rankings identical; original and resume-baseline acoustic/identity hashes unchanged; all pre-resume images/primary paths unchanged. Evidence: `data/iem/images/phase4/{batch}-comparison.json`; superseded metadata retained in `{batch}-superseded.json`.\n')
    print({'correction':'original Signature Pure photograph','ranking':'identical','pre_resume_images':'unchanged'})

if __name__=='__main__':main()
