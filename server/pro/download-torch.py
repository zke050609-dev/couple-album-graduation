"""Verified ranged download from the official PyTorch wheel repository."""
import urllib.request,urllib.parse,html.parser,pathlib,json,hashlib,threading,concurrent.futures,time,sys,re
filename='torch-2.10.0+cu128-cp312-cp312-win_amd64.whl'
class Links(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.links.extend(v for k,v in attrs if k=='href')
index='https://download.pytorch.org/whl/cu128/torch/'
with urllib.request.urlopen(index,timeout=30) as r:page=r.read().decode()
parser=Links();parser.feed(page)
link=next(x for x in parser.links if urllib.parse.unquote(x.split('#')[0]).endswith(filename))
url=urllib.parse.urljoin(index,link).split('#')[0]
expected=urllib.parse.parse_qs(urllib.parse.urlsplit(link).fragment)['sha256'][0]
root=pathlib.Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True);target=root/filename
def checksum(file):
 d=hashlib.sha256()
 with file.open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):d.update(chunk)
 return d.hexdigest()
if target.exists() and checksum(target)==expected:
 print('GPU wheel already downloaded and verified.',flush=True);sys.exit(0)
request=urllib.request.Request(url,headers={'Range':'bytes=0-0'})
with urllib.request.urlopen(request,timeout=30) as r:total=int(r.headers['Content-Range'].split('/')[-1]);r.read()
chunk_size=8*1024*1024;count=(total+chunk_size-1)//chunk_size
partial=root/(filename+'.partial');progress=root/(filename+'.chunks.json');done=set()
if progress.exists() and partial.exists():
 old=json.loads(progress.read_text())
 if old.get('sha256')==expected and old.get('size')==total:done=set(old['done'])
if not partial.exists():
 with partial.open('wb') as f:f.truncate(total)
lock=threading.Lock();start=time.monotonic();last=start
def download(i):
 global last
 begin=i*chunk_size;end=min(total,begin+chunk_size)-1
 for attempt in range(4):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'Range':f'bytes={begin}-{end}'}),timeout=60) as r:data=r.read()
   if len(data)!=end-begin+1:raise RuntimeError('Invalid wheel chunk length')
   with lock:
    with partial.open('r+b') as f:f.seek(begin);f.write(data)
    done.add(i);progress.write_text(json.dumps({'sha256':expected,'size':total,'done':sorted(done)}))
    if time.monotonic()-last>10 or len(done)==count:
     print(f'GPU package: {len(done)/count*100:.1f}% ({len(done)} / {count} chunks)',flush=True);last=time.monotonic()
   return
  except Exception:
   if attempt==3:raise
   time.sleep(1+attempt)
with concurrent.futures.ThreadPoolExecutor(6) as pool:list(pool.map(download,[i for i in range(count) if i not in done]))
if checksum(partial)!=expected:raise RuntimeError('Official PyTorch wheel checksum mismatch')
partial.replace(target);progress.unlink(missing_ok=True)
print(f'GPU wheel verified: {total/1048576:.0f} MB in {time.monotonic()-start:.1f}s',flush=True)
