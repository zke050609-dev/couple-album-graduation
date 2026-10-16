'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const DATA_DIR=path.resolve(process.env.GRAD_DATA_DIR||path.join(__dirname,'../../runtime'));
fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(path.join(DATA_DIR,'media'),{recursive:true});
const db=new DatabaseSync(path.join(DATA_DIR,'graduation.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,password TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members(space_id TEXT REFERENCES spaces(id),user_id TEXT REFERENCES users(id),role TEXT CHECK(role IN ('owner','editor','viewer')),joined_at TEXT NOT NULL,PRIMARY KEY(space_id,user_id));
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,space_id TEXT REFERENCES spaces(id),token_hash TEXT UNIQUE NOT NULL,role TEXT CHECK(role IN ('editor','viewer')),expires_at INTEGER NOT NULL,used_by TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notebooks(space_id TEXT PRIMARY KEY REFERENCES spaces(id),revision INTEGER NOT NULL DEFAULT 0,data_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records(space_id TEXT REFERENCES spaces(id),record_key TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,date TEXT,city TEXT,body TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(space_id,record_key));
CREATE VIRTUAL TABLE IF NOT EXISTS record_search USING fts5(space_id UNINDEXED,record_key UNINDEXED,body,tokenize='trigram');
CREATE TABLE IF NOT EXISTS trash(id TEXT PRIMARY KEY,space_id TEXT REFERENCES spaces(id),record_key TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,payload TEXT NOT NULL,location TEXT NOT NULL,deleted_at TEXT NOT NULL,deleted_by TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,space_id TEXT REFERENCES spaces(id),user_id TEXT REFERENCES users(id),name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,filename TEXT NOT NULL,thumbnail TEXT,metadata TEXT NOT NULL DEFAULT '{}',dhash TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(space_id,sha256));
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,space_id TEXT REFERENCES spaces(id),media_id TEXT REFERENCES media(id),status TEXT NOT NULL,attempts INTEGER DEFAULT 0,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,space_id TEXT REFERENCES spaces(id),user_id TEXT REFERENCES users(id),action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_space_time ON audit(space_id,created_at);
CREATE INDEX IF NOT EXISTS media_space ON media(space_id);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS trash_space ON trash(space_id);
`);
if(!db.prepare('PRAGMA table_info(media)').all().some(c=>c.name==='preview'))db.exec('ALTER TABLE media ADD COLUMN preview TEXT');
const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function empty(){return {pin:'1234',startDate:'',siteName:'情侣相册',features:{timeline:true,diary:true,memory:true},albums:[],memories:[],diaries:[],anniversaries:[],notes:[],mapPlaces:[],travelPlans:[],cityIcons:{}}}
function audit(space,user,action,detail=''){db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(id(),space,user,action,String(detail).slice(0,600),now())}
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}}
function createSpace(user,name){return transaction(()=>{const sid=id();db.prepare('INSERT INTO spaces VALUES(?,?,?,?)').run(sid,name,user,now());db.prepare('INSERT INTO members VALUES(?,?,?,?)').run(sid,user,'owner',now());db.prepare('INSERT INTO notebooks VALUES(?,?,?,?)').run(sid,0,JSON.stringify(empty()),now());audit(sid,user,'space.create',name);return sid})}
function notebook(sid){const row=db.prepare('SELECT * FROM notebooks WHERE space_id=?').get(sid);return {revision:row.revision,data:JSON.parse(row.data_json),updatedAt:row.updated_at}}
// Locations describe array paths; they also allow restoring photos into the correct parent album.
function flatten(data){const result=new Map();const add=(kind,items,location,city='')=>{for(const x of items||[]){const key=kind+':'+location.join('/')+':'+x.id;const label=String(x.name||x.title||x.originalName||x.text||'未命名').slice(0,90);const effectiveCity=city||x.detectedCity||'';const body=[label,x.text,x.mood,x.tag,x.date,effectiveCity].filter(Boolean).join(' ');result.set(key,{key,kind,label,date:x.date||x.startDate||'',city:effectiveCity,body,payload:x,location})}};
 for(const kind of ['diaries','memories','anniversaries','notes','travelPlans'])add(kind,data[kind],[kind]);
 add('album',data.albums,['albums']);for(const a of data.albums||[])add('photo',a.photos,['albums',String(a.id),'photos']);
 add('city',data.mapPlaces,['mapPlaces']);for(const p of data.mapPlaces||[]){add('cityAlbum',p.albums,['mapPlaces',String(p.id),'albums'],p.city);for(const a of p.albums||[])add('photo',a.photos,['mapPlaces',String(p.id),'albums',String(a.id),'photos'],p.city)}return result;
}
function reindex(sid,data){db.prepare('DELETE FROM records WHERE space_id=?').run(sid);db.prepare('DELETE FROM record_search WHERE space_id=?').run(sid);const ins=db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,?)'),fts=db.prepare('INSERT INTO record_search(space_id,record_key,body) VALUES(?,?,?)');for(const r of flatten(data).values()){ins.run(sid,r.key,r.kind,r.label,r.date,r.city,r.body,JSON.stringify(r.payload));fts.run(sid,r.key,r.body)}}
function isAncestor(a,b){return b.location.length>a.location.length&&b.location.slice(0,a.location.length).join('/')===a.location.join('/')&&b.location[a.location.length]===String(a.payload.id)}
function saveNotebook(sid,user,data,revision,{detectDeletions=true,action='notebook.save',onSaved}={}){return transaction(()=>{const old=notebook(sid);if(old.revision!==revision){const e=new Error('另一位成员已修改内容，请同步后重试。');e.status=409;throw e}
 if(detectDeletions){const before=flatten(old.data),after=flatten(data),removed=[...before.values()].filter(x=>!after.has(x.key));const ins=db.prepare('INSERT INTO trash VALUES(?,?,?,?,?,?,?,?,?)');for(const r of removed){if(removed.some(p=>p!==r&&isAncestor(p,r)))continue;ins.run(id(),sid,r.key,r.kind,r.label,JSON.stringify(r.payload),JSON.stringify(r.location),now(),user)}}
 db.prepare('UPDATE notebooks SET data_json=?,revision=revision+1,updated_at=? WHERE space_id=?').run(JSON.stringify(data),now(),sid);reindex(sid,data);audit(sid,user,action);if(onSaved)onSaved(old.revision+1);return old.revision+1})}
function resolveArray(data,location){let cursor=data;for(const part of location){if(Array.isArray(cursor))cursor=cursor.find(x=>String(x.id)===part);else cursor=cursor?.[part];if(!cursor)return null}return Array.isArray(cursor)?cursor:null}
function restoreTrash(sid,user,tid){const row=db.prepare('SELECT * FROM trash WHERE id=? AND space_id=?').get(tid,sid);if(!row){const e=new Error('回收记录不存在');e.status=404;throw e}return transaction(()=>{const n=notebook(sid),loc=JSON.parse(row.location),item=JSON.parse(row.payload),list=resolveArray(n.data,loc);if(!list){const e=new Error('上级相册已删除，请先恢复上级相册。');e.status=409;throw e}if(list.some(x=>String(x.id)===String(item.id))){const e=new Error('此记录已存在，无法重复恢复。');e.status=409;throw e}list.unshift(item);
 if(loc[0]==='mapPlaces'){const p=n.data.mapPlaces.find(x=>String(x.id)===loc[1]);if(p)p.photos=(p.albums||[]).flatMap(a=>a.photos||[])}
 db.prepare('UPDATE notebooks SET data_json=?,revision=revision+1,updated_at=? WHERE space_id=?').run(JSON.stringify(n.data),now(),sid);db.prepare('DELETE FROM trash WHERE id=?').run(tid);reindex(sid,n.data);audit(sid,user,'trash.restore',row.label);return n.revision+1})}
module.exports={db,DATA_DIR,id,now,hash,empty,audit,transaction,createSpace,notebook,flatten,saveNotebook,restoreTrash};

