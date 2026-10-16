// Test-only entry point. Production always loads the real local model engine.
const engine=require('../../server/pro/memory-engine.cjs');
let settings={delay:150,fail:false,available:true};
const original=engine.status;
engine.status=()=>({...original(),available:settings.available,engine:'ready',error:settings.available?null:'test model unavailable'});
engine.generate=async input=>{const mode={...settings};await new Promise(r=>setTimeout(r,mode.delay));if(mode.fail)throw Object.assign(new Error('模拟生成失败，可重试'),{status:503});const data=JSON.parse(input.context);return {text:data.已知日期+'，我们在'+data.已知城市+'留下了一段回忆。'+data.用户的真实经历和感受,device:'test'}};
process.on('message',message=>{if(message?.type==='settings'){settings={...settings,...message.value};process.send?.({type:'settings',settings})}});
require('../../server/pro/server.cjs');
