"""Bulk public catalogues from additional Indian music retailers."""
import json
from concurrent.futures import ThreadPoolExecutor
from phase5_india import WORK,fetch,save

stores={
 'bajaao-headphones':('Bajaao','https://www.bajaao.com','/collections/headphones'),
 'bajaao-iems':('Bajaao','https://www.bajaao.com','/collections/in-ear-monitors'),
 'johnsmusic':("John's Music",'https://www.johnsmusic.in','/collections/headphones'),
 'proaudiobrands':('Pro Audio Brands','https://proaudiobrands.com',''),
}
def run(item):
    k,(name,origin,path)=item;products=[];pages=[];error=None
    for n in range(1,15):
        u=f'{origin}{path}/products.json?limit=250&page={n}'
        try:
            b,m=fetch(u)
            if m.get('redirect'):b,m=fetch(m['redirect'])
            batch=json.loads(b)['products'];products.extend(batch);pages.append(m)
            if not batch:break
        except Exception as e:error=str(e);break
    save(WORK/f'feed-{k}.json',{'retailer':name,'origin':origin,'products':products,'pages':pages,'error':error})
    print({'retailer':name,'collection':path,'products':len(products),'error':error},flush=True)
# Serialize two collections on Bajaao within one worker/host.
def bajaao():
    run(('bajaao-headphones',stores['bajaao-headphones']));run(('bajaao-iems',stores['bajaao-iems']))
with ThreadPoolExecutor(max_workers=3) as pool:
    fs=[pool.submit(bajaao),pool.submit(run,('johnsmusic',stores['johnsmusic'])),pool.submit(run,('proaudiobrands',stores['proaudiobrands']))]
    for f in fs:f.result()
