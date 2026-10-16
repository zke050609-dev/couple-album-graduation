// Deliberately memory-only: refresh/close the page discards every unfinished draft.
const pageDrafts = new Map();
let formDraftContext = '';

function draftControls(root) {
  return [...root.querySelectorAll('input,textarea,select')].filter(field =>
    !['submit','button'].includes(field.type) && field.id !== 'cloud-backup-file');
}
function controlDraftKey(field, index) {
  return field.name ? `${field.name}:${field.type === 'radio' ? field.value : ''}` : field.id || `field:${index}`;
}
function capturePageDraft(root) {
  const key = root?.dataset.draftKey;
  if (!key || root.dataset.draftSaved === 'true') return;
  const values = new Map();
  draftControls(root).forEach((field,index) => values.set(controlDraftKey(field,index), {
    value: field.value, checked: field.checked,
    files: field.type === 'file' ? [...field.files] : null
  }));
  pageDrafts.set(key, { owner: root, values });
}
function restorePageDraft(root) {
  const draft = pageDrafts.get(root?.dataset.draftKey);
  if (!draft) return;
  draftControls(root).forEach((field,index) => {
    const stored = draft.values.get(controlDraftKey(field,index));
    if (!stored) return;
    if (field.type === 'file') {
      try { const transfer = new DataTransfer(); stored.files.forEach(file => transfer.items.add(file)); field.files = transfer.files; }
      catch { /* Some mobile browsers require selecting files again. Text still restores. */ }
    } else if (['checkbox','radio'].includes(field.type)) field.checked = stored.checked;
    else field.value = stored.value;
  });
  root.querySelectorAll('[data-media-mode]').forEach(panel => {
    panel.hidden = panel.dataset.mediaMode !== root.querySelector('[name="mediaMode"]:checked')?.value;
  });
  root.querySelectorAll('[data-ann-icon]').forEach(button => button.classList.toggle('selected',button.dataset.annIcon === root.querySelector('[name="icon"]')?.value));
  const moods = (root.querySelector('[name="mood"]')?.value || '').split(/[、,，]+/).map(x => x.trim());
  root.querySelectorAll('[data-mood]').forEach(button => button.classList.toggle('selected',moods.includes(button.dataset.mood)));
  capturePageDraft(root);
}
function forgetFormDraft(root) {
  if (!root) return;
  if (pageDrafts.get(root.dataset.draftKey)?.owner === root) pageDrafts.delete(root.dataset.draftKey);
  root.dataset.draftSaved = 'true';
}
async function saveFormDraft(root) {
  const success = await save();
  if (success) forgetFormDraft(root);
  return success;
}
function captureOpenDrafts() {
  document.querySelectorAll('[data-draft-key]').forEach(capturePageDraft);
}

const draftBaseModal = modal, draftBaseCloseModal = closeModal;
modal = function(html) {
  captureOpenDrafts();
  draftBaseModal(html);
  document.querySelectorAll('#modal-root form').forEach(form => {
    form.dataset.draftKey = `${form.id}:${formDraftContext}`;
    restorePageDraft(form);
  });
};
closeModal = function() { captureOpenDrafts(); draftBaseCloseModal(); };
window.modal = modal;
window.closeModal = closeModal;

// Explicit identities keep different cities, albums and edited records isolated.
const draftOpeners = {
  openForm: (type,item={},edit=false,parent='') => `item:${type}:${edit ? item.id : 'new'}:${parent || ''}`,
  createGeneralAlbum: () => 'album:new',
  editGeneralAlbum: id => `album:${id}`,
  editCityAlbum: (place,album) => `city-album:${place}:${album}`,
  openTripPlanForm: id => `trip:${id || 'new'}`,
  openAnniversaryEditor: id => `anniversary:${id || 'new'}`,
  editLandmark: city => `landmark:${city}`,
  pickGeneralMedia: album => `general-media:${album}:new`,
  pickGeneralPhotos: album => `general-media:${album}:new`,
  editGeneralMedia: (album,item) => `general-media:${album}:${item}`,
  cityMediaForm: (scope,album,place='',item='') => `city-media:${place}:${album}:${item || 'new'}`,
  openAlbumPhotoForm: (scope,album,place='',item='') => `city-media:${place}:${album}:${item || 'new'}`,
  openTravelSettings: () => 'travel-settings'
};
Object.entries(draftOpeners).forEach(([name,identity]) => {
  const original = window[name];
  if (typeof original !== 'function') return;
  window[name] = function(...args) {
    const previous = formDraftContext;
    formDraftContext = identity(...args);
    try { return original.apply(this,args); }
    finally { formDraftContext = previous; }
  };
});

// Settings use cards instead of forms. Observe replacements too, including the
// cloud renderer, which is installed asynchronously after the API health check.
const pageRoot = document.querySelector('#page-root');
new MutationObserver(() => {
  if (currentPage !== 'settings') return;
  pageRoot.querySelectorAll('.setting-card').forEach(card => {
    if (card.dataset.draftKey) return;
    card.dataset.draftKey = `settings:${card.querySelector('h3')?.textContent}`;
    restorePageDraft(card);
  });
}).observe(pageRoot,{childList:true,subtree:true});
['input','change'].forEach(type => document.addEventListener(type,event => {
  const root = event.target.closest('[data-draft-key]');
  if (root) { delete root.dataset.draftSaved; capturePageDraft(root); }
}));
document.addEventListener('click', () => queueMicrotask(captureOpenDrafts));
