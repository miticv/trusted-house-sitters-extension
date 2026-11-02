const test = require('node:test');
const assert = require('node:assert/strict');
const { listingIdFromHref } = require('../src/lib/listing-id.js');

const BASE = '/house-and-pet-sitting-assignments/australia/western-australia/mandurah/l/1609804/';

test('relative listing url', () => {
  assert.equal(listingIdFromHref(BASE), '1609804');
});

test('absolute listing url', () => {
  assert.equal(listingIdFromHref(`https://www.trustedhousesitters.com${BASE}`), '1609804');
});

test('no trailing slash', () => {
  assert.equal(listingIdFromHref(BASE.slice(0, -1)), '1609804');
});

test('query string and hash', () => {
  assert.equal(listingIdFromHref(`${BASE}?ref=search`), '1609804');
  assert.equal(listingIdFromHref(`${BASE}#photos`), '1609804');
});

test('short form without location segments', () => {
  assert.equal(listingIdFromHref('/house-and-pet-sitting-assignments/l/215605/'), '215605');
});

test('non-listing links return null', () => {
  assert.equal(listingIdFromHref('/house-and-pet-sitting-assignments/'), null);
  assert.equal(listingIdFromHref('/house-and-pet-sitting-assignments/australia/'), null);
  assert.equal(listingIdFromHref('/pages/about/'), null);
  assert.equal(listingIdFromHref('/l/123/'), null);
  assert.equal(listingIdFromHref('/house-and-pet-sitting-assignments/x/l/12ab/'), null);
});

test('non-string input returns null', () => {
  assert.equal(listingIdFromHref(undefined), null);
  assert.equal(listingIdFromHref(null), null);
});

const { isSearchPath } = require('../src/lib/listing-id.js');

test('isSearchPath is true only for sit search pages', () => {
  assert.equal(isSearchPath('/house-and-pet-sitting-assignments/'), true);
  assert.equal(isSearchPath('/house-and-pet-sitting-assignments/australia/western-australia/'), true);
  assert.equal(isSearchPath('/house-and-pet-sitting-assignments/australia/western-australia/mandurah/l/1609804/'), false);
  assert.equal(isSearchPath('/inbox/123/'), false);
  assert.equal(isSearchPath('/'), false);
});
