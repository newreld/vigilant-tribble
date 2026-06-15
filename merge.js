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
    reset, step, dropCurrent, moveCurrent, spawnCurrent, pickTier, mulberry32 };
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
  const elScore = $('score'), elBest = $('best'), elNext = $('next-emoji');
  const elCombo = $('combo'), elOver = $('gameover'), elFinal = $('final-score');
  const elNewBest = $('new-best');

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
  canvas.addEventListener('pointermove', e => { if (world.current) moveCurrent(toField(e.clientX)); });
  canvas.addEventListener('pointerdown', e => {
    if (world.over) return;
    moveCurrent(toField(e.clientX));
    if (dropCurrent()) blip(220, 0.05, 'square', 0.12);
  });
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
        const t = TIERS[ev.tier];
        burst(ev.x, ev.y, 8 + ev.tier * 4, t.color);
        shake = Math.min(shake + 2 + ev.tier, 18);
        const mult = 1 + (world.combo - 1) * 0.5;
        floatScore(ev.x, ev.y, '+' + Math.round(POINTS[ev.tier] * mult), '#fff');
        blip(200 + ev.tier * 70, 0.1, 'sine', 0.18);
        if (world.combo > 1) floatScore(ev.x, ev.y - 22, 'COMBO x' + world.combo, '#ffe066');
      } else if (ev.type === 'bigbang') {
        for (let i = 0; i < 10; i++) setTimeout(() => burst(FIELD_W * Math.random(), FIELD_H * Math.random(), 40, '#fff'), i * 40);
        shake = 26; floatScore(FIELD_W / 2, FIELD_H / 2, '💥 BIG BANG +' + ev.bonus, '#ff66cc');
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
    const t = TIERS[tier], r = t.r;
    ctx.save();
    ctx.globalAlpha = ghost ? 0.35 : 1;
    // glow for high tiers
    if (tier >= 5) { ctx.shadowColor = t.color; ctx.shadowBlur = 18; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = t.color; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = (r * 1.4) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.emoji, x, y + r * 0.05);
    ctx.restore();
  }

  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.translate(offX + sx, offY + sy); ctx.scale(scale, scale);

    // field background + danger line
    ctx.fillStyle = 'rgba(10,6,30,0.6)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.strokeStyle = 'rgba(255,80,120,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(FIELD_W, DANGER_Y); ctx.stroke();
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
    elNext.textContent = TIERS[world.next].emoji;
    elCombo.textContent = world.combo > 1 ? 'COMBO x' + world.combo : '';
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
  reset();
  requestAnimationFrame(loop);
})();
