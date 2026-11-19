"""Exact public source pages found in the remaining-ranked-model search pass.

These are leads only. Article photographs still require contact-sheet decisions.
"""
import json
from phase3_images import WORK, models, write_new

SEEDS = {
 '1more-single-driver': [('Gadgets360','https://www.gadgets360.com/audio/reviews/1more-single-driver-in-ear-headphones-review-1784636')],
 '1more-triple-driver-ltng': [('MacSources','https://macsources.com/1-triple-driver-ltng-ear-headphones-review-enjoy-lightning-connected-listening/'),('Poc Network','https://www.pocnetwork.net/technology-news/review-1more-triple-driver-ltng-in-ear-headphones-for-ios/')],
 'akg-n400': [('In-Ear Fidelity','https://crinacle.com/2020/06/25/akg-n400-review-the-better-galaxy-buds/')],
 'apple-me186-in-ear-headphones': [('TechnoCity','https://www.technocity.ru/catalog/detail/524393/')],
 'audio-technica-ath-ckn50': [('PHILE WEB','https://www.phileweb.com/sp/news/d-av/201211/19/32005.html')],
 'audioquest-nighthawk': [('What Hi-Fi','https://www.whathifi.com/audioquest/nighthawk/review'),('Sound & Vision','https://www.soundandvision.com/content/audioquest-nighthawk-headphone-review')],
 'bowers-wilkins-c5-series-2': [('Gadgets360','https://www.gadgets360.com/tv/reviews/bowers-wilkins-c5-series-2-review-luxury-in-your-ears-688689'),('iLounge','https://www.ilounge.com/index.php/reviews/entry/bowers-wilkins-c5-series-2-in-ear-headphones')],
 'cosmic-ears-ce6b': [('SLS Audio','https://sls-audio.com/cosmic-ears-ce6b/')],
 'fiio-f3': [('FoneArena','https://www.fonearena.com/blog/226075/fiio-f3-dynamic-in-ear-monitors-review.html'),('FiiO','https://www.fiio.com/newsinfo/64479.html')],
 'final-audio-adagio-iii': [('Slinky Studio','https://slinkystudio.info/reviews/final-audio-design-adagio-iii-earphones-review')],
 'final-audio-heaven-v': [('ON-mag','https://www.on-mag.fr/index.php/topaudio/actualites-news/13207-test-ecouteurs-final-audio-design-heaven-v-esthetisme-audiophile-et-minimaliste-japonais')],
 'hidition-viento': [('In-Ear Fidelity','https://crinacle.com/2019/08/05/cliffnotes-hidition-viento-when-less-is-truly-more/')],
 'huawei-freebuds-pro-2': [('Android Authority','https://www.androidauthority.com/huawei-freebuds-pro-2-review-3190338/'),('TechRadar','https://www.techradar.com/reviews/huawei-freebuds-pro-2')],
 'jabra-evolve-75e': [('India Today','https://www.indiatoday.in/technology/reviews/story/jabra-evolve-75e-review-excellent-battery-life-perfect-for-use-in-office-1198864-2018-03-27')],
 'jvc-ha-fw01': [('JVC','https://www.jvc.com/usa/headphones/high-resolution/ha-fw01/'),('Sound & Vision','https://www.soundandvision.com/content/jvc-ha-fw01-ear-headphones-review')],
 'jvc-ha-fw10000': [('ohm image','https://ohm-image.net/opinion/audiophile/ohmage-to-the-jvc-ha-fw10000')],
 'jvc-ha-fw1800': [('Crutchfield','https://www.crutchfield.com/p_257HAFW180/JVC-HA-FW1800.html')],
 'jvc-ha-fx7': [('MikroTech','https://mikrotech.co.za/product/jvc-ha-fx7-a-ex-ear-bud-headphone/')],
 'lz-hi-fi-audio-z05a': [('Moonstar Reviews','https://moonstarreviews.net/lz-audio-z05a-iem-review/')],
 'massdrop-plus-universal-iem': [('Headphones.com Community','https://forum.headphones.com/t/massdrop-plus-universal-iem-review/1549')],
 'moondrop-quarks-dsp': [('Headphone Corner','https://kuulokenurkka.com/en/review-moondrop-quarks-dsp/'),('Boizoff','https://boizoff.com/language/en/moondrop-quarks-dsp-review-the-charming-quarks/')],
 'noble-audio-k10-ciem': [('Passion for Sound','https://passionforsound.com.au/noble-kaiser-k10-custom-in-ear-monitor/')],
 'ns-audio-ns3': [('Hi End Portable','https://hiendportable.com/ns-audio-ns3-english-review/')],
 'nuforce-edc3': [('Techaeris','https://techaeris.com/2018/02/15/massdrop-x-nuforce-edc3-in-ear-monitors-review/')],
 'nuforce-stride': [('SoundGuys','https://www.soundguys.com/massdrop-x-nuforce-stride-27451/')],
 'oppo-enco-x2': [('Stuff','https://www.stuff.tv/review/oppo-enco-x2-review/'),('Indian Express','https://indianexpress.com/article/technology/tech-reviews/oppo-enco-x2-review-8057044/')],
 'panasonic-rp-hje120': [('HeadphonesAddict','https://headphonesaddict.com/panasonic-ergofit-rp-hje120-review/')],
 'philips-she3855': [('TMW','https://tmw.com.sg/products/philips-she3855-headphones')],
 'qkz-vk4': [('Concept Kart','https://conceptkart.com/products/qkz-vk4-wired-iem-with-mic')],
 'qudelix-qx-over': [('Audioreviews','https://www.audioreviews.org/qudelix-5k-qx-over-review/')],
 'samsung-akg-eo-ig955': [('Skroutz','https://www.skroutz.gr/s/22963729/Samsung-EO-IG955-In-ear-Handsfree-Headphones-with-Connector-3-5mm-Black.html')],
 'samsung-eo-ic500-anc-type-c': [('Jarir','https://www.jarir.com/sa-en/samsung-headsets-538252.html'),('SHI','https://portal.shi.com/product/39558542/Samsung-EO-IC500-Earphones-with-mic')],
 'sennheiser-cx-3-00': [('What Hi-Fi','https://www.whathifi.com/sennheiser/cx-300/review')],
 'sennheiser-ie-4': [('Bonedo','https://www.bonedo.de/artikel/sennheiser-ie-4-test/')],
 'sony-mdr-7550': [('Sony Professional','https://pro.sony/en_US/products/headphones/mdr-7550')],
 'sony-mdr-ex15lp': [('HiFiReport','https://www.hifireport.com/sony-mdr-ex15lp-review/'),('B&H Photo','https://www.bhphotovideo.com/c/product/1036452-REG/sony_mdrex15lp_b_in_ear_headset.html/overview')],
 'sony-mh750': [('WillyBoy Audio','https://willyboy.home.blog/2020/11/30/sony-mh750/')],
 'sony-xba-n1': [('Sony','https://www.sony.jp/headphone/products/XBA-N1/')],
 'sony-xba-n3': [('Audio Discourse','https://www.audiodiscourse.com/2023/05/sony-xba-n3-impressions.html')],
 'stax-sr-003mk2': [('Hi-Fi Voice','https://www.hifi-voice.com/testy-a-recenze/sluchatka/2149-stax-sr-003mk2')],
 'tfz-t2-galaxy': [('Perrivan Audio','https://perrivanaudio.com/tfz-t2-galaxy-review/')],
 'tripowin-olina': [('Prime Audio','https://primeaudio.org/tripowin-x-hbb-olina-review/')],
 'v-moda-zn': [('Audioholics','https://www.audioholics.com/headphone-reviews/v-moda-zn-in-ear-monitor-review')],
 'vision-ears-erlk-nig': [('Audio Discourse','https://www.audiodiscourse.com/2020/12/vision-ears-erlkonig-review.html')],
 'vsonic-vs7': [('No Borders Audiophile','https://nobordersaudiophile.wordpress.com/2019/06/12/vsonic-vs7-the-gr07-successor-is-sure-a-winner-lush-and-addictive/'),('In-Ear Fidelity','https://crinacle.com/2019/09/06/vsonic-vs7-review-unfulfilled/')],
 'xiaomi-mi-anc': [('FoneArena','https://www.fonearena.com/blog/226659/xiaomi-mi-noise-cancelling-usb-type-c-earphones-unboxing.html')],
}

if __name__=='__main__':
    existing=json.loads((WORK/'ranked08-leads.json').read_text(encoding='utf-8'))
    safe={'final-audio-e1000','final-audio-heaven-iv','kz-ate','kz-zst','rock-zircon'}
    leads=[]
    for m in models('ranked'):
        choices=[{'source':s,'page_url':u,'title':m['brand']+' '+m['model'], 'kind':'article','images':[],'score':100} for s,u in SEEDS.get(m['slug'],[])]
        if m['slug'] in safe:
            choices.extend(c for r in existing if r['slug']==m['slug'] for c in r['choices'] if c['source']!='KZ Audio')
        if choices:leads.append({**m,'choices':choices})
    write_new(WORK/'ranked09-leads.json',leads)
    print({'ranked_models':len(leads),'source_pages':sum(len(m['choices']) for m in leads)})
