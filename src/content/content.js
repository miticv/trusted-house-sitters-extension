(function () {
  'use strict';
  const { listingIdFromHref, createStore, badgeLabel, badgeTitle, openPopover } = globalThis.THS;

  const store = createStore(chrome.storage.local);
  const CARD_SELECTOR = '[data-testid="ListingCard__container"]';
  const UI_SELECTOR = '.ths-ext-controls, .ths-ext-popover';

  let marks = {};
  let reasons = [];
  let cardCount = 0;
  const controlsByCard = new WeakMap();

  function run(promise) {
    promise.catch((err) => console.error('[ths-ext]', err));
  }

  function isDetailPage() {
    return listingIdFromHref(location.href) !== null;
  }

  function linkInfo(root) {
    for (const a of root.querySelectorAll('a[href]')) {
      if (a.closest(UI_SELECTOR)) continue;
      const id = listingIdFromHref(a.href);
      if (id) return { id, url: a.href.split(/[?#]/)[0] };
    }
    return null;
  }

  function distinctListingIds(el) {
    const ids = new Set();
    for (const a of el.querySelectorAll('a[href]')) {
      const id = listingIdFromHref(a.href);
      if (id) ids.add(id);
    }
    return ids.size;
  }

  // Fallback when the site drops its data-testid: the largest ancestor of a listing link that still holds only that listing.
  function findCardsFallback() {
    const cards = new Set();
    for (const a of document.querySelectorAll('a[href*="/l/"]')) {
      if (!listingIdFromHref(a.href) || a.closest(UI_SELECTOR)) continue;
      let el = a;
      while (el.parentElement && el.parentElement !== document.body && distinctListingIds(el.parentElement) === 1) {
        el = el.parentElement;
      }
      if (el !== a) cards.add(el);
    }
    return [...cards];
  }

  function findCards() {
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];
    if (cards.length || isDetailPage()) return cards;
    return findCardsFallback();
  }

  function cardTarget(card) {
    const info = linkInfo(card);
    if (!info) return null;
    const text = (selector) => card.querySelector(selector)?.innerText.trim() || '';
    return {
      id: info.id,
      meta: {
        url: info.url,
        title: text('[data-testid="ListingCard__title"]'),
        location: text('[data-testid="ListingCard__location"]'),
      },
    };
  }

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function button(icon, label, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ths-ext-btn ${className}`;
    b.textContent = icon;
    b.title = label;
    b.setAttribute('aria-label', label);
    return b;
  }

  // getTarget is called at click time, so a card element the site reuses for another listing acts on the right id.
  function buildControls(getTarget) {
    const root = document.createElement('div');
    root.className = 'ths-ext-controls';
    const star = button('⭐', 'Interested', 'ths-ext-star');
    const x = button('❌', 'Not interested', 'ths-ext-x');
    const badge = document.createElement('span');
    badge.className = 'ths-ext-badge';
    badge.hidden = true;
    root.append(star, x, badge);

    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      root.addEventListener(type, (e) => e.stopPropagation());
    }
    root.addEventListener('click', (e) => e.preventDefault());

    star.addEventListener('click', (e) => {
      stop(e);
      const target = getTarget();
      if (!target) return;
      if (marks[target.id]?.status === 'interested') run(store.unmark(target.id));
      else run(store.setInterested(target.id, target.meta));
    });

    x.addEventListener('click', (e) => {
      stop(e);
      const target = getTarget();
      if (!target) return;
      const mark = marks[target.id];
      openPopover({
        anchor: x,
        reasons,
        mark: mark?.status === 'not_interested' ? mark : null,
        onSave: (value) => run(store.setNotInterested(target.id, value, target.meta)),
        onRemove: () => run(store.unmark(target.id)),
      });
    });

    return { root, star, x, badge };
  }

  // Only touch text when it changes, so the MutationObserver is not re-triggered by our own writes.
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function paint(ctrl, mark) {
    ctrl.star.setAttribute('aria-pressed', String(mark?.status === 'interested'));
    ctrl.x.setAttribute('aria-pressed', String(mark?.status === 'not_interested'));
    const label = badgeLabel(mark, reasons);
    setText(ctrl.badge, label);
    ctrl.badge.hidden = !label;
    ctrl.badge.title = badgeTitle(mark, reasons);
  }

  function renderCard(card) {
    const info = linkInfo(card);
    if (!info) return;
    let ctrl = controlsByCard.get(card);
    if (!ctrl || !card.contains(ctrl.root)) {
      ctrl = buildControls(() => cardTarget(card));
      card.classList.add('ths-ext-card');
      card.append(ctrl.root);
      controlsByCard.set(card, ctrl);
    }
    card.dataset.thsExtId = info.id;
    const mark = marks[info.id];
    card.classList.toggle('ths-ext-interested', mark?.status === 'interested');
    card.classList.toggle('ths-ext-rejected', mark?.status === 'not_interested');
    paint(ctrl, mark);
  }

  function scan() {
    const cards = findCards();
    cardCount = cards.length;
    cards.forEach(renderCard);
  }

  let scanTimer = 0;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 100);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.marks) marks = changes.marks.newValue || {};
    if (changes.reasons) reasons = changes.reasons.newValue || [];
    scan();
  });

  (async () => {
    [marks, reasons] = await Promise.all([store.getMarks(), store.getReasons()]);
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  })().catch((err) => console.error('[ths-ext]', err));
})();
