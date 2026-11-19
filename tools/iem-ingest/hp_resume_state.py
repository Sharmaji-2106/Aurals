"""Write-once Phase 4B baseline and preservation checks, including Phase 6 photos."""
import json
import sys
from sqlalchemy import text
from auralis.db import new_session
from hp_common import WORK, digest, space, write_new, append_report
from hp_db import protected, ranking

def state():
    with new_session() as s:
        return {
            'protected': protected(s),
            'images': {str(r[0]): digest(r[1]) for r in s.execute(text('SELECT id, row_to_json(t)::text FROM iem_images t'))},
            'primaries': {str(r[0]): r[1] for r in s.execute(text('SELECT id, image_path FROM iems WHERE image_path IS NOT NULL'))},
            'headphones': [dict(r._mapping) for r in s.execute(text("SELECT DISTINCT i.slug, i.brand, i.model, i.image_path FROM iems i JOIN fr_measurements f ON f.iem_id=i.id WHERE f.rig_family LIKE 'headphone:%' ORDER BY i.slug"))],
        }

def verify():
    before = json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))
    now = state()
    for table, rows in before['protected'].items():
        assert all(now['protected'][table].get(k)==v for k,v in rows.items()), table
    for table in ('images','primaries'):
        assert all(now[table].get(k)==v for k,v in before[table].items()), table
    return {'all_pre_resume_images_and_primaries_unchanged': True, 'all_pre_resume_identities_and_acoustics_unchanged': True}

if __name__ == '__main__':
    space()
    if sys.argv[1] == 'baseline':
        now = state()
        write_new(WORK/'hp-resume-baseline.json', now)
        write_new(WORK/'hp-resume-ranking-baseline.json', ranking())
        append_report('\n## Phase 4B resume baseline\n\nCurrent database snapshotted after the Headphone Zone additions. All existing image rows and primary paths are protected, including every Phase 6 in-ear photograph. Rankings are compared against this current baseline; the original pre-Phase-6 ranking is historical evidence only.\n')
        print({'headphones':len(now['headphones']), 'with_photo':sum(bool(m['image_path']) for m in now['headphones']), 'protected_images':len(now['images'])})
    else:
        print(verify())
