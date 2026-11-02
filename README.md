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

Runs the unit tests for `src/lib` with Node's built-in test runner (Node 22.8+). No dependencies, no build.

Icons: edit `scripts/make-icons.js`, then run `node scripts/make-icons.js` to regenerate `icons/`.

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
