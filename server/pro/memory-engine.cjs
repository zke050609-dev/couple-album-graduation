'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),MODEL='Qwen/Qwen3-1.7B',REVISION='70d244cc86ccca08cf5af4e1e306ecf908b1ad5e';
const python=process.env.MEMORY_PYTHON||path.join(ROOT,'runtime/ai-env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const modelDir=process.env.MEMORY_MODEL_DIR||path.join(ROOT,'runtime/ai/models/qwen3-1.7b');
const enabled=process.env.MEMORY_ENABLED!=='0',fault=(status,message)=>Object.assign(new Error(message),{status});
let child,ready=false,queue=[],active=null,sequence=0,buffer='',idleTimer,bootTimer,stopped=false,device=null,lastError='',exitingIdle=false;
function configured(){return enabled&&fs.existsSync(python)&&['config.json','tokenizer_config.json','model-00001-of-00002.safetensors','model-00002-of-00002.safetensors'].every(n=>fs.existsSync(path.join(modelDir,n)))}
function status(){return {available:configured(),model:MODEL,device,engine:active?'generating':child?(ready?'ready':'loading'):'idle',waiting:queue.length,error:lastError||(!configured()?'请运行“安装回忆助手.cmd”安装本地文字模型。':null)}}
function rejectAll(message){if(active){clearTimeout(active.timer);active.reject(fault(503,message));active=null}for(const job of queue)job.reject(fault(503,message));queue=[]}
function pump(){if(!ready||active||!child||exitingIdle)return;clearTimeout(idleTimer);if(!queue.length){idleTimer=setTimeout(()=>{if(!active&&!queue.length){exitingIdle=true;child?.kill()}},120000);idleTimer.unref();return}active=queue.shift();active.timer=setTimeout(()=>{lastError='回忆生成超时，请减少描述或照片数量后重试';rejectAll(lastError);child?.kill()},180000);active.timer.unref();child.stdin.write(JSON.stringify({id:active.id,...active.input})+'\n')}
function start(){if(child||stopped)return;buffer='';lastError='';child=spawn(python,['-u',path.join(__dirname,'memory-worker.py'),modelDir],{windowsHide:true,env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe']});
 bootTimer=setTimeout(()=>{lastError='文字模型加载超时，请稍后重试';rejectAll(lastError);child?.kill()},180000);bootTimer.unref();
 child.stdout.on('data',chunk=>{buffer+=chunk.toString('utf8');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;let result;try{result=JSON.parse(line)}catch{continue}if(result.event==='ready'){ready=true;device=result.device;clearTimeout(bootTimer);pump()}else if(result.event==='fatal'){lastError='文字模型启动失败，请检查本地安装';rejectAll(lastError);child?.kill()}else if(active&&result.id===active.id){const job=active;active=null;clearTimeout(job.timer);if(result.error){lastError='文字生成失败，请缩短描述或减少照片数量后重试';job.reject(fault(503,lastError))}else if(typeof result.text!=='string'||!result.text.trim()){job.reject(fault(503,'模型未生成有效内容，请重试'))}else{lastError='';job.resolve(result)}pump()}}});
 child.stdin.on('error',()=>rejectAll('本地文字模型通信中断，请重试'));
 child.stderr.on('data',chunk=>{if(/Traceback|Error:/.test(String(chunk)))console.error('Memory model:',String(chunk).slice(-400))});
 child.on('error',()=>{lastError='无法启动本地文字模型';rejectAll(lastError)});
 child.on('exit',()=>{clearTimeout(bootTimer);clearTimeout(idleTimer);child=null;ready=false;buffer='';const idle=exitingIdle;exitingIdle=false;if(idle&&!stopped){if(queue.length)start()}else if(active||queue.length)rejectAll(stopped?'服务正在停止':'本地文字模型已退出，请重试')});
}
function generate(input){if(stopped)return Promise.reject(fault(503,'服务正在停止'));if(!configured())return Promise.reject(fault(503,'请运行“安装回忆助手.cmd”安装本地文字模型'));if(queue.length+(active?1:0)>=2)return Promise.reject(fault(429,'回忆助手正在忙，请稍后再试'));return new Promise((resolve,reject)=>{queue.push({id:++sequence,input,resolve,reject});start();pump()})}
function stop(){stopped=true;clearTimeout(idleTimer);clearTimeout(bootTimer);rejectAll('服务正在停止');child?.kill()}
process.once('exit',stop);module.exports={MODEL,REVISION,status,generate,stop};
