const test = require('node:test');
const assert = require('node:assert/strict');
const { isSaveKeyTarget } = require('../src/content/popover.js');

const node = (...classes) => ({ classList: { contains: (c) => classes.includes(c) } });

test('Enter saves when focus is on the popover itself or a reason chip', () => {
  const popover = node('ths-ext-popover');
  assert.equal(isSaveKeyTarget(popover, popover), true);
  assert.equal(isSaveKeyTarget(node('ths-ext-chip'), popover), true);
});

test('Enter does not save from Cancel, Remove mark, Save or the note', () => {
  const popover = node('ths-ext-popover');
  assert.equal(isSaveKeyTarget(node(), popover), false);
  assert.equal(isSaveKeyTarget(node('ths-ext-danger'), popover), false);
  assert.equal(isSaveKeyTarget(node('ths-ext-primary'), popover), false);
  assert.equal(isSaveKeyTarget(node('ths-ext-note'), popover), false);
});
