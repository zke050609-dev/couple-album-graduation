const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process'),os=require('node:os');
let base,child;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'couple-album-test-'));
async function start(){child=spawn(process.execPath,[path.resolve(__dirname,'../server/pro/server.cjs')],{env:{...process.env,PORT:'0',SEMANTIC_ENABLED:'0',GRAD_DATA_DIR:temp},windowsHide:true,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){base=match[0];resolve()}});child.once('error',reject);child.once('exit',code=>reject(new Error('Test server exited '+code)))});}
process.on('exit',()=>{child?.kill()});
let checks=0;
async function req(route,body,cookie='',method=body?'POST':'GET',status=200,extra={}){const res=await fetch(base+'/api/v2'+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});const json=await res.json();assert.equal(res.status,status,route+' '+JSON.stringify(json));checks++;return {data:json,cookie:res.headers.get('set-cookie')?.split(';')[0]}}
async function register(username){return (await req('/auth/register',{username,password:'TestPass_2026',displayName:username},'', 'POST')).cookie}
(async()=>{
await start();
const prefix='qa'+Date.now(),owner=await register(prefix+'a'),editor=await register(prefix+'b'),viewer=await register(prefix+'c'),outsider=await register(prefix+'d');
const me=(await req('/me',null,owner)).data,sid=me.spaces[0].id,s='/spaces/'+sid;
await req('/auth/login',{username:prefix+'a',password:'wrongpass'},'','POST',401);
await req(s+'/notebook',null,'','GET',401);await req(s+'/notebook',null,outsider,'GET',403);
const invite=(await req(s+'/invites',{role:'editor'},owner,'POST',201)).data;
await req('/join',{code:invite.code},editor);await req('/join',{code:invite.code},outsider,'POST',400);
const second=(await req(s+'/invites',{role:'editor'},owner,'POST',201)).data;await req('/join',{code:second.code},outsider,'POST',409);
const vi=(await req(s+'/invites',{role:'viewer'},owner,'POST',201)).data;await req('/join',{code:vi.code},viewer);
const n=(await req(s+'/notebook',null,editor)).data;assert.equal(n.role,'editor');assert.equal(n.data.albums.length,0);
await req(s+'/notebook',{data:n.data,revision:n.revision},viewer,'PUT',403);
await req(s+'/notebook',{data:n.data,revision:n.revision},owner,'PUT',403,{Origin:'https://foreign.example'});
n.data.albums.push({id:10,name:'海边散步',photos:[{id:11,date:'2026-10-13',text:'海边散步，周末旅行',mediaType:'image',image:''}],cover:''});n.data.notes.push({id:20,text:'一起喝咖啡',date:'2026-10-13'});
let revision=(await req(s+'/notebook',{data:n.data,revision:n.revision},owner,'PUT')).data.revision;
await req(s+'/notebook',{data:n.data,revision:n.revision},editor,'PUT',409);
assert.equal((await req(s+'/search?q='+encodeURIComponent('海边散步'),null,viewer)).data.results.length,2);
assert.equal((await req(s+'/search?q='+encodeURIComponent('咖啡'),null,editor)).data.results.length,1);
const after=structuredClone(n.data);after.albums[0].photos=[];revision=(await req(s+'/notebook',{data:after,revision},editor,'PUT')).data.revision;
let trash=(await req(s+'/trash',null,owner)).data.items;assert.equal(trash.length,1);await req(s+'/trash/'+trash[0].id,{},viewer,'POST',403);revision=(await req(s+'/trash/'+trash[0].id,{},owner)).data.revision;
const restored=(await req(s+'/notebook',null,owner)).data;assert.equal(restored.data.albums[0].photos.length,1);
restored.data.albums=[];revision=(await req(s+'/notebook',{data:restored.data,revision},owner,'PUT')).data.revision;trash=(await req(s+'/trash',null,owner)).data.items;assert.equal(trash.length,1,'parent deletion should avoid duplicate child trash');revision=(await req(s+'/trash/'+trash[0].id,{},owner)).data.revision;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
async function upload(cookie=owner){const r=await fetch(base+'/api/v2'+s+'/media',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','X-File-Name':'test.png'},body:png});const data=await r.json();assert.ok([200,201].includes(r.status),JSON.stringify(data));checks++;return data}
const media=await upload(),duplicate=await upload();assert.equal(media.id,duplicate.id);assert.equal(duplicate.duplicate,true);
const denied=await fetch(base+media.url,{headers:{Cookie:outsider}});assert.equal(denied.status,403);checks++;
const unauthorized=await fetch(base+media.url);assert.equal(unauthorized.status,401);checks++;
const range=await fetch(base+media.url,{headers:{Cookie:viewer,Range:'bytes=0-7'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,8);checks++;
const privateStatic=await fetch(base+'/runtime/graduation.sqlite');assert.equal(privateStatic.status,404);checks++;
const fake=await fetch(base+'/api/v2'+s+'/media',{method:'POST',headers:{Cookie:owner,'Content-Type':'image/png'},body:Buffer.from('<svg onload="alert(1)"></svg>')});assert.equal(fake.status,415);checks++;
const bn=(await req(s+'/notebook',null,owner)).data;bn.data.albums[0].photos[0].image=media.url;revision=(await req(s+'/notebook',{data:bn.data,revision:bn.revision},owner,'PUT')).data.revision;
const otherMe=(await req('/me',null,outsider)).data;const otherSid=otherMe.spaces[0].id;const otherN=(await req('/spaces/'+otherSid+'/notebook',null,outsider)).data;otherN.data.albums=[{id:111,name:'bad',photos:[{id:222,image:media.url}]}];await req('/spaces/'+otherSid+'/notebook',{data:otherN.data,revision:otherN.revision},outsider,'PUT',403);
await req(s+'/statistics',null,viewer);await req(s+'/audit',null,viewer);const backup=(await req(s+'/export',null,owner)).data;await req(s+'/import',{data:backup.data,revision:backup.revision},owner);
let ready;for(let i=0;i<30;i++){const list=(await req(s+'/media',null,owner)).data.media;ready=list.find(m=>m.id===media.id);if(ready.status==='ready')break;if(ready.status==='failed')throw new Error(JSON.stringify((await req(s+'/jobs',null,owner)).data));await new Promise(r=>setTimeout(r,500))}assert.equal(ready.status,'ready');assert.ok(ready.thumbnail);assert.equal(ready.metadata.width,1);await req(s+'/duplicates',null,owner);
const removedId=(await req('/me',null,editor)).data.user.id;await req(s+'/members/'+removedId,{},owner,'DELETE');await req(s+'/notebook',null,editor,'GET',403);
await req('/auth/password',{currentPassword:'TestPass_2026',newPassword:'ChangedPass_2026'},owner,'PUT');await req('/auth/logout',{},owner);await req('/me',null,owner,'GET',401);
console.log('PASS API:',checks,'requests; auth, tenant isolation, editor/viewer, single-use invites, capacity, conflicts, FTS/CJK, trash, exact dedup, protected media/range, worker, import/export, removal, password and logout');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{child?.kill()});
