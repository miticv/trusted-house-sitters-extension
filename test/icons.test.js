const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { encodePng, drawIcon } = require('../scripts/make-icons.js');

test('encodePng writes a valid RGBA PNG of the given size', () => {
  const png = encodePng(3, 2, new Uint8Array(3 * 2 * 4).fill(255));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 2);
  assert.equal(png[24], 8); // bit depth
  assert.equal(png[25], 6); // colour type RGBA
  const idatLength = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength));
  assert.equal(raw.length, 2 * (1 + 3 * 4)); // filter byte + pixels per row
  assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
});

test('drawIcon has transparent corners and a teal background', () => {
  const size = 48;
  const rgba = drawIcon(size);
  const px = (x, y) => [...rgba.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  assert.equal(px(0, 0)[3], 0);
  assert.deepEqual(px(4, size / 2), [0x00, 0x39, 0x39, 255]);
});
