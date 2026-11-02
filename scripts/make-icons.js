// Draws the extension icon (teal tile, white house, red "not interested" badge) and writes it as PNGs.
// No dependencies: shapes are tested per pixel and encoded with Node's zlib.
// Usage: node scripts/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { crc32 } = require('./crc32.js');

const SIZES = [16, 32, 48, 128];
const TEAL = [0x00, 0x39, 0x39];
const WHITE = [0xff, 0xff, 0xff];
const RED = [0xc6, 0x28, 0x28];
const SAMPLES = 4; // per axis, for anti-aliasing

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA; compression, filter and interlace stay 0
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    // Each row starts with filter type 0 (none).
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (1 + stride) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const side = (px, py, qx, qy) => (x - qx) * (py - qy) - (px - qx) * (y - qy);
  const d1 = side(ax, ay, bx, by);
  const d2 = side(bx, by, cx, cy);
  const d3 = side(cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function distToSegment(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

// Colour at a point in unit coordinates (0..1), or null where the icon is transparent.
function colorAt(x, y) {
  if (!inRoundedRect(x, y, 0, 0, 1, 1, 0.22)) return null;
  let color = TEAL;

  const roof = inTriangle(x, y, [0.5, 0.16], [0.12, 0.5], [0.88, 0.5]);
  const body = x >= 0.24 && x <= 0.76 && y >= 0.46 && y <= 0.84;
  const door = x >= 0.43 && x <= 0.57 && y >= 0.62 && y <= 0.84;
  if ((roof || body) && !door) color = WHITE;

  // Badge in the bottom-right corner, with a teal ring separating it from the house.
  const [bx, by] = [0.76, 0.76];
  const d = Math.hypot(x - bx, y - by);
  if (d <= 0.25) color = TEAL;
  if (d <= 0.2) {
    color = RED;
    const arm = 0.085;
    const width = 0.035;
    if (distToSegment(x, y, bx - arm, by - arm, bx + arm, by + arm) <= width ||
        distToSegment(x, y, bx - arm, by + arm, bx + arm, by - arm) <= width) {
      color = WHITE;
    }
  }
  return color;
}

function drawIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = colorAt((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (!color) continue;
          covered++;
          for (let i = 0; i < 3; i++) sum[i] += color[i];
        }
      }
      const at = (py * size + px) * 4;
      if (covered) for (let i = 0; i < 3; i++) rgba[at + i] = Math.round(sum[i] / covered);
      rgba[at + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return rgba;
}

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(dir, { recursive: true });
  for (const size of SIZES) {
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), encodePng(size, size, drawIcon(size)));
    console.log(`icons/icon-${size}.png`);
  }
}

module.exports = { encodePng, drawIcon };
