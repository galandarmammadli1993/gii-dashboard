(() => {
  'use strict';

  const OWNER = 'galandarmammadli1993';
  const REPO = 'gii-dashboard';
  const BRANCH = 'main';
  const DATA_PATH = 'dashboard-data.json';
  const TOKEN_KEY = 'gii2025_github_pat_v1';
  const API_VERSION = '2022-11-28';

  let syncStatus = 'idle';
  let syncMessage = '';
  let clearTimer = null;

  const apiUrl = () =>
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(DATA_PATH)}?ref=${encodeURIComponent(BRANCH)}`;

  const headers = (token = '') => {
    const result = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION
    };
    if (token) result.Authorization = `Bearer ${token}`;
    return result;
  };

  const getToken = () => {
    try {
      return (localStorage.getItem(TOKEN_KEY) || '').trim();
    } catch {
      return '';
    }
  };

  const requestToken = () => {
    let token = getToken();
    if (token) return token;

    token = (window.prompt(
      'GitHub-a avtomatik saxlama üçün Fine-grained Personal Access Token daxil edin.\n\nRepository access: Only select repositories → gii-dashboard\nPermission: Contents → Read and write\n\nToken yalnız bu brauzerdə saxlanacaq və dashboard linkində görünməyəcək.'
    ) || '').trim();

    if (!token) throw new Error('GitHub tokeni daxil edilmədi.');
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.warn('Token brauzerdə saxlanmadı:', error);
    }
    return token;
  };

  const forgetToken = () => {
    if (!window.confirm('Bu brauzerdə saxlanmış GitHub girişini silmək istəyirsiniz?')) return;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
    setStatus('info', 'GitHub girişi bu brauzerdən silindi. Növbəti SAVE zamanı token yenidən tələb olunacaq.');
  };

  const setStatus = (status, message) => {
    syncStatus = status;
    syncMessage = message || '';
    render();
    if (clearTimer) clearTimeout(clearTimer);
    if (status !== 'saving') {
      clearTimer = setTimeout(() => {
        syncStatus = 'idle';
        syncMessage = '';
        render();
      }, 6500);
    }
  };

  const decodeContent = (content) =>
    decodeBase64ToUtf8(String(content || '').replace(/\s/g, ''));

  async function readRemoteSnapshot() {
    const response = await fetch(`${apiUrl()}&_=${Date.now()}`, {
      method: 'GET',
      headers: headers(),
      cache: 'no-store'
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub məlumatı oxunmadı: HTTP ${response.status}`);

    const file = await response.json();
    const snapshot = JSON.parse(decodeContent(file.content));
    if (!validatePortableSnapshot(snapshot)) {
      throw new Error('GitHub-dakı dashboard-data.json faylı etibarlı deyil.');
    }
    return snapshot;
  }

  async function writeRemoteSnapshot(snapshot) {
    const token = requestToken();
    const url = apiUrl();
    let sha = null;

    const currentResponse = await fetch(`${url}&_=${Date.now()}`, {
      method: 'GET',
      headers: headers(token),
      cache: 'no-store'
    });

    if (currentResponse.ok) {
      const current = await currentResponse.json();
      sha = current.sha || null;
    } else if (currentResponse.status !== 404) {
      if (currentResponse.status === 401 || currentResponse.status === 403) {
        try { localStorage.removeItem(TOKEN_KEY); } catch {}
        throw new Error('GitHub tokeni qəbul edilmədi. Contents icazəsi “Read and write” olan yeni token daxil edin.');
      }
      throw new Error(`GitHub faylı yoxlanılmadı: HTTP ${currentResponse.status}`);
    }

    const body = {
      message: `Update dashboard data — ${snapshot.savedAt}`,
      content: encodeUtf8ToBase64(JSON.stringify(snapshot, null, 2)),
      branch: BRANCH
    };
    if (sha) body.sha = sha;

    const saveResponse = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!saveResponse.ok) {
      let detail = '';
      try {
        detail = (await saveResponse.json()).message || '';
      } catch {}

      if (saveResponse.status === 401 || saveResponse.status === 403) {
        try { localStorage.removeItem(TOKEN_KEY); } catch {}
        throw new Error('GitHub yazma icazəsi qəbul edilmədi. Token silindi; düzgün icazəli tokenlə yenidən SAVE edin.');
      }
      if (saveResponse.status === 409) {
        throw new Error('Paralel dəyişiklik aşkarlanıb. Səhifəni yeniləyib SAVE düyməsini təkrar basın.');
      }
      throw new Error(`GitHub-a saxlamaq mümkün olmadı: HTTP ${saveResponse.status}${detail ? ` — ${detail}` : ''}`);
    }
  }

  const originalRender = render;

  function patchInterface() {
    document.querySelectorAll('button[onclick="doSave()"]').forEach((button) => {
      button.textContent = '💾 GitHub-a SAVE';
      button.title = 'Cari vəziyyəti GitHub-dakı mərkəzi dashboard-data.json faylına yaz';
      button.disabled = syncStatus === 'saving';
    });

    document.querySelectorAll('.card').forEach((card) => {
      if (!card.textContent.includes('Dəyişiklikləri linkdə saxla və paylaş')) return;
      const title = [...card.querySelectorAll('div')].find((el) =>
        el.textContent.trim() === 'Dəyişiklikləri linkdə saxla və paylaş'
      );
      if (title) title.textContent = 'Dəyişiklikləri GitHub-da mərkəzləşdirilmiş saxla';

      const description = [...card.querySelectorAll('div')].find((el) =>
        el.textContent.includes('SAVE cari məlumatları sıxılmış formada URL-ə daxil edir')
      );
      if (description) {
        description.textContent = 'SAVE cari vəziyyəti repozitoriyadakı dashboard-data.json faylına yazır. Eyni əsas linki açan bütün istifadəçilər son saxlanmış məlumatları görür.';
      }

      const exportButton = [...card.querySelectorAll('button')].find((button) =>
        button.textContent.includes('Ehtiyat HTML')
      );
      if (exportButton && !card.querySelector('[data-github-forget]')) {
        const forgetButton = document.createElement('button');
        forgetButton.className = 'btn btn-gray btn-sm';
        forgetButton.textContent = 'GitHub girişini sil';
        forgetButton.dataset.githubForget = '1';
        forgetButton.addEventListener('click', forgetToken);
        exportButton.insertAdjacentElement('afterend', forgetButton);
      }
    });

    document.querySelectorAll('.content > .ok-box, .content > .warn').forEach((box) => {
      const text = box.textContent || '';
      if (text.includes('paylaşım linki') || text.includes('Link') || text.includes('linkdə saxlanıldı')) {
        box.remove();
      }
    });

    const content = document.querySelector('.content');
    if (!content) return;
    document.getElementById('github-sync-banner')?.remove();
    if (syncStatus === 'idle') return;

    const banner = document.createElement('div');
    banner.id = 'github-sync-banner';
    banner.style.marginBottom = '14px';
    banner.style.fontSize = '12px';

    if (syncStatus === 'success') {
      banner.className = 'ok-box';
      banner.style.color = '#15803d';
      banner.innerHTML = `<b>GitHub-da saxlanıldı.</b> ${esc(syncMessage)}`;
    } else if (syncStatus === 'saving') {
      banner.className = 'warn';
      banner.style.color = '#92400e';
      banner.innerHTML = `<span>↻</span><div><b>GitHub-a yazılır.</b> ${esc(syncMessage)}</div>`;
    } else if (syncStatus === 'error') {
      banner.className = 'warn';
      banner.style.background = '#fef2f2';
      banner.style.borderColor = '#fecaca';
      banner.style.color = '#b91c1c';
      banner.innerHTML = `<span>✕</span><div><b>Saxlama xətası.</b> ${esc(syncMessage)}</div>`;
    } else {
      banner.className = 'warn';
      banner.style.color = '#475569';
      banner.innerHTML = `<span>ℹ</span><div>${esc(syncMessage)}</div>`;
    }
    content.prepend(banner);
  }

  render = function githubSynchronizedRender() {
    originalRender();
    patchInterface();
  };
  window.render = render;

  window.doSave = async () => {
    setStatus('saving', 'Cari dashboard vəziyyəti mərkəzi fayla göndərilir.');
    try {
      commitActiveFormControl();
      const snapshot = buildPortableSnapshot();
      await writeRemoteSnapshot(snapshot);
      saveState(snapshot, true);
      lastSavedAt = new Date(snapshot.savedAt);
      history.replaceState(null, '', location.href.split('#')[0]);
      setStatus('success', 'Eyni əsas linki açan istifadəçilər səhifəni yenilədikdə son məlumatları görəcəklər.');
    } catch (error) {
      console.error('GitHub save failed:', error);
      setStatus('error', String(error?.message || error));
    }
  };

  window.doForgetGitHubToken = forgetToken;

  async function initializeGitHubSync() {
    try {
      const snapshot = await readRemoteSnapshot();
      if (snapshot) {
        applyPortableSnapshot(snapshot);
        saveState(snapshot, false);
        history.replaceState(null, '', location.href.split('#')[0]);
      }
    } catch (error) {
      console.warn('GitHub state load failed:', error);
      syncStatus = 'error';
      syncMessage = `${String(error?.message || error)} Lokal/HTML ehtiyat məlumatı göstərilir.`;
    }
    render();
  }

  initializeGitHubSync();
})();
