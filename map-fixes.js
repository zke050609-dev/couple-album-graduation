const isIconUrl=v=>String(v||'').startsWith('/api/v2/media/')||/^(https?:\/\/|data:image\/|(?:\.?\/)?assets\/)/i.test(String(v||'').trim());
const builtinLandmarkIcons={
  '杭州市':'assets/landmarks/hangzhou-1254.png',
  '南京市':'assets/landmarks/nanjing-1254.png',
  '嘉善县':'assets/landmarks/jiashan-1254.png'
};
const originalGeoIcon=geoIcon;
geoIcon=city=>data.cityIcons?.[city]||builtinLandmarkIcons[city]||originalGeoIcon(city);
const htmlIcon=v=>isIconUrl(v)?`<img src="${esc(v)}" alt="地标图标">`:esc(v||'📍');
function appendFixedSvgIcon(g,v,name){
  const ns='http://www.w3.org/2000/svg';
  if(!isIconUrl(v)){
    const text=document.createElementNS(ns,'text');
    text.setAttribute('y','8');
    text.textContent=v||'📍';
    g.appendChild(text);
    return;
  }
  const image=document.createElementNS(ns,'image');
  const raw=String(v).trim();
  const src=/^data:/i.test(raw)?raw:new URL(raw,document.baseURI).href;
  image.setAttribute('class','city-marker-photo');
  image.setAttribute('href',src);
  image.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',src);
  image.setAttribute('x','-20.9');
  image.setAttribute('y','-20.9');
  image.setAttribute('width','41.8');
  image.setAttribute('height','41.8');
  image.setAttribute('preserveAspectRatio','xMidYMid slice');
  image.setAttribute('clip-path','url(#city-marker-image-clip)');
  image.addEventListener('error',()=>{
    const fallback=builtinLandmarkIcons[name];
    if(!fallback||image.dataset.fallbackTried)return;
    image.dataset.fallbackTried='true';
    const fallbackUrl=new URL(fallback,document.baseURI).href;
    image.setAttribute('href',fallbackUrl);
    image.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',fallbackUrl);
  });
  const frame=document.createElementNS(ns,'circle');
  frame.setAttribute('class','city-marker-frame');
  frame.setAttribute('r','22');
  frame.style.setProperty('fill','none','important');
  frame.style.setProperty('stroke','var(--rose,#d96d86)','important');
  frame.style.setProperty('stroke-width','2.2','important');
  g.append(image,frame);
}
const shortRegionName=n=>String(n).replace(/壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市$/g,'').replace('内蒙古','内蒙古');
let fixedView={scale:1,x:0,y:0,drag:null,moved:false};

function fixedMapPage(){return `<section class="page"><div class="page-header"><div><p class="eyebrow">OUR TRAVEL ATLAS</p><h2>一起去过的 <em>每一座城</em></h2><p class="subtext">悬停查看完整名称，点击省份进入地级市。</p></div><button class="primary" onclick="openAdd('place')">＋ 添加城市足迹</button></div><div class="geo-toolbar"><button class="secondary ${mapLevel.code==='100000'?'hidden':''}" onclick="backToChina()">← 返回中国地图</button><span id="geo-breadcrumb">${esc(mapLevel.name)}</span><span class="geo-hint">滚轮或按钮缩放 · 拖动空白处浏览</span></div><div id="geo-map" class="geo-map"><div class="geo-loading">正在展开地图…</div></div></section>`}
mapPage=fixedMapPage;

function fixedApplyView(){const svg=$('.geo-svg');if(!svg)return;const width=800/fixedView.scale,height=500/fixedView.scale,x=(800-width)/2+fixedView.x,y=(500-height)/2+fixedView.y;svg.style.transform='none';svg.setAttribute('viewBox',`${x} ${y} ${width} ${height}`)}
function fixedMapZoom(mult){fixedView.scale=Math.max(.7,Math.min(5,fixedView.scale*mult));fixedApplyView()}
function fixedResetZoom(){fixedView={scale:1,x:0,y:0,drag:null,moved:false};fixedApplyView()}
window.mapZoom=fixedMapZoom;window.resetMapZoom=fixedResetZoom;

function bindFixedMapInteractions(host){host.onwheel=e=>{e.preventDefault();fixedMapZoom(e.deltaY<0?1.12:.89)};host.onpointerdown=e=>{if(e.target.closest('.map-zoom-tools'))return;fixedView.drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,ox:fixedView.x,oy:fixedView.y};fixedView.moved=false};host.onpointermove=e=>{const d=fixedView.drag;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.sx,dy=e.clientY-d.sy;if(!fixedView.moved&&Math.hypot(dx,dy)<5)return;if(!fixedView.moved){fixedView.moved=true;host.classList.add('is-dragging');host.setPointerCapture(e.pointerId)}const unitX=800/host.clientWidth/fixedView.scale,unitY=500/host.clientHeight/fixedView.scale;fixedView.x=d.ox-dx*unitX;fixedView.y=d.oy-dy*unitY;fixedApplyView()};const end=()=>{if(!fixedView.drag)return;fixedView.drag=null;host.classList.remove('is-dragging');if(fixedView.moved){host.dataset.justDragged='1';setTimeout(()=>delete host.dataset.justDragged,0)}};host.onpointerup=end;host.onpointercancel=end;host.addEventListener('click',e=>{if(host.dataset.justDragged){e.preventDefault();e.stopPropagation()}},true)}

function geometryLabelCenter(geometry){const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;let ring=null,largest=-1;polygons.forEach(poly=>{const r=poly[0]||[];let area=0;for(let i=0;i<r.length-1;i++)area+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];area=Math.abs(area);if(area>largest){largest=area;ring=r}});if(!ring?.length)return null;const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),inside=(x,y)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes},segDist=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1))),px=a[0]+t*dx,py=a[1]+t*dy;return Math.hypot(x-px,y-py)};let best=null,bestDistance=-1;for(let gx=1;gx<30;gx++)for(let gy=1;gy<30;gy++){const x=minX+(maxX-minX)*gx/30,y=minY+(maxY-minY)*gy/30;if(!inside(x,y))continue;let distance=Infinity;for(let i=0;i<ring.length-1;i++)distance=Math.min(distance,segDist(x,y,ring[i],ring[i+1]));if(distance>bestDistance){bestDistance=distance;best=[x,y]}}return best||ring[0]}

async function fixedDrawGeoMap(){const host=$('#geo-map');if(!host)return;fixedResetZoom();host.innerHTML='<div class="geo-loading">正在展开地图…</div>';try{const response=await fetchGeoAsset(mapLevel.code);if(!response.ok)throw Error('map');const geo=await response.json(),features=geo.features.filter(f=>String(f.properties.adcode)!==String(mapLevel.code)),projection=projectFeatures(features),national=mapLevel.code==='100000';host.innerHTML=`<div class="map-zoom-tools"><button type="button" aria-label="放大地图" onclick="mapZoom(1.25)">＋</button><button type="button" aria-label="缩小地图" onclick="mapZoom(.8)">－</button><button type="button" onclick="resetMapZoom()">复位</button></div><svg class="geo-svg" viewBox="0 0 800 500" aria-label="${esc(mapLevel.name)}地图"><defs><clipPath id="city-marker-image-clip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"></circle></clipPath></defs>${features.map(f=>{const q=f.properties,labelPoint=projection.point(geometryLabelCenter(f.geometry)||q.centroid||q.center||[0,0]),label=shortRegionName(q.name);return `<g class="geo-area ${national?'province-area':'city-area'}" onclick="geoClick('${q.adcode}','${esc(q.name)}')"><title>${esc(q.name)}</title><path d="${projection.path(f.geometry)}"></path><text x="${labelPoint[0]}" y="${labelPoint[1]}">${esc(label)}</text></g>`}).join('')}</svg>`;$('#geo-breadcrumb').textContent=mapLevel.name;if(!national)addFixedCityPins(features,projection);bindFixedMapInteractions(host);fixedApplyView()}catch{host.innerHTML='<div class="geo-error">地图资源加载失败，请刷新页面重试。<button class="secondary" onclick="drawGeoMap()">重新加载</button></div>'}}
function addFixedCityPins(features,projection){const svg=$('.geo-svg'),ns='http://www.w3.org/2000/svg';features.forEach(f=>{const name=f.properties.name,place=data.mapPlaces.find(p=>p.city===name),c=projection.point(f.properties.centroid||f.properties.center||[0,0]),g=document.createElementNS(ns,'g'),base=document.createElementNS(ns,'circle'),title=document.createElementNS(ns,'title'),icon=geoIcon(name);g.setAttribute('class',`city-marker ${place?.photos.length?'visited':''}`);g.setAttribute('transform',`translate(${c[0]},${c[1]})`);base.setAttribute('r','22');title.textContent=`${name}${place?' · 已收藏':''}`;if(!isIconUrl(icon))g.appendChild(base);appendFixedSvgIcon(g,icon,name);g.appendChild(title);g.onclick=e=>{e.stopPropagation();ensureCity(name);place?openPlace(place.id):openAdd('place',name)};svg.appendChild(g)})}
drawGeoMap=fixedDrawGeoMap;window.drawGeoMap=fixedDrawGeoMap;
function fixedGeoClick(code,name){if(mapLevel.code==='100000'){mapLevel={code:String(code),name};render()}else{ensureCity(name);const place=data.mapPlaces.find(x=>x.city===name);place?openPlace(place.id):openAdd('place',name)}}function fixedBackToChina(){mapLevel={code:'100000',name:'中国'};render()}geoClick=fixedGeoClick;backToChina=fixedBackToChina;window.geoClick=fixedGeoClick;window.backToChina=fixedBackToChina;

const municipalityNames=new Set(['北京市','上海市','天津市','重庆市']);
function searchableLandmarks(){return `<section class="page"><div class="page-header"><div><p class="eyebrow">LANDMARK ICONS</p><h2>城市的 <em>小地标</em></h2><p class="subtext">查找城市，并管理专属地标。</p></div></div><div class="landmark-search"><span>⌕</span><input id="city-search" type="search" placeholder="搜索城市名称，例如南京、扬州"></div><div class="landmark-filters"><select id="province-filter"><option value="">全部省份</option></select><select id="landmark-filter"><option value="all">全部城市</option><option value="custom">已自定义地标的城市</option><option value="plain">未自定义地标的城市</option></select><span id="city-total"></span></div><div id="landmark-list" class="landmark-grid"><div class="directory-loading">正在读取全国地级市目录…</div></div></section>`}landmarks=searchableLandmarks;
async function fixedLoadDirectory(){const list=$('#landmark-list');if(!list)return;try{if(!cityDirectory){const national=await(await fetchGeoAsset('100000')).json(),provinces=national.features.filter(f=>String(f.properties.adcode)!=='100000'&&/^\d{6}$/.test(String(f.properties.adcode))),nested=await Promise.all(provinces.map(async p=>{if(municipalityNames.has(p.properties.name))return[{province:'直辖市',city:p.properties.name}];try{const g=await(await fetchGeoAsset(p.properties.adcode)).json();return g.features.filter(f=>String(f.properties.adcode)!==String(p.properties.adcode)).map(f=>({province:p.properties.name,city:f.properties.name}))}catch{return[]}}));cityDirectory=nested.flat().filter(x=>x.city);municipalityNames.forEach(city=>{if(!cityDirectory.some(x=>x.city===city))cityDirectory.unshift({province:'直辖市',city})})}const province=$('#province-filter'),status=$('#landmark-filter'),search=$('#city-search');province.innerHTML='<option value="">全部省份</option>'+[...new Set(cityDirectory.map(x=>x.province))].sort().map(p=>`<option>${esc(p)}</option>`).join('');const draw=()=>{const selected=province.value,mode=status.value,keyword=search.value.trim().toLowerCase(),rows=cityDirectory.filter(x=>{const custom=Boolean(data.cityIcons[x.city]||data.mapPlaces.some(p=>p.city===x.city&&p.icon)),matches=!keyword||x.city.toLowerCase().includes(keyword)||x.province.toLowerCase().includes(keyword);return matches&&(!selected||x.province===selected)&&(mode==='all'||mode==='custom'&&custom||mode==='plain'&&!custom)});$('#city-total').textContent=`共 ${rows.length} 个城市`;list.innerHTML=rows.map(x=>`<article class="landmark-card"><span>${htmlIcon(geoIcon(x.city))}</span><div><h3>${esc(x.city)}</h3><p>${esc(x.province)}</p></div><button class="secondary" onclick="editLandmark('${esc(x.city)}')">${data.cityIcons[x.city]?'已自定义':'设置图标'}</button></article>`).join('')||'<div class="directory-loading">没有找到符合条件的城市</div>'};province.onchange=draw;status.onchange=draw;search.oninput=draw;draw()}catch{list.innerHTML='<div class="directory-loading">城市目录加载失败，请刷新页面重试。</div>'}}
loadLandmarkDirectory=fixedLoadDirectory;

function fixedEditLandmark(city){modal(`<h3>${esc(city)} 的地标图标</h3><form id="landmark-form"><label>Emoji 图标</label><input name="icon" value="${isIconUrl(geoIcon(city))?'':esc(geoIcon(city))}" maxlength="8" placeholder="例如：🏯"><label>或使用图片链接</label><input name="iconUrl" value="${isIconUrl(geoIcon(city))?esc(geoIcon(city)):''}" placeholder="https://example.com/icon.png"><p class="form-help">填写图片链接后优先使用图片，建议使用正方形 PNG、JPG 或 WebP。</p><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">取消</button><button class="primary">保存图标</button></div></form>`);$('#landmark-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),url=String(f.get('iconUrl')||'').trim(),icon=String(f.get('icon')||'').trim();if(url&&!isIconUrl(url))return toast('图片链接需要以 http:// 或 https:// 开头');data.cityIcons[city]=url||icon||'📍';ensureCity(city);save();closeModal();render();toast('地标图标已更新')}}
editLandmark=fixedEditLandmark;window.editLandmark=fixedEditLandmark;

function enhancePlaceIconForm(){const form=$('#item-form');if(!form||form.querySelector('[name="iconUrl"]'))return;const icon=form.querySelector('[name="icon"]');if(!icon)return;const current=isIconUrl(icon.value)?icon.value:'';if(current)icon.value='';icon.insertAdjacentHTML('afterend',`<label>或使用地标图片链接</label><input name="iconUrl" value="${esc(current)}" placeholder="https://example.com/icon.png"><p class="form-help">图片链接会优先作为该城市的地图地标。</p>`);form.addEventListener('submit',()=>{const url=form.querySelector('[name="iconUrl"]').value.trim(),city=form.querySelector('[name="city"]')?.value;if(url){icon.value=url;if(city)data.cityIcons[city]=url}},true)}
const currentOpenAdd=window.openAdd,currentEditItem=window.editItem;window.openAdd=(type='memory',city='')=>{currentOpenAdd(type,city);if(type==='place')enhancePlaceIconForm()};window.editItem=(type,id,pid)=>{if(type==='anniversary')return openAnniversaryEditor(id);currentEditItem(type,id,pid);if(type==='place')enhancePlaceIconForm()};

function fixedAnniversaries(){return `<section class="page"><div class="page-header"><div><p class="eyebrow">OUR SPECIAL DAYS</p><h2>值得画圈的 <em>日子</em></h2><p class="subtext">每一个重要时刻，都有专属的位置。</p></div><button class="primary" onclick="openAnniversaryEditor()">＋ 添加纪念日</button></div><div class="ann-list anniversary-list">${data.anniversaries.map(a=>`<article class="ann-card"><span class="ann-icon">${esc(a.icon)}</span><div><h4>${esc(a.name)}</h4><p>${esc(a.date)}</p></div><b>${daysUntil(a.date)}<small>天</small></b><span class="ann-actions"><button onclick="openAnniversaryEditor(${a.id})">编辑</button><button onclick="confirmAnniversaryDelete(${a.id})">删除</button></span></article>`).join('')}</div></section>`}
anniversaries=fixedAnniversaries;
function openAnniversaryEditor(id){const item=id?data.anniversaries.find(x=>x.id===id):null;modal(`<h3>${item?'修改纪念日':'添加纪念日'}</h3><form id="anniversary-form"><label>纪念日名称</label><input name="name" value="${esc(item?.name||'')}" required><label>日期</label><input name="date" type="date" value="${esc(item?.date||'')}" required><label>图标</label><input name="icon" value="${esc(item?.icon||'♡')}" maxlength="8"><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">取消</button><button class="primary">保存</button></div></form>`);$('#anniversary-form').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(item)Object.assign(item,f);else data.anniversaries.push({id:uid(),...f});save();closeModal();render();toast(item?'纪念日已修改':'纪念日已添加')}}
function confirmAnniversaryDelete(id){modal(`<h3>删除这个纪念日？</h3><p class="delete-copy">删除后将无法恢复。</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">取消</button><button class="danger" onclick="removeAnniversary(${id})">确定删除</button></div>`)}
function removeAnniversary(id){data.anniversaries=data.anniversaries.filter(x=>x.id!==id);save();closeModal();render();toast('纪念日已删除')}
window.openAnniversaryEditor=openAnniversaryEditor;window.confirmAnniversaryDelete=confirmAnniversaryDelete;window.removeAnniversary=removeAnniversary;
