"""Download a pinned official model; this script never reads the photo directory."""
import hashlib,json,pathlib,time,urllib.request,sys

MODEL_ID='OFA-Sys/chinese-clip-vit-large-patch14-336px'
REVISION='567e85f859213abde0cd45e95d87f4421ccbc14c'
root=pathlib.Path(sys.argv[1]).resolve()
root.mkdir(parents=True,exist_ok=True)
api=f'https://huggingface.co/api/models/{MODEL_ID}/revision/{REVISION}?blobs=true'
with urllib.request.urlopen(api,timeout=60) as response:metadata=json.load(response)
files={f['rfilename']:f for f in metadata['siblings']}
def file_hash(file):
    digest=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(8*1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()
manifest={'modelId':MODEL_ID,'revision':REVISION,'source':'https://huggingface.co/'+MODEL_ID,'files':{}}
for name in ['config.json','preprocessor_config.json','vocab.txt','pytorch_model.bin']:
    entry=files[name];expected=entry.get('lfs',{}).get('sha256');target=root/name
    if target.exists() and (not expected or file_hash(target)==expected):
        print('Already downloaded: '+name,flush=True)
    else:
        url=f'https://huggingface.co/{MODEL_ID}/resolve/{REVISION}/{name}'
        partial=root/(name+'.partial');start=time.monotonic();last=start;count=0;digest=hashlib.sha256()
        with urllib.request.urlopen(url,timeout=120) as response,partial.open('wb') as output:
            total=int(response.headers.get('Content-Length') or entry.get('size') or 0)
            while True:
                chunk=response.read(1024*1024)
                if not chunk:break
                output.write(chunk);digest.update(chunk);count+=len(chunk)
                if time.monotonic()-last>10:
                    print(f'{name}: {count/1048576:.0f} MB / {total/1048576:.0f} MB',flush=True);last=time.monotonic()
        actual=digest.hexdigest()
        if expected and actual!=expected:raise RuntimeError('Model checksum mismatch: '+name)
        partial.replace(target)
        print(f'Downloaded {name}: {count/1048576:.1f} MB in {time.monotonic()-start:.1f}s',flush=True)
    manifest['files'][name]={'sha256':expected or file_hash(target),'bytes':target.stat().st_size}
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('Official model download complete.',flush=True)
