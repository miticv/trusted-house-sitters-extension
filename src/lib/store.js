(function (root) {
  'use strict';
  const THS = (root.THS = root.THS || {});

  // No catch-all "Other": the free-text note covers it.
  const DEFAULT_REASONS = [
    { id: 'too_far', label: 'Too far' },
    { id: 'dates', label: "Dates don't fit" },
    { id: 'too_many_pets', label: 'Too many pets' },
    { id: 'pet_type', label: 'Pet type' },
    { id: 'length', label: 'Too long / too short' },
    { id: 'needs_car', label: 'Needs car' },
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

  const STATUSES = ['interested', 'not_interested'];
  const isString = (v) => typeof v === 'string';
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function fail(message) {
    throw new Error(`Invalid import file: ${message}`);
  }

  function parseExport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      fail('not valid JSON');
    }
    if (!isPlainObject(data)) fail('expected a JSON object');
    if (data.version !== 1) fail(`unsupported version ${JSON.stringify(data.version)}`);
    if (!isPlainObject(data.marks)) fail('"marks" must be an object');
    if (!Array.isArray(data.reasons)) fail('"reasons" must be an array');

    const reasons = data.reasons.map((r, i) => {
      if (!isPlainObject(r) || !isString(r.id) || !r.id || !isString(r.label)) {
        fail(`reason #${i + 1} needs a string id and label`);
      }
      return { id: r.id, label: r.label };
    });

    const marks = {};
    for (const [id, m] of Object.entries(data.marks)) {
      if (!/^\d+$/.test(id)) fail(`listing id "${id}" is not numeric`);
      if (!isPlainObject(m) || !STATUSES.includes(m.status)) fail(`listing ${id} has an unknown status`);
      if (!isString(m.markedAt) || Number.isNaN(Date.parse(m.markedAt))) fail(`listing ${id} has no valid markedAt`);
      if (m.reasons !== undefined && !(Array.isArray(m.reasons) && m.reasons.every(isString))) {
        fail(`listing ${id} has invalid reasons`);
      }
      marks[id] = {
        status: m.status,
        reasons: m.status === 'interested' ? [] : [...new Set(m.reasons || [])],
        note: isString(m.note) ? m.note : '',
        title: isString(m.title) ? m.title : '',
        location: isString(m.location) ? m.location : '',
        url: isString(m.url) ? m.url : '',
        markedAt: m.markedAt,
      };
    }
    return { marks, reasons };
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

    async function deleteReason(id) {
      const reasons = (await getReasons()).filter((r) => r.id !== id);
      const marks = await getMarks();
      for (const mark of Object.values(marks)) {
        mark.reasons = mark.reasons.filter((r) => r !== id);
      }
      await area.set({ reasons, marks });
    }

    async function exportData() {
      return { version: 1, marks: await getMarks(), reasons: await getReasons() };
    }

    async function importData(text, mode) {
      if (mode !== 'merge' && mode !== 'replace') throw new Error(`Unknown import mode: ${mode}`);
      const incoming = parseExport(text);
      if (mode === 'replace') {
        await area.set({ marks: incoming.marks, reasons: incoming.reasons });
        return { added: Object.keys(incoming.marks).length, updated: 0 };
      }
      const marks = await getMarks();
      const reasons = await getReasons();
      let added = 0;
      let updated = 0;
      for (const [id, mark] of Object.entries(incoming.marks)) {
        const current = marks[id];
        if (!current) {
          marks[id] = mark;
          added++;
        } else if (Date.parse(mark.markedAt) > Date.parse(current.markedAt)) {
          marks[id] = mark;
          updated++;
        }
      }
      for (const reason of incoming.reasons) {
        if (!reasons.some((r) => r.id === reason.id)) reasons.push(reason);
      }
      await area.set({ marks, reasons });
      return { added, updated };
    }

    return {
      getMarks, getReasons, setInterested, setNotInterested, unmark,
      addReason, renameReason, deleteReason, exportData, importData,
    };
  }

  Object.assign(THS, { createStore, parseExport, DEFAULT_REASONS });
  if (typeof module !== 'undefined') module.exports = { createStore, parseExport, DEFAULT_REASONS };
})(globalThis);
