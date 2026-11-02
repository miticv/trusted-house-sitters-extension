const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const { listPackageFiles, createZip } = require('../scripts/package.js');

const ROOT = path.join(__dirname, '..');

test('package contains only the files the extension runs on', () => {
  const files = listPackageFiles(ROOT);
  for (const needed of ['manifest.json', 'src/content/content.js', 'src/popup/popup.html', 'icons/icon-128.png']) {
    assert.ok(files.includes(needed), needed);
  }
  for (const file of files) {
    assert.ok(file === 'manifest.json' || file.startsWith('src/') || file.startsWith('icons/'), file);
  }
});

test('createZip stores each file deflated under its name', () => {
  const data = Buffer.from('hello hello hello');
  const zip = createZip([{ name: 'src/a.txt', data }, { name: 'b.txt', data: Buffer.from('x') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(8), 8); // deflate
  const compressedSize = zip.readUInt32LE(18);
  const nameLength = zip.readUInt16LE(26);
  assert.equal(zip.toString('utf8', 30, 30 + nameLength), 'src/a.txt');
  const start = 30 + nameLength + zip.readUInt16LE(28);
  assert.deepEqual(zlib.inflateRawSync(zip.subarray(start, start + compressedSize)), data);
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2); // total entries
});
