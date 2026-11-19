"""Final alternate public listings for ranked gaps; still unverified candidates."""
from phase3_images import WORK, models, write_new

SEEDS = {
 '1more-single-driver':[('Indian Express','https://indianexpress.com/article/technology/tech-reviews/1more-1m301-and-beyerdynamic-byron-wired-earphones-review-price-in-india-features-specifications-sale-4730228/')],
 'apple-me186-in-ear-headphones':[('E-Catalog','https://e-catalog.com/APPLE-IPOD-IN-EAR-HEADPHONES-WITH-REMOTE-AND-MIC.htm')],
 'audio-technica-ath-ckn50':[('Audio-Technica','https://www.audio-technica.co.jp/product/ATH-CKN50')],
 'creative-aurvana-ace':[('Creative','https://en.creative.com/p/headphones-headsets/creative-aurvana-ace')],
 'final-audio-heaven-v':[('e-earphone','https://www.e-earphone.jp/products/118579')],
 'jabra-evolve-75e':[('Robert Setiadi','https://www.robertsetiadi.com/casual-review-jabra-evolve-75e/')],
 'jbl-t200a':[('E-Catalog','https://e-catalog.com/JBL-T200A.htm')],
 'jvc-ha-fw1800':[('JVC','https://www.jvc.com/usa/headphones/high-resolution/ha-fw1800/')],
 'kz-edse':[('PlusPDA','https://pluspda.ru/blog/aliexpress/29118.html')],
 'lz-hi-fi-audio-z05a':[('Market Changers','https://marketchangers.wordpress.com/audioreviews/lz-hifi-z05a/')],
 'philips-she3855':[('E-Catalog','https://e-catalog.com/PHILIPS-SHE3855.htm')],
 'philips-shs8000':[('E-Catalog','https://e-catalog.com/PHILIPS-SHS8000.htm')],
 'qudelix-qx-over':[('Qudelix','https://www.qudelix.com/blogs/5k-dac-amp/qx-over-earphones')],
 'samsung-akg-eo-ig955':[('Samsung','https://www.samsung.com/uk/mobile-accessories/earphones-tuned-by-akg-gray-eo-ig955bsegww/')],
 'samsung-eo-ic500-anc-type-c':[('Digitec','https://www.digitec.ch/en/s1/product/samsung-eo-ic500-anc-cable-headphones-12475699')],
 'sennheiser-cx-2-00':[('E-Catalog','https://e-catalog.com/SENNHEISER-CX-2-00.htm')],
 'sennheiser-ie-4':[('E-Catalog','https://e-catalog.com/SENNHEISER-IE-4.htm')],
 'sennheiser-ocx-685':[('E-Catalog','https://e-catalog.com/SENNHEISER-OCX-685.htm')],
 'sony-mdr-ex10':[('E-Catalog','https://e-catalog.com/SONY-MDR-EX10.htm')],
 'sony-mdr-xb50':[('E-Catalog','https://e-catalog.com/SONY-MDR-XB50.htm')],
 'sony-mh1':[('E-Catalog','https://e-catalog.com/SONY-MH1.htm')],
 'sony-xba-h3':[('Hifi.nl','https://hifi.nl/artikel/review-sony-xba-h3-in-ears-alles-behalve-subtiel')],
 'tfz-t2-galaxy':[('Audio123','https://audio123blog.wordpress.com/2018/12/05/tfz-t2-galaxy/')],
 'vivo-xe800':[('E-Catalog','https://e-catalog.com/VIVO-XE800.htm')],
}

out=[]
for m in models('ranked'):
    if m['slug'] in SEEDS:
        out.append({**m,'choices':[{'source':s,'page_url':u,'title':m['brand']+' '+m['model'],
                                  'kind':'article','images':[],'score':100} for s,u in SEEDS[m['slug']]]})
write_new(WORK/'ranked11-leads.json',out)
print({'remaining_ranked_queried':len(out)})
