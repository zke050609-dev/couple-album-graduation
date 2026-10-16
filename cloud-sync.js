(function () {
  'use strict';

  let cloudMode = false;
  let cloudRevision = 0;
  let cloudUsername = '';
  let cloudSaveQueue = Promise.resolve(true);
  const localSave = save;
  const localStorageReady = storageReady;
  const localRender = render;
  const hadLocalNotebook = Boolean(saved);

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `请求失败（${response.status}）`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function dataUrlToBlob(value) {
    const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(value || '');
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const base64 = value.slice(0, value.indexOf(',')).includes(';base64');
    const bytes = base64 ? atob(match[2]) : decodeURIComponent(match[2]);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index++) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
  }

  function extensionFor(type) {
    return ({
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
      'image/heic': '.heic', 'image/heif': '.heif', 'video/mp4': '.mp4',
      'video/webm': '.webm', 'video/quicktime': '.mov'
    })[type] || '.bin';
  }

  async function uploadBlob(blob, name) {
    const contentType = blob.type || 'application/octet-stream';
    const signed = await api('/media/presign', {
      method: 'POST',
      body: JSON.stringify({ name: name || `import${extensionFor(contentType)}`, type: contentType, size: blob.size })
    });
    const response = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': signed.contentType },
      body: blob
    });
    if (!response.ok) throw new Error(`OSS上传失败（${response.status}）`);
    return signed.viewUrl;
  }

  window.cloudUploadFile = async function cloudUploadFile(file) {
    if (!cloudMode || !file) return null;
    return uploadBlob(file, file.name);
  };

  async function migrateDataUrls(value, cache = new Map(), progress = { count: 0 }) {
    if (typeof value === 'string' && value.startsWith('data:')) {
      if (!cache.has(value)) {
        const blob = dataUrlToBlob(value);
        if (!blob) return value;
        progress.count += 1;
        toast(`正在迁移第 ${progress.count} 个本地媒体文件…`);
        cache.set(value, uploadBlob(blob, `migration-${progress.count}${extensionFor(blob.type)}`));
      }
      return cache.get(value);
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const child of value) result.push(await migrateDataUrls(child, cache, progress));
      return result;
    }
    if (value && typeof value === 'object') {
      const result = {};
      for (const [key, child] of Object.entries(value)) result[key] = await migrateDataUrls(child, cache, progress);
      return result;
    }
    return value;
  }

  async function loadCloudNotebook({ migrateIfEmpty = false } = {}) {
    const cloud = await api('/notebook');
    cloudRevision = Number(cloud.revision || 0);
    if (cloud.data) {
      normalizeLoadedData(cloud.data);
      await localSave();
      return;
    }
    await localStorageReady;
    if (!migrateIfEmpty) return;
    const source = hadLocalNotebook ? data : {
      ...data,
      albums: [], memories: [], diaries: [], anniversaries: [], notes: [], mapPlaces: [], travelPlans: [], cityIcons: {}
    };
    toast(hadLocalNotebook ? '首次登录，正在把本机回忆安全迁移到云端…' : '正在建立你的云端手账…');
    const snapshot = await migrateDataUrls(JSON.parse(JSON.stringify(source)));
    const saved = await api('/notebook', {
      method: 'PUT',
      body: JSON.stringify({ data: snapshot, revision: cloudRevision })
    });
    cloudRevision = Number(saved.revision || 1);
    normalizeLoadedData(saved.data);
    await localSave();
    toast(hadLocalNotebook ? '本机回忆已迁移到云端' : '云端手账已建立');
  }

  async function importBackup(file) {
    if (!file) return;
    const imported = JSON.parse(await file.text());
    if (!imported || typeof imported !== 'object' || !Array.isArray(imported.albums) || !Array.isArray(imported.mapPlaces)) {
      throw new Error('这不是有效的回忆备份文件');
    }
    if (!confirm('导入会用备份文件覆盖当前云端内容，确定继续吗？')) return;
    toast('正在上传备份中的照片和视频，请不要关闭页面…');
    const migrated = await migrateDataUrls(imported);
    const savedNotebook = await api('/notebook', {
      method: 'PUT',
      body: JSON.stringify({ data: migrated, revision: cloudRevision })
    });
    cloudRevision = Number(savedNotebook.revision);
    normalizeLoadedData(savedNotebook.data);
    await localSave();
    render();
    toast('本地备份已完整迁移到云端');
  }

  async function cloudSave() {
    if (!cloudMode) return localSave();
    const snapshot = JSON.parse(JSON.stringify(data));
    const previous = cloudSaveQueue;
    cloudSaveQueue = previous.then(async () => {
      try {
        const migrated = await migrateDataUrls(snapshot);
        const saved = await api('/notebook', {
          method: 'PUT',
          body: JSON.stringify({ data: migrated, revision: cloudRevision })
        });
        cloudRevision = Number(saved.revision);
        normalizeLoadedData(saved.data);
        await localSave();
        return true;
      } catch (error) {
        if (error.status === 409) toast('另一台设备刚刚更新了内容，请刷新页面后再操作。');
        else toast(error.message || '云端保存失败，本机数据仍然保留');
        return false;
      }
    });
    return cloudSaveQueue;
  }

  function installCloudLogin() {
    const form = document.querySelector('#unlock-form');
    if (!form) return;
    form.querySelector('label').textContent = 'The Beginning of love';
    const inputs = form.querySelector('.pin-inputs');
    inputs.className = 'cloud-login-panel';
    inputs.innerHTML = `
      <div class="pin-inputs cloud-pin-inputs">
        <input inputmode="numeric" maxlength="1" aria-label="第1位访问密码">
        <input inputmode="numeric" maxlength="1" aria-label="第2位访问密码">
        <input inputmode="numeric" maxlength="1" aria-label="第3位访问密码">
        <input inputmode="numeric" maxlength="1" aria-label="第4位访问密码">
      </div>
      <div class="cloud-login-fields hidden">
        <input id="cloud-username" autocomplete="username" placeholder="账号">
        <input id="cloud-password" type="password" autocomplete="current-password" placeholder="完整登录密码">
      </div>
      <button id="cloud-login-toggle" class="cloud-login-toggle" type="button">使用账号和自定义密码</button>
    `;
    const pinInputs = [...inputs.querySelectorAll('.cloud-pin-inputs input')];
    const passwordFields = inputs.querySelector('.cloud-login-fields');
    let fullPasswordMode = false;
    pinInputs.forEach((input, index) => {
      input.oninput = () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && index < pinInputs.length - 1) pinInputs[index + 1].focus();
      };
      input.onkeydown = event => {
        if (event.key === 'Backspace' && !input.value && index) pinInputs[index - 1].focus();
      };
    });
    inputs.querySelector('#cloud-login-toggle').onclick = () => {
      fullPasswordMode = !fullPasswordMode;
      inputs.querySelector('.cloud-pin-inputs').classList.toggle('hidden', fullPasswordMode);
      passwordFields.classList.toggle('hidden', !fullPasswordMode);
      inputs.querySelector('#cloud-login-toggle').textContent = fullPasswordMode ? '返回四位访问密码' : '使用账号和自定义密码';
      (fullPasswordMode ? inputs.querySelector('#cloud-username') : pinInputs[0]).focus();
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const error = document.querySelector('#pin-error');
      error.textContent = '正在安全登录…';
      const password = fullPasswordMode
        ? document.querySelector('#cloud-password').value
        : pinInputs.map(input => input.value).join('');
      if (!fullPasswordMode && !/^\d{4}$/.test(password)) {
        error.textContent = '请输入完整的四位访问密码。';
        return;
      }
      try {
        const result = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: fullPasswordMode ? document.querySelector('#cloud-username').value.trim() : '',
            password
          })
        });
        cloudUsername = result.username;
        await loadCloudNotebook({ migrateIfEmpty: true });
        document.querySelector('#lock-screen').classList.add('hidden');
        document.querySelector('#app').classList.remove('hidden');
        render();
      } catch (loginError) {
        error.textContent = loginError.status === 401 ? '访问密码不正确，再想想我们的小暗号。' : (loginError.message || '登录失败，请稍后再试。');
        if (!fullPasswordMode) {
          pinInputs.forEach(input => { input.value = ''; });
          pinInputs[0].focus();
        }
      }
    };
  }

  function enhanceCloudSettings() {
    if (!cloudMode || currentPage !== 'settings') return;
    const container = document.querySelector('.settings');
    if (!container || document.querySelector('#cloud-account-card')) return;
    const legacyPassword = [...container.querySelectorAll('.setting-card')]
      .find(card => card.querySelector('h3')?.textContent.trim() === '访问密码');
    if (legacyPassword) legacyPassword.hidden = true;
    container.insertAdjacentHTML('beforeend', `
      <article id="cloud-account-card" class="setting-card cloud-account-card">
        <h3>云端账户与迁移</h3>
        <p>当前账户：${String(cloudUsername || '').replace(/[&<>"']/g, '')}。登录密码可以自由设置；若恰好设置为四位数字，也可以使用首页四格快捷登录。</p>
        <div class="cloud-account-actions">
          <label class="secondary cloud-file-button">导入本地备份<input id="cloud-backup-file" type="file" accept="application/json,.json"></label>
          <button id="cloud-change-password" class="secondary" type="button">修改登录密码</button>
          <button id="cloud-logout" class="secondary" type="button">退出登录</button>
        </div>
      </article>
    `);
    document.querySelector('#cloud-backup-file').onchange = async event => {
      try { await importBackup(event.target.files?.[0]); }
      catch (error) { toast(error.message || '备份导入失败'); }
      event.target.value = '';
    };
    document.querySelector('#cloud-change-password').onclick = () => {
      modal(`<h3>修改登录密码</h3><form id="cloud-password-form">
        <label>当前登录密码</label><input name="currentPassword" type="password" autocomplete="current-password" required>
        <label>新密码</label><input name="newPassword" type="password" autocomplete="new-password" placeholder="数字、文字和符号均可" required>
        <label>再次输入新密码</label><input name="confirmPassword" type="password" autocomplete="new-password" required>
        <p class="subtext">密码只需非空。设置为四位数字时，可继续使用首页四格快捷登录。</p>
        <div class="modal-actions"><button type="button" class="secondary" onclick="closeModal()">取消</button><button class="primary">保存新密码</button></div>
      </form>`);
      document.querySelector('#cloud-password-form').onsubmit = async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.target));
        if (!values.newPassword) return toast('新密码不能为空');
        if (values.newPassword !== values.confirmPassword) return toast('两次输入的新密码不一致');
        try {
          await api('/auth/password', { method: 'PUT', body: JSON.stringify(values) });
          forgetFormDraft(event.target);
          closeModal();
          toast(/^\d{4}$/.test(values.newPassword) ? '密码已更新，下次可使用四格密码进入' : '密码已更新，下次请使用账号和自定义密码登录');
        } catch (error) {
          toast(error.payload?.error === 'Current password is incorrect' ? '当前密码不正确，请重新输入' : (error.message || '密码修改失败'));
        }
      };
    };
    document.querySelector('#cloud-logout').onclick = async () => {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      location.reload();
    };
  }

  function cloudRender() {
    localRender();
    enhanceCloudSettings();
  }

  async function detectCloud() {
    if (window.COUPLE_ALBUM_CLOUD_ENABLED !== true || location.protocol === 'file:') return;
    try {
      const health = await api('/health');
      if (!health.ok) return;
      cloudMode = true;
      save = cloudSave;
      window.save = cloudSave;
      render = cloudRender;
      window.render = cloudRender;
      installCloudLogin();
      document.documentElement.classList.add('cloud-mode');
      try {
        const status = await api('/auth/status');
        cloudUsername = status.username;
        await loadCloudNotebook({ migrateIfEmpty: true });
        document.querySelector('#lock-screen').classList.add('hidden');
        document.querySelector('#app').classList.remove('hidden');
        render();
      } catch (error) {
        if (error.status !== 401) console.error(error);
      }
    } catch {
      // Keep the original offline-first behavior when the API is unavailable.
    }
  }

  window.cloudNotebook = {
    get enabled() { return cloudMode; },
    get username() { return cloudUsername; },
    refresh: async () => { await loadCloudNotebook(); render(); },
    importBackup
  };

  detectCloud();
})();
