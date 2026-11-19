"""Manual contact-sheet choices from the interrupted batches; never heuristic approval."""
import json
from collections import defaultdict
from hp_common import WORK, write_new

PICKS = {
    'hp-photo04-0000': [3,16,24,32,51,55,69,71,75,76,80,81,92,97,100,113,119,121,123,128,133,135,136,142,148,153,155,158,164,165,167,180,187,193,200,210,213,226,228,230,235,237,239,245,252,256,258,260,263,265,267,269,270,276,279,289,295,301,306,313,314,327,329,337,341,346,351,360,362,366,371,372,383,389,392,395,401,411,413,416,420,423,425,430,443,445,449,455,459,461,467,477,492,495,499,503,506,509,511,514,517,518],
    'hp-photo05-0000': [1,5,7,9,13,15,17,19,21,23,25,27,31,33,35,37,41,43,45,48,49,50,51,52,53,54,55,56,57],
}
REJECT = {
    'beyerdynamic-dt-770':'DT 770 M is a different named model.',
    'beyerdynamic-dt-990-pro':'URL identifies Black Limited Edition, despite abbreviated page title.',
    'bose-quietcomfort':'Listing explicitly names second generation; stored base generation not established.',
    'bose-quietcomfort-ultra':'Earbuds, not Ultra over-ear headphones. A correct headphone photo is in photo05.',
    'focal-listen':'Wired photos have promotional award frames; other listing is Listen Wireless Chic Edition.',
    'grado-sr225':'SR225x and SR325x comparison; original SR225 not shown.',
    'grado-sr60':'SR60e/SR60i, not original SR60.',
    'grado-sr80':'SR80x/SR80e, not original SR80.',
    'hifiman-ananda':'Ananda Nano and Nano GEN.2, not base Ananda.',
    'hyperx-cloud':'Cloud Orbit S, not original Cloud.',
    'hyperx-cloud-ii':'Cloud III and Cloud III S Wireless, not Cloud II.',
    'hyperx-cloud-iii':'Cloud III S Wireless, not wired Cloud III.',
    'sennheiser-momentum':'True Wireless earbuds, not original Momentum over-ear.',
    'sennheiser-momentum-2-0':'Wireless and on-ear variants; wired over-ear identity not established.',
    'skullcandy-crusher':'Crusher Evo, not original Crusher.',
    'skullcandy-grind':'Wireless model, not wired Grind.',
    'skullcandy-hesh':'Hesh ANC, not original Hesh.',
    'skullcandy-hesh-2':'Comparison photo does not establish which generation is pictured.',
    'akg-k81-dj':'Review covers K81DJ/K518DJ/K518LE; exact pictured model is unresolved.',
    'astro-gaming-a20':'Gen.2, not original A20.',
    'astro-gaming-a30':'Wireless A30, not original wired A30.',
    'audeze-lcd-xc':'2024 revision, not established for stored base LCD-XC.',
    'audio-technica-ath-m20x':'BT and STS headset variants, not wired M20x.',
    'audio-technica-ath-m50x':'STS and STS-WL headset variants, not M50x.',
    'audio-technica-ath-r70x':'Replacement cable or R70xa, not R70x.',
    'audio-technica-ath-esw9':'ATH-ESW9A regional revision; base ESW9 not established here.',
    'beats-mixr':'Neon named edition, base identity not established.',
    'beats-solo':'Solo Buds earbuds, not Solo headphones.',
    'beats-studio':'Studio Buds earbuds and case covers, not Studio headphones.',
    'beyerdynamic-dt-1770':'Comparison frames contain multiple models/generations without isolated exact-model photo.',
    'beyerdynamic-dt770-pro-x-limited-edition':'Three-model comparison; exact subject not isolated confidently.',
    'beyerdynamic-lagoon':'Named Traveller edition or multi-model comparison; base identity unresolved.',
    'beyerdynamic-t1':'Second-generation T1, not original T1.',
    'cleer-next':'Unrelated Google promotion and Strauss & Wagner advert; no NEXT headphone.',
    'corsair-hs60':'HS60 Haptic variant, not base HS60.',
    'creative-aurvana':'Aurvana Ace earbuds, not Aurvana headphones.',
    'creative-fatal1ty':'HS-1000 USB packaging or unrelated article image; base model not established.',
    'fostex-t50':'T50RP MK3G and Bluetooth models, not original T50.',
    'fostex-t50rp':'Wireless variant or modified T50RP; original generation unresolved.',
    'fostex-th-x00':'Purpleheart named edition, not base TH-X00.',
    'grado-gs1000':'Balanced Classic listing or GS1000x; original GS1000 not established.',
    'grado-rs2':'RS2e, not original RS2.',
    'hifiman-edition-x':'Edition XV, not Edition X.',
    'hifiman-he-6':'HE6 Remastered, not original HE-6.',
    'hifiman-he6':'HE6 Remastered, not original HE6.',
    'hifiman-he1000':'HE1000 WiFi, not original HE1000.',
    'jabra-move':'Move Style Edition, not base Move.',
    'jbl-tour-one':'Tour One M2, not original Tour One.',
    'lucidsound-ls31':'Shared LS31/LS41 announcement; exact image identity unresolved.',
    'meze-109-pro':'Upgrade cables only, no headphone.',
    'monoprice-m1570':'Closed M1570C, not open M1570.',
    'razer-blackshark-v2':'Special Edition and HyperSpeed variants, not base wired V2.',
    'razer-blackshark-v2-pro':'Xbox/PlayStation variants; original base revision unresolved.',
    'razer-blackshark-v2-x':'White named variant or USB model, not base analog V2 X.',
    'razer-kraken-v3-x':'Listing explicitly identifies upgraded model; stored generation unresolved.',
    'sennheiser-accentum':'True Wireless earbuds or Wireless SE package, not base Accentum.',
    'sennheiser-hd1-on-ear':'Comparison frame; exact HD1 version not independently established.',
    'sennheiser-rs-195':'Shared multi-model comparison; exact RS195 identity unresolved.',
    'sennheiser-urbanite-xl':'Wireless version, not wired Urbanite XL.',
    'shure-srh240':'SRH240A, not original SRH240.',
    'shure-srh440':'SRH440A, not original SRH440.',
    'shure-srh840':'SRH840A, not original SRH840.',
    'sony-mdr-m1':'MDR-M1ST, not MDR-M1.',
    'stax-sr-007':'SR-007A, not original SR-007.',
    'steelseries-arctis-1':'Wireless version, not wired Arctis 1.',
    'steelseries-arctis-7':'Arctis 7+, not original Arctis 7.',
    'steelseries-arctis-nova-3':'Nova 3P Wireless, not wired Nova 3.',
    'steelseries-arctis-nova-pro':'Nova Pro Wireless, not wired Nova Pro.',
    'turtle-beach-stealth-500':'500X or Nintendo revision; base Stealth 500 unresolved.',
    'turtle-beach-stealth-600':'Gen.2 and Gen.2 MAX, not original Stealth 600.',
    'turtle-beach-stealth-700':'Gen.2 and Gen.2 MAX, not original Stealth 700.',
    'ultrasone-hfi-450':'Shared HFI-450/Yamaha review; exact pictured headphone unresolved.',
    'v-moda-crossfade-wireless':'Crossfade II Wireless Codex edition, not original Wireless.',
}

def main():
    covered={r['slug'] for f in WORK.glob('hp-*-library.jsonl') for r in map(json.loads,f.read_text(encoding='utf-8').splitlines())}
    baseline=json.loads((WORK/'hp-resume-baseline.json').read_text(encoding='utf-8'))
    covered.update(m['slug'] for m in baseline['headphones'] if m['image_path'])
    for batch, picks in PICKS.items():
        raw=json.loads((WORK/f'{batch}-candidates.json').read_text(encoding='utf-8'))
        rows=[r for r in raw if 'file' in r]
        grouped=defaultdict(list)
        for r in raw: grouped[r['slug']].append(r)
        # Tile 136 belongs to the base A10 group but depicts Gen.2; use tile 137
        # under the actual Gen.2 identity, keeping tile 135 for the original.
        if batch == 'hp-photo04-0000':
            picks=[137 if n==136 else n for n in picks]
        chosen={rows[n-1]['slug']:rows[n-1] for n in picks}
        decisions={}
        for slug, candidates in grouped.items():
            if slug in covered: continue
            if slug in chosen:
                r=chosen[slug]
                decisions[slug]={'slug':slug,'candidate':r['id'],'note':f'Manual visual review of {batch} contact sheets, selected tile {rows.index(r)+1}: exact model photograph agrees with source identity; accessories, unrelated frames and conflicting editions excluded.'}
                covered.add(slug)
            else:
                note=REJECT.get(slug)
                if not note:
                    errors=list(dict.fromkeys(r['error'] for r in candidates if r.get('error')))
                    assert all('file' not in r for r in candidates), slug
                    note='No photograph acquired: '+' | '.join(errors)
                decisions[slug]={'slug':slug,'candidate':None,'note':note}
        write_new(WORK/f'{batch}-decisions.json',decisions)
        print({'batch':batch,'accepted':sum(bool(d['candidate']) for d in decisions.values()),'rejected':sum(not d['candidate'] for d in decisions.values())})

if __name__=='__main__':main()
