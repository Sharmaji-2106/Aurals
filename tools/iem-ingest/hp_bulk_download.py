"""Use twelve workers for independent hosts, preserving the existing fetcher guards."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hp_photos

class BulkPool(ThreadPoolExecutor):
    def __init__(self,*args,**kwargs):
        kwargs['max_workers']=12
        super().__init__(*args,**kwargs)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('batch');p.add_argument('--choices',type=int,default=4);p.add_argument('--frames',type=int,default=1);a=p.parse_args()
    hp_photos.ThreadPoolExecutor=BulkPool
    hp_photos.download(a.batch,0,1000,a.choices,a.frames)
    hp_photos.sheets(a.batch+'-0000')
