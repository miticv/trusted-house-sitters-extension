const test = require('node:test');
const assert = require('node:assert/strict');
const { reasonLabel, badgeLabel, badgeTitle } = require('../src/lib/format.js');

const REASONS = [
  { id: 'too_far', label: 'Too far' },
  { id: 'dates', label: "Dates don't fit" },
];
const rejected = (reasons, note = '') => ({ status: 'not_interested', reasons, note });

test('reasonLabel falls back to the id', () => {
  assert.equal(reasonLabel('dates', REASONS), "Dates don't fit");
  assert.equal(reasonLabel('gone', REASONS), 'gone');
});

test('badgeLabel is empty for no mark and for interested', () => {
  assert.equal(badgeLabel(undefined, REASONS), '');
  assert.equal(badgeLabel({ status: 'interested', reasons: [], note: '' }, REASONS), '');
});

test('badgeLabel shows first reason and a count of the rest', () => {
  assert.equal(badgeLabel(rejected(['too_far']), REASONS), 'Too far');
  assert.equal(badgeLabel(rejected(['dates', 'too_far']), REASONS), "Dates don't fit +1");
});

test('badgeLabel falls back to the first words of the note', () => {
  assert.equal(badgeLabel(rejected([], 'wants four walks every single day'), REASONS), 'wants four walks every…');
  assert.equal(badgeLabel(rejected([], 'no car'), REASONS), 'no car');
});

test('badgeLabel with nothing at all', () => {
  assert.equal(badgeLabel(rejected([]), REASONS), 'Not interested');
});

test('badgeTitle lists everything', () => {
  assert.equal(badgeTitle(undefined, REASONS), '');
  assert.equal(badgeTitle({ status: 'interested', reasons: [], note: '' }, REASONS), 'Interested');
  assert.equal(
    badgeTitle(rejected(['too_far', 'dates'], 'Also 3 cats'), REASONS),
    "Not interested\nToo far, Dates don't fit\nAlso 3 cats",
  );
  assert.equal(badgeTitle(rejected([]), REASONS), 'Not interested');
});
