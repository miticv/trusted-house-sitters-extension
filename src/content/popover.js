(function (root) {
  'use strict';
  const THS = (root.THS = root.THS || {});

  let current = null;

  function closePopover() {
    if (!current) return;
    current.el.remove();
    document.removeEventListener('mousedown', current.onOutside, true);
    document.removeEventListener('keydown', current.onKey, true);
    current = null;
  }

  // Enter saves only from the popover itself or a chip; on a button it must do what that button says.
  function isSaveKeyTarget(target, popoverEl) {
    return target === popoverEl || Boolean(target.classList?.contains('ths-ext-chip'));
  }

  function actionButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener('click', onClick);
    return button;
  }

  function openPopover({ anchor, reasons, mark, onSave, onRemove }) {
    closePopover();
    const picked = new Set(mark?.reasons || []);

    const el = document.createElement('div');
    el.className = 'ths-ext-popover';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Not interested: reasons');
    el.tabIndex = -1;

    const chips = document.createElement('div');
    chips.className = 'ths-ext-chips';
    for (const reason of reasons) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ths-ext-chip';
      chip.textContent = reason.label;
      chip.setAttribute('aria-pressed', String(picked.has(reason.id)));
      chip.addEventListener('click', () => {
        if (picked.has(reason.id)) picked.delete(reason.id);
        else picked.add(reason.id);
        chip.setAttribute('aria-pressed', String(picked.has(reason.id)));
      });
      chips.append(chip);
    }

    const note = document.createElement('textarea');
    note.className = 'ths-ext-note';
    note.rows = 2;
    note.placeholder = 'Note (optional)';
    note.value = mark?.note || '';

    const save = actionButton('Save', 'ths-ext-primary', () => {
      const value = { reasons: [...picked], note: note.value };
      closePopover();
      onSave(value);
    });
    const actions = document.createElement('div');
    actions.className = 'ths-ext-actions';
    if (mark) {
      actions.append(actionButton('Remove mark', 'ths-ext-danger', () => {
        closePopover();
        onRemove();
      }));
    }
    actions.append(actionButton('Cancel', '', closePopover), save);
    el.append(chips, note, actions);

    // Keep clicks and keys inside the popover away from the site's own handlers.
    for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) {
      el.addEventListener(type, (e) => e.stopPropagation());
    }

    document.body.append(el);
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - el.offsetWidth - 8));
    const below = rect.bottom + 6;
    const top = below + el.offsetHeight > window.innerHeight ? Math.max(8, rect.top - el.offsetHeight - 6) : below;
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${top + window.scrollY}px`;

    const onOutside = (e) => {
      if (!el.contains(e.target)) closePopover();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
      } else if (e.key === 'Enter' && isSaveKeyTarget(e.target, el)) {
        e.preventDefault();
        save.click();
      }
    };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    current = { el, onOutside, onKey };
    el.focus();
  }

  Object.assign(THS, { openPopover, closePopover });
  if (typeof module !== 'undefined') module.exports = { isSaveKeyTarget };
})(globalThis);
