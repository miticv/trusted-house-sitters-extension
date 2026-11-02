(function (root) {
  'use strict';
  const THS = (root.THS = root.THS || {});

  const OTHER_ID = 'other';
  const DEFAULT_REASONS = [
    { id: 'too_far', label: 'Too far' },
    { id: 'dates', label: "Dates don't fit" },
    { id: 'too_many_pets', label: 'Too many pets' },
    { id: 'pet_type', label: 'Pet type' },
    { id: 'length', label: 'Too long / too short' },
    { id: 'needs_car', label: 'Needs car' },
    { id: OTHER_ID, label: 'Other' },
  ];

  function cleanLabel(label) {
    const clean = String(label ?? '').trim();
    if (!clean) throw new Error('Reason label is empty');
    return clean;
  }

  function assertUniqueLabel(reasons, label, exceptId) {
    const lower = label.toLowerCase();
    if (reasons.some((r) => r.id !== exceptId && r.label.toLowerCase() === lower)) {
      throw new Error(`Reason "${label}" already exists`);
    }
  }

  function createStore(area, { now = () => new Date().toISOString() } = {}) {
    async function getMarks() {
      const { marks } = await area.get('marks');
      return marks || {};
    }

    async function getReasons() {
      const { reasons } = await area.get('reasons');
      if (reasons) return reasons;
      const seeded = DEFAULT_REASONS.map((r) => ({ ...r }));
      await area.set({ reasons: seeded });
      return seeded;
    }

    async function writeMark(id, status, reasons, note, meta) {
      const marks = await getMarks();
      const prev = marks[id] || {};
      marks[id] = {
        status,
        reasons,
        note,
        title: meta.title || prev.title || '',
        location: meta.location || prev.location || '',
        url: meta.url || prev.url || '',
        markedAt: now(),
      };
      await area.set({ marks });
      return marks[id];
    }

    function setInterested(id, meta = {}) {
      return writeMark(id, 'interested', [], '', meta);
    }

    function setNotInterested(id, { reasons = [], note = '' } = {}, meta = {}) {
      return writeMark(id, 'not_interested', [...new Set(reasons)], String(note).trim(), meta);
    }

    async function unmark(id) {
      const marks = await getMarks();
      if (!(id in marks)) return;
      delete marks[id];
      await area.set({ marks });
    }

    async function addReason(label) {
      const clean = cleanLabel(label);
      const reasons = await getReasons();
      assertUniqueLabel(reasons, clean);
      const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'reason';
      let id = base;
      for (let n = 2; reasons.some((r) => r.id === id); n++) id = `${base}_${n}`;
      const reason = { id, label: clean };
      reasons.push(reason);
      await area.set({ reasons });
      return reason;
    }

    async function renameReason(id, label) {
      const clean = cleanLabel(label);
      const reasons = await getReasons();
      const reason = reasons.find((r) => r.id === id);
      if (!reason) throw new Error(`Unknown reason: ${id}`);
      assertUniqueLabel(reasons, clean, id);
      reason.label = clean;
      await area.set({ reasons });
    }

    return { getMarks, getReasons, setInterested, setNotInterested, unmark, addReason, renameReason };
  }

  Object.assign(THS, { createStore, DEFAULT_REASONS, OTHER_ID });
  if (typeof module !== 'undefined') module.exports = { createStore, DEFAULT_REASONS, OTHER_ID };
})(globalThis);
