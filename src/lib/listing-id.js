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
