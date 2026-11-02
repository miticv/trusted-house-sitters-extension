(function () {
  'use strict';
  const { createStore, reasonLabel } = globalThis.THS;

  const store = createStore(chrome.storage.local);
  const $ = (id) => document.getElementById(id);
  const inTab = new URLSearchParams(location.search).has('tab');
  const state = {
    tab: inTab ? 'backup' : 'not_interested', // the full-tab page is opened for importing
    text: '',
    reason: '',
    marks: {},
    reasons: [],
    pendingImport: null,
    confirmDelete: null,
  };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function show(text, isError = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', isError);
  }

  function run(promise) {
    return promise.catch((err) => {
      show(err.message, true);
      load();
    });
  }

  async function load() {
    [state.marks, state.reasons] = await Promise.all([store.getMarks(), store.getReasons()]);
    render();
  }

  function render() {
    const all = Object.entries(state.marks);
    const interested = all.filter(([, m]) => m.status === 'interested').length;
    $('counts').textContent = `⭐ ${interested} · ❌ ${all.length - interested}`;
    for (const tab of document.querySelectorAll('[data-tab]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
    }
    const view = state.tab === 'reasons' || state.tab === 'backup' ? state.tab : 'list';
    $('list-view').hidden = view !== 'list';
    $('reasons-view').hidden = view !== 'reasons';
    $('backup-view').hidden = view !== 'backup';
    if (view === 'reasons') renderReasons();
    else if (view === 'list') renderList(all);
  }

  function renderList(all) {
    const select = $('filter-reason');
    select.hidden = state.tab !== 'not_interested';
    select.replaceChildren(
      el('option', { value: '', textContent: 'All reasons' }),
      ...state.reasons.map((r) => el('option', { value: r.id, textContent: r.label })),
    );
    select.value = state.reason;
    state.reason = select.value; // drops a filter whose reason was deleted

    const query = state.text.toLowerCase();
    const rows = all
      .filter(([, m]) => m.status === state.tab)
      .filter(([, m]) => state.tab !== 'not_interested' || !state.reason || m.reasons.includes(state.reason))
      .filter(([id, m]) => !query || [id, m.title, m.location, m.note].some((s) => s.toLowerCase().includes(query)))
      .sort(([, a], [, b]) => b.markedAt.localeCompare(a.markedAt));

    $('list').replaceChildren(...rows.map(([id, m]) => markRow(id, m)));
    $('empty').hidden = rows.length > 0;
  }

  function markRow(id, m) {
    const name = m.title || `Listing ${id}`;
    const title = m.url
      ? el('a', { href: m.url, target: '_blank', rel: 'noopener', textContent: name })
      : el('span', { textContent: name });
    title.className = 'title';
    const meta = el('div', {
      className: 'meta',
      textContent: [m.location, new Date(m.markedAt).toLocaleDateString()].filter(Boolean).join(' · '),
    });
    const chips = el('div', { className: 'chips' },
      ...m.reasons.map((rid) => el('span', { className: 'chip', textContent: reasonLabel(rid, state.reasons) })));
    const body = el('div', { className: 'body' }, title, meta, chips);
    if (m.note) body.append(el('div', { className: 'note', textContent: m.note }));

    const remove = el('button', { type: 'button', className: 'icon', title: 'Remove mark', textContent: '🗑' });
    remove.addEventListener('click', () => run(store.unmark(id)));
    return el('li', {}, body, remove);
  }

  function renderReasons() {
    const used = {};
    for (const m of Object.values(state.marks)) for (const r of m.reasons) used[r] = (used[r] || 0) + 1;
    $('reason-list').replaceChildren(...state.reasons.map((r) => reasonRow(r, used[r.id] || 0)));
  }

  function reasonRow(reason, used) {
    const input = el('input', { value: reason.label, maxLength: 40 });
    input.setAttribute('aria-label', `Rename ${reason.label}`);
    input.addEventListener('change', () => run(store.renameReason(reason.id, input.value)));
    const armed = state.confirmDelete === reason.id;
    const del = el('button', {
      type: 'button',
      className: armed ? 'danger' : 'icon',
      title: 'Delete reason',
      textContent: armed ? `Delete? (used ${used}×)` : '🗑',
    });
    del.addEventListener('click', () => {
      if (used && !armed) {
        state.confirmDelete = reason.id;
        render();
        return;
      }
      state.confirmDelete = null;
      run(store.deleteReason(reason.id));
    });
    const count = el('span', { className: 'muted', textContent: used ? `${used} used` : '' });
    return el('li', {}, input, count, del);
  }

  async function checkPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'ths-ext-status' });
      $('warning').hidden = !(status && status.isSearch && !status.isDetail && status.count === 0);
    } catch {
      // Not a TrustedHousesitters tab: the content script is not there to answer.
    }
  }

  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      state.confirmDelete = null;
      render();
    });
  }
  $('filter-text').addEventListener('input', (e) => {
    state.text = e.target.value;
    render();
  });
  $('filter-reason').addEventListener('change', (e) => {
    state.reason = e.target.value;
    render();
  });
  $('add-reason').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('new-reason');
    run(store.addReason(input.value).then(() => {
      input.value = '';
    }));
  });

  $('export').addEventListener('click', async () => {
    const data = await store.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = el('a', { href: url, download: `ths-marks-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show(`Exported ${Object.keys(data.marks).length} marks.`);
  });

  // The OS file chooser closes extension popups, so import runs from the same page opened in a tab.
  $('import').addEventListener('click', () => {
    if (!inTab) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?tab=1') });
      window.close();
      return;
    }
    $('import-file').click();
  });
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    state.pendingImport = await file.text();
    $('import-choice').hidden = false;
    show(`Loaded ${file.name}. Merge into your marks, or replace them all?`);
  });
  for (const mode of ['merge', 'replace']) {
    $(`import-${mode}`).addEventListener('click', async () => {
      const text = state.pendingImport;
      state.pendingImport = null;
      $('import-choice').hidden = true;
      try {
        const { added, updated } = await store.importData(text, mode);
        show(`Import done: +${added} added, ${updated} updated.`);
      } catch (err) {
        show(err.message, true);
      }
    });
  }

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') load();
  });

  document.body.classList.toggle('in-tab', inTab);
  run(load());
  checkPage();
})();
