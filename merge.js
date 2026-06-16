/* COSMIC MERGE — a physics merge game (the Suika lineage), themed in space.
 *
 * Design thesis: a genuinely good, skill+strategy game you return to — the
 * "too good to be true" version of the games whose ads overpromise. It scratches
 * the real itch (satisfying physics merges, "one more run") with ZERO dark
 * patterns: no monetization, no energy/lives walls, no paywalls, no gambling.
 *
 * Note on randomness: the next-piece is random for fair gameplay variety (like
 * Tetris's next piece). That is NOT a predatory variable-ratio reward — nothing
 * random is ever sold or gated behind money. See DESIGN.md.
 *
 * The simulation core is DOM-free and deterministic given a seed, so it can be
 * unit-tested headlessly. Rendering/input/audio attach only if a DOM exists.
 */
(() => {
  'use strict';

  // ---- tiers: asteroid -> ... -> black hole (-> BIG BANG on max merge) -----
  const TIERS = [
    { name: 'Asteroid',   emoji: '🪨', r: 18,  color: '#9c8b7a' },
    { name: 'Comet',      emoji: '☄️', r: 24,  color: '#7fd1ff' },
    { name: 'Moon',       emoji: '🌑', r: 31,  color: '#cfd2d6' },
    { name: 'Planet',     emoji: '🌍', r: 39,  color: '#4aa3ff' },
    { name: 'Ringed',     emoji: '🪐', r: 48,  color: '#e0b86b' },
    { name: 'Dwarf Star', emoji: '⭐', r: 58,  color: '#ffe066' },
    { name: 'Star',       emoji: '☀️', r: 70,  color: '#ff9f40' },
    { name: 'Galaxy',     emoji: '🌌', r: 84,  color: '#b56cff' },
    { name: 'Black Hole', emoji: '⚫', r: 100, color: '#1a1030' },
  ];
  const MAX_TIER = TIERS.length - 1;
  // triangular-ish scoring: bigger merges are worth disproportionately more
  const POINTS = TIERS.map((_, t) => t === 0 ? 0 : (t * (t + 1)) / 2 * 10);

  // ========================================================================
  // Procedural celestial-body art. A PURE pixel function over normalized
  // coords nx,ny in [-1,1]: |(nx,ny)|<=1 is the body; out to GLOW_MAX is glow.
  // Shared by the in-game sprite baker AND the offline preview tool, so what
  // you preview is exactly what renders in the game. No emoji, real contrast.
  // ========================================================================
  const GLOW_MAX = 1.85;
  const TIER_ART = [
    // a = lit color, b = shadow color, glow = halo color, gs = glow strength
    { type: 'rock',   a: [0.64, 0.46, 0.32], b: [0.15, 0.10, 0.07], glow: [0.0, 0.0, 0.0],  gs: 0.0,  accent: '#b8763f' },
    { type: 'ice',    a: [0.85, 0.97, 1.00], b: [0.13, 0.46, 0.70], glow: [0.45, 0.85, 1.0], gs: 0.75, accent: '#8fe3ff' },
    { type: 'moon',   a: [0.95, 0.95, 0.99], b: [0.34, 0.35, 0.44], glow: [0.55, 0.62, 0.85], gs: 0.22, accent: '#dfe2f0' },
    { type: 'planet', a: [0.26, 0.56, 1.00], b: [0.02, 0.10, 0.30], glow: [0.30, 0.62, 1.0], gs: 0.40, accent: '#5aa6ff' },
    { type: 'ringed', a: [0.96, 0.80, 0.52], b: [0.42, 0.26, 0.10], glow: [0.95, 0.78, 0.45], gs: 0.20, accent: '#f0c878' },
    { type: 'star',   a: [1.00, 0.98, 0.78], b: [1.00, 0.74, 0.20], glow: [1.0, 0.84, 0.32], gs: 1.0,  accent: '#ffe066' },
    { type: 'star',   a: [1.00, 0.93, 0.72], b: [1.00, 0.50, 0.14], glow: [1.0, 0.52, 0.18], gs: 1.15, accent: '#ff9a3c' },
    { type: 'galaxy', a: [0.92, 0.82, 1.00], b: [0.30, 0.16, 0.55], glow: [0.62, 0.40, 1.0], gs: 0.9,  accent: '#c79bff' },
    { type: 'hole',   a: [0.0, 0.0, 0.0],    b: [0.0, 0.0, 0.0],    glow: [1.0, 0.55, 0.22], gs: 0.85, accent: '#ffb866' },
  ];

  const _cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const _ss = (e0, e1, x) => { const t = _cl((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const _mix = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
  function _hash(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
  function _vn(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = _hash(xi, yi), b = _hash(xi + 1, yi), c = _hash(xi, yi + 1), d = _hash(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function _fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * _vn(x * f, y * f); f *= 2; a *= 0.5; } return s; }

  // light direction (upper-left key light)
  const LX = -0.42, LY = -0.52, LZ = 0.74;

  function _ringSample(nx, ny) {
    const tilt = 0.40, RIN = 1.24, ROUT = 1.96;
    const rho = Math.sqrt(nx * nx + (ny / tilt) * (ny / tilt));
    if (rho < RIN || rho > ROUT) return null;
    let a = 0.9 * (0.6 + 0.4 * _vn(rho * 60, 7));        // banding
    if (Math.abs(rho - 1.60) < 0.07) a *= 0.18;          // Cassini-style gap
    a *= _ss(ROUT, ROUT - 0.12, rho);                    // soft outer edge
    const col = _mix([0.55, 0.40, 0.22], [0.98, 0.86, 0.62], _vn(rho * 30, 3));
    return { col, a: _cl(a, 0, 1) };
  }

  // returns [r,g,b,a] each 0..255
  function shadeBody(tier, nx, ny) {
    const art = TIER_ART[tier];
    const d = Math.hypot(nx, ny);
    let col = [0, 0, 0], al = 0;

    if (d <= 1.0) {
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const diff = _cl(nx * LX + ny * LY + nz * LZ, 0, 1);
      const rim = _ss(0.55, 1.0, d) * (0.35 + 0.65 * (1 - diff));
      const limb = 0.85 + 0.15 * nz;

      if (art.type === 'rock') {
        const m = _fbm(nx * 3.5 + 9, ny * 3.5);
        let base = _mix(art.b, art.a, 0.35 + 0.65 * m);
        const cr = _fbm(nx * 6 + 2, ny * 6 + 4);
        if (cr > 0.72) base = base.map(c => c * 0.6);
        col = base.map(c => c * (0.2 + diff * 0.95));
        col = _mix(col, [0.7, 0.65, 0.6], rim * 0.5);
      } else if (art.type === 'moon') {
        let base = _mix(art.b, art.a, 0.55 + 0.45 * _fbm(nx * 2.5 + 1, ny * 2.5));
        const cr = _fbm(nx * 5 + 7, ny * 5 + 2);
        if (cr > 0.66) base = base.map(c => c * 0.7);
        col = base.map(c => c * (0.16 + diff * 1.0));
        col = _mix(col, [0.8, 0.85, 1.0], rim * 0.55);
      } else if (art.type === 'ice') {
        let base = _mix(art.b, art.a, 0.4 + 0.6 * (1 - d));
        col = base.map(c => c * (0.45 + diff * 0.7));
        const spec = Math.pow(_cl(nx * LX + ny * LY + nz * LZ, 0, 1), 22);
        col = _mix(col, [1, 1, 1], spec * 0.8);
        col = _mix(col, [0.7, 0.95, 1.0], rim * 0.6);
      } else if (art.type === 'planet') {
        const land = _fbm(nx * 2.6 + 4, ny * 2.6 + 1);
        let base = _mix(art.b, art.a, 0.45 + 0.55 * (1 - d)); // ocean
        if (land > 0.56) base = _mix(base, [0.20, 0.58, 0.28], _ss(0.56, 0.7, land)); // land
        if (Math.abs(ny) > 0.72) base = _mix(base, [0.92, 0.96, 1.0], _ss(0.72, 0.9, Math.abs(ny))); // ice caps
        const cloud = _fbm(nx * 3.2 + 20, ny * 2.4 + 11);
        base = _mix(base, [0.95, 0.97, 1.0], _ss(0.62, 0.8, cloud) * 0.7);
        col = base.map(c => c * (0.12 + diff * 1.05));
        col = _mix(col, [0.45, 0.7, 1.0], rim * 0.85); // atmosphere
      } else if (art.type === 'ringed') {
        const band = 0.5 + 0.5 * Math.sin(ny * 9 + nx * 1.5);
        let base = _mix(art.b, art.a, 0.4 + 0.6 * band);
        col = base.map(c => c * (0.18 + diff * 1.0));
        col = _mix(col, [1.0, 0.9, 0.7], rim * 0.5);
      } else if (art.type === 'star') {
        const gran = _fbm(nx * 5 + tier, ny * 5 + 3);
        col = _mix(art.b, art.a, 0.3 + 0.7 * gran).map(c => c * limb);
        col = _mix(col, [1, 1, 0.95], Math.pow(1 - d, 2) * 0.6); // hot core
      } else if (art.type === 'galaxy') {
        const ang = Math.atan2(ny, nx);
        const arms = 0.5 + 0.5 * Math.sin(2 * ang + d * 7.0);
        const armGlow = Math.pow(arms, 2.2) * (1 - d) * 1.3;
        const core = Math.pow(_cl(1 - d * 1.6, 0, 1), 2) * 1.6;
        col = _mix(art.b, art.a, _cl(armGlow, 0, 1));
        col = _mix(col, [1, 1, 1], _cl(core, 0, 1));
        col = col.map((c, i) => c * (0.35 + 0.65 * _cl(armGlow + core, 0, 1)) + [0.05, 0.02, 0.1][i]);
      } else if (art.type === 'hole') {
        col = [0, 0, 0];
        const ring = _ss(0.78, 0.9, d) * _ss(1.0, 0.92, d); // bright photon ring
        col = _mix(col, [1.0, 0.78, 0.4], _cl(ring * 1.6, 0, 1));
        const top = _ss(0.0, 0.4, ny) * _ss(0.9, 0.75, d); // lensed light arc over top
        col = _mix(col, [1.0, 0.9, 0.7], top * 0.5);
      }
      al = 1;
      if (d > 0.985) al = _ss(1.0, 0.985, d); // 1px edge feather
    } else {
      // glow halo
      const t = _cl(1 - (d - 1) / (GLOW_MAX - 1), 0, 1);
      al = art.gs * Math.pow(t, 2.4);
      col = art.glow.slice();
    }

    let out = [col[0], col[1], col[2], al];
    if (art.type === 'ringed') {
      const ring = _ringSample(nx, ny);
      if (ring) {
        const front = ny > 0;
        const occluded = d <= 1 && !front;
        if (!occluded) {
          const ta = ring.a;
          out = [
            ring.col[0] * ta + out[0] * (1 - ta),
            ring.col[1] * ta + out[1] * (1 - ta),
            ring.col[2] * ta + out[2] * (1 - ta),
            ta + out[3] * (1 - ta),
          ];
        }
      }
    }
    return [_cl(out[0], 0, 1) * 255, _cl(out[1], 0, 1) * 255, _cl(out[2], 0, 1) * 255, _cl(out[3], 0, 1) * 255];
  }


  // ---- field + physics constants ------------------------------------------
  const FIELD_W = 360, FIELD_H = 600;
  const SPAWN_Y = 48;          // y of the hovering current piece
  const DANGER_Y = 96;         // resting above this for too long = game over
  const GRAVITY = 2200;        // units / s^2
  const RESTITUTION = 0.18;    // bounciness
  const DAMP = 0.992;          // velocity damping per substep
  const WALL_DAMP = 0.5;
  const SOLVER_ITERS = 6;
  const MERGE_OVERLAP = 1.02;  // merge on contact (solver rests bodies at ~touching)
  const DROP_COOLDOWN = 0.35;  // s between drops
  const OVER_GRACE = 1.3;      // s a body may sit above the danger line
  const DROP_TIERS = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3]; // weighted spawn pool

  // ---- seedable RNG (deterministic for tests) -----------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- world --------------------------------------------------------------
  const world = {
    bodies: [], current: null, next: null,
    score: 0, best: 0, over: false,
    overTimer: 0, dropTimer: 0, combo: 0, comboTimer: 0,
    rng: mulberry32(Date.now() >>> 0),
    idSeq: 1,
    events: [], // {type, x, y, tier} consumed by the renderer for juice
  };

  function pickTier() { return DROP_TIERS[Math.floor(world.rng() * DROP_TIERS.length)]; }

  function reset(seed) {
    world.bodies = [];
    world.score = 0; world.over = false; world.overTimer = 0;
    world.dropTimer = 0; world.combo = 0; world.comboTimer = 0;
    world.idSeq = 1; world.events = [];
    if (seed != null) world.rng = mulberry32(seed >>> 0);
    world.next = pickTier();
    spawnCurrent();
  }

  function spawnCurrent() {
    world.current = { tier: world.next, x: FIELD_W / 2 };
    world.next = pickTier();
  }

  function moveCurrent(x) {
    if (!world.current) return;
    const r = TIERS[world.current.tier].r;
    world.current.x = Math.max(r, Math.min(FIELD_W - r, x));
  }

  function dropCurrent() {
    if (world.over || !world.current || world.dropTimer > 0) return false;
    const t = world.current.tier, r = TIERS[t].r;
    world.bodies.push({
      id: world.idSeq++, tier: t,
      x: Math.max(r, Math.min(FIELD_W - r, world.current.x)),
      y: SPAWN_Y, vx: 0, vy: 0, age: 0,
    });
    world.current = null;
    world.dropTimer = DROP_COOLDOWN;
    return true;
  }

  // ---- physics step (fixed timestep h, in seconds) ------------------------
  function step(h) {
    if (world.over) return;

    if (world.dropTimer > 0) {
      world.dropTimer -= h;
      if (world.dropTimer <= 0 && !world.current) spawnCurrent();
    }
    if (world.comboTimer > 0) { world.comboTimer -= h; if (world.comboTimer <= 0) world.combo = 0; }

    // integrate
    for (const b of world.bodies) {
      b.vy += GRAVITY * h;
      b.x += b.vx * h; b.y += b.vy * h;
      b.vx *= DAMP; b.vy *= DAMP;
      b.age += h;
    }

    // constraints + collisions (iterative relaxation)
    for (let it = 0; it < SOLVER_ITERS; it++) {
      // walls / floor
      for (const b of world.bodies) {
        const r = TIERS[b.tier].r;
        if (b.x < r) { b.x = r; b.vx = -b.vx * WALL_DAMP; }
        if (b.x > FIELD_W - r) { b.x = FIELD_W - r; b.vx = -b.vx * WALL_DAMP; }
        if (b.y > FIELD_H - r) { b.y = FIELD_H - r; b.vy = -b.vy * RESTITUTION; b.vx *= 0.92; }
      }
      // pairwise
      for (let i = 0; i < world.bodies.length; i++) {
        for (let j = i + 1; j < world.bodies.length; j++) {
          const a = world.bodies[i], c = world.bodies[j];
          let dx = c.x - a.x, dy = c.y - a.y;
          let d = Math.hypot(dx, dy);
          const rs = TIERS[a.tier].r + TIERS[c.tier].r;
          if (d === 0) { dx = 0.01; d = 0.01; }
          if (d < rs) {
            const nx = dx / d, ny = dy / d, overlap = rs - d;
            // separate (equal split)
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            c.x += nx * overlap * 0.5; c.y += ny * overlap * 0.5;
            // velocity response along normal
            const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
            const vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              const imp = -(1 + RESTITUTION) * vn / 2;
              a.vx -= imp * nx; a.vy -= imp * ny;
              c.vx += imp * nx; c.vy += imp * ny;
            }
          }
        }
      }
    }

    resolveMerges();
    checkGameOver(h);
  }

  function resolveMerges() {
    const consumed = new Set();
    // collect mergeable same-tier overlapping pairs
    const pairs = [];
    for (let i = 0; i < world.bodies.length; i++) {
      for (let j = i + 1; j < world.bodies.length; j++) {
        const a = world.bodies[i], c = world.bodies[j];
        if (a.tier !== c.tier || a.tier >= MAX_TIER) continue;
        const rs = TIERS[a.tier].r + TIERS[c.tier].r;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d < rs * MERGE_OVERLAP) pairs.push([a, c, d]);
      }
    }
    pairs.sort((p, q) => p[2] - q[2]);
    let merged = 0;
    for (const [a, c] of pairs) {
      if (consumed.has(a.id) || consumed.has(c.id)) continue;
      consumed.add(a.id); consumed.add(c.id);
      const nt = a.tier + 1;
      const nx = (a.x + c.x) / 2, ny = (a.y + c.y) / 2;
      const nb = { id: world.idSeq++, tier: nt, x: nx, y: ny,
        vx: (a.vx + c.vx) / 2, vy: (a.vy + c.vy) / 2, age: 0 };
      // remove the two, add the new
      world.bodies = world.bodies.filter(b => b !== a && b !== c);
      if (nt >= MAX_TIER) {
        // two black holes already exist? a NEW black hole is the max tier;
        // merging TWO black holes triggers the BIG BANG.
        world.bodies.push(nb);
        world.events.push({ type: 'merge', x: nx, y: ny, tier: nt });
      } else {
        world.bodies.push(nb);
        world.events.push({ type: 'merge', x: nx, y: ny, tier: nt });
      }
      merged++;
    }
    if (merged > 0) {
      world.combo += merged; world.comboTimer = 1.1;
      const mult = 1 + (world.combo - 1) * 0.5;
      // score the new tiers created
      for (const ev of world.events) {
        if (ev.type === 'merge' && ev._scored !== true) {
          ev._scored = true;
          world.score += Math.round(POINTS[ev.tier] * mult);
        }
      }
      if (world.score > world.best) world.best = world.score;
    }

    // BIG BANG: if two black holes (max tier) touch, detonate.
    detonateBlackHoles();
  }

  function detonateBlackHoles() {
    const holes = world.bodies.filter(b => b.tier === MAX_TIER);
    for (let i = 0; i < holes.length; i++) {
      for (let j = i + 1; j < holes.length; j++) {
        const a = holes[i], c = holes[j];
        const rs = TIERS[MAX_TIER].r * 2;
        if (Math.hypot(c.x - a.x, c.y - a.y) < rs * MERGE_OVERLAP) {
          // clear the whole field, huge bonus, fresh start of the board
          const bonus = 5000 + world.bodies.length * 200;
          world.score += bonus; if (world.score > world.best) world.best = world.score;
          world.events.push({ type: 'bigbang', x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, bonus });
          world.bodies = [];
          world.overTimer = 0;
          return;
        }
      }
    }
  }

  function checkGameOver(h) {
    // a body resting (slow) with its top above the danger line for too long
    let danger = false;
    for (const b of world.bodies) {
      const r = TIERS[b.tier].r;
      if (b.y - r < DANGER_Y && Math.abs(b.vy) < 40 && b.age > 0.5) { danger = true; break; }
    }
    if (danger) {
      world.overTimer += h;
      if (world.overTimer >= OVER_GRACE) {
        world.over = true;
        world.events.push({ type: 'gameover' });
      }
    } else {
      world.overTimer = Math.max(0, world.overTimer - h * 2);
    }
  }

  // expose the headless core for tests
  const core = { world, TIERS, MAX_TIER, POINTS, FIELD_W, FIELD_H, DANGER_Y,
    reset, step, dropCurrent, moveCurrent, spawnCurrent, pickTier, mulberry32,
    TIER_ART, GLOW_MAX, shadeBody };
  if (typeof window !== 'undefined') window.__cosmic = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;

  // =========================================================================
  // Everything below is presentation (DOM/canvas/audio/input). Skipped in the
  // headless test environment where there is no document/canvas.
  // =========================================================================
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const canvas = $('game'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const elScore = $('score'), elBest = $('best'), elNext = $('next-canvas');
  const elCombo = $('combo'), elOver = $('gameover'), elFinal = $('final-score');
  const elNewBest = $('new-best');

  // ---- procedural sprite cache (bake shadeBody once per tier) --------------
  // Each tier is rasterized to an offscreen canvas via the shared shader, then
  // blitted. Falls back to a flat disc if 2D/ImageData is unavailable (e.g. the
  // headless jsdom test), so the game still boots everywhere.
  const SUP = 2; // supersample for crisp edges
  const sprites = [];
  function bakeSprite(tier) {
    try {
      const r = TIERS[tier].r, px = Math.ceil(r * GLOW_MAX * 2 * SUP);
      const cv = document.createElement('canvas'); cv.width = px; cv.height = px;
      const c = cv.getContext('2d'); if (!c || !c.createImageData) return null;
      const img = c.createImageData(px, px), data = img.data, half = px / 2;
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        const nx = (x - half + 0.5) / (r * SUP), ny = (y - half + 0.5) / (r * SUP);
        const s = shadeBody(tier, nx, ny), i = (y * px + x) * 4;
        data[i] = s[0]; data[i + 1] = s[1]; data[i + 2] = s[2]; data[i + 3] = s[3];
      }
      c.putImageData(img, 0, 0);
      return { cv, half: r * GLOW_MAX };
    } catch (e) { return null; }
  }
  function sprite(tier) { return sprites[tier] || (sprites[tier] = bakeSprite(tier)); }

  // field gradients (built once; null in stub environments → flat fallback)
  let fieldGrad = null, sideVig = null;
  function buildFieldGfx() {
    try {
      const g = ctx.createLinearGradient(0, 0, 0, FIELD_H);
      g.addColorStop(0, 'rgba(38,26,44,0.5)'); g.addColorStop(0.55, 'rgba(20,13,24,0.5)'); g.addColorStop(1, 'rgba(8,5,12,0.62)');
      fieldGrad = g;
      const v = ctx.createRadialGradient(FIELD_W / 2, FIELD_H * 0.42, FIELD_W * 0.18, FIELD_W / 2, FIELD_H * 0.5, FIELD_W * 0.82);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
      sideVig = v;
    } catch (e) { fieldGrad = null; sideVig = null; }
  }

  // next-piece preview (mini sprite in the HUD)
  const nctx = (elNext && elNext.getContext) ? elNext.getContext('2d') : null;
  let nextShown = -1;
  function drawNext() {
    if (!nctx) return;
    const w = elNext.width, h = elNext.height;
    nctx.clearRect(0, 0, w, h);
    const sp = sprite(world.next);
    if (sp && sp.cv) { const sz = Math.min(w, h) * 0.96; nctx.drawImage(sp.cv, (w - sz) / 2, (h - sz) / 2, sz, sz); }
  }

  let muted = false;
  try { world.best = parseInt(localStorage.getItem('cosmic.best') || '0', 10) || 0; } catch (e) {}
  let storedBest = world.best;
  const persistBest = () => { if (world.best > storedBest) { storedBest = world.best; try { localStorage.setItem('cosmic.best', String(storedBest)); } catch (e) {} } };

  // ---- audio --------------------------------------------------------------
  let actx = null;
  const audio = () => { if (muted) return null; if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } return actx; };
  function blip(freq, dur = 0.08, type = 'sine', gain = 0.16) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  }

  // ---- juice: particles, shake, floaters ----------------------------------
  let parts = [], shake = 0, floaters = [];
  function burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 5;
      parts.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, size: 2 + Math.random() * 4, color });
    }
    if (parts.length > 500) parts = parts.slice(-500);
  }
  function floatScore(x, y, text, color) { floaters.push({ x, y, text, color, life: 1 }); }

  // ---- layout / responsive scale ------------------------------------------
  let scale = 1, offX = 0, offY = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availW = canvas.clientWidth, availH = canvas.clientHeight;
    canvas.width = availW * dpr; canvas.height = availH * dpr;
    scale = Math.min(availW / FIELD_W, availH / FIELD_H);
    offX = (availW - FIELD_W * scale) / 2;
    offY = (availH - FIELD_H * scale) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  // ---- input --------------------------------------------------------------
  function toField(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left - offX) / scale;
  }
  // Aim model: press/drag to position the piece, release to drop. A mouse can
  // also hover-aim before pressing (touch has no hover, so it aims while held).
  // A simple tap is just press+release at one spot, so it still drops there.
  let aiming = false;
  canvas.addEventListener('pointermove', e => {
    if (world.current && (aiming || e.pointerType === 'mouse')) moveCurrent(toField(e.clientX));
  });
  canvas.addEventListener('pointerdown', e => {
    if (world.over || !world.current) return;
    aiming = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    moveCurrent(toField(e.clientX));
    e.preventDefault();
  });
  canvas.addEventListener('pointerup', e => {
    if (!aiming) return;
    aiming = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (world.over || !world.current) return;
    moveCurrent(toField(e.clientX));
    if (dropCurrent()) blip(220, 0.05, 'square', 0.12);
  });
  canvas.addEventListener('pointercancel', () => { aiming = false; });
  window.addEventListener('keydown', e => {
    if (!world.current) return;
    if (e.key === 'ArrowLeft') moveCurrent(world.current.x - 18);
    else if (e.key === 'ArrowRight') moveCurrent(world.current.x + 18);
    else if (e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); dropCurrent(); }
  });
  const restart = () => { reset(); elOver.classList.add('hidden'); };
  $('restart').addEventListener('click', restart);
  $('muteBtn').addEventListener('click', () => { muted = !muted; $('muteBtn').textContent = muted ? '🔇' : '🔊'; if (!muted) blip(660, 0.1); });

  // ---- consume sim events into juice ---------------------------------------
  function drainEvents() {
    for (const ev of world.events) {
      if (ev.type === 'merge') {
        burst(ev.x, ev.y, 8 + ev.tier * 4, TIER_ART[ev.tier].accent);
        shake = Math.min(shake + 2 + ev.tier, 18);
        const mult = 1 + (world.combo - 1) * 0.5;
        floatScore(ev.x, ev.y, '+' + Math.round(POINTS[ev.tier] * mult), '#fff');
        blip(200 + ev.tier * 70, 0.1, 'sine', 0.18);
        if (world.combo > 1) floatScore(ev.x, ev.y - 22, 'COMBO x' + world.combo, '#ffe066');
      } else if (ev.type === 'bigbang') {
        for (let i = 0; i < 10; i++) setTimeout(() => burst(FIELD_W * Math.random(), FIELD_H * Math.random(), 40, '#fff'), i * 40);
        shake = 26; floatScore(FIELD_W / 2, FIELD_H / 2, 'BIG BANG  +' + ev.bonus, '#ff8ad0');
        [262, 330, 392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'triangle', 0.2), i * 90));
      } else if (ev.type === 'gameover') {
        elFinal.textContent = world.score;
        const isNewBest = world.score > storedBest && world.score > 0;
        persistBest();
        elNewBest.classList.toggle('hidden', !isNewBest);
        elOver.classList.remove('hidden');
        blip(160, 0.4, 'sawtooth', 0.2);
      }
    }
    world.events.length = 0;
  }

  // ---- render -------------------------------------------------------------
  function drawBody(x, y, tier, ghost) {
    const sp = sprite(tier);
    ctx.save();
    ctx.globalAlpha = ghost ? 0.42 : 1;
    if (sp && sp.cv) {
      const sz = sp.half * 2;
      ctx.drawImage(sp.cv, x - sp.half, y - sp.half, sz, sz);
    } else {
      // fallback disc (headless/no-ImageData environments)
      const r = TIERS[tier].r;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = TIER_ART[tier].accent; ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.translate(offX + sx, offY + sy); ctx.scale(scale, scale);

    // field background: deep-space gradient + soft side vignette
    if (fieldGrad) {
      ctx.fillStyle = fieldGrad; ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.fillStyle = sideVig; ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    } else {
      ctx.fillStyle = 'rgba(8,6,24,0.55)'; ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }
    // danger line — a subtle glowing threshold, only assertive when threatened
    const danger = world.overTimer > 0.05;
    ctx.save();
    ctx.strokeStyle = danger ? 'rgba(210,74,44,0.9)' : 'rgba(180,150,120,0.24)';
    ctx.lineWidth = danger ? 2.5 : 1.5; ctx.setLineDash([7, 9]);
    if (danger) { ctx.shadowColor = 'rgba(210,74,44,0.9)'; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(FIELD_W, DANGER_Y); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    for (const b of world.bodies) drawBody(b.x, b.y, b.tier, false);
    if (world.current && !world.over) {
      drawBody(world.current.x, SPAWN_Y, world.current.tier, true);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(world.current.x, SPAWN_Y); ctx.lineTo(world.current.x, FIELD_H); ctx.stroke();
      ctx.setLineDash([]);
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.03;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color || '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floaters
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.y -= 0.6; f.life -= 0.02;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.color || '#fff';
      ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    shake *= 0.85; if (shake < 0.3) shake = 0;

    // HUD
    elScore.textContent = world.score;
    elBest.textContent = world.best;
    if (world.next !== nextShown) { drawNext(); nextShown = world.next; }
    elCombo.textContent = world.combo > 1 ? 'COMBO ×' + world.combo : '';
  }

  // ---- main loop (fixed-timestep accumulator) ------------------------------
  let last = performance.now(), acc = 0;
  const H = 1 / 120;
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    let guard = 0;
    while (acc >= H && guard++ < 20) { step(H); acc -= H; }
    drainEvents();
    render();
    requestAnimationFrame(loop);
  }

  window.addEventListener('visibilitychange', () => { if (document.hidden) persistBest(); });
  window.addEventListener('pagehide', persistBest);

  // ---- boot ----------------------------------------------------------------
  resize();
  buildFieldGfx();
  for (let t = 0; t < TIERS.length; t++) sprite(t); // pre-bake so first frames are instant
  drawNext();
  reset();
  requestAnimationFrame(loop);
})();
