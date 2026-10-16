// Album navigation state is UI-only. Leaving the album discards it; no cloud
// records, browser storage or media files are changed by filtering/scrolling.
(function () {
  const categories = [['all','总览'],['image','照片'],['video','视频'],['live','实况']];
  let session = null;
  let modalContext = '';

  function albumKey(scope,albumId,placeId='') {
    return `${scope}:${placeId || ''}:${albumId}`;
  }
  function rememberPosition() {
    const panel = document.querySelector('#modal-root .modal[data-album-browser-key]');
    if (session && panel?.dataset.albumBrowserKey === session.key) {
      session.positions[session.category] = panel.scrollTop;
    }
  }
  function inAlbumContext(key,callback) {
    const previous = modalContext;
    modalContext = key;
    try { return callback(); }
    finally { modalContext = previous; }
  }
  const originalModal = modal;
  modal = function(html) {
    rememberPosition();
    if (!session || modalContext !== session.key) session = null;
    // Replacing a playing video/live view should never leave its audio running.
    document.querySelectorAll('#modal-root video').forEach(video => video.pause());
    return originalModal(html);
  };
  window.modal = modal;
  const originalClose = closeModal;
  closeModal = function() {
    session = null;
    document.querySelectorAll('#modal-root video').forEach(video => video.pause());
    return originalClose();
  };
  window.closeModal = closeModal;

  function albumItems() {
    if (!session) return [];
    const album = session.scope === 'city'
      ? data.mapPlaces.find(place => String(place.id) === String(session.placeId))?.albums?.find(item => String(item.id) === String(session.albumId))
      : data.albums.find(item => String(item.id) === String(session.albumId));
    return album?.photos || [];
  }
  function categoryTabs(items) {
    const counts = {all:items.length,image:0,video:0,live:0};
    items.forEach(item => counts[mediaKind(item)]++);
    return `<div class="album-category-tabs" role="tablist" aria-label="相册内容分类">${categories.map(([key,label]) => `<button type="button" role="tab" id="album-tab-${key}" data-album-category="${key}" aria-selected="${session.category === key}" tabindex="${session.category === key ? 0 : -1}" aria-controls="album-category-panel" class="${session.category === key ? 'active' : ''}" onclick="selectAlbumCategory('${key}')"><span>${label}</span><small>${counts[key]}</small></button>`).join('')}</div>`;
  }
  function restorePosition(panel,expectedSession,category) {
    const top = expectedSession.positions[category] || 0;
    const restore = () => {
      if (session === expectedSession && session.category === category && panel.isConnected) panel.scrollTop = top;
    };
    panel.style.scrollBehavior = 'auto';
    restore();
    // The second pass covers layout after the reconstructed modal is painted.
    requestAnimationFrame(restore);
  }
  function renderCategory(panel) {
    const items = albumItems();
    const category = session.category;
    const shown = category === 'all' ? items : items.filter(item => mediaKind(item) === category);
    const content = panel.querySelector('.album-category-content');
    content.setAttribute('aria-labelledby',`album-tab-${category}`);
    content.innerHTML = shown.length
      ? polishedPhotoGrid(shown,session.scope,session.albumId,session.placeId)
      : `<div class="album-empty">${category === 'all' ? '这本相册还没有内容，添加第一段回忆吧 ♡' : `这本相册还没有${categories.find(([key]) => key === category)[1]}，点击右上角即可添加 ♡`}</div>`;
    panel.querySelectorAll('[data-album-category]').forEach(button => {
      const active = button.dataset.albumCategory === category;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex = active ? 0 : -1;
    });
    restorePosition(panel,session,category);
  }
  function decorateAlbum() {
    const panel = document.querySelector('#modal-root .modal');
    const header = panel?.querySelector('.album-sticky-head');
    const grid = panel?.querySelector('.album-photo-grid,.album-empty');
    if (!session || !panel || !header || !grid) return;
    panel.dataset.albumBrowserKey = session.key;
    panel.classList.add('classified-album-modal');
    header.classList.add('classified-album-head');
    header.insertAdjacentHTML('beforeend',categoryTabs(albumItems()));
    header.querySelector('.album-category-tabs').addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const buttons = [...header.querySelectorAll('[data-album-category]')];
      const index = buttons.indexOf(event.target.closest('[data-album-category]'));
      if (index < 0) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      window.selectAlbumCategory(buttons[nextIndex].dataset.albumCategory);
      buttons[nextIndex].focus();
    });
    const content = document.createElement('div');
    content.className = 'album-category-content';
    content.id = 'album-category-panel';
    content.setAttribute('role','tabpanel');
    grid.replaceWith(content);
    renderCategory(panel);
    panel.addEventListener('scroll',rememberPosition,{passive:true});
  }
  function openAlbum(scope,albumId,placeId,openOriginal) {
    rememberPosition();
    const key = albumKey(scope,albumId,placeId);
    if (session?.key !== key) session = {key,scope,albumId,placeId,category:'all',positions:{}};
    inAlbumContext(key,openOriginal);
    decorateAlbum();
  }
  const originalGeneral = openGeneralAlbum;
  openGeneralAlbum = function(id) {
    if (!data.albums.some(album => album.id === id)) return;
    openAlbum('general',id,'',() => originalGeneral(id));
  };
  window.openGeneralAlbum = openGeneralAlbum;
  const originalCity = openCityAlbum;
  openCityAlbum = function(placeId,albumId) {
    const place = data.mapPlaces.find(item => item.id === placeId);
    if (!place) return;
    const album = ensureCityAlbum(place).album;
    openAlbum('city',album.id,place.id,() => originalCity(place.id,album.id));
  };
  window.openCityAlbum = openCityAlbum;

  window.selectAlbumCategory = function(category) {
    if (!session || !categories.some(([key]) => key === category)) return;
    const panel = document.querySelector('#modal-root .modal[data-album-browser-key]');
    if (!panel || session.category === category) return;
    rememberPosition();
    session.category = category;
    renderCategory(panel);
  };

  // These child views temporarily replace the grid. Returning from them keeps
  // the same album session; opening an unrelated dialog ends that session.
  const scopeKey = (scope,album,place='') => albumKey(scope,album,place);
  const generalKey = album => albumKey('general',album);
  const childViews = {
    openPhotoLightbox: (scope,album,item,place='') => scopeKey(scope,album,place),
    pickGeneralPhotos: generalKey,
    pickGeneralMedia: generalKey,
    editGeneralMedia: generalKey,
    openAlbumPhotoForm: scopeKey,
    cityMediaForm: scopeKey,
    editNestedPhoto: (scope,album,item,place='') => scopeKey(scope,album,place),
    deleteNestedPhoto: (scope,album,item,place='') => scopeKey(scope,album,place),
    deleteGeneralAlbum: generalKey,
    askDelete: (type,id) => type === 'mapPlace' && session?.scope === 'city' && String(session.placeId) === String(id) ? session.key : ''
  };
  Object.entries(childViews).forEach(([name,identity]) => {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function(...args) {
      const key = identity(...args);
      return inAlbumContext(key,() => original.apply(this,args));
    };
  });

  const originalGo = go;
  go = function(...args) { session = null; return originalGo.apply(this,args); };
  window.go = go;
})();
