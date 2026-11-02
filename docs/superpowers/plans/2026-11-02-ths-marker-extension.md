# THS Listing Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that lets a sitter mark trustedhousesitters.com sit listings as Interested / Not interested (with reasons) and shows those marks on the listing cards wherever they reappear.

**Architecture:** Manifest V3, plain JavaScript, no build step. Pure logic (listing-ID parsing, storage, badge text) lives in `src/lib/*.js` as classic scripts that attach to a `globalThis.THS` namespace and also `module.exports` for Node tests. A content script decorates listing cards and re-applies decoration via a `MutationObserver`; a toolbar popup manages marks, reasons and export/import. All state is in `chrome.storage.local` and every view re-renders from `chrome.storage.onChanged`.

**Tech Stack:** Chrome MV3, vanilla JS/CSS/HTML, Node 24 built-in test runner (`node:test`), no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-ths-marker-extension-design.md`

## Global Constraints

- Manifest V3; only permission is `"storage"`.
- No build step and no npm dependencies (runtime or dev).
- Storage: `chrome.storage.local`, keys `marks` and `reasons` only. Mark shape: `{ status, reasons, note, title, location, url, markedAt }`, `status` ∈ `"interested" | "not_interested"`.
- Default reasons (ids/labels): `too_far` Too far, `dates` Dates don't fit, `too_many_pets` Too many pets, `pet_type` Pet type, `length` Too long / too short, `needs_car` Needs car, `other` Other.
- All injected CSS classes/ids prefixed `ths-ext-`.
- Export file: `ths-marks-YYYY-MM-DD.json` containing `{ version: 1, marks, reasons }`.
- Tests: `npm test` → `node --test "test/*.test.js"` (Node 24 rejects a bare directory argument).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate refinements of the spec (flag these in review)

1. Content script matches all of `https://www.trustedhousesitters.com/*`, not just the search path: the site is an SPA, so a user who lands on the home page and navigates to search would otherwise never get the script. It only acts where listing cards / listing pages exist.
2. Listing-page controls are a floating pill at the bottom-right instead of a top bar, so they never cover the site's header navigation.
3. The "Other" reason cannot be deleted (it is the fallback for marks left with no reason). It can be renamed.
4. Import opens the popup page in a full tab first, because the OS file chooser closes extension popups and loses the selected file.
5. Reason-delete confirmation is an inline "click again" button; `confirm()` is unreliable in extension popups.
6. Interested is shown by the pressed ⭐ button plus a green outline; there is no separate interested badge.

## Review Focus

1. **Card element reused for a different listing** after paging — the decoration must follow the listing ID, not the DOM node. (Task 5: ID re-read on every scan; manual check step.)
2. **Marking from the listing page** (which has no location text) must not erase the title/location snapshot taken earlier from the card. (Task 2 test.)
3. **Importing a file that is older than, or malformed relative to, current data** — older/equal marks keep the current version; a bad file changes nothing. (Task 3 tests.)
4. **Deleting the only reason on a mark** — mark falls back to "Other"; "Other" itself cannot be deleted. (Task 3 tests.)
5. **Clicking ⭐ / ❌ / inside the popover** must never open the listing or flip the photo carousel. (Task 5 manual check step.)

---

## File Structure

```
package.json                 npm test script only
manifest.json                MV3 manifest
src/lib/listing-id.js        listingIdFromHref(href) -> string | null
src/lib/store.js             createStore(area, {now}) -> marks/reasons/import/export API; parseExport
src/lib/format.js            reasonLabel, badgeLabel, badgeTitle
src/content/popover.js       openPopover / closePopover
src/content/content.js       card discovery, controls, listing-page pill, observer, status message
src/content/content.css      all on-page styles
src/popup/popup.html         popup markup
src/popup/popup.css          popup styles
src/popup/popup.js           popup behaviour
test/helpers/mem-area.js     in-memory chrome.storage.local stand-in
test/listing-id.test.js
test/store.test.js
test/format.test.js
README.md                    install + manual test checklist
```

---

### Task 1: Project scaffold and listing-ID parser

**Files:**
- Create: `package.json`
- Create: `src/lib/listing-id.js`
- Test: `test/listing-id.test.js`

**Interfaces:**
- Produces: `THS.listingIdFromHref(href: string): string | null` (also `module.exports.listingIdFromHref`). Returns the numeric listing id as a string for any `/house-and-pet-sitting-assignments/.../l/<digits>` URL (absolute or relative), else `null`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ths-listing-marker",
  "version": "0.1.0",
  "private": true,
  "description": "Chrome extension to mark TrustedHousesitters listings as interested / not interested",
  "scripts": {
    "test": "node --test \"test/*.test.js\""
  }
}
```

- [ ] **Step 2: Write the failing test** — `test/listing-id.test.js`

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../src/lib/listing-id.js'`

- [ ] **Step 4: Write implementation** — `src/lib/listing-id.js`

```js
(function (root) {
  'use strict';
  const THS = (root.THS = root.THS || {});

  // /house-and-pet-sitting-assignments/<any location path>/l/<digits>/ — the digits are the listing id.
  const LISTING_RE = /\/house-and-pet-sitting-assignments\/(?:[^?#]*\/)?l\/(\d+)(?=[/?#]|$)/;

  function listingIdFromHref(href) {
    if (typeof href !== 'string') return null;
    const match = href.match(LISTING_RE);
    return match ? match[1] : null;
  }

  THS.listingIdFromHref = listingIdFromHref;
  if (typeof module !== 'undefined') module.exports = { listingIdFromHref };
})(globalThis);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/listing-id.js test/listing-id.test.js
git commit -m "Add listing id parser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Store — marks and reasons

**Files:**
- Create: `src/lib/store.js`
- Create: `test/helpers/mem-area.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (on `THS` and `module.exports`): `DEFAULT_REASONS`, `OTHER_ID` (`'other'`), `createStore(area, { now } = {})` where `area` has `get(key: string) -> Promise<object>` and `set(items: object) -> Promise<void>` (i.e. `chrome.storage.local`), returning:
  - `getMarks(): Promise<Record<string, Mark>>`
  - `getReasons(): Promise<{id, label}[]>` — seeds `DEFAULT_REASONS` on first call
  - `setInterested(id, meta = {}): Promise<Mark>`
  - `setNotInterested(id, { reasons = [], note = '' } = {}, meta = {}): Promise<Mark>`
  - `unmark(id): Promise<void>`
  - `addReason(label): Promise<{id, label}>`
  - `renameReason(id, label): Promise<void>`
  - `meta` is `{ title?, location?, url? }`; empty values keep the previous snapshot.

- [ ] **Step 1: Create the storage stand-in** — `test/helpers/mem-area.js`

```js
// In-memory stand-in for chrome.storage.local. Clones on the way in and out, like the real API.
function memArea(initial = {}) {
  let data = structuredClone(initial);
  return {
    async get(keys) {
      const list = typeof keys === 'string' ? [keys] : keys;
      const out = {};
      for (const key of list) if (key in data) out[key] = structuredClone(data[key]);
      return out;
    },
    async set(items) {
      data = { ...data, ...structuredClone(items) };
    },
    dump() {
      return structuredClone(data);
    },
  };
}

module.exports = { memArea };
```

- [ ] **Step 2: Write the failing tests** — `test/store.test.js`

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../src/lib/store.js'`

- [ ] **Step 4: Write implementation** — `src/lib/store.js`

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all listing-id and store tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.js test/helpers/mem-area.js test/store.test.js
git commit -m "Add mark and reason storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store — reason deletion, export, import

**Files:**
- Modify: `src/lib/store.js`
- Test: `test/store.test.js` (append)

**Interfaces:**
- Consumes: `createStore` internals from Task 2.
- Produces (added to the object returned by `createStore`):
  - `deleteReason(id): Promise<void>` — throws for `'other'`
  - `exportData(): Promise<{ version: 1, marks, reasons }>`
  - `importData(text: string, mode: 'merge' | 'replace'): Promise<{ added: number, updated: number }>` — throws `Error('Invalid import file: …')` without writing anything
- Produces (module level, on `THS` and `module.exports`): `parseExport(text): { marks, reasons }`

- [ ] **Step 1: Append the failing tests** to `test/store.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `store.deleteReason is not a function` (and similar for `exportData`, `importData`).

- [ ] **Step 3: Add `parseExport` at module level** in `src/lib/store.js`, directly after `assertUniqueLabel`:

```js
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
    if (!reasons.some((r) => r.id === OTHER_ID)) reasons.push({ id: OTHER_ID, label: 'Other' });

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
```

- [ ] **Step 4: Add the three store methods** inside `createStore`, after `renameReason`:

```js
    async function deleteReason(id) {
      if (id === OTHER_ID) throw new Error('The "Other" reason cannot be deleted');
      const reasons = (await getReasons()).filter((r) => r.id !== id);
      const marks = await getMarks();
      for (const mark of Object.values(marks)) {
        if (!mark.reasons.includes(id)) continue;
        mark.reasons = mark.reasons.filter((r) => r !== id);
        if (mark.status === 'not_interested' && mark.reasons.length === 0 && !mark.note) mark.reasons = [OTHER_ID];
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
```

Update the `return` of `createStore` and the exports:

```js
    return {
      getMarks, getReasons, setInterested, setNotInterested, unmark,
      addReason, renameReason, deleteReason, exportData, importData,
    };
  }

  Object.assign(THS, { createStore, parseExport, DEFAULT_REASONS, OTHER_ID });
  if (typeof module !== 'undefined') module.exports = { createStore, parseExport, DEFAULT_REASONS, OTHER_ID };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.js test/store.test.js
git commit -m "Add reason deletion and JSON export/import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Badge text formatting

**Files:**
- Create: `src/lib/format.js`
- Test: `test/format.test.js`

**Interfaces:**
- Produces (on `THS` and `module.exports`):
  - `reasonLabel(id, reasons): string` — label for id, or the raw id if unknown
  - `badgeLabel(mark | undefined, reasons): string` — `''` unless not_interested; first reason label plus ` +N`; else first 4 words of note (with `…` if longer); else `'Not interested'`
  - `badgeTitle(mark | undefined, reasons): string` — `''` for no mark, `'Interested'`, or `'Not interested'` + lines for joined reason labels and the note

- [ ] **Step 1: Write the failing test** — `test/format.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../src/lib/format.js'`

- [ ] **Step 3: Write implementation** — `src/lib/format.js`

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.js test/format.test.js
git commit -m "Add badge text formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Content script — card controls and reason popover

**Files:**
- Create: `manifest.json`
- Create: `src/content/content.css`
- Create: `src/content/popover.js`
- Create: `src/content/content.js`

**Interfaces:**
- Consumes: `THS.listingIdFromHref`, `THS.createStore`, `THS.badgeLabel`, `THS.badgeTitle`.
- Produces: `THS.openPopover({ anchor: Element, reasons, mark: Mark | null, onSave({ reasons, note }), onRemove() })`, `THS.closePopover()`. In `content.js` (used by Task 6): `buildControls(getTarget) -> { root, star, x, badge }`, `paint(ctrl, mark)`, `isDetailPage()`, `scan()`, module variables `marks`, `reasons`, `cardCount`.

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "THS Listing Marker",
  "version": "0.1.0",
  "description": "Mark TrustedHousesitters sit listings as interested or not interested, and see those marks on every search.",
  "permissions": ["storage"],
  "action": {
    "default_title": "THS Listing Marker",
    "default_popup": "src/popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.trustedhousesitters.com/*"],
      "js": [
        "src/lib/listing-id.js",
        "src/lib/store.js",
        "src/lib/format.js",
        "src/content/popover.js",
        "src/content/content.js"
      ],
      "css": ["src/content/content.css"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Create `src/content/content.css`**

```css
.ths-ext-card { position: relative; }

.ths-ext-controls {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 30;
  display: flex;
  gap: 4px;
  align-items: center;
  opacity: 0.45;
  transition: opacity 0.15s;
  font-family: system-ui, sans-serif;
}
.ths-ext-card:hover .ths-ext-controls,
.ths-ext-interested .ths-ext-controls,
.ths-ext-rejected .ths-ext-controls { opacity: 1; }

.ths-ext-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.ths-ext-btn:hover { transform: scale(1.08); }
.ths-ext-star[aria-pressed="true"] { border-color: #2e9d5b; }
.ths-ext-x[aria-pressed="true"] { border-color: #c62828; }

.ths-ext-badge {
  max-width: 170px;
  padding: 5px 9px;
  border-radius: 12px;
  background: #c62828;
  color: #fff;
  font: 600 12px/1.2 system-ui, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: help;
}
.ths-ext-badge[hidden] { display: none; }

.ths-ext-interested { outline: 3px solid #2e9d5b; outline-offset: 2px; border-radius: 12px; }
.ths-ext-rejected { opacity: 0.4; transition: opacity 0.15s; }
.ths-ext-rejected:hover { opacity: 1; }
.ths-ext-rejected img { filter: grayscale(1); }

#ths-ext-bar {
  position: fixed;
  top: auto;
  left: auto;
  right: 16px;
  bottom: 16px;
  z-index: 2147482000;
  opacity: 1;
  padding: 6px;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}

.ths-ext-popover {
  position: absolute;
  z-index: 2147483000;
  width: 280px;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 10px;
  background: #fff;
  color: #222;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  font: 13px/1.4 system-ui, sans-serif;
}
.ths-ext-popover:focus { outline: none; }
.ths-ext-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ths-ext-chip {
  padding: 4px 10px;
  border: 1px solid #bbb;
  border-radius: 14px;
  background: #fff;
  color: #222;
  font: inherit;
  cursor: pointer;
}
.ths-ext-chip[aria-pressed="true"] { border-color: #c62828; background: #c62828; color: #fff; }
.ths-ext-note {
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid #bbb;
  border-radius: 6px;
  font: inherit;
  resize: vertical;
}
.ths-ext-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.ths-ext-actions button {
  padding: 5px 12px;
  border: 1px solid #bbb;
  border-radius: 6px;
  background: #fff;
  color: #222;
  font: inherit;
  cursor: pointer;
}
.ths-ext-actions .ths-ext-primary { border-color: #222; background: #222; color: #fff; }
.ths-ext-actions .ths-ext-danger { margin-right: auto; border-color: #c62828; color: #c62828; }
```

- [ ] **Step 3: Create `src/content/popover.js`**

```js
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
      } else if (e.key === 'Enter' && e.target !== note && el.contains(e.target)) {
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
})(globalThis);
```

- [ ] **Step 4: Create `src/content/content.js`**

```js
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
```

- [ ] **Step 5: Run unit tests (regression)**

Run: `npm test`
Expected: PASS (content files are not loaded by tests; this guards the libs).

- [ ] **Step 6: Load the extension and verify on the live site**

Ask the human to open `chrome://extensions`, enable Developer mode, click **Load unpacked** and pick the repo root (or click the reload ↻ icon if already loaded), then open `https://www.trustedhousesitters.com/house-and-pet-sitting-assignments/`. Check, in the browser:

1. Every listing card shows faint ⭐ ❌ top-left; they go solid on card hover. `document.querySelectorAll('[data-ths-ext-id]').length` equals the number of cards.
2. Click ⭐: green outline, ⭐ pressed; the page does **not** navigate and the photo does **not** change. Click ⭐ again: mark removed.
3. Click ❌: popover opens under the button. Pick two chips, type a note, press Enter while a chip has focus → card dims, photo greyscale, red badge "<first reason> +1"; hovering the badge shows all reasons and the note; hovering the card restores opacity.
4. Click ❌ on that card again: popover prefilled, has **Remove mark**; Esc closes without change; clicking outside closes without change; **Remove mark** clears it.
5. Click ⭐ on a rejected card: becomes interested, badge gone.
6. Mark two cards, then go to page 2 of results and back (pagination). Marks are on the same listings as before, not on whatever card now occupies the same position (Review Focus 1). No console errors with prefix `[ths-ext]`.
7. Open the same search in a second tab, mark a card in tab A — tab B updates without reload.
8. Leave the page idle for 10 s with DevTools Performance monitor open: no continuous DOM-node growth or CPU spin (observer does not loop on its own writes).

- [ ] **Step 7: Commit**

```bash
git add manifest.json src/content
git commit -m "Add card controls and reason popover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Listing-page pill and status message

**Files:**
- Modify: `src/content/content.js`

**Interfaces:**
- Consumes: `buildControls`, `paint`, `isDetailPage`, `scan`, `marks`, `cardCount` from Task 5.
- Produces: content script answers `chrome.runtime` message `{ type: 'ths-ext-status' }` with `{ count: number, isSearch: boolean, isDetail: boolean }` (used by the popup in Task 7).

- [ ] **Step 1: Add the listing-page pill.** In `src/content/content.js`, directly after the `renderCard` function, add:

```js
  let bar = null;

  function detailTarget() {
    const id = listingIdFromHref(location.href);
    if (!id) return null;
    return {
      id,
      meta: {
        url: location.href.split(/[?#]/)[0],
        title: document.querySelector('h1')?.innerText.trim() || '',
        location: '',
      },
    };
  }

  function renderBar() {
    const id = listingIdFromHref(location.href);
    if (!id) {
      bar?.root.remove();
      bar = null;
      return;
    }
    if (!bar || !document.body.contains(bar.root)) {
      bar = buildControls(detailTarget);
      bar.root.id = 'ths-ext-bar';
      document.body.append(bar.root);
    }
    paint(bar, marks[id]);
  }
```

- [ ] **Step 2: Call it from `scan`.** Replace the `scan` function with:

```js
  function scan() {
    const cards = findCards();
    cardCount = cards.length;
    cards.forEach(renderCard);
    renderBar();
  }
```

- [ ] **Step 3: Answer the popup's status request.** Directly after the `chrome.storage.onChanged.addListener(...)` block, add:

```js
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'ths-ext-status') return;
    sendResponse({
      count: cardCount,
      isSearch: location.pathname.startsWith('/house-and-pet-sitting-assignments/'),
      isDetail: isDetailPage(),
    });
  });
```

- [ ] **Step 4: Run unit tests (regression)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify on the live site** (reload the extension at `chrome://extensions` first)

1. Open any listing from search. A white pill with ⭐ ❌ appears bottom-right; it does not cover the site header.
2. Mark it not interested from the pill with one reason. Go back to search: that card is dimmed with the same badge; if the card was marked from search earlier, its stored `location` is still the card's value (right-click the toolbar icon → Inspect popup, then run `await chrome.storage.local.get('marks')`).
3. Navigate (inside the site) from a listing back to search: the pill disappears.
4. The listing page's own "similar sits" cards (if present) are decorated too.

- [ ] **Step 6: Commit**

```bash
git add src/content/content.js
git commit -m "Add listing-page controls and status message

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Toolbar popup

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`

**Interfaces:**
- Consumes: `THS.createStore` (all methods from Tasks 2–3), `THS.reasonLabel`, `THS.OTHER_ID`, content message `{ type: 'ths-ext-status' }` → `{ count, isSearch, isDetail }`.
- Produces: nothing used by other tasks.

- [ ] **Step 1: Create `src/popup/popup.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>THS Listing Marker</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <header>
    <h1>THS Listing Marker</h1>
    <p id="counts"></p>
  </header>
  <p id="warning" class="warning" hidden>No listing cards detected on this page. The site layout may have changed.</p>

  <nav class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="not_interested">Not interested</button>
    <button type="button" role="tab" data-tab="interested">Interested</button>
    <button type="button" role="tab" data-tab="reasons">Reasons</button>
  </nav>

  <section id="list-view">
    <div class="filters">
      <input id="filter-text" type="search" placeholder="Filter by title, location, note">
      <select id="filter-reason" aria-label="Filter by reason"></select>
    </div>
    <ul id="list"></ul>
    <p id="empty" class="muted" hidden>Nothing here yet.</p>
  </section>

  <section id="reasons-view" hidden>
    <ul id="reason-list"></ul>
    <form id="add-reason">
      <input id="new-reason" placeholder="New reason" maxlength="40" aria-label="New reason">
      <button type="submit">Add</button>
    </form>
  </section>

  <footer>
    <button type="button" id="export">Export</button>
    <button type="button" id="import">Import</button>
    <input id="import-file" type="file" accept="application/json,.json" hidden>
    <span id="import-choice" hidden>
      <button type="button" id="import-merge">Merge</button>
      <button type="button" id="import-replace">Replace all</button>
    </span>
    <p id="message" role="status"></p>
  </footer>

  <script src="../lib/listing-id.js"></script>
  <script src="../lib/store.js"></script>
  <script src="../lib/format.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/popup/popup.css`**

```css
:root { color-scheme: light; font: 13px/1.4 system-ui, sans-serif; color: #222; }
body { width: 380px; margin: 0; padding: 10px 12px; background: #fff; }
body.in-tab { width: auto; max-width: 720px; margin: 0 auto; padding: 24px; }
[hidden] { display: none !important; }
input, select, button { font: inherit; }

header { display: flex; justify-content: space-between; align-items: baseline; }
h1 { margin: 0; font-size: 15px; }
#counts { margin: 0; color: #555; }
.warning { padding: 6px 8px; border-radius: 6px; background: #fff4e5; color: #8a4b00; }

.tabs { display: flex; gap: 4px; margin: 10px 0 8px; border-bottom: 1px solid #ddd; }
.tabs button { padding: 6px 10px; border: none; border-bottom: 2px solid transparent; background: none; color: #555; cursor: pointer; }
.tabs button[aria-selected="true"] { border-bottom-color: #222; color: #222; font-weight: 600; }

.filters { display: flex; gap: 6px; margin-bottom: 8px; }
.filters input { flex: 1; }

ul { max-height: 360px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
body.in-tab ul { max-height: none; }
li { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid #eee; }
li .body { flex: 1; min-width: 0; }
.title { color: #1a4fa0; font-weight: 600; text-decoration: none; }
.meta, .muted { color: #777; font-size: 12px; }
.note { color: #444; font-style: italic; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.chip { padding: 1px 8px; border-radius: 10px; background: #fde7e7; color: #8e1c1c; font-size: 12px; }

button.icon { border: none; background: none; font-size: 14px; cursor: pointer; }
button.danger { border: 1px solid #c62828; border-radius: 6px; background: #fff; color: #c62828; cursor: pointer; }
#reason-list li { align-items: center; }
#reason-list input { flex: 1; }
#add-reason { display: flex; gap: 6px; margin-top: 8px; }
#add-reason input { flex: 1; }

footer { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd; }
#message { flex-basis: 100%; min-height: 1em; margin: 4px 0 0; color: #2e7d32; }
#message.error { color: #c62828; }
```

- [ ] **Step 3: Create `src/popup/popup.js`**

```js
(function () {
  'use strict';
  const { createStore, reasonLabel, OTHER_ID } = globalThis.THS;

  const store = createStore(chrome.storage.local);
  const $ = (id) => document.getElementById(id);
  const inTab = new URLSearchParams(location.search).has('tab');
  const state = {
    tab: 'not_interested',
    text: '',
    reason: '',
    marks: {},
    reasons: [],
    pendingImport: null,
    confirmDelete: null,
  };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function show(text, isError = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', isError);
  }

  function run(promise) {
    return promise.catch((err) => {
      show(err.message, true);
      load();
    });
  }

  async function load() {
    [state.marks, state.reasons] = await Promise.all([store.getMarks(), store.getReasons()]);
    render();
  }

  function render() {
    const all = Object.entries(state.marks);
    const interested = all.filter(([, m]) => m.status === 'interested').length;
    $('counts').textContent = `⭐ ${interested} · ❌ ${all.length - interested}`;
    for (const tab of document.querySelectorAll('[data-tab]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
    }
    const isReasons = state.tab === 'reasons';
    $('list-view').hidden = isReasons;
    $('reasons-view').hidden = !isReasons;
    if (isReasons) renderReasons();
    else renderList(all);
  }

  function renderList(all) {
    const select = $('filter-reason');
    select.hidden = state.tab !== 'not_interested';
    select.replaceChildren(
      el('option', { value: '', textContent: 'All reasons' }),
      ...state.reasons.map((r) => el('option', { value: r.id, textContent: r.label })),
    );
    select.value = state.reason;
    state.reason = select.value; // drops a filter whose reason was deleted

    const query = state.text.toLowerCase();
    const rows = all
      .filter(([, m]) => m.status === state.tab)
      .filter(([, m]) => state.tab !== 'not_interested' || !state.reason || m.reasons.includes(state.reason))
      .filter(([id, m]) => !query || [id, m.title, m.location, m.note].some((s) => s.toLowerCase().includes(query)))
      .sort(([, a], [, b]) => b.markedAt.localeCompare(a.markedAt));

    $('list').replaceChildren(...rows.map(([id, m]) => markRow(id, m)));
    $('empty').hidden = rows.length > 0;
  }

  function markRow(id, m) {
    const name = m.title || `Listing ${id}`;
    const title = m.url
      ? el('a', { href: m.url, target: '_blank', rel: 'noopener', textContent: name })
      : el('span', { textContent: name });
    title.className = 'title';
    const meta = el('div', {
      className: 'meta',
      textContent: [m.location, new Date(m.markedAt).toLocaleDateString()].filter(Boolean).join(' · '),
    });
    const chips = el('div', { className: 'chips' },
      ...m.reasons.map((rid) => el('span', { className: 'chip', textContent: reasonLabel(rid, state.reasons) })));
    const body = el('div', { className: 'body' }, title, meta, chips);
    if (m.note) body.append(el('div', { className: 'note', textContent: m.note }));

    const remove = el('button', { type: 'button', className: 'icon', title: 'Remove mark', textContent: '🗑' });
    remove.addEventListener('click', () => run(store.unmark(id)));
    return el('li', {}, body, remove);
  }

  function renderReasons() {
    const used = {};
    for (const m of Object.values(state.marks)) for (const r of m.reasons) used[r] = (used[r] || 0) + 1;
    $('reason-list').replaceChildren(...state.reasons.map((r) => reasonRow(r, used[r.id] || 0)));
  }

  function reasonRow(reason, used) {
    const input = el('input', { value: reason.label, maxLength: 40 });
    input.setAttribute('aria-label', `Rename ${reason.label}`);
    input.addEventListener('change', () => run(store.renameReason(reason.id, input.value)));
    const row = el('li', {}, input, el('span', { className: 'muted', textContent: used ? `${used} used` : '' }));

    if (reason.id !== OTHER_ID) {
      const armed = state.confirmDelete === reason.id;
      const del = el('button', {
        type: 'button',
        className: armed ? 'danger' : 'icon',
        title: 'Delete reason',
        textContent: armed ? `Delete? (used ${used}×)` : '🗑',
      });
      del.addEventListener('click', () => {
        if (used && !armed) {
          state.confirmDelete = reason.id;
          render();
          return;
        }
        state.confirmDelete = null;
        run(store.deleteReason(reason.id));
      });
      row.append(del);
    }
    return row;
  }

  async function checkPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'ths-ext-status' });
      $('warning').hidden = !(status && status.isSearch && !status.isDetail && status.count === 0);
    } catch {
      // Not a TrustedHousesitters tab: the content script is not there to answer.
    }
  }

  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      state.confirmDelete = null;
      render();
    });
  }
  $('filter-text').addEventListener('input', (e) => {
    state.text = e.target.value;
    render();
  });
  $('filter-reason').addEventListener('change', (e) => {
    state.reason = e.target.value;
    render();
  });
  $('add-reason').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('new-reason');
    run(store.addReason(input.value).then(() => {
      input.value = '';
    }));
  });

  $('export').addEventListener('click', async () => {
    const data = await store.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = el('a', { href: url, download: `ths-marks-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show(`Exported ${Object.keys(data.marks).length} marks.`);
  });

  // The OS file chooser closes extension popups, so import runs from the same page opened in a tab.
  $('import').addEventListener('click', () => {
    if (!inTab) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?tab=1') });
      window.close();
      return;
    }
    $('import-file').click();
  });
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    state.pendingImport = await file.text();
    $('import-choice').hidden = false;
    show(`Loaded ${file.name}. Merge into your marks, or replace them all?`);
  });
  for (const mode of ['merge', 'replace']) {
    $(`import-${mode}`).addEventListener('click', async () => {
      const text = state.pendingImport;
      state.pendingImport = null;
      $('import-choice').hidden = true;
      try {
        const { added, updated } = await store.importData(text, mode);
        show(`Import done: +${added} added, ${updated} updated.`);
      } catch (err) {
        show(err.message, true);
      }
    });
  }

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') load();
  });

  document.body.classList.toggle('in-tab', inTab);
  run(load());
  checkPage();
})();
```

- [ ] **Step 4: Run unit tests (regression)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser** (reload the extension first)

1. With a few marks made, click the toolbar icon: header counts are correct; **Not interested** lists rejected listings newest first with reason chips and note; **Interested** lists the others and hides the reason filter.
2. Text filter and reason filter narrow the list. Clicking a title opens the listing in a new tab. 🗑 removes the mark and the open search tab un-dims that card.
3. **Reasons**: add "No wifi" → appears as a chip in the on-page popover. Rename a reason → badge text on the page updates. Deleting a used reason first shows "Delete? (used N×)", second click deletes. "Other" has no delete button. Adding a duplicate shows a red error.
4. **Export** downloads `ths-marks-<today>.json`. **Import** in the popup opens a tab; in that tab pick the exported file → **Merge** reports "+0 added, 0 updated". Pick a hand-broken file (e.g. delete a brace) → red "Invalid import file: not valid JSON" and nothing changes.
5. On a search page, run `document.querySelectorAll('[data-testid="ListingCard__container"]').forEach(e => e.removeAttribute('data-testid'))` in DevTools, then open the popup: no warning (fallback still finds cards). On a non-THS tab: no warning and no errors.

- [ ] **Step 6: Commit**

```bash
git add src/popup
git commit -m "Add toolbar popup with list, reasons and export/import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README and end-to-end check

**Files:**
- Create: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Create `README.md`**

````markdown
# THS Listing Marker

Chrome extension for [TrustedHousesitters](https://www.trustedhousesitters.com/house-and-pet-sitting-assignments/) sit search. Mark listings as ⭐ interested or ❌ not interested (with reasons), and see those marks on the cards every time the listing shows up again.

## Install

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open the sit search. After pulling changes, click ↻ on the extension card and reload the tab.

## Use

- Hover a card: ⭐ marks interested (click again to clear). ❌ opens reason chips plus an optional note. Enter saves, Esc cancels.
- Rejected cards are dimmed with a red badge; hover the badge for all reasons and the note.
- On a listing's own page, the same controls sit in a pill at the bottom-right.
- Toolbar popup: browse/filter your marks, edit reason chips, export/import a JSON backup (import opens in a tab).

Marks live in `chrome.storage.local` on this machine only. Export regularly if you care about them.

## Develop

```
npm test
```

Runs the unit tests for `src/lib` with Node's built-in test runner (Node 22+). No dependencies, no build.

## Manual test checklist

- [ ] Cards show ⭐ ❌; clicking them never opens the listing or flips photos.
- [ ] Interested: green outline. Not interested: dimmed, greyscale, badge with first reason (+N).
- [ ] Popover: chips toggle, Enter saves, Esc / click outside cancel, Remove mark on an existing mark.
- [ ] Paging through results keeps marks on the right listings.
- [ ] "Recommended sits" strip is decorated.
- [ ] Listing page pill works; marks made there show on search cards.
- [ ] Two tabs update together.
- [ ] Popup lists, filters, deletes; reasons add/rename/delete (Other not deletable).
- [ ] Export, then import (merge) round-trips; a broken file is rejected with no changes.
````

- [ ] **Step 2: Run the unit tests**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 3: Run the full README manual checklist** against the live site with the freshly reloaded extension, and note any failure before claiming completion.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Add README with install and manual test checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
