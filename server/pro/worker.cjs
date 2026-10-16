'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {execFile}=require('node:child_process');
const {enrichMetadata}=require('./location.cjs');
const {db,DATA_DIR,now}=require('./store.cjs');
const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.PYTHON_PATH||(fs.existsSync(bundled)?bundled:'python');
db.prepare("UPDATE jobs SET status='queued' WHERE status='running'").run();
let running=false;
function tick(){if(running)return;const job=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(!job)return;running=true;const media=db.prepare('SELECT * FROM media WHERE id=?').get(job.media_id);const thumbnail=media.id+'-thumb.jpg';db.prepare("UPDATE jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=?").run(now(),job.id);
 execFile(python,[path.join(__dirname,'media-worker.py'),path.join(DATA_DIR,'media',media.filename),path.join(DATA_DIR,'media',thumbnail),media.mime],{timeout:240000,windowsHide:true,maxBuffer:1024*1024},(error,stdout,stderr)=>{try{if(error)throw new Error((stderr||error.message).slice(-1200));const result=JSON.parse(stdout);result.metadata=enrichMetadata(result.metadata);db.prepare("UPDATE media SET thumbnail=?,metadata=?,dhash=?,preview=?,status='ready' WHERE id=?").run(thumbnail,JSON.stringify(result.metadata),result.dhash,result.preview||null,media.id);db.prepare("UPDATE jobs SET status='done',error=NULL,updated_at=? WHERE id=?").run(now(),job.id);require('./semantic.cjs').enqueue(media.id)}catch(e){db.prepare("UPDATE media SET status='failed' WHERE id=?").run(media.id);db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=?").run(String(e.message).slice(-1200),now(),job.id)}finally{running=false;setImmediate(tick)}});
}
const interval=setInterval(tick,700);interval.unref();module.exports={tick};
