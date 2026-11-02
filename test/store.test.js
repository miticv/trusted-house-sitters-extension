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
