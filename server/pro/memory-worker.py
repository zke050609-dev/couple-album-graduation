"""Offline text generation using only the supplied, authorized memory context."""
import os,sys,json,time,pathlib
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false',PYTHONIOENCODING='utf-8')
import torch
from transformers import AutoModelForCausalLM,AutoTokenizer
root=pathlib.Path(sys.argv[1]).resolve()
os.environ.setdefault('TORCH_HOME',str(root.parent.parent/'torch-cache'))
os.environ.setdefault('CUDA_CACHE_PATH',str(root.parent.parent/'cuda-cache'))
pathlib.Path(os.environ['CUDA_CACHE_PATH']).mkdir(parents=True,exist_ok=True)
torch.set_num_threads(min(6,os.cpu_count() or 2))
device='cuda' if torch.cuda.is_available() and os.environ.get('MEMORY_DEVICE')!='cpu' else 'cpu'
dtype=torch.float16 if device=='cuda' else torch.float32
def emit(value):print(json.dumps(value,ensure_ascii=False,separators=(',',':')),flush=True)
try:
    tokenizer=AutoTokenizer.from_pretrained(str(root),local_files_only=True,trust_remote_code=False)
    model=AutoModelForCausalLM.from_pretrained(str(root),local_files_only=True,trust_remote_code=False,dtype=dtype).to(device).eval()
except Exception as error:
    emit({'event':'fatal','error':type(error).__name__+': '+str(error)[:300]});raise
emit({'event':'ready','device':device,'model':'Qwen/Qwen3-1.7B'})
for line in sys.stdin:
    request={}
    try:
        request=json.loads(line);start=time.monotonic()
        messages=[{'role':'system','content':request['system']},{'role':'user','content':request['context']}]
        prompt=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=False)
        inputs=tokenizer(prompt,return_tensors='pt').to(device)
        if inputs.input_ids.shape[-1]>4800:raise ValueError('Context is too long')
        with torch.inference_mode():
            output=model.generate(**inputs,max_new_tokens=600,do_sample=True,temperature=.3,top_p=.8,top_k=20,repetition_penalty=1.08,pad_token_id=tokenizer.eos_token_id)
        tokens=output[0,inputs.input_ids.shape[-1]:]
        if len(tokens)>=600 and tokens[-1].item()!=tokenizer.eos_token_id:raise ValueError('Generation did not finish; please shorten the description and try again')
        result=tokenizer.decode(tokens,skip_special_tokens=True).strip()
        if not result:raise ValueError('Empty generated text')
        emit({'id':request['id'],'text':result,'seconds':round(time.monotonic()-start,2),'device':device})
    except Exception as error:
        emit({'id':request.get('id'),'error':type(error).__name__+': '+str(error)[:300]})
        if torch.cuda.is_available():torch.cuda.empty_cache()
