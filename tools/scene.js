/* Renders a realistic in-game FIELD scene (gradient, danger line, a natural
 * pile produced by actually playing) to a PNG — same shader the game blits.
 * Lets the art be judged in context, not just as isolated bodies.
 *   node tools/scene.js [out.png] [seed]
 */
const zlib = require('zlib');
const fs = require('fs');
const C = require('../merge.js');
const { TIERS, FIELD_W, FIELD_H, DANGER_Y, GLOW_MAX, shadeBody, world, reset, step, dropCurrent, moveCurrent } = C;

// --- play a bit to build an organic board ---
const seed = parseInt(process.argv[3] || '7', 10);
reset(seed);
const H = 1 / 120;
function settle(cap = 3) { let t = 0; while (t < cap) { step(H); t += H; let v = 0; for (const b of world.bodies) v = Math.max(v, Math.abs(b.vx) + Math.abs(b.vy)); if (world.current && world.dropTimer <= 0 && v < 25) return; if (world.over) return; } }
let sown = 1;
for (let i = 0; i < 70 && !world.over; i++) {
  if (!world.current) { settle(); if (world.over) break; }
  // bias toward stacking same tiers near each other for a natural, merged look
  let x = (Math.sin(sown * 2.3) * 0.5 + 0.5) * FIELD_W; sown++;
  const same = world.bodies.filter(b => b.tier === world.current.tier);
  if (same.length && i % 2 === 0) x = same[same.length - 1].x;
  moveCurrent(x); if (!dropCurrent()) { settle(); continue; } settle();
  world.events.length = 0;
  if (world.bodies.length >= 16) break;
}

// --- raster ---
const SC = 1.5, W = Math.round(FIELD_W * SC), Hh = Math.round(FIELD_H * SC);
const fb = new Float32Array(W * Hh * 3);
const mix = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];

// field gradient + side vignette (matches merge.js buildFieldGfx intent)
for (let y = 0; y < Hh; y++) {
  const t = y / Hh, top = [54, 39, 64], midc = [36, 25, 46], bot = [22, 15, 30];
  const c = t < 0.55 ? mix(top, midc, t / 0.55) : mix(midc, bot, (t - 0.55) / 0.45);
  for (let x = 0; x < W; x++) {
    const dx = (x / W - 0.5), vig = 1 - Math.min(1, (dx * dx) * 3.0) * 0.28;
    const i = (y * W + x) * 3; fb[i] = c[0] * vig; fb[i + 1] = c[1] * vig; fb[i + 2] = c[2] * vig;
  }
}
// stars
let s = seed * 99 + 1; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = 0; i < 160; i++) { const x = (rnd() * W) | 0, y = (rnd() * Hh) | 0, b = 80 + rnd() * 150, j = (y * W + x) * 3; fb[j] = b; fb[j + 1] = b; fb[j + 2] = b * 1.05; }
// danger line (dashed)
const dy = Math.round(DANGER_Y * SC);
for (let x = 0; x < W; x++) { if (Math.floor(x / 7) % 2) continue; for (let o = -1; o <= 1; o++) { const i = ((dy + o) * W + x) * 3; fb[i] = mix([fb[i], 0, 0], [150, 170, 255], 1)[0]; fb[i + 1] = 170 * 0.7; fb[i + 2] = 255 * 0.6; } }

function drawBody(tier, cx, cy, R) {
  const ext = Math.ceil(R * GLOW_MAX);
  for (let py = cy - ext; py <= cy + ext; py++) { if (py < 0 || py >= Hh) continue;
    for (let px = cx - ext; px <= cx + ext; px++) { if (px < 0 || px >= W) continue;
      const nx = (px - cx) / R, ny = (py - cy) / R;
      const sm = shadeBody(tier, nx, ny), a = sm[3] / 255; if (a <= 0) continue;
      const i = (py * W + px) * 3;
      fb[i] = sm[0] * a + fb[i] * (1 - a); fb[i + 1] = sm[1] * a + fb[i + 1] * (1 - a); fb[i + 2] = sm[2] * a + fb[i + 2] * (1 - a);
    } }
}
for (const b of world.bodies) drawBody(b.tier, Math.round(b.x * SC), Math.round(b.y * SC), Math.round(TIERS[b.tier].r * SC));
if (world.current) drawBody(world.current.tier, Math.round(world.current.x * SC), Math.round(48 * SC), Math.round(TIERS[world.current.tier].r * SC));

// --- PNG encode (RGB) ---
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(Hh * (1 + W * 3));
for (let y = 0; y < Hh; y++) { raw[y * (1 + W * 3)] = 0; for (let x = 0; x < W; x++) { const fi = (y * W + x) * 3, ri = y * (1 + W * 3) + 1 + x * 3; raw[ri] = Math.max(0, Math.min(255, fb[fi])) | 0; raw[ri + 1] = Math.max(0, Math.min(255, fb[fi + 1])) | 0; raw[ri + 2] = Math.max(0, Math.min(255, fb[fi + 2])) | 0; } }
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = process.argv[2] || 'tools/scene.png';
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + W + 'x' + Hh + ', ' + world.bodies.length + ' bodies, ' + png.length + ' bytes)');
