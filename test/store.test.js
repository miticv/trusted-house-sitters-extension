const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, DEFAULT_REASONS } = require('../src/lib/store.js');
const { memArea } = require('./helpers/mem-area.js');

function setup(initial) {
  const area = memArea(initial);
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 2, 12, 0, tick++)).toISOString();
  return { area, store: createStore(area, { now }) };
}

const META = {
  title: 'Looking for an animal loving house sitter',
  location: 'Mandurah, WA, Australia',
  url: 'https://www.trustedhousesitters.com/house-and-pet-sitting-assignments/australia/western-australia/mandurah/l/1609804/',
};

test('getMarks is empty initially', async () => {
  const { store } = setup();
  assert.deepEqual(await store.getMarks(), {});
});

test('getReasons seeds and persists the defaults', async () => {
  const { store, area } = setup();
  assert.deepEqual(await store.getReasons(), DEFAULT_REASONS);
  assert.deepEqual(area.dump().reasons, DEFAULT_REASONS);
});

test('setInterested stores an interested mark with snapshot', async () => {
  const { store } = setup();
  await store.setInterested('1609804', META);
  assert.deepEqual((await store.getMarks())['1609804'], {
    status: 'interested', reasons: [], note: '', ...META, markedAt: '2026-11-02T12:00:00.000Z',
  });
});

test('setNotInterested stores deduplicated reasons and a trimmed note', async () => {
  const { store } = setup();
  await store.setNotInterested('1', { reasons: ['too_far', 'dates', 'too_far'], note: '  4 walks a day  ' }, META);
  const mark = (await store.getMarks())['1'];
  assert.equal(mark.status, 'not_interested');
  assert.deepEqual(mark.reasons, ['too_far', 'dates']);
  assert.equal(mark.note, '4 walks a day');
});

test('whitespace-only note is stored as empty', async () => {
  const { store } = setup();
  await store.setNotInterested('1', { reasons: [], note: '   ' });
  assert.equal((await store.getMarks())['1'].note, '');
});

test('switching to interested clears reasons and note', async () => {
  const { store } = setup();
  await store.setNotInterested('1', { reasons: ['too_far'], note: 'far' }, META);
  await store.setInterested('1');
  const mark = (await store.getMarks())['1'];
  assert.equal(mark.status, 'interested');
  assert.deepEqual(mark.reasons, []);
  assert.equal(mark.note, '');
  assert.equal(mark.markedAt, '2026-11-02T12:00:01.000Z');
});

test('re-marking with empty meta keeps the earlier snapshot', async () => {
  const { store } = setup();
  await store.setInterested('1', META);
  await store.setNotInterested('1', { reasons: ['dates'] }, { title: '', location: '', url: '' });
  const mark = (await store.getMarks())['1'];
  assert.equal(mark.title, META.title);
  assert.equal(mark.location, META.location);
  assert.equal(mark.url, META.url);
});

test('unmark removes the entry and ignores unknown ids', async () => {
  const { store } = setup();
  await store.setInterested('1', META);
  await store.setInterested('2', META);
  await store.unmark('1');
  await store.unmark('999');
  assert.deepEqual(Object.keys(await store.getMarks()), ['2']);
});

test('addReason creates a slug id, unique on collision', async () => {
  const { store } = setup();
  assert.deepEqual(await store.addReason('  No wifi '), { id: 'no_wifi', label: 'No wifi' });
  assert.deepEqual(await store.addReason('Too far!'), { id: 'too_far_2', label: 'Too far!' });
  const ids = (await store.getReasons()).map((r) => r.id);
  assert.ok(ids.includes('no_wifi') && ids.includes('too_far_2'));
});

test('addReason rejects empty and duplicate labels', async () => {
  const { store } = setup();
  await assert.rejects(store.addReason('   '), /empty/);
  await assert.rejects(store.addReason('too FAR'), /already exists/);
});

test('renameReason renames and validates', async () => {
  const { store } = setup();
  await store.renameReason('too_far', 'Too far away');
  assert.equal((await store.getReasons()).find((r) => r.id === 'too_far').label, 'Too far away');
  await assert.rejects(store.renameReason('dates', ' '), /empty/);
  await assert.rejects(store.renameReason('dates', 'needs car'), /already exists/);
  await assert.rejects(store.renameReason('nope', 'X'), /Unknown reason/);
});

test('deleteReason strips the reason from marks, falling back to Other', async () => {
  const { store } = setup();
  await store.setNotInterested('1', { reasons: ['too_far', 'dates'] });
  await store.setNotInterested('2', { reasons: ['too_far'] });
  await store.setNotInterested('3', { reasons: ['too_far'], note: 'far' });
  await store.deleteReason('too_far');
  const marks = await store.getMarks();
  assert.deepEqual(marks['1'].reasons, ['dates']);
  assert.deepEqual(marks['2'].reasons, ['other']);
  assert.deepEqual(marks['3'].reasons, []);
  assert.ok(!(await store.getReasons()).some((r) => r.id === 'too_far'));
});

test('the Other reason cannot be deleted', async () => {
  const { store } = setup();
  await assert.rejects(store.deleteReason('other'), /cannot be deleted/);
});

test('exportData returns version, marks and reasons', async () => {
  const { store } = setup();
  await store.setInterested('1', META);
  const data = await store.exportData();
  assert.equal(data.version, 1);
  assert.deepEqual(Object.keys(data.marks), ['1']);
  assert.deepEqual(data.reasons, DEFAULT_REASONS);
});

function file(marks, reasons = DEFAULT_REASONS) {
  return JSON.stringify({ version: 1, marks, reasons });
}
const mark = (status, markedAt, extra = {}) => ({
  status, reasons: [], note: '', title: 'T', location: 'L', url: 'U', markedAt, ...extra,
});

test('import merge adds new, replaces older, keeps newer-or-equal', async () => {
  const { store } = setup();
  await store.setInterested('1', META); // 12:00:00
  await store.setInterested('2', META); // 12:00:01
  await store.setInterested('3', META); // 12:00:02
  const result = await store.importData(file({
    1: mark('not_interested', '2027-01-01T00:00:00.000Z', { reasons: ['dates'] }), // newer -> replaces
    2: mark('not_interested', '2025-01-01T00:00:00.000Z'), // older -> kept
    3: mark('not_interested', '2026-11-02T12:00:02.000Z'), // equal -> kept
    4: mark('interested', '2025-01-01T00:00:00.000Z'), // new -> added
  }, [...DEFAULT_REASONS, { id: 'no_wifi', label: 'No wifi' }]), 'merge');
  assert.deepEqual(result, { added: 1, updated: 1 });
  const marks = await store.getMarks();
  assert.equal(marks['1'].status, 'not_interested');
  assert.equal(marks['2'].status, 'interested');
  assert.equal(marks['3'].status, 'interested');
  assert.equal(marks['4'].status, 'interested');
  assert.ok((await store.getReasons()).some((r) => r.id === 'no_wifi'));
});

test('import replace overwrites everything', async () => {
  const { store } = setup();
  await store.setInterested('1', META);
  const result = await store.importData(file({ 9: mark('interested', '2025-01-01T00:00:00.000Z') }), 'replace');
  assert.deepEqual(result, { added: 1, updated: 0 });
  assert.deepEqual(Object.keys(await store.getMarks()), ['9']);
});

test('import adds the Other reason when the file lacks it', async () => {
  const { store } = setup();
  await store.importData(file({}, [{ id: 'x', label: 'X' }]), 'replace');
  assert.deepEqual((await store.getReasons()).map((r) => r.id), ['x', 'other']);
});

test('invalid import files are rejected and nothing changes', async () => {
  const { store, area } = setup();
  await store.setInterested('1', META);
  const before = area.dump();
  const bad = [
    'not json',
    JSON.stringify([]),
    JSON.stringify({ version: 2, marks: {}, reasons: [] }),
    JSON.stringify({ version: 1, marks: [], reasons: [] }),
    JSON.stringify({ version: 1, marks: {}, reasons: {} }),
    file({ abc: mark('interested', '2025-01-01T00:00:00.000Z') }),
    file({ 5: mark('maybe', '2025-01-01T00:00:00.000Z') }),
    file({ 5: mark('interested', 'yesterday') }),
    file({ 5: mark('not_interested', '2025-01-01T00:00:00.000Z', { reasons: 'dates' }) }),
    file({}, [{ id: 'x' }]),
  ];
  for (const text of bad) {
    for (const mode of ['merge', 'replace']) {
      await assert.rejects(store.importData(text, mode), /Invalid import file/, text);
    }
  }
  assert.deepEqual(area.dump(), before);
});

test('unknown import mode is rejected', async () => {
  const { store } = setup();
  await assert.rejects(store.importData(file({}), 'append'), /Unknown import mode/);
});
