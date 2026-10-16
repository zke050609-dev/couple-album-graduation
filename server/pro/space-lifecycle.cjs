'use strict';
const fs=require('node:fs'),path=require('node:path');
const {db,DATA_DIR,transaction}=require('./store.cjs');
const mediaRoot=path.join(DATA_DIR,'media'),cleanupRoot=path.join(DATA_DIR,'space-cleanup');
const fault=(status,message)=>Object.assign(new Error(message),{status});
function mediaPath(name){const target=path.resolve(mediaRoot,name);if(path.dirname(target)!==mediaRoot)throw new Error('Invalid stored media filename');return target}
// Staging makes file removal recoverable if the database transaction fails or the process exits.
function recoverCleanup(){if(!fs.existsSync(cleanupRoot))return;for(const entry of fs.readdirSync(cleanupRoot,{withFileTypes:true})){if(!entry.isDirectory()||!/^[-a-f0-9]{36}$/.test(entry.name))continue;const dir=path.join(cleanupRoot,entry.name);if(db.prepare('SELECT 1 FROM spaces WHERE id=?').get(entry.name)){for(const name of fs.readdirSync(dir))fs.renameSync(path.join(dir,name),mediaPath(name));fs.rmdirSync(dir)}else{try{fs.rmSync(dir,{recursive:true,force:true})}catch(error){console.error('Deferred space file cleanup:',error.code)}}}}
function deleteSpace(sid,{name,revision}){
 const space=db.prepare('SELECT name FROM spaces WHERE id=?').get(sid);
 if(!space)throw fault(404,'空间不存在');
 if(name!==space.name)throw fault(400,'请输入完整的空间名称确认删除');
 if(db.prepare('SELECT revision FROM notebooks WHERE space_id=?').get(sid).revision!==revision)throw fault(409,'空间内容已更新，请同步后重新确认删除');
 if(db.prepare("SELECT 1 FROM jobs WHERE space_id=? AND status='running'").get(sid)||db.prepare("SELECT 1 FROM semantic_jobs WHERE space_id=? AND status='running'").get(sid))throw fault(409,'此空间还有影像正在处理，请等待任务完成后再删除');
 const files=[...new Set(db.prepare('SELECT filename,thumbnail,preview FROM media WHERE space_id=?').all(sid).flatMap(m=>[m.filename,m.thumbnail,m.preview]).filter(Boolean))];
 const dir=path.join(cleanupRoot,sid),moved=[];
 fs.mkdirSync(dir,{recursive:true});
 try{
  for(const name of files){const source=mediaPath(name);if(fs.existsSync(source)){fs.renameSync(source,path.join(dir,name));moved.push(name)}}
  transaction(()=>{
   db.prepare('DELETE FROM semantic_jobs WHERE space_id=?').run(sid);
   db.prepare('DELETE FROM semantic_vectors WHERE media_id IN (SELECT id FROM media WHERE space_id=?)').run(sid);
   for(const table of ['memory_tasks','memory_documents','memory_drafts','jobs','media','record_search','records','trash','invites','notebooks','members','audit'])db.prepare('DELETE FROM '+table+' WHERE space_id=?').run(sid);
   db.prepare('DELETE FROM spaces WHERE id=?').run(sid);
  });
 }catch(error){for(const name of moved)fs.renameSync(path.join(dir,name),mediaPath(name));fs.rmdirSync(dir);throw error}
 let cleanupPending=false;try{fs.rmSync(dir,{recursive:true,force:true})}catch(error){cleanupPending=true;console.error('Deferred space file cleanup:',error.code)}
 return {ok:true,cleanupPending};
}
module.exports={deleteSpace,recoverCleanup};
