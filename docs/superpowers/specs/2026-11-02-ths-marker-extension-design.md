# THS Listing Marker — Chrome Extension Design

Date: 2026-11-02

## Goal

On trustedhousesitters.com sit-listing search (`/house-and-pet-sitting-assignments/`), let a sitter mark each listing as **Interested** or **Not interested (with reasons)**, remember those marks by listing ID, and visually flag marked listings whenever they reappear. The site's own filtering is weak; this avoids re-evaluating the same listings.

Success: while scrolling search results, already-judged listings are recognisable at a glance without opening them.

## Decisions

| Topic | Decision |
|---|---|
| What is marked | Sit listings (homeowner assignments), keyed by listing ID |
| Not-interested display | Card stays in place, dimmed, with a ❌ badge + reason |
| Reason entry | Multi-select quick-pick chips (editable list) + optional free-text note |
| Storage | `chrome.storage.local` only, with JSON export/import |
| Approach | MV3 content script, plain JS, no build step |

## Site facts (observed 2026-11-02)

- Listing URL: `/house-and-pet-sitting-assignments/<country>/<region>/<city>/l/<id>/`; `<id>` is numeric.
- Card root: `div[data-testid="ListingCard__container"]`, containing a stretched overlay `<a href=".../l/<id>/">` and an "Add to favorites" button top-right.
- SPA: pagination (`RouterPagination_*`) re-renders results without a full reload.
- A "recommended sits" section reuses the same cards.

## Data model

`chrome.storage.local`:

```js
marks: {
  "<listingId>": {
    status: "interested" | "not_interested",
    reasons: string[],     // reason ids; always [] for interested
    note: string,          // may be ""
    title: string,         // snapshot from card/page at mark time
    location: string,      // snapshot
    url: string,           // absolute listing URL at mark time
    markedAt: string       // ISO timestamp, updated on every change
  }
}
reasons: [{ id: string, label: string }]
```

- Unmarking deletes the entry; there is no stored neutral state.
- Changing status overwrites the entry.
- Default reasons (seeded on install when `reasons` is absent): Too far, Dates don't fit, Too many pets, Pet type, Too long / too short, Needs car, Other.
- A not-interested mark may have zero reasons and an empty note.

## File layout

```
manifest.json            MV3; content script matches https://www.trustedhousesitters.com/house-and-pet-sitting-assignments/*
src/lib/listing-id.js    pure: href -> id | null
src/lib/store.js         marks/reasons CRUD, export, import (merge|replace) with validation
src/content/content.js   card discovery, controls, badges, MutationObserver, detail-page bar, storage.onChanged
src/content/popover.js   reason chips + note popover
src/content/content.css  all classes prefixed `ths-ext-`
src/popup/popup.html     toolbar popup
src/popup/popup.js
test/listing-id.test.js
test/store.test.js
README.md                install (load unpacked) + manual test checklist
```

Library files are loaded as classic scripts listed in the manifest (content scripts) and via `<script>` tags (popup), exposing a single namespace object; tests load them in Node with a stubbed `chrome.storage`.

## On-page behaviour

**Card discovery.** Primary selector `[data-testid="ListingCard__container"]`. Fallback: nearest ancestor of a `/l/<id>/` link that contains exactly one distinct listing ID. A single `MutationObserver` on `document.body` (debounced ~100 ms) rescans. Processed cards get `data-ths-ext-id="<id>"`; on each scan the card's current link ID is compared with that attribute, and the card is re-rendered if it changed (element reuse).

**Controls.** Two round buttons (⭐, ❌) top-left of the card photo. They sit above the overlay link and call `preventDefault` + `stopPropagation`, so they never open the listing. Faint on unmarked cards, full opacity on card hover.

**States.**
- Interested: ⭐ badge, thin green outline. Clicking ⭐ again unmarks.
- Not interested: card opacity ~0.4 and greyscale photo; red ❌ badge labelled with the first reason label plus "+N" for others, or the first words of the note if no reasons. Badge `title` shows all reasons and the full note. Card returns to full opacity on hover.
- Clicking ⭐ on a not-interested card switches it to interested (reasons and note cleared).

**Popover** (on ❌ click). Anchored to the card: reason chips (multi-toggle), note textarea, Save / Cancel; Enter (outside the textarea) saves, Esc cancels, clicking outside cancels. If the card is already not-interested, the popover opens prefilled and adds **Remove mark**. One popover open at a time.

**Listing page** (`/l/<id>/`). A thin fixed bar at the top shows current status with the same ⭐ / ❌ controls and popover. Title and location snapshots are taken from the page heading and location text where available, else left empty.

**Cross-tab.** `chrome.storage.onChanged` re-renders affected cards in every open tab.

**Failure mode.** If no cards are found, the script does nothing to the page. The content script records a per-tab card count; the popup shows "No listing cards detected on this page" when the active tab is a search page with a count of 0.

## Popup

- Header counts: "⭐ N · ❌ M".
- Tabs: **Not interested** | **Interested** | **Reasons**.
- List rows: title, location, reason chips, marked date. Row click opens the stored `url` in a new tab. 🗑 unmarks. Text filter box plus reason filter.
- Reasons tab: add, rename, delete. Deleting an in-use reason asks for confirmation, then strips it from marks; a mark left with no reasons and no note gets the "Other" reason.
- Footer: **Export** downloads `ths-marks-YYYY-MM-DD.json` containing `{ version: 1, marks, reasons }`. **Import** offers **Merge** (per ID, newer `markedAt` wins; reasons merged by id) or **Replace**, and reports "+A added, U updated". Invalid files are rejected with a message and existing data is untouched.

## Testing

Automated (`node --test`, no dependencies):
- `listing-id`: real listing URLs, with/without trailing slash, with query string, absolute vs relative, non-listing links -> null.
- `store`: mark, unmark, overwrite, status switch clears reasons, delete in-use reason (incl. fallback to "Other"), export shape, import merge (newer wins), import replace, invalid import rejected without changes.

Manual (README checklist, also run by the implementer against the live site): mark/unmark both states, dimming and badge text, popover keyboard handling, clicking controls does not navigate, pagination re-render, recommended strip, listing page bar, two tabs updating together, export then import round-trip.

## Out of scope

Hiding not-interested listings, cross-device sync, reason statistics, marking sitter profiles.
