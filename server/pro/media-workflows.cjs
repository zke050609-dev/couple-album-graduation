'use strict';
const {db,notebook,flatten,saveNotebook}=require('./store.cjs');
const {enrichMetadata}=require('./location.cjs');
const error=(status,message)=>Object.assign(new Error(message),{status});
function placePhotos(place){const byId=new Map();for(const p of [...(place.photos||[]),...(place.albums||[]).flatMap(a=>a.photos||[])])byId.set(String(p.id),p);return [...byId.values()]}
function hasCityMedia(place){return placePhotos(place).some(p=>p.image||p.sourceImage||p.video)}
function photoKey(p){return p.sourceImage||p.image||p.video?'media:'+(p.sourceImage||p.image||'')+'|'+(p.video||''):'id:'+p.id}
function uniquePhotos(rows){const byKey=new Map();for(const r of rows)if(!byKey.has(photoKey(r.payload)))byKey.set(photoKey(r.payload),r);return [...byKey.values()]}
function validateIds(ids){if(!Array.isArray(ids)||ids.length>1000||ids.some(i=>!Number.isSafeInteger(i)||i<0))throw error(400,'请选择有效的照片');return new Set(ids)}
function candidates(sid,ids){const selected=validateIds(ids),n=notebook(sid),mediaRows=db.prepare('SELECT * FROM media WHERE space_id=?').all(sid),byUrl=new Map(mediaRows.map(m=>['/api/v2/media/'+m.id,m])),results=[];let pending=0,failed=0;
 for(const album of n.data.albums||[])for(const photo of album.photos||[]){if(!selected.has(photo.id)||photo.mediaType==='video')continue;const m=byUrl.get(photo.sourceImage||photo.image)||byUrl.get(photo.video);if(!m)continue;const meta=enrichMetadata(JSON.parse(m.metadata)),city=meta.location?.city||'',processing=m.status==='queued'||m.status==='running';if(processing&&!city)pending++;if(m.status==='failed')failed++;if(!city&&!processing)continue;const place=n.data.mapPlaces.find(p=>p.city===city),alreadySynced=Boolean(city&&place&&placePhotos(place).some(p=>photoKey(p)===photoKey(photo)));results.push({recordId:photo.id,mediaId:m.id,name:photo.originalName||m.name,city,province:meta.location?.province||'',image:photo.image||photo.sourceImage||'',thumbnail:m.thumbnail?'/api/v2/media/'+m.id+'/thumb':null,processing,alreadySynced,canSync:!!city&&!alreadySynced,photo,metadata:meta})}
 return {revision:n.revision,items:results,pending,failed};
}
function syncToCities(sid,user,ids,revision){const selected=validateIds(ids);if(!selected.size)throw error(400,'请至少勾选一张照片');const n=notebook(sid);if(n.revision!==revision)throw error(409,'空间内容已更新，请同步后重新确认');const lookup=candidates(sid,[...selected]);const used=new Set([...flatten(n.data).values()].map(r=>r.payload.id));let sequence=Date.now();const alloc=()=>{while(used.has(sequence))sequence++;used.add(sequence);return sequence++};let added=0,skipped=0;
 for(const recordId of selected){const c=lookup.items.find(c=>c.recordId===recordId);if(!c||!c.city)throw error(409,'所选照片的位置尚未识别，或照片已移除，请刷新后重试');if(!c.canSync){skipped++;continue}let place=n.data.mapPlaces.find(p=>p.city===c.city);if(!place){place={id:alloc(),city:c.city,icon:'',photos:[],albums:[]};n.data.mapPlaces.push(place)}place.photos??=[];place.albums??=[];let album=place.albums[0];if(!album){album={id:alloc(),name:'城市回忆',date:'',cover:'',photos:[...place.photos]};place.albums.push(album)}album.photos??=[];
 // Multiple selected records may refer to the same original. Check again after each insertion.
 if(placePhotos(place).some(p=>photoKey(p)===photoKey(c.photo))){skipped++;continue}
 const copy={...structuredClone(c.photo),id:alloc(),sourceRecordId:c.photo.id,mediaId:c.mediaId,detectedCity:c.city,detectedProvince:c.province};if(!copy.date&&c.metadata.capturedAt)copy.date=c.metadata.capturedAt.slice(0,10).replaceAll(':','-');if(c.metadata.gps)copy.gps=c.metadata.gps;album.photos.push(copy);place.photos.push(copy);if(!album.cover){album.cover=copy.image||'';album.coverMediaType=copy.mediaType||'image'}added++;
 }
 const nextRevision=added?saveNotebook(sid,user,n.data,revision,{action:'city.sync'}):revision;return {revision:nextRevision,added,skipped};
}
module.exports={hasCityMedia,photoKey,uniquePhotos,candidates,syncToCities};
