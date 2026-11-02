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
