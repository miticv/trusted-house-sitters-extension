# Chrome Web Store submission

Copy-paste text for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Field names follow the dashboard tabs.

## Before each upload

1. Bump `version` in `manifest.json` (the store rejects a version it has already seen).
2. `npm test`, then `npm run package` → upload `dist/ths-listing-marker-<version>.zip`.

## Store listing tab

**Name** (from the manifest): Sit Listing Marker for TrustedHousesitters (unofficial)

**Summary** (from the manifest, max 132 chars): Unofficial: mark TrustedHousesitters sit listings as interested or not interested, and see your marks on every search.

**Description:**

```
Tired of seeing the same house sits over and over while you search TrustedHousesitters? Sit Listing Marker lets you judge a listing once and remember it.

• Hover any sit card and click ⭐ (interested) or ❌ (not interested).
• Not interested? Pick one or more quick reasons (too far, dates don't fit, too many pets…) and add an optional note.
• Next time that listing appears, in any search or on any page of results, it is outlined in green, or dimmed and outlined in red with your reason on a badge.
• Mark a listing from its own page too, using the small floating buttons.
• Toolbar popup: browse and filter everything you have marked, edit your reason list, and export or import a JSON backup.

Private by design: your marks are stored only in your browser (chrome.storage.local). Nothing is sent anywhere, there are no accounts, no analytics and no remote code.

This extension is not affiliated with, endorsed by or sponsored by TrustedHousesitters. It only changes how search results look in your own browser.
```

**Category:** Productivity (choose the closest productivity/tools category offered).

**Language:** English.

**Graphics:**
- Store icon: `icons/icon-128.png`.
- Screenshots: at least one, 1280×800 (or 640×400) PNG/JPEG. Suggested: (1) search results with one green and one red/dimmed card, (2) the reason popover open, (3) the toolbar popup list. Capture at 100% zoom in a 1280×800 window.

## Privacy tab

**Single purpose:**

```
Lets the user mark TrustedHousesitters sit listings as interested or not interested (with reasons) and shows those marks on the listing cards whenever the listings appear again.
```

**Permission justification — `storage`:**

```
Stores the user's marks (listing ID, status, chosen reasons, note, and the listing's title, location and URL for the popup list) and the user's editable reason list, locally in chrome.storage.local.
```

**Permission justification — host access (content script on https://www.trustedhousesitters.com/*):**

```
The content script adds the ⭐/❌ buttons and mark styling to listing cards on trustedhousesitters.com. It runs on the whole site because the site is a single-page app: search results can be reached without a full page load. It reads only listing links, titles and locations from the page, and sends nothing anywhere.
```

**Remote code:** No, I am not using remote code.

**Data usage:** The extension does not transmit any data off the device. If the form asks about data the extension handles, the only item is *Website content* (titles and locations of listings the user marks), stored locally and never sent anywhere. Tick all three certifications (not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending).

**Privacy policy URL** (if requested): link to `docs/PRIVACY.md` on GitHub, e.g. `https://github.com/miticv/trusted-house-sitters-extension/blob/main/docs/PRIVACY.md`.

## Distribution tab

- **Unlisted:** installable only by people with the link. Good for personal use and friends.
- **Public:** searchable in the store.
