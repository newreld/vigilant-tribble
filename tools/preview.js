/* Offline previewer: renders the SAME procedural shader the game uses to a real
 * PNG, so the art can be inspected (and contrast judged) without a browser.
 * This is how Claude gets "eyes" on the static art: what you see here is what
 * the game blits. Pure Node — no deps beyond built-in zlib.
 *
 *   node tools/preview.js [out.png]
 */
const zlib = require('zlib');
const fs = require('fs');
const C = require('../merge.js');
const { TIERS, GLOW_MAX, shadeBody } = C;

const W = 900, H = 640;
const fb = new Float32Array(W * H * 3);

const mix = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
const setpx = (x, y, c) => { const i = (y * W + x) * 3; fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2]; };

// --- background: vertical space gradient (matches the game field) ---
for (let y = 0; y < H; y++) {
  const t = y / H;
  const top = [10, 8, 28], bot = [3, 2, 11];
  const c = mix(top, bot, t * t);
  for (let x = 0; x < W; x++) setpx(x, y, c);
}
// --- starfield (seeded so it's stable) ---
let s = 1337; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = 0; i < 420; i++) {
  const x = (rnd() * W) | 0, y = (rnd() * H) | 0, b = 90 + rnd() * 165;
  const i0 = (y * W + x) * 3; fb[i0] = b; fb[i0 + 1] = b; fb[i0 + 2] = b * 1.05;
}

// --- composite one body at (cx,cy) with on-screen radius R ---
function drawBody(tier, cx, cy, R) {
  const ext = Math.ceil(R * GLOW_MAX);
  for (let py = cy - ext; py <= cy + ext; py++) {
    if (py < 0 || py >= H) continue;
    for (let px = cx - ext; px <= cx + ext; px++) {
      if (px < 0 || px >= W) continue;
      const nx = (px - cx) / R, ny = (py - cy) / R;
      const [r, g, b, a8] = shadeBody(tier, nx, ny);
      const a = a8 / 255; if (a <= 0) continue;
      const i = (py * W + px) * 3;
      fb[i] = r * a + fb[i] * (1 - a);
      fb[i + 1] = g * a + fb[i + 1] * (1 - a);
      fb[i + 2] = b * a + fb[i + 2] * (1 - a);
    }
  }
}

// --- top: 3x3 grid, each body at equal size to judge each design + contrast ---
const cols = 3, rows = 3, cw = W / cols, gridH = 430;
for (let t = 0; t < TIERS.length; t++) {
  const cx = ((t % cols) + 0.5) * cw;
  const cy = (Math.floor(t / cols) + 0.5) * (gridH / rows);
  drawBody(t, Math.round(cx), Math.round(cy), Math.round((gridH / rows) * 0.30));
}
// --- bottom strip: all 9 at TRUE relative scale, resting on a line ---
let x = 70;
for (let t = 0; t < TIERS.length; t++) {
  const R = TIERS[t].r * 0.62;
  drawBody(t, Math.round(x + R), Math.round(H - 30 - R), Math.round(R));
  x += R * 2 + 10;
}

// ---- minimal PNG encoder (RGB, 8-bit) ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor RGB
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: none
  for (let x2 = 0; x2 < W; x2++) {
    const fi = (y * W + x2) * 3, ri = y * (1 + W * 3) + 1 + x2 * 3;
    raw[ri] = Math.max(0, Math.min(255, fb[fi])) | 0;
    raw[ri + 1] = Math.max(0, Math.min(255, fb[fi + 1])) | 0;
    raw[ri + 2] = Math.max(0, Math.min(255, fb[fi + 2])) | 0;
  }
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = process.argv[2] || 'tools/preview.png';
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + W + 'x' + H + ', ' + png.length + ' bytes)');
