'use strict';
// Offline administrative-area lookup. Coordinates and photos never leave this server.
const fs=require('node:fs'),path=require('node:path');
const GEO_DIR=path.resolve(__dirname,'../../assets/geo');
const MUNICIPALITIES=new Set(['北京市','天津市','上海市','重庆市']);
let areas;
const cache=new Map();
function box(coordinates){const bounds=[Infinity,Infinity,-Infinity,-Infinity];const walk=a=>{if(typeof a?.[0]==='number'){bounds[0]=Math.min(bounds[0],a[0]);bounds[1]=Math.min(bounds[1],a[1]);bounds[2]=Math.max(bounds[2],a[0]);bounds[3]=Math.max(bounds[3],a[1])}else for(const b of a||[])walk(b)};walk(coordinates);return bounds}
function inBox([x,y],b){return x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]}
function inRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const [xi,yi]=ring[i],[xj,yj]=ring[j];
 const cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
 if(Math.abs(cross)<1e-10&&x>=Math.min(xi,xj)-1e-10&&x<=Math.max(xi,xj)+1e-10&&y>=Math.min(yi,yj)-1e-10&&y<=Math.max(yi,yj)+1e-10)return true;
 if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }return inside}
function inPolygon(point,rings){return !!rings.length&&inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r))}
function contains(point,geometry){if(!geometry)return false;if(geometry.type==='Polygon')return inPolygon(point,geometry.coordinates);if(geometry.type==='MultiPolygon')return geometry.coordinates.some(p=>inPolygon(point,p));return false}
function loadAreas(){if(areas)return areas;const national=JSON.parse(fs.readFileSync(path.join(GEO_DIR,'100000_full.json'),'utf8'));areas=[];
 for(const province of national.features){const props=province.properties,code=String(props.adcode);if(!/^\d{6}$/.test(code)||code==='100000'||!province.geometry)continue;
 const row={name:props.name,adcode:code,geometry:province.geometry,bounds:box(province.geometry.coordinates),cities:[]};
 if(!MUNICIPALITIES.has(row.name)){const file=path.join(GEO_DIR,code+'_full.json');if(fs.existsSync(file)){const region=JSON.parse(fs.readFileSync(file,'utf8'));for(const city of region.features){if(String(city.properties.adcode)===code||!city.geometry)continue;row.cities.push({name:city.properties.name,adcode:String(city.properties.adcode),geometry:city.geometry,bounds:box(city.geometry.coordinates)})}}}
 areas.push(row);
 }return areas}
function locateGPS(gps){if(!gps||typeof gps.lat!=='number'||typeof gps.lng!=='number'||!Number.isFinite(gps.lat)||!Number.isFinite(gps.lng)||Math.abs(gps.lat)>90||Math.abs(gps.lng)>180)return null;
 const point=[gps.lng,gps.lat],key=gps.lat.toFixed(5)+','+gps.lng.toFixed(5);if(cache.has(key))return cache.get(key);
 let match=null;
 for(const province of loadAreas()){
  // Test each city's own boundary; province and city outlines can be simplified differently.
  if(!inBox(point,province.bounds))continue;
  if(MUNICIPALITIES.has(province.name)&&contains(point,province.geometry)){match={province:province.name,city:province.name,adcode:province.adcode,label:province.name,source:'offline-administrative-boundaries'};break}
  const city=province.cities.find(c=>inBox(point,c.bounds)&&contains(point,c.geometry));
  if(city){match={province:province.name,city:city.name,adcode:city.adcode,label:province.name+' · '+city.name,source:'offline-administrative-boundaries'};break}
  if(!match&&contains(point,province.geometry))match={province:province.name,city:'',adcode:province.adcode,label:province.name,source:'offline-administrative-boundaries'};
 }
 if(cache.size>=5000)cache.delete(cache.keys().next().value);cache.set(key,match);return match;
}
function enrichMetadata(metadata){if(!metadata||typeof metadata!=='object'||!metadata.gps||metadata.location?.city)return metadata;const location=locateGPS(metadata.gps);return location?{...metadata,location}:metadata}
function backfillLocations(db){const rows=db.prepare('SELECT id,metadata FROM media').all();const updates=[];for(const row of rows){const before=JSON.parse(row.metadata);const next=enrichMetadata(before);if(JSON.stringify(next)!==row.metadata)updates.push([JSON.stringify(next),row.id])}if(!updates.length)return 0;
 db.exec('BEGIN IMMEDIATE');try{const update=db.prepare('UPDATE media SET metadata=? WHERE id=?');for(const args of updates)update.run(...args);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return updates.length;
}
module.exports={locateGPS,enrichMetadata,backfillLocations,contains};
