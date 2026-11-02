(function (root) {
  'use strict';
  const THS = (root.THS = root.THS || {});

  const NOTE_WORDS = 4;

  function reasonLabel(id, reasons) {
    const reason = reasons.find((r) => r.id === id);
    return reason ? reason.label : id;
  }

  function badgeLabel(mark, reasons) {
    if (!mark || mark.status !== 'not_interested') return '';
    if (mark.reasons.length) {
      const first = reasonLabel(mark.reasons[0], reasons);
      return mark.reasons.length > 1 ? `${first} +${mark.reasons.length - 1}` : first;
    }
    if (mark.note) {
      const words = mark.note.split(/\s+/);
      return words.length > NOTE_WORDS ? `${words.slice(0, NOTE_WORDS).join(' ')}…` : mark.note;
    }
    return 'Not interested';
  }

  function badgeTitle(mark, reasons) {
    if (!mark) return '';
    if (mark.status === 'interested') return 'Interested';
    const lines = ['Not interested'];
    if (mark.reasons.length) lines.push(mark.reasons.map((id) => reasonLabel(id, reasons)).join(', '));
    if (mark.note) lines.push(mark.note);
    return lines.join('\n');
  }

  Object.assign(THS, { reasonLabel, badgeLabel, badgeTitle });
  if (typeof module !== 'undefined') module.exports = { reasonLabel, badgeLabel, badgeTitle };
})(globalThis);
