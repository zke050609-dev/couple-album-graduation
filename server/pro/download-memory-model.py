"""Download pinned public Qwen weights with resumable ranges and SHA-256 checks."""
import concurrent.futures,hashlib,json,pathlib,sys,time,urllib.request,shutil
MODEL='Qwen/Qwen3-1.7B'
REVISION='70d244cc86ccca08cf5af4e1e306ecf908b1ad5e'
root=pathlib.Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
def digest(file):
    h=hashlib.sha256()
    with file.open('rb') as stream:
        for part in iter(lambda:stream.read(8*1024*1024),b''):h.update(part)
    return h.hexdigest()
with urllib.request.urlopen(f'https://huggingface.co/api/models/{MODEL}/revision/{REVISION}?blobs=true',timeout=60) as response:metadata=json.load(response)
manifest={'modelId':MODEL,'revision':REVISION,'files':{}}
for entry in metadata['siblings']:
    name=entry['rfilename']
    if name not in ['config.json','generation_config.json','tokenizer.json','tokenizer_config.json','vocab.json','merges.txt','model.safetensors.index.json'] and not name.endswith('.safetensors'):continue
    size=entry['size'];expected=entry.get('lfs',{}).get('sha256');target=root/name;url=f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}'
    if target.exists() and target.stat().st_size==size and (not expected or digest(target)==expected):print('Verified '+name,flush=True)
    else:
        partial=root/(name+'.partial')
        if size>8*1024*1024:
            parts=root/(name+'.parts');parts.mkdir(exist_ok=True);block=16*1024*1024;count=(size+block-1)//block;started=time.monotonic()
            def fetch(index):
                start=index*block;end=min(size,start+block)-1;file=parts/str(index)
                if file.exists() and file.stat().st_size==end-start+1:return
                for attempt in range(4):
                    try:
                        request=urllib.request.Request(url+f'?download=true&part={index}',headers={'Range':f'bytes={start}-{end}'})
                        with urllib.request.urlopen(request,timeout=90) as response:
                            if response.status!=206 or not response.headers.get('Content-Range','').startswith(f'bytes {start}-{end}/'):raise RuntimeError('Server did not honor range')
                            data=response.read(end-start+2)
                        if len(data)!=end-start+1:raise RuntimeError('Incomplete chunk')
                        file.write_bytes(data);return
                    except Exception:
                        if attempt==3:raise
                        time.sleep(attempt+1)
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                for completed,_ in enumerate(concurrent.futures.as_completed([pool.submit(fetch,i) for i in range(count)]),1):
                    _.result()
                    if completed%8==0 or completed==count:print(f'{name}: chunks {completed}/{count}, {time.monotonic()-started:.0f}s',flush=True)
            with partial.open('wb') as output:
                for index in range(count):
                    with (parts/str(index)).open('rb') as source:shutil.copyfileobj(source,output)
        else:
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(url+f'?download=true&attempt={attempt}',timeout=60) as response,partial.open('wb') as output:shutil.copyfileobj(response,output)
                    break
                except Exception:
                    if attempt==3:raise
                    time.sleep(attempt+1)
        if partial.stat().st_size!=size or expected and digest(partial)!=expected:raise RuntimeError('Checksum mismatch: '+name)
        partial.replace(target)
        if size>8*1024*1024:shutil.rmtree(parts)
        print('Downloaded and verified '+name,flush=True)
    manifest['files'][name]={'bytes':size,'sha256':expected or digest(target)}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print('Memory model ready.',flush=True)
