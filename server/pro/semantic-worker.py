"""Persistent, offline-only Chinese image/text encoder over a private stdio pipe."""
import sys,os,json,time,pathlib,traceback
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
os.environ['PYTHONIOENCODING']='utf-8'
from PIL import Image,ImageOps
import torch
from transformers import ChineseCLIPModel,ChineseCLIPProcessor
from collections import OrderedDict

root=pathlib.Path(sys.argv[1]).resolve()
cache_root=root.parent.parent
os.environ.setdefault('TORCH_HOME',str(cache_root/'torch-cache'))
os.environ.setdefault('CUDA_CACHE_PATH',str(cache_root/'cuda-cache'))
pathlib.Path(os.environ['CUDA_CACHE_PATH']).mkdir(parents=True,exist_ok=True)
model_id='OFA-Sys/chinese-clip-vit-large-patch14-336px'
start=time.monotonic()
torch.set_num_threads(min(6,os.cpu_count() or 2))
device='cuda' if torch.cuda.is_available() and os.environ.get('SEMANTIC_DEVICE')!='cpu' else 'cpu'
dtype=torch.float16 if device=='cuda' else torch.float32
def emit(value):
    print(json.dumps(value,ensure_ascii=False,separators=(',',':')),flush=True)
try:
    model=ChineseCLIPModel.from_pretrained(str(root),local_files_only=True,trust_remote_code=False,dtype=dtype).to(device).eval()
    processor=ChineseCLIPProcessor.from_pretrained(str(root),local_files_only=True,use_fast=False)
except Exception as e:
    emit({'event':'fatal','error':type(e).__name__+': '+str(e)[:500]})
    raise
emit({'event':'ready','model':model_id,'device':device,'gpu':torch.cuda.get_device_name(0) if device=='cuda' else None,'dimensions':model.config.projection_dim,'loadSeconds':round(time.monotonic()-start,2)})
cache=OrderedDict()
def vector(feature):
    feature=feature.float();feature=feature/feature.norm(p=2,dim=-1,keepdim=True).clamp_min(1e-12)
    return feature[0].cpu().tolist()
def inputs_to_device(inputs):
    return {k:v.to(device=device,dtype=dtype if v.is_floating_point() else v.dtype) for k,v in inputs.items()}
for line in sys.stdin:
    try:
        request=json.loads(line);rid=request['id'];operation=request['op'];started=time.monotonic()
        if operation=='text':
            query=str(request['text'])[:200]
            if query in cache:
                cache.move_to_end(query);result=cache[query]
            else:
                inputs=processor(text=[query],padding=True,truncation=True,max_length=128,return_tensors='pt')
                # ChineseCLIP uses the raw CLS token, matching the official forward().
                # Transformers 4.57.6 get_text_features incorrectly uses a disabled BERT pooler.
                with torch.inference_mode():
                    outputs=model.text_model(**inputs_to_device(inputs),return_dict=True)
                    result=vector(model.text_projection(outputs.last_hidden_state[:,0,:]))
                cache[query]=result
                if len(cache)>200:cache.popitem(last=False)
        elif operation=='image':
            with Image.open(request['path']) as original:image=ImageOps.exif_transpose(original).convert('RGB')
            inputs=processor(images=image,return_tensors='pt')
            with torch.inference_mode():result=vector(model.get_image_features(**inputs_to_device(inputs)))
        else:raise ValueError('Unsupported inference operation')
        emit({'id':rid,'vector':result,'seconds':round(time.monotonic()-started,4)})
    except Exception as e:
        emit({'id':request.get('id') if 'request' in locals() else None,'error':type(e).__name__+': '+str(e)[:400]})
        if torch.cuda.is_available():torch.cuda.empty_cache()
