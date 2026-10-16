let timelineRange='all',travelState=null;
const timelineFilters={year:'',month:'',day:'',city:''};

function photoTimestamp(photo){
  const raw=String(photo.date||'').trim().replace(/[./]/g,'-');
  const parts=/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(raw);
  if(parts){const value=new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3]||1)).getTime();if(Number.isFinite(value))return value}
  if(photo.createdAt){const value=new Date(photo.createdAt).getTime();if(Number.isFinite(value))return value}
  return Number(photo.id)>1e12?Number(photo.id):0;
}
function cityTimelinePhotos(){
  const result=[];
  data.mapPlaces.forEach(place=>{const album=ensureCityAlbum(place).album;(place.photos||[]).forEach(photo=>{
    if(photo.image&&isStaticPhoto(photo))result.push({...photo,placeId:place.id,albumId:album.id,city:place.city,albumName:'城市回忆',timestamp:photoTimestamp(photo)});
  })});
  return result.sort((a,b)=>b.timestamp-a.timestamp||Number(b.id)-Number(a.id));
}
function timelineCutoff(months){const date=new Date();date.setMonth(date.getMonth()-months);return date.getTime()}
function photosForRange(range='all'){const photos=cityTimelinePhotos();return range==='all'?photos:photos.filter(photo=>photo.timestamp&&photo.timestamp<=timelineCutoff(Number(range)))}
function timelineVisiblePhotos(){
  return photosForRange(timelineRange).filter(photo=>{
    if(timelineFilters.city&&photo.city!==timelineFilters.city)return false;
    if(!timelineFilters.year)return true;
    if(!photo.timestamp)return false;
    const date=new Date(photo.timestamp);
    return date.getFullYear()===Number(timelineFilters.year)&&(!timelineFilters.month||date.getMonth()+1===Number(timelineFilters.month))&&(!timelineFilters.day||date.getDate()===Number(timelineFilters.day));
  });
}
function timelineDate(photo){if(photo.date)return esc(photo.date.replace(/-/g,'.').replace(/\//g,'.'));if(photo.timestamp)return new Date(photo.timestamp).toLocaleDateString('zh-CN').replace(/\//g,'.');return ''}
function rangeOptions(selected='all'){return [['all','全部时光'],['1','1 个月以前'],['3','3 个月以前'],['6','半年以前'],['12','1 年以前']].map(([value,label])=>'<option value="'+value+'" '+(String(selected)===value?'selected':'')+'>'+label+'</option>').join('')}
function setTimelineRange(value){timelineRange=value;Object.assign(timelineFilters,{year:'',month:'',day:''});render()}
function setTimelineFilter(field,value){
  timelineFilters[field]=value;
  if(field==='year'){timelineFilters.month='';timelineFilters.day=''}
  if(field==='month')timelineFilters.day='';
  if(field!=='city')timelineRange='all';
  render();
}
function resetTimelineFilters(){timelineRange='all';Object.assign(timelineFilters,{year:'',month:'',day:'',city:''});render()}
function timelineFilterSummary(){
  const date=timelineFilters.year?timelineFilters.year+'年'+(timelineFilters.month?timelineFilters.month+'月':'')+(timelineFilters.day?timelineFilters.day+'日':''):({'all':'全部时光','1':'1 个月以前','3':'3 个月以前','6':'半年以前','12':'1 年以前'}[timelineRange]);
  return date+' · '+(timelineFilters.city||'全部城市');
}
function timelineFilterToolbar(photos,all){
  const years=[...new Set([new Date().getFullYear(),...all.filter(photo=>photo.timestamp).map(photo=>new Date(photo.timestamp).getFullYear())])].sort((a,b)=>b-a);
  if(timelineFilters.year&&!years.includes(Number(timelineFilters.year)))years.push(Number(timelineFilters.year));
  const cities=[...new Set(all.map(photo=>photo.city))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const options=(items,selected,suffix='')=>items.map(value=>'<option value="'+esc(value)+'" '+(String(value)===String(selected)?'selected':'')+'>'+esc(value)+suffix+'</option>').join('');
  const days=timelineFilters.year&&timelineFilters.month?new Date(Number(timelineFilters.year),Number(timelineFilters.month),0).getDate():31;
  return '<div class="timeline-toolbar"><div class="timeline-filter-group"><label for="timeline-range">时间筛选</label><select id="timeline-range" onchange="setTimelineRange(this.value)">'+rangeOptions(timelineRange)+'</select></div><div class="timeline-filter-group"><label for="timeline-year">自选日期</label><select id="timeline-year" aria-label="选择年份" onchange="setTimelineFilter(\'year\',this.value)"><option value="">全部年份</option>'+options(years,timelineFilters.year,'年')+'</select><select id="timeline-month" aria-label="选择月份" '+(timelineFilters.year?'':'disabled')+' onchange="setTimelineFilter(\'month\',this.value)"><option value="">全年</option>'+options(Array.from({length:12},(_,i)=>i+1),timelineFilters.month,'月')+'</select><select id="timeline-day" aria-label="选择日期" '+(timelineFilters.year&&timelineFilters.month?'':'disabled')+' onchange="setTimelineFilter(\'day\',this.value)"><option value="">整月</option>'+options(Array.from({length:days},(_,i)=>i+1),timelineFilters.day,'日')+'</select></div><div class="timeline-filter-group"><label for="timeline-city">地点筛选</label><select id="timeline-city" onchange="setTimelineFilter(\'city\',this.value)"><option value="">全部城市</option>'+options(cities,timelineFilters.city)+'</select></div><button class="text-btn" onclick="resetTimelineFilters()">重置筛选</button><span>共 '+photos.length+' 张照片</span></div>';
}
function albumTimeline(){
  const photos=timelineVisiblePhotos(),all=cityTimelinePhotos();
  const cards=photos.map(photo=>'<div class="timeline-item"><span class="date-pill">'+[timelineDate(photo),esc(photo.city)].filter(Boolean).join(' · ')+'</span><article class="timeline-card timeline-photo-card" onclick="openPhotoLightbox(\'city\','+photo.albumId+','+photo.id+','+photo.placeId+')"><img src="'+esc(photo.image)+'" alt="'+esc(photo.city)+'的照片"><div class="timeline-card-copy"><p class="timeline-album-name">'+esc(photo.city)+'回忆</p>'+(photo.text?'<p class="timeline-description">'+esc(photo.text)+'</p>':'')+'<div class="timeline-card-footer"><span class="tag">'+esc(photo.city)+'</span>'+(photo.mood?'<span class="timeline-mood">'+esc(photo.mood)+'</span>':'')+'</div></div></article></div>').join('');
  return '<section class="page timeline-page"><div class="page-header"><div><p class="eyebrow">TIMELINE</p><h2>我们的 <em>时光轴</em></h2><p class="subtext">每座城市里的每一帧，按时间汇成我们的故事。</p></div><button class="primary travel-start" onclick="startTimeTravel()">✦ 开始时光旅行</button></div>'+timelineFilterToolbar(photos,all)+(photos.length?'<div class="timeline timeline-from-albums">'+cards+'</div>':'<div class="timeline-empty"><span>♡</span><h3>'+(all.length?'当前筛选下还没有照片':'城市里还没有照片')+'</h3><p>'+(all.length?'换个日期或城市，再沿着记忆走走吧。':'先去足迹地图，点击城市直接添加照片吧。')+'</p></div>')+'</section>';
}
timeline=albumTimeline;

function normalizedTravelSettings(source={}){return{interval:Math.max(1,Math.min(60,Math.round(Number(source.interval)||5))),count:Math.max(1,Math.min(5,Math.round(Number(source.count)||1))),immersive:Boolean(source.immersive)}}
function currentTravelSettings(){return normalizedTravelSettings(data.travelSettings||{})}
function travelSettingsFields(settings){return '<p class="travel-filter-summary">跟随时光轴：'+esc(travelState?.filterSummary||timelineFilterSummary())+'</p><label>照片轮播间隔</label><div class="travel-interval"><input name="interval" type="number" min="1" max="60" step="1" value="'+settings.interval+'" required><span>秒 / 轮</span></div><label>每轮显示的照片数量</label><select name="count">'+[1,2,3,4,5].map(count=>'<option value="'+count+'" '+(settings.count===count?'selected':'')+'>'+count+' 张</option>').join('')+'</select><label class="travel-immersive-choice"><input name="immersive" type="checkbox" '+(settings.immersive?'checked':'')+'><span><b>沉浸式全屏播放</b><small>仅显示照片，按 Esc 返回；手机轻点照片返回普通播放。</small></span></label>'}
function settingsFromForm(form){const values=new FormData(form);return normalizedTravelSettings({interval:values.get('interval'),count:values.get('count'),immersive:values.get('immersive')==='on'})}
function openTravelSettings(){
  modal('<h3>时光旅行设置</h3><form id="travel-settings-form" class="travel-settings-form">'+travelSettingsFields(currentTravelSettings())+'<div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">取消</button><button class="primary">开始旅行</button></div></form>');
  $('#travel-settings-form').onsubmit=async event=>{event.preventDefault();const next=settingsFromForm(event.target);if(!timelineVisiblePhotos().length)return toast('当前筛选下还没有照片');data.travelSettings=next;if(!await saveFormDraft(event.target))return;startTimeTravel(next)};
}
function travelSlideMarkup(photos,index,total){
  const first=photos[0],start=index*travelState.settings.count+1,end=start+photos.length-1;
  const frames=photos.map(photo=>'<figure class="travel-frame"><img src="'+esc(photo.image)+'" alt="'+esc(photo.city)+'的时光旅行照片"><span class="travel-tape"></span>'+(photos.length>1?'<figcaption>'+timelineDate(photo)+' · '+esc(photo.city)+'</figcaption>':'')+'</figure>').join('');
  const meta=[timelineDate(first),esc(first.city)].filter(Boolean).join(' · ');
  return '<div class="travel-ambient" style="background-image:url(\''+esc(first.image)+'\')"></div><div class="travel-photo-group travel-group-'+photos.length+'">'+frames+'</div><div class="travel-story"><p class="travel-meta">'+(photos.length===1?meta:esc(travelState.filterSummary))+'</p>'+(photos.length===1&&first.text?'<blockquote class="travel-description">'+esc(first.text)+'</blockquote>':'')+(photos.length===1&&first.mood?'<p class="travel-mood">'+esc(first.mood)+'</p>':'')+'</div><div class="travel-count"><b>'+start+(end>start?'–'+end:'')+'</b><span>/ '+total+'</span></div>';
}
function startTravelTimer(){if(!travelState)return;clearInterval(travelState.timer);travelState.timer=travelState.playing?setInterval(()=>travelNext(1),travelState.settings.interval*1000):null}
function renderTravelSlide(){
  if(!travelState)return;const stage=document.querySelector('.travel-stage');if(!stage)return;
  const start=travelState.index*travelState.settings.count;
  stage.innerHTML=travelSlideMarkup(travelState.photos.slice(start,start+travelState.settings.count),travelState.index,travelState.photos.length);
  const progress=document.querySelector('.travel-progress span');if(progress){progress.style.setProperty('--travel-duration',travelState.settings.interval+'s');progress.style.animation='none';void progress.offsetWidth;progress.style.animation=travelState.playing?'travel-progress var(--travel-duration) linear forwards':'none'}
  const toggle=document.querySelector('.travel-toggle');if(toggle)toggle.textContent=travelState.playing?'Ⅱ 暂停':'▶ 继续';
}
function inlineTravelSettings(){return '<form id="travel-inline-form" class="travel-config-card" data-draft-key="travel:inline"><h3>旅行设置</h3>'+travelSettingsFields(travelState.settings)+'<div class="modal-actions"><button type="button" class="secondary" onclick="toggleTravelSettingsPanel()">取消</button><button class="primary">应用设置</button></div></form>'}
function startTimeTravel(settings=currentTravelSettings()){
  const photos=timelineVisiblePhotos();if(!photos.length)return toast('当前筛选下还没有照片');
  captureOpenDrafts();if(travelState)clearInterval(travelState.timer);
  settings=normalizedTravelSettings(settings);
  travelState={photos,index:0,playing:true,timer:null,settings,filterSummary:timelineFilterSummary(),resumeAfterSettings:true};
  $('#modal-root').innerHTML='<div class="time-travel" role="dialog" aria-modal="true" aria-label="时光旅行"><div class="travel-tools"><button onclick="toggleTravelSettingsPanel()">⚙ 设置</button><button onclick="enterImmersiveTravel()">⛶ 沉浸播放</button><button class="travel-close" onclick="closeTimeTravel()" aria-label="结束时光旅行">×</button></div><div class="travel-title"><small>OUR TIME JOURNEY</small><strong>沿着照片，再爱一遍</strong></div><div class="travel-stage" onclick="if(event.currentTarget.closest(\'.immersive\'))exitImmersiveTravel()"></div><div class="travel-controls"><button onclick="travelNext(-1)" aria-label="上一轮">←</button><button class="travel-toggle" onclick="toggleTimeTravel()">Ⅱ 暂停</button><button onclick="travelNext(1)" aria-label="下一轮">→</button></div><div class="travel-progress"><span></span></div><div class="travel-config" hidden></div></div>';
  renderTravelSlide();startTravelTimer();document.body.classList.add('traveling');if(settings.immersive)enterImmersiveTravel();
}
function travelNext(direction){if(!travelState)return;const total=Math.ceil(travelState.photos.length/travelState.settings.count);travelState.index=(travelState.index+direction+total)%total;renderTravelSlide();startTravelTimer()}
function toggleTimeTravel(){if(!travelState)return;travelState.playing=!travelState.playing;renderTravelSlide();startTravelTimer()}
function toggleTravelSettingsPanel(){
  if(!travelState)return;const panel=document.querySelector('.travel-config');if(!panel)return;
  if(panel.hidden){travelState.resumeAfterSettings=travelState.playing;travelState.playing=false;startTravelTimer();panel.innerHTML=inlineTravelSettings();const form=$('#travel-inline-form');restorePageDraft(form);form.onsubmit=event=>{event.preventDefault();applyTravelSettings()};panel.hidden=false}
  else{capturePageDraft($('#travel-inline-form'));panel.hidden=true;travelState.playing=travelState.resumeAfterSettings;renderTravelSlide();startTravelTimer()}
}
async function applyTravelSettings(){
  if(!travelState)return;const form=$('#travel-inline-form');if(!form.reportValidity())return;
  const next=settingsFromForm(form);data.travelSettings=next;if(!await saveFormDraft(form))return;
  if(!travelState)return;travelState.settings=next;travelState.index=0;travelState.playing=travelState.resumeAfterSettings;document.querySelector('.travel-config').hidden=true;document.querySelector('.time-travel').classList.toggle('immersive',next.immersive);renderTravelSlide();startTravelTimer();
}
function enterImmersiveTravel(){if(!travelState)return;document.querySelector('.time-travel')?.classList.add('immersive');travelState.settings.immersive=true}
function exitImmersiveTravel(){document.querySelector('.time-travel')?.classList.remove('immersive');if(travelState)travelState.settings.immersive=false}
function closeTimeTravel(){captureOpenDrafts();if(travelState)clearInterval(travelState.timer);travelState=null;document.body.classList.remove('traveling');$('#modal-root').innerHTML=''}
document.addEventListener('keydown',event=>{if(!travelState||(event.target instanceof Element&&event.target.matches('input,select,textarea')))return;const immersive=document.querySelector('.time-travel')?.classList.contains('immersive');if(event.key==='Escape'){immersive?exitImmersiveTravel():closeTimeTravel();return}if(document.querySelector('.travel-config')?.hidden===false)return;if(event.key==='ArrowLeft')travelNext(-1);if(event.key==='ArrowRight')travelNext(1);if(event.key===' '){event.preventDefault();toggleTimeTravel()}});
