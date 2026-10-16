function ensureCityAlbum(place){
  let changed=false;
  if(!Array.isArray(place.photos)){place.photos=[];changed=true}
  if(!Array.isArray(place.albums)){place.albums=[];changed=true}
  const merged=[],seen=new Set();
  const addPhoto=photo=>{if(!photo)return;photo.id??=uid();const key=String(photo.id);if(!seen.has(key)){seen.add(key);merged.push(photo)}};
  place.photos.forEach(addPhoto);
  place.albums.forEach(album=>{if(!Array.isArray(album.photos)){album.photos=[];changed=true}album.photos.forEach(addPhoto)});
  let album=place.albums[0];
  if(!album){album={id:uid(),name:'城市回忆',date:'',cover:'',coverMediaType:'',photos:[]};changed=true}
  if(album.id==null){album.id=uid();changed=true}
  if(place.albums.length!==1)changed=true;
  if(album.photos.length!==merged.length||album.photos.some((photo,index)=>String(photo.id)!==String(merged[index]?.id)))changed=true;
  if(place.photos.length!==merged.length||place.photos.some((photo,index)=>String(photo.id)!==String(merged[index]?.id)))changed=true;
  album.name='城市回忆';
  album.photos=[...merged];
  const coverItem=merged.find(photo=>photo.image&&String(photo.mediaType||'image')==='image')||merged.find(photo=>photo.image);
  if(!album.cover&&coverItem){album.cover=coverItem.image;album.coverMediaType=coverItem.mediaType||'image';changed=true}
  place.photos=[...merged];
  place.albums=[album];
  return{album,changed}
}
window.ensureCityAlbum=ensureCityAlbum;

function ensureAlbumModel(){
  let changed=false;
  if(!Array.isArray(data.albums)){data.albums=[];changed=true}
  data.albums.forEach(album=>{
    if(!Array.isArray(album.photos)){album.photos=[];changed=true}
    const known=new Set(album.photos.map(photo=>String(photo.id)));
    data.memories.filter(photo=>String(photo.albumId||'')===String(album.id)).forEach(photo=>{
      if(!known.has(String(photo.id))){album.photos.push(photo);known.add(String(photo.id));changed=true}
    });
    if(!album.cover){const coverItem=album.photos.find(photo=>photo.image&&String(photo.mediaType||'image')==='image')||album.photos.find(photo=>photo.image);if(coverItem){album.cover=coverItem.image;album.coverMediaType=coverItem.mediaType||'image';changed=true}}
  });
  data.mapPlaces.forEach(place=>{
    const normalized=ensureCityAlbum(place);
    if(normalized.changed)changed=true;
  });
  if(changed)save();
}
storageReady.then(()=>ensureAlbumModel());
const fallbackCover='assets/theme-sakura.png';
const albumCover=a=>a.cover||a.photos?.[0]?.image||fallbackCover;
const moodButtons=()=>`<details class="mood-picker"><summary>☺ 选择心情表情（可多选）</summary><div>${moodChoices.map(([emoji,text])=>`<button type="button" title="${text}" data-mood="${emoji} ${text}"><span>${emoji}</span><small>${text}</small></button>`).join('')}</div></details>`;
function photoGrid(photos,scope,parentId,placeId=''){return photos.length?`<div class="album-photo-grid">${photos.map(p=>`<article><img src="${esc(p.image)}" alt="${esc(p.title||'相册照片')}"><div><h4>${esc(p.title||'未命名照片')}</h4><p>${esc(p.date||'未填写日期')}${p.mood?' · '+esc(p.mood):''}</p>${p.text?`<small>${esc(p.text)}</small>`:''}</div><span class="photo-actions"><button onclick="editNestedPhoto('${scope}',${parentId},${p.id}${placeId?','+placeId:''})">编辑</button><button onclick="deleteNestedPhoto('${scope}',${parentId},${p.id}${placeId?','+placeId:''})">删除</button></span></article>`).join('')}</div>`:'<div class="album-empty">这本相册还是空的，放入第一张照片吧 ♡</div>'}

function albumsV2(){ensureAlbumModel();return `<section class="page"><div class="page-header"><div><p class="eyebrow">OUR PHOTO ALBUMS</p><h2>照片里的 <em>小宇宙</em></h2><p class="subtext">先创建相册，再把照片、视频和实况慢慢装进去。</p></div><button class="primary" onclick="openAdd('album')">＋ 新建相册</button></div><div class="album-grid">${data.albums.map((a,i)=>`<article class="album album-clickable" style="--r:${[-2,2,-1][i%3]}deg" onclick="openGeneralAlbum(${a.id})"><span class="pin">♥</span><img src="${esc(albumCover(a))}"><h3>${esc(a.name||'未命名相册')}</h3><p>${esc(a.date||'未填写日期')} · ${mediaCountText(a.photos)}</p><span class="card-actions"><button onclick="event.stopPropagation();editGeneralAlbum(${a.id})">编辑</button></span></article>`).join('')}</div></section>`}
albums=albumsV2;

function openGeneralAlbum(id){const a=data.albums.find(x=>x.id===id);if(!a)return;a.photos??=[];modal(`<div class="album-modal-head"><button class="back-chip" onclick="closeModal()">← 返回相册集</button><p class="eyebrow">${esc(a.date||'OUR MEMORIES')}</p><h3>${esc(a.name||'未命名相册')}</h3><span>${a.photos.length} 张照片</span></div>${photoGrid(a.photos,'general',a.id)}<div class="modal-actions"><button class="primary" onclick="openAlbumPhotoForm('general',${a.id})">＋ 添加照片</button></div>`)}window.openGeneralAlbum=openGeneralAlbum;
function createGeneralAlbum(){modal(`<h3>新建一本相册</h3><form id="create-album-form"><label>相册名称（可不填）</label><input name="name" placeholder="未命名相册"><label>日期（可不填）</label><div class="date-combo"><input name="date" type="text" placeholder="YYYY-MM-DD，也可点击日历选择"><button type="button" class="calendar-button">▣</button><input class="native-date" type="date" tabindex="-1"></div><label>选择相册封面（可不选）</label><input name="coverFile" class="pretty-file" type="file" accept="image/*"><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">取消</button><button class="primary">创建相册</button></div></form>`);wireDateCombo($('#create-album-form'));$('#create-album-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),file=f.get('coverFile'),cover=file?.size?await readImage(file):'';data.albums.unshift({id:uid(),name:String(f.get('name')||'').trim()||'未命名相册',date:String(f.get('date')||''),cover,coverMediaType:cover?'image':'',photos:[]});if(!await saveFormDraft(e.target))return;closeModal();render();toast('相册已创建并保存')}}
function editGeneralAlbum(id){const a=data.albums.find(x=>x.id===id);if(!a)return;modal(`<h3>修改相册</h3><form id="edit-album-form"><label>相册名称</label><input name="name" value="${esc(a.name)}"><label>日期</label><div class="date-combo"><input name="date" type="text" value="${esc(a.date)}" placeholder="YYYY-MM-DD"><button type="button" class="calendar-button">▣</button><input class="native-date" type="date" tabindex="-1"></div><label>更换封面（可不选）</label><input name="coverFile" class="pretty-file" type="file" accept="image/*"><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">取消</button><button class="primary">保存</button></div></form>`);wireDateCombo($('#edit-album-form'));$('#edit-album-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),file=f.get('coverFile');a.name=String(f.get('name')||'').trim()||'未命名相册';a.date=String(f.get('date')||'');if(file?.size){a.cover=await readImage(file);a.coverMediaType='image'}if(!await saveFormDraft(e.target))return;closeModal();render();toast('相册已修改并保存')}}
function deleteGeneralAlbum(id){confirmAlbumDelete(()=>{data.albums=data.albums.filter(a=>a.id!==id)})}
window.editGeneralAlbum=editGeneralAlbum;window.deleteGeneralAlbum=deleteGeneralAlbum;

function cityAlbumsView(id){ensureAlbumModel();const p=data.mapPlaces.find(x=>x.id===id);if(!p)return;const album=ensureCityAlbum(p).album;openCityAlbum(p.id,album.id)}
openPlace=cityAlbumsView;window.openPlace=cityAlbumsView;
function createCityAlbum(placeId){const p=data.mapPlaces.find(x=>x.id===placeId);if(!p)return;const album=ensureCityAlbum(p).album;openAlbumPhotoForm('city',album.id,p.id)}window.createCityAlbum=createCityAlbum;
function editCityAlbum(placeId,albumId){const p=data.mapPlaces.find(x=>x.id===placeId),a=p?.albums.find(x=>x.id===albumId);if(!a)return;modal(`<h3>修改城市相册</h3><form id="city-album-edit"><label>相册名称</label><input name="name" value="${esc(a.name)}"><label>日期</label><div class="date-combo"><input name="date" type="text" value="${esc(a.date)}"><button type="button" class="calendar-button">▣</button><input class="native-date" type="date" tabindex="-1"></div><label>更换封面</label><input name="coverFile" class="pretty-file" type="file" accept="image/*"><div class="modal-actions"><button type="button" class="secondary" onclick="cityAlbumsView(${p.id})">取消</button><button class="primary">保存</button></div></form>`);wireDateCombo($('#city-album-edit'));$('#city-album-edit').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),file=f.get('coverFile');a.name=String(f.get('name')||'').trim()||'未命名相册';a.date=String(f.get('date')||'');if(file?.size){a.cover=await readImage(file);a.coverMediaType='image'}if(!await saveFormDraft(e.target))return;cityAlbumsView(p.id);toast('相册已修改并保存')}}
function deleteCityAlbum(placeId,albumId){confirmAlbumDelete(()=>{const p=data.mapPlaces.find(x=>x.id===placeId),a=p.albums.find(x=>x.id===albumId);p.albums=p.albums.filter(x=>x.id!==albumId);const removed=new Set((a?.photos||[]).map(x=>x.id));p.photos=p.photos.filter(x=>!removed.has(x.id))},()=>cityAlbumsView(placeId))}window.editCityAlbum=editCityAlbum;window.deleteCityAlbum=deleteCityAlbum;
function openCityAlbum(placeId,albumId){const p=data.mapPlaces.find(x=>x.id===placeId);if(!p)return;const a=ensureCityAlbum(p).album,cityLabel=shortRegionName(p.city);modal(`<div class="place-head"><span>${htmlIcon(geoIcon(p.city))}</span><div><p class="eyebrow">我们在${esc(cityLabel)}的足迹</p><h3>${esc(p.city)} · 城市照片</h3><small>${mediaCountText(a.photos)}</small></div></div>${photoGrid(a.photos,'city',a.id,p.id)}<div class="modal-actions"><button class="secondary" onclick="askDelete('mapPlace',${p.id})">删除城市</button><button class="primary" onclick="openAlbumPhotoForm('city',${a.id},${p.id})">＋ 添加照片 / 视频 / 实况</button></div>`)}window.openCityAlbum=openCityAlbum;

function openAlbumPhotoForm(scope,albumId,placeId='',photoId=''){const owner=scope==='city'?data.mapPlaces.find(x=>x.id===placeId):null,album=scope==='city'?owner?.albums.find(x=>x.id===albumId):data.albums.find(x=>x.id===albumId),photo=photoId?album?.photos.find(x=>x.id===photoId):null;if(!album)return;modal(`<h3>${photo?'修改照片记录':'添加相册照片'}</h3><form id="item-form"><input type="hidden" name="type" value="album-photo"><label>标题（可不填）</label><input name="title" value="${esc(photo?.title||'')}"><label>日期（可不填）</label><input name="date" value="${esc(photo?.date||'')}" placeholder="YYYY-MM-DD"><label>心情（可手输或多选）</label><input name="mood" value="${esc(photo?.mood||'')}">${moodButtons()}<label>描述（可不填）</label><textarea name="text">${esc(photo?.text||'')}</textarea><label>${photo?'更换照片（可不选）':'选择照片'}</label><input name="imagefile" class="pretty-file" type="file" accept="image/*"><div class="modal-actions"><button type="button" class="secondary" onclick="${scope==='city'?`openCityAlbum(${placeId},${albumId})`:`openGeneralAlbum(${albumId})`}">取消</button><button class="primary">收藏保存</button></div></form>`);const form=$('#item-form');wireDateCombo(form);wireMultiMood(form);form.onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),file=f.get('imagefile');if(!photo&&!file?.size)return toast('请选择一张照片');const record=photo||{id:uid(),image:''};record.title=String(f.get('title')||'');record.date=String(f.get('date')||'');record.mood=String(f.get('mood')||'');record.text=String(f.get('text')||'');if(file?.size)record.image=await readImage(file);if(!photo){album.photos.unshift(record);if(scope==='city')owner.photos.unshift(record)}if(!album.cover)album.cover=record.image;save();scope==='city'?openCityAlbum(placeId,albumId):openGeneralAlbum(albumId);toast(photo?'照片记录已修改':'照片已加入相册')}}window.openAlbumPhotoForm=openAlbumPhotoForm;
function editNestedPhoto(scope,albumId,photoId,placeId=''){openAlbumPhotoForm(scope,albumId,placeId,photoId)}function deleteNestedPhoto(scope,albumId,photoId,placeId=''){confirmAlbumDelete(()=>{const owner=scope==='city'?data.mapPlaces.find(x=>x.id===placeId):null,album=scope==='city'?owner.albums.find(x=>x.id===albumId):data.albums.find(x=>x.id===albumId);album.photos=album.photos.filter(x=>x.id!==photoId);if(owner)owner.photos=owner.photos.filter(x=>x.id!==photoId)},()=>{render();scope==='city'?openCityAlbum(placeId,albumId):openGeneralAlbum(albumId)})}window.editNestedPhoto=editNestedPhoto;window.deleteNestedPhoto=deleteNestedPhoto;
function wireDateCombo(form){form.querySelectorAll('.date-combo').forEach(box=>{const text=box.querySelector('input[name="date"]'),native=box.querySelector('.native-date'),button=box.querySelector('.calendar-button');native.value=/^\d{4}-\d{2}-\d{2}$/.test(text.value)?text.value:'';native.onchange=()=>text.value=native.value;button.onclick=()=>native.showPicker?native.showPicker():native.click()})}
function wireMultiMood(form){const mood=form.querySelector('[name="mood"]'),picker=form.querySelector('.mood-picker');if(!mood||!picker)return;picker.onclick=e=>{const b=e.target.closest('[data-mood]');if(!b)return;const value=b.dataset.mood,parts=mood.value.split(/[、,，]+/).map(x=>x.trim()).filter(Boolean),i=parts.indexOf(value);if(i>=0)parts.splice(i,1);else parts.push(value);mood.value=parts.join('、');b.classList.toggle('selected',i<0)}}
function confirmAlbumDelete(change,after=()=>{closeModal();render()}){modal('<h3>确定要删除吗？</h3><p class="delete-copy">相册中的照片记录也会一并删除。</p><div class="modal-actions"><button class="secondary" onclick="closeModal()">取消</button><button id="confirm-album-delete" class="danger">确定删除</button></div>');$('#confirm-album-delete').onclick=async()=>{change();if(!await save())return;after();toast('已删除并保存')}}
const beforeAlbumOpenAdd=window.openAdd;function albumAwareOpenAdd(type='memory',city=''){if(type==='album')return createGeneralAlbum();if(type==='place'&&city){ensureCity(city);let place=data.mapPlaces.find(p=>p.city===city);if(!place){place={id:uid(),city,icon:'',photos:[],albums:[]};Object.defineProperty(place,'_cityDraft',{value:true,configurable:true});data.mapPlaces.push(place)}const album=ensureCityAlbum(place).album;return openAlbumPhotoForm('city',album.id,place.id)}beforeAlbumOpenAdd(type,city)}openAdd=albumAwareOpenAdd;window.openAdd=albumAwareOpenAdd;

