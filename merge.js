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
    { name: 'Asteroid',   emoji: '🪨', r: 12,  color: '#9c8b7a' },
    { name: 'Comet',      emoji: '☄️', r: 16,  color: '#7fd1ff' },
    { name: 'Moon',       emoji: '🌑', r: 21,  color: '#cfd2d6' },
    { name: 'Planet',     emoji: '🌍', r: 27,  color: '#4aa3ff' },
    { name: 'Ringed',     emoji: '🪐', r: 35,  color: '#e0b86b' },
    { name: 'Dwarf Star', emoji: '⭐', r: 44,  color: '#ffe066' },
    { name: 'Star',       emoji: '☀️', r: 54,  color: '#ff9f40' },
    { name: 'Galaxy',     emoji: '🌌', r: 65,  color: '#b56cff' },
    { name: 'Black Hole', emoji: '⚫', r: 77,  color: '#1a1030' },
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
    { accent: '#a06428' }, // 0 asteroid  — sandy ochre
    { accent: '#88c4bc' }, // 1 comet     — ice teal
    { accent: '#7c7870' }, // 2 moon      — warm ash
    { accent: '#c03c20' }, // 3 planet    — brick/rust
    { accent: '#e08830' }, // 4 gas giant — marigold
    { accent: '#f0c840' }, // 5 star      — cream-yellow
    { accent: '#c82c10' }, // 6 red giant — deep brick
    { accent: '#3a9484' }, // 7 galaxy    — teal
    { accent: '#f0883e' }, // 8 black hole — marigold ring
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

  // Poster-style Saturn rings: three hard-edged bands (teal / cream / ochre) with a gap
  function _posterRing(nx, ny) {
    const tilt = 0.34;
    const rho = Math.sqrt(nx * nx + (ny / tilt) * (ny / tilt));
    if (rho < 1.13 || rho > 1.78) return null;
    if (rho > 1.34 && rho < 1.46) return null; // gap between inner and mid band
    let c, a;
    if (rho <= 1.34) {
      c = _mix([0.24, 0.62, 0.58], [0.16, 0.48, 0.44], (rho - 1.13) / 0.21);
      a = 0.88;
    } else if (rho <= 1.62) {
      c = _mix([0.90, 0.82, 0.62], [0.76, 0.66, 0.44], (rho - 1.46) / 0.16);
      a = 0.82;
    } else {
      const t = (rho - 1.62) / 0.16;
      c = _mix([0.66, 0.52, 0.26], [0.50, 0.36, 0.14], t);
      a = 0.60 * (1 - t);
    }
    return { col: c, a: _cl(a, 0, 1) };
  }

  // returns [r,g,b,a] each 0..255 — mid-century NASA-poster art language:
  // flat fills, hard-edged bands, stippled craters, no sphere normals, subtle grain.
  function shadeBody(tier, nx, ny) {
    const d = Math.hypot(nx, ny);
    // paper-grain: fine hash noise added to all body fills
    const grain = (_hash(nx * 53.1 + tier * 17.3, ny * 61.7 + tier * 11.9) - 0.5) * 0.055;
    let col = [0, 0, 0], al = 0;

    if (d <= 1.0) {
      const limb = 0.80 + 0.20 * (1 - d); // flat limb darkening — no sphere normals

      if (tier === 0) {
        // ASTEROID — sandy ochre, etching-hatch texture, stippled craters
        let c = [0.54, 0.36, 0.16];
        c = _mix(c, [0.34, 0.20, 0.08], (Math.sin(ny * 18 + nx * 6) * 0.5 + 0.5) * 0.32);
        const CX = [ 0.22, -0.38,  0.05, -0.15,  0.40];
        const CY = [-0.14,  0.28,  0.42, -0.40,  0.10];
        const CR = [ 0.18,  0.13,  0.10,  0.15,  0.09];
        for (let i = 0; i < 5; i++) {
          const cd = Math.hypot(nx - CX[i], ny - CY[i]);
          if (cd < CR[i]) {
            c = _mix(c, [0.22, 0.12, 0.05], _ss(CR[i], CR[i] * 0.5, cd) * 0.70);
            if (cd > CR[i] * 0.78) c = _mix(c, [0.72, 0.54, 0.28], 0.26);
          }
        }
        col = c.map(v => _cl(v * limb + grain, 0, 1));

      } else if (tier === 1) {
        // COMET / ICE WORLD — cream-teal, hard concentric rings
        const rings = Math.floor(d * 4) / 4;
        let c = _mix([0.86, 0.92, 0.90], [0.32, 0.64, 0.60], rings * 0.65);
        c = _mix(c, [0.96, 0.97, 0.94], (1 - d * 1.5) * 0.50);
        col = c.map(v => _cl(v * limb + grain * 0.5, 0, 1));

      } else if (tier === 2) {
        // MOON — warm ash gray, value-noise base, hard craters with central peak
        let c = _mix([0.48, 0.44, 0.40], [0.68, 0.64, 0.60], _vn(nx * 4.5 + 2, ny * 4.5 + 3));
        const MCX = [ 0.20, -0.35,  0.42, -0.12,  0.08, -0.44];
        const MCY = [ 0.32, -0.20, -0.08,  0.44, -0.38,  0.14];
        const MCR = [ 0.16,  0.20,  0.12,  0.18,  0.22,  0.11];
        for (let i = 0; i < 6; i++) {
          if (Math.hypot(MCX[i], MCY[i]) + MCR[i] > 0.96) continue;
          const cd = Math.hypot(nx - MCX[i], ny - MCY[i]);
          if (cd < MCR[i]) {
            c = _mix(c, [0.30, 0.27, 0.24], _ss(MCR[i], MCR[i] * 0.45, cd) * 0.68);
            if (cd < MCR[i] * 0.10) c = _mix(c, [0.82, 0.80, 0.76], 0.60); // peak
          }
        }
        col = c.map(v => _cl(v * limb + grain * 0.7, 0, 1));

      } else if (tier === 3) {
        // MARS-TYPE PLANET — brick/rust, latitude bands, cream polar cap
        const py = Math.abs(ny);
        let c;
        if (py > 0.76) {
          c = _mix([0.80, 0.52, 0.32], [0.94, 0.88, 0.78], _ss(0.76, 0.94, py));
        } else {
          const band = Math.sin(ny * 4.5 + 0.3) * 0.5 + 0.5;
          c = _mix([0.70, 0.26, 0.12], [0.84, 0.54, 0.24], band);
          const edge = Math.abs(Math.sin(ny * 4.5 + 0.3));
          if (edge < 0.12) c = _mix(c, [0.44, 0.16, 0.08], (0.12 - edge) / 0.12 * 0.40);
        }
        col = c.map(v => _cl(v * limb + grain * 0.4, 0, 1));

      } else if (tier === 4) {
        // GAS GIANT — marigold/ochre, hard horizontal bands, polar darkening
        const bv = Math.sin(ny * 7.5 + 0.4) * 0.5 + 0.5;
        let c = _mix([0.76, 0.50, 0.20], [0.94, 0.74, 0.38], bv);
        const pv = Math.abs(ny);
        if (pv > 0.60) c = c.map(v => v * (1 - (pv - 0.60) * 0.75));
        col = c.map(v => _cl(v * limb + grain * 0.4, 0, 1));

      } else if (tier === 5) {
        // YELLOW DWARF STAR — cream-marigold, hard concentric bands, sunspots
        const rings = Math.floor(d * 5) / 5;
        let c = _mix([0.98, 0.94, 0.72], [0.92, 0.64, 0.20], rings);
        c = _mix(c, [1.0, 0.98, 0.88], (1 - d * 1.6) * 0.55);
        if (_hash(nx * 8.3 + 3, ny * 7.1 + 5) < 0.08) c = _mix(c, [0.50, 0.28, 0.08], 0.60);
        col = c.map(v => _cl(v + grain * 0.3, 0, 1));

      } else if (tier === 6) {
        // RED GIANT — deep brick/crimson, convection cell banding
        const conv = _vn(nx * 3.5 + 7, ny * 3.0 + 2);
        let c = _mix([0.78, 0.20, 0.08], [0.92, 0.44, 0.16], Math.sin(ny * 5 + conv * 0.8) * 0.5 + 0.5);
        if (conv < 0.28) c = _mix(c, [0.46, 0.08, 0.04], 0.55);
        col = c.map(v => _cl(v * (0.82 + 0.18 * (1 - d * 0.5)) + grain * 0.25, 0, 1));

      } else if (tier === 7) {
        // GALAXY — round disc (in-family silhouette), warm core, smooth teal
        // logarithmic spiral arms. Smooth modulation (no hard pinwheel edges).
        const ang = Math.atan2(ny, nx);
        const spiral = Math.cos(2 * ang - 5.5 * Math.log(d + 0.16)); // 2-arm log spiral
        const arm = Math.pow(_cl(spiral * 0.5 + 0.5, 0, 1), 1.7);    // 0..1, tightened
        const core = _cl((0.30 - d) * 4.0, 0, 1);
        let c = _mix([0.08, 0.20, 0.22], [0.15, 0.40, 0.38], 1 - d); // disc: rim→mid teal
        c = _mix(c, [0.32, 0.76, 0.66], arm * (0.80 - 0.40 * d));     // brighter teal arms
        c = _mix(c, [0.98, 0.90, 0.74], core);                       // warm cream core
        col = c.map(v => _cl(v * limb + grain * 0.4, 0, 1));

      } else if (tier === 8) {
        // BLACK HOLE — near-black, hard marigold photon ring, faint lensed arc
        const inRing = d > 0.70 && d < 0.88;
        const lensArc = ny < -0.44 && d > 0.52 && d < 0.75;
        if (inRing) {
          col = _mix([0.70, 0.36, 0.08], [0.98, 0.70, 0.24], Math.sin((d - 0.70) / 0.18 * Math.PI));
        } else if (lensArc) {
          const s = (d - 0.52) / 0.23;
          col = _mix([0.44, 0.22, 0.06], [0.0, 0.0, 0.0], s * s);
        } else {
          col = [0.03, 0.01, 0.03];
        }
      }

      al = 1;
      if (d > 0.985) al = _ss(1.0, 0.985, d); // 1px edge feather

    } else {
      // outer halo — only stars (5,6) and galaxy (7) get visible warm/teal glow
      const t = _cl(1 - (d - 1) / (GLOW_MAX - 1), 0, 1);
      if (tier === 5) { al = 0.52 * Math.pow(t, 3.2); col = [0.94, 0.62, 0.18]; }
      else if (tier === 6) { al = 0.48 * Math.pow(t, 3.2); col = [0.80, 0.18, 0.06]; }
      else if (tier === 7) { al = 0.32 * Math.pow(t, 3.8); col = [0.20, 0.58, 0.54]; }
      else { al = 0; col = [0, 0, 0]; }
    }

    let out = [col[0], col[1], col[2], al];

    // Saturn rings composite — front rings over body, back rings occluded by body
    if (tier === 4) {
      const ring = _posterRing(nx, ny);
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
  const SCORE_MILESTONES = [[1000,'KILO-MERGE'],[5000,'MEGA-MERGE'],[10000,'GIGA-MERGE'],[25000,'TERA-MERGE'],[50000,'PETA-MERGE'],[100000,'EXA-MERGE']];

  // Daily seed: deterministic from YYYY-MM-DD so every player gets the same run today.
  function dailySeed() {
    const d = new Date();
    const n = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const m = mulberry32(n * 1664525 + 1013904223);
    m(); m(); // warm up
    return (m() * 0x100000000) >>> 0;
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

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
    bodies: [], current: null, next: null, next2: null,
    score: 0, best: 0, over: false,
    overTimer: 0, dropTimer: 0, combo: 0, comboTimer: 0,
    charge: 0, superReady: false, // Supernova: earned by combos, no meta-currency
    modified: false, graceMult: 1, // set from the equipped loadout at reset()
    rng: mulberry32(Date.now() >>> 0),
    idSeq: 1,
    events: [], // {type, x, y, tier} consumed by the renderer for juice
    milestoneAt: 0, // highest score milestone already announced this run
    // run stats: tracked per session, shown on game-over, reset on reset()
    drops: 0, peakCombo: 0, topTier: 0,
    daily: false, // true for a daily-challenge run (no loadout modifiers)
  };

  // ---- Supernova: an in-run, earned tool — NOT meta-progression ------------
  // It charges purely from combos within a run and resets every run; nothing is
  // saved, bought, or gated behind money. When ready, the player fires it to
  // vaporize the small debris (Asteroids + Comets) that clutters the field —
  // serving the core fantasy: a good merge/clear makes the field emptier.
  const CHARGE_MAX = 18;
  function addCharge(n) {
    if (world.superReady) return;          // don't overfill a ready meter
    world.charge = Math.min(CHARGE_MAX, world.charge + n);
    if (world.charge >= CHARGE_MAX) world.superReady = true;
  }
  function useSupernova() {
    if (!world.superReady || world.over) return false;
    const before = world.bodies.length;
    world.bodies = world.bodies.filter(b => b.tier > 1); // blast Asteroids+Comets
    const cleared = before - world.bodies.length;
    world.score += cleared * 30;
    if (world.score > world.best) world.best = world.score;
    world.charge = 0; world.superReady = false;
    world.overTimer = 0; // a clear relieves the danger line
    world.events.push({ type: 'supernova', cleared });
    return true;
  }

  // ---- Meta-progression: earned by PLAY, never by money -------------------
  // Persistent across runs. "Stardust" is earned purely from how you play; you
  // spend it in the Star Chart. The line we hold: this is a game, not a shop —
  // every reward is reachable by playing, nothing is sold, gated behind money,
  // gambled for, or locked behind a wait timer. Two branches, kept separate:
  //   cosmetic — never affects balance, so the Classic score chase stays pure.
  //   modifier — opt-in loadout perks. Equipping ANY of them flags a run as
  //              "modified", so the Classic best stays a fair record of skill.
  //              It's play-to-unlock, never pay-to-win.
  const META_ITEMS = [
    { id: 'theme_aurora',  branch: 'cosmetic', name: 'Aurora Field',  cost: 250,
      desc: 'A cool aurora wash over the playfield.', tint: '#1f6f6a' },
    { id: 'theme_ember',   branch: 'cosmetic', name: 'Ember Field',   cost: 250,
      desc: 'A warm ember wash over the playfield.', tint: '#7a2f1c' },
    { id: 'theme_eclipse', branch: 'cosmetic', name: 'Eclipse Field', cost: 350,
      desc: 'Indigo haze — the deep end of the spectrum.', tint: '#2d1b4e' },
    { id: 'theme_forge',   branch: 'cosmetic', name: 'Forge Field',   cost: 350,
      desc: 'Volcanic amber — heat bloom at the edge of a star.', tint: '#6a2e0e' },
    { id: 'mod_primed',    branch: 'modifier', name: 'Primed Core',   cost: 400,
      desc: 'Start each run with the Supernova half-charged.' },
    { id: 'mod_steady',    branch: 'modifier', name: 'Steady Hands',  cost: 700,
      desc: 'A longer grace before the danger line ends a run.' },
    { id: 'mod_guide',     branch: 'modifier', name: 'Guide Star',    cost: 600,
      desc: 'Shows a landing ring — where your piece will come to rest.' },
    { id: 'mod_doublenext', branch: 'modifier', name: 'Deep Scan',    cost: 900,
      desc: 'See two pieces ahead instead of one — plan further, chain deeper.' },
  ];
  const META_BY_ID = {}; for (const it of META_ITEMS) META_BY_ID[it.id] = it;

  // one-time stardust bonus for first-ever discovery of each tier (index = tier).
  // Tiers 0-3 are made constantly and give no bonus; the bigger the tier, the bigger the reward.
  const CODEX_BONUS = [0, 0, 0, 0, 25, 50, 100, 250, 500];

  const meta = {
    stardust: 0,
    unlocked: {},      // id -> true
    equipped: {},      // modifier id -> true
    theme: null,       // selected (unlocked) cosmetic field theme id, or null
    bestClassic: 0,    // fair, unmodified high score (for an honest leaderboard)
    codex: new Array(TIERS.length).fill(false), // which tiers have been created by merge (ever)
    bestDailyScore: 0, // personal best on today's daily seed
    bestDailyDate: '', // 'YYYY-MM-DD' of the day the daily best was set
  };
  function metaReset() {
    meta.stardust = 0; meta.unlocked = {}; meta.equipped = {};
    meta.theme = null; meta.bestClassic = 0;
    meta.codex = new Array(TIERS.length).fill(false);
    meta.bestDailyScore = 0; meta.bestDailyDate = '';
  }
  // Stardust from a run: scales with score but sub-linearly (sqrt), so a single
  // huge run can't trivialize the economy and grinding stays meaningful.
  function stardustForScore(score) { return Math.floor(Math.sqrt(Math.max(0, score)) * 1.5); }
  function metaUnlock(id) {
    const item = META_BY_ID[id];
    if (!item || meta.unlocked[id] || meta.stardust < item.cost) return false;
    meta.stardust -= item.cost; meta.unlocked[id] = true;
    if (item.branch === 'cosmetic' && meta.theme === null) meta.theme = id; // auto-wear first
    return true;
  }
  function metaEquip(id, on) {
    const item = META_BY_ID[id];
    if (!item || item.branch !== 'modifier' || !meta.unlocked[id]) return false;
    if (on === false) delete meta.equipped[id]; else meta.equipped[id] = true;
    return true;
  }
  function metaSetTheme(id) {
    if (id !== null && (!META_BY_ID[id] || META_BY_ID[id].branch !== 'cosmetic' || !meta.unlocked[id])) return false;
    meta.theme = id; return true;
  }
  function equippedMods() { return Object.keys(meta.equipped).filter(id => meta.equipped[id]); }

  function pickTier() { return DROP_TIERS[Math.floor(world.rng() * DROP_TIERS.length)]; }

  function reset(seed) {
    world.bodies = [];
    world.score = 0; world.over = false; world.overTimer = 0;
    world.dropTimer = 0; world.combo = 0; world.comboTimer = 0;
    world.charge = 0; world.superReady = false;
    world.idSeq = 1; world.events = []; world.milestoneAt = 0;
    world.drops = 0; world.peakCombo = 0; world.topTier = 0;
    // daily runs are pure (no loadout modifiers) for a fair daily comparison.
    // Classic runs get the full equipped loadout (modified flag when active).
    world.graceMult = 1;
    if (!world.daily) {
      world.modified = equippedMods().length > 0;
      if (meta.equipped['mod_primed']) world.charge = Math.floor(CHARGE_MAX / 2);
      if (meta.equipped['mod_steady']) world.graceMult = 1.6;
    } else {
      world.modified = false;
    }
    if (seed != null) world.rng = mulberry32(seed >>> 0);
    world.next = pickTier();
    world.next2 = pickTier();
    spawnCurrent();
  }

  function spawnCurrent() {
    world.current = { tier: world.next, x: FIELD_W / 2 };
    world.next = world.next2;
    world.next2 = pickTier();
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
    world.drops++;
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
      world.bodies.push(nb);
      world.events.push({ type: 'merge', x: nx, y: ny, tier: nt, id: nb.id });
      if (nt > world.topTier) world.topTier = nt;
      // first time this tier has been created by merge → codex discovery + one-time bonus
      if (!meta.codex[nt]) {
        meta.codex[nt] = true;
        const bonus = CODEX_BONUS[nt] || 0;
        if (bonus) meta.stardust += bonus; // instant bonus; persisted by saveMeta in the handler
        world.events.push({ type: 'codex_unlock', tier: nt, x: nx, y: ny, bonus });
      }
      merged++;
    }
    if (merged > 0) {
      world.combo += merged; world.comboTimer = 1.1;
      if (world.combo > world.peakCombo) world.peakCombo = world.combo;
      addCharge(merged + Math.max(0, world.combo - 1)); // chains charge faster
      const mult = 1 + (world.combo - 1) * 0.5;
      // score the new tiers created
      for (const ev of world.events) {
        if (ev.type === 'merge' && ev._scored !== true) {
          ev._scored = true;
          world.score += Math.round(POINTS[ev.tier] * mult);
        }
      }
      if (world.score > world.best) world.best = world.score;
      // score milestone celebrations (per-run, non-persistent)
      for (const [threshold, label] of SCORE_MILESTONES) {
        if (world.score >= threshold && world.milestoneAt < threshold) {
          world.milestoneAt = threshold;
          world.events.push({ type: 'milestone', label, x: FIELD_W / 2, y: FIELD_H * 0.32 });
        }
      }
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
      if (world.overTimer >= OVER_GRACE * (world.graceMult || 1)) {
        world.over = true;
        const earned = stardustForScore(world.score);
        meta.stardust += earned;
        if (!world.modified && world.score > meta.bestClassic) meta.bestClassic = world.score;
        let isNewDailyBest = false;
        if (world.daily) {
          const today = todayStr();
          if (today !== meta.bestDailyDate || world.score > meta.bestDailyScore) {
            isNewDailyBest = true;
            meta.bestDailyScore = world.score; meta.bestDailyDate = today;
          }
        }
        world.events.push({ type: 'gameover', earned, modified: world.modified,
          drops: world.drops, peakCombo: world.peakCombo, topTier: world.topTier,
          daily: world.daily, isNewDailyBest });
      }
    } else {
      world.overTimer = Math.max(0, world.overTimer - h * 2);
    }
  }

  // expose the headless core for tests
  const core = { world, TIERS, MAX_TIER, POINTS, FIELD_W, FIELD_H, DANGER_Y,
    reset, step, dropCurrent, moveCurrent, spawnCurrent, pickTier, mulberry32,
    TIER_ART, GLOW_MAX, shadeBody, useSupernova, CHARGE_MAX,
    meta, META_ITEMS, metaReset, stardustForScore, metaUnlock, metaEquip,
    metaSetTheme, equippedMods, CODEX_BONUS, dailySeed, todayStr };
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
  const elNova = $('nova'), elNovaFill = $('nova-fill');
  const elChart = $('starchart'), elGoEarned = $('go-earned'), elGoBalance = $('go-balance');

  // ---- procedural sprite cache (bake shadeBody once per tier) --------------
  // Each tier is rasterized to an offscreen canvas via the shared shader, then
  // blitted. Falls back to a flat disc if 2D/ImageData is unavailable (e.g. the
  // headless jsdom test), so the game still boots everywhere.
  const SUP = 3; // supersample for crisp edges (sprites blit near 1:1 with device px)
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
  let nextShown = -1, nextShown2 = -1, novaShown = null;
  function drawNext() {
    if (!nctx) return;
    const w = elNext.width, h = elNext.height;
    nctx.clearRect(0, 0, w, h);
    const doubleNext = !world.daily && !!meta.equipped['mod_doublenext'] && world.next2 !== null;
    if (doubleNext) {
      // left: current next at ~60%, right: next2 at ~38% (dimmer, further ahead)
      const sp1 = sprite(world.next), sp2 = sprite(world.next2);
      const sz1 = Math.min(w, h) * 0.62, sz2 = Math.min(w, h) * 0.38;
      if (sp1 && sp1.cv) nctx.drawImage(sp1.cv, 0, (h - sz1) / 2, sz1, sz1);
      if (sp2 && sp2.cv) {
        nctx.globalAlpha = 0.55;
        nctx.drawImage(sp2.cv, w - sz2 - 1, (h - sz2) / 2 + 4, sz2, sz2);
        nctx.globalAlpha = 1;
      }
      if (elNextName) elNextName.textContent = TIERS[world.next].name + ' · ' + TIERS[world.next2].name;
    } else {
      const sp = sprite(world.next);
      if (sp && sp.cv) { const sz = Math.min(w, h) * 0.96; nctx.drawImage(sp.cv, (w - sz) / 2, (h - sz) / 2, sz, sz); }
      if (elNextName) elNextName.textContent = TIERS[world.next].name;
    }
  }

  let muted = false;
  try { world.best = parseInt(localStorage.getItem('cosmic.best') || '0', 10) || 0; } catch (e) {}
  let storedBest = world.best;
  const persistBest = () => { if (world.best > storedBest) { storedBest = world.best; try { localStorage.setItem('cosmic.best', String(storedBest)); } catch (e) {} } };

  // ---- meta profile persistence (stardust, unlocks, loadout) ---------------
  function loadMeta() {
    try {
      const raw = localStorage.getItem('cosmic.meta'); if (!raw) return;
      const m = JSON.parse(raw);
      meta.stardust = m.stardust | 0;
      meta.unlocked = m.unlocked || {};
      meta.equipped = m.equipped || {};
      meta.theme = m.theme || null;
      meta.bestClassic = m.bestClassic | 0;
      meta.bestDailyScore = m.bestDailyScore | 0;
      meta.bestDailyDate = m.bestDailyDate || '';
      if (Array.isArray(m.codex)) {
        m.codex.forEach((v, i) => { if (v && i < TIERS.length) meta.codex[i] = true; });
      }
    } catch (e) {}
  }
  const saveMeta = () => { try { localStorage.setItem('cosmic.meta', JSON.stringify(meta)); } catch (e) {} };
  loadMeta();

  // ---- audio + haptics ----------------------------------------------------
  let actx = null;
  const audio = () => { if (muted) return null; if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } return actx; };
  const haptic = (pat = 4) => { try { navigator.vibrate && navigator.vibrate(pat); } catch (_) {} };
  function blip(freq, dur = 0.08, type = 'sine', gain = 0.16) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  }
  // Merge "pop": a quick pitch-up chime on a pleasant scale, climbing with tier
  // and combo — the ascending chain is what makes a merge feel satisfying.
  const _SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // major pentatonic-ish
  function mergeSound(tier, combo) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime;
    const semis = _SCALE[Math.min(tier, _SCALE.length - 1)] + (combo - 1) * 2;
    const base = 196 * Math.pow(2, semis / 12);
    for (const [mult, type, gain] of [[1, 'sine', 0.22], [2.01, 'triangle', 0.07]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(base * mult * 0.86, t0);
      o.frequency.exponentialRampToValueAtTime(base * mult, t0 + 0.05); // the "pop" glide
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);            // fast attack
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);          // quick decay
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + 0.22);
    }
  }

  // ---- juice: particles, shake, floaters, shockwave rings, body pops -------
  let parts = [], shake = 0, floaters = [], rings = [], bangFlash = 0, comboFlash = 0;
  let prevDanger = false; // for danger-onset audio cue
  let scoreCountUp = null; // { to, start, dur } — animates the final-score display
  const popById = new Map(); // body id -> pop start time (performance.now)
  function burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 5.5;
      // most sparks take the body's accent color; a few bright cream ones add sparkle
      const c = Math.random() < 0.25 ? '#f1e6d0' : color;
      parts.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1, size: 2 + Math.random() * 4, color: c });
    }
    if (parts.length > 500) parts = parts.slice(-500);
  }
  function floatScore(x, y, text, color) { floaters.push({ x, y, text, color, life: 1 }); }
  function shockwave(x, y, maxR, color) { rings.push({ x, y, maxR, color, life: 1 }); }
  function dropDust(x) {
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.55;
      const spd = 1.2 + Math.random() * 2.8;
      parts.push({ x, y: SPAWN_Y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.55, size: 1 + Math.random() * 2, color: 'rgba(241,230,208,0.75)' });
    }
  }
  // easeOutBack — overshoots past 1 then settles back; the "pop" of a new body
  function popScale(id) {
    const t0 = popById.get(id); if (t0 === undefined) return 1;
    const e = (performance.now() - t0) / 240; // 240ms pop
    if (e >= 1) { popById.delete(id); return 1; }
    const c1 = 1.70158, c3 = c1 + 1;
    const back = 1 + c3 * Math.pow(e - 1, 3) + c1 * Math.pow(e - 1, 2);
    return 0.55 + 0.45 * back; // 0.55 -> overshoot ~1.07 -> 1.0
  }

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
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
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
    const dx = world.current ? world.current.x : null;
    if (dropCurrent()) { blip(220, 0.05, 'square', 0.12); if (dx !== null) dropDust(dx); }
  });
  canvas.addEventListener('pointercancel', () => { aiming = false; });
  window.addEventListener('keydown', e => {
    if (!world.current) return;
    if (e.key === 'ArrowLeft') moveCurrent(world.current.x - 18);
    else if (e.key === 'ArrowRight') moveCurrent(world.current.x + 18);
    else if (e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dx = world.current ? world.current.x : null;
      if (dropCurrent() && dx !== null) dropDust(dx);
    }
  });
  // Supernova: fire with the meter (tap) or the 'S' key when charged.
  function fireSupernova() { if (useSupernova()) blip(120, 0.15, 'sawtooth', 0.2); }
  if (elNova) elNova.addEventListener('click', fireSupernova);
  window.addEventListener('keydown', e => { if (e.key === 's' || e.key === 'S') fireSupernova(); });
  $('restart').addEventListener('click', () => { world.daily = false; reset(); elOver.classList.add('hidden'); });
  $('muteBtn').addEventListener('click', () => { muted = !muted; $('muteBtn').setAttribute('aria-pressed', muted ? 'true' : 'false'); if (!muted) blip(660, 0.1); });

  // ---- Star Chart: spend stardust earned by playing -----------------------
  const scBalance = $('sc-balance'), scCosmetic = $('sc-cosmetic'), scModifier = $('sc-modifier'), scCodex = $('sc-codex');
  const elGoStats = $('go-stats'), elNextName = $('next-name');
  const elGoDailyBanner = $('go-daily'), elDailyBtn = $('daily-btn');
  const elDailyBadge = $('daily-badge'), elShareBtn = $('share-btn');
  if (elDailyBtn) elDailyBtn.addEventListener('click', () => { world.daily = true; reset(dailySeed()); elOver.classList.add('hidden'); });
  if (elShareBtn) elShareBtn.addEventListener('click', async () => {
    const text = `COSMIC MERGE · Daily ${todayStr()}\nScore: ${world.score.toLocaleString()}\n${location.href.split('?')[0]}`;
    try {
      if (navigator.share) { await navigator.share({ text }); }
      else {
        await navigator.clipboard.writeText(text);
        elShareBtn.textContent = 'COPIED!';
        setTimeout(() => { elShareBtn.textContent = 'SHARE SCORE'; }, 1800);
      }
    } catch (_) {}
  });
  function chartItemEl(item) {
    const owned = !!meta.unlocked[item.id];
    const el = document.createElement('div');
    el.className = 'sc-item' + (owned ? ' owned' : '');
    const main = document.createElement('div'); main.className = 'sc-item-main';
    const name = document.createElement('div'); name.className = 'sc-item-name'; name.textContent = item.name;
    const desc = document.createElement('div'); desc.className = 'sc-item-desc'; desc.textContent = item.desc;
    main.append(name, desc);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'sc-btn';
    if (!owned) {
      const afford = meta.stardust >= item.cost;
      btn.classList.add(afford ? 'buy' : 'too-poor');
      btn.textContent = (afford ? 'UNLOCK · ' : '') + item.cost;
      if (afford) btn.onclick = () => { if (metaUnlock(item.id)) { blip(660, 0.1, 'triangle', 0.15); saveMeta(); renderChart(); } };
    } else if (item.branch === 'modifier') {
      const on = !!meta.equipped[item.id];
      btn.classList.add('toggle'); if (on) btn.classList.add('on');
      btn.textContent = on ? 'EQUIPPED' : 'EQUIP';
      btn.onclick = () => { metaEquip(item.id, !on); blip(on ? 330 : 520, 0.08, 'triangle', 0.13); saveMeta(); renderChart(); };
    } else { // cosmetic
      const worn = meta.theme === item.id;
      btn.classList.add('toggle'); if (worn) btn.classList.add('on');
      btn.textContent = worn ? 'WORN' : 'WEAR';
      btn.onclick = () => { metaSetTheme(worn ? null : item.id); blip(520, 0.08, 'triangle', 0.13); saveMeta(); renderChart(); };
    }
    el.append(main, btn);
    return el;
  }
  function renderCodex() {
    if (!scCodex) return;
    scCodex.innerHTML = '';
    for (let t = 0; t < TIERS.length; t++) {
      const found = t === 0 || !!meta.codex[t]; // tier 0 (Asteroid) always found — you drop them
      const bonus = CODEX_BONUS[t] || 0;
      const el = document.createElement('div');
      el.className = 'codex-tier' + (found ? ' found' : '');
      const dot = document.createElement('span');
      dot.className = 'codex-dot';
      if (found) dot.style.background = TIER_ART[t].accent;
      const lbl = document.createElement('span');
      lbl.className = 'codex-label';
      lbl.textContent = TIERS[t].name;
      el.append(dot, lbl);
      if (bonus) {
        const bon = document.createElement('span');
        bon.className = 'codex-bonus' + (found ? ' earned' : '');
        bon.textContent = (found ? '' : '+') + bonus;
        el.append(bon);
      }
      scCodex.append(el);
    }
  }
  function renderChart() {
    if (!elChart) return;
    scBalance.textContent = meta.stardust;
    scCosmetic.innerHTML = ''; scModifier.innerHTML = '';
    for (const item of META_ITEMS) {
      (item.branch === 'cosmetic' ? scCosmetic : scModifier).append(chartItemEl(item));
    }
    renderCodex();
  }
  const openChart = () => { renderChart(); elChart.classList.remove('hidden'); };
  const closeChart = () => elChart.classList.add('hidden');
  if (elChart) {
    $('open-chart').addEventListener('click', openChart);
    $('close-chart').addEventListener('click', closeChart);
    elChart.addEventListener('click', e => { if (e.target === elChart) closeChart(); });
  }

  // ---- consume sim events into juice ---------------------------------------
  function drainEvents() {
    for (const ev of world.events) {
      if (ev.type === 'merge') {
        const accent = TIER_ART[ev.tier].accent;
        burst(ev.x, ev.y, 10 + ev.tier * 4, accent);
        shockwave(ev.x, ev.y, TIERS[ev.tier].r * 2.2, accent);
        if (ev.id !== undefined) popById.set(ev.id, performance.now());
        shake = Math.min(shake + 2 + ev.tier, 18);
        const mult = 1 + (world.combo - 1) * 0.5;
        floatScore(ev.x, ev.y, '+' + Math.round(POINTS[ev.tier] * mult), '#f1e6d0');
        mergeSound(ev.tier, world.combo);
        haptic(ev.tier < 4 ? 3 : 6); // brief buzz — stronger for higher tiers
        if (world.combo > 1) {
          floatScore(ev.x, ev.y - 22, 'COMBO x' + world.combo, '#ffe066');
          comboFlash = Math.min(comboFlash + 0.28, 0.9);
        }
      } else if (ev.type === 'bigbang') {
        bangFlash = 1; shake = 26;
        haptic([30, 15, 30, 15, 60]); // BIG BANG rhythm
        for (let i = 0; i < 14; i++) setTimeout(() => burst(FIELD_W * Math.random(), FIELD_H * Math.random(), 48, '#fff'), i * 30);
        setTimeout(() => floatScore(FIELD_W / 2, FIELD_H / 2, 'BIG BANG  +' + ev.bonus, '#ff8ad0'), 300);
        [196, 262, 330, 392, 523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 80));
      } else if (ev.type === 'supernova') {
        // a shockwave from the top sweeping the field; debris flares out
        shake = Math.min(shake + 16, 26);
        shockwave(FIELD_W / 2, SPAWN_Y, FIELD_W * 1.1, '#f0883e');
        for (let i = 0; i < 18; i++) burst(FIELD_W * Math.random(), FIELD_H * (0.2 + 0.7 * Math.random()), 22, '#f0883e');
        if (ev.cleared > 0) floatScore(FIELD_W / 2, FIELD_H / 2, 'SUPERNOVA  +' + ev.cleared * 30, '#ffd9a0');
        [392, 523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.16), i * 70));
      } else if (ev.type === 'milestone') {
        shake = Math.min(shake + 6, 18);
        floatScore(ev.x, ev.y, ev.label + '!', '#f1e6d0');
        [523, 659].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.14), i * 65));
      } else if (ev.type === 'codex_unlock') {
        const bonusStr = ev.bonus ? '  +' + ev.bonus : '';
        floatScore(ev.x, ev.y - 28, 'FIRST  ' + TIERS[ev.tier].name.toUpperCase() + '!' + bonusStr, '#4bb39c');
        [392, 523, 659].forEach((f, i) => setTimeout(() => blip(f, 0.15, 'triangle', 0.18), i * 80));
        saveMeta(); // persist the discovery + bonus immediately, even mid-run
      } else if (ev.type === 'gameover') {
        elFinal.textContent = '0';
        scoreCountUp = { to: world.score, start: performance.now(), dur: Math.min(1400, 400 + world.score / 40) };
        const isNewBest = world.score > storedBest && world.score > 0;
        persistBest();
        elNewBest.classList.toggle('hidden', !isNewBest || ev.daily);
        if (elShareBtn) elShareBtn.classList.toggle('hidden', !ev.daily);
        if (elGoDailyBanner) {
          if (ev.daily) {
            elGoDailyBanner.classList.remove('hidden');
            elGoDailyBanner.textContent = ev.isNewDailyBest ? 'NEW DAILY BEST' : 'DAILY BEST · ' + meta.bestDailyScore;
          } else {
            elGoDailyBanner.classList.add('hidden');
          }
        }
        if (elGoStats) {
          const topName = ev.topTier > 0 ? TIERS[ev.topTier].name : '—';
          elGoStats.innerHTML =
            `<span>${ev.drops || 0} drops</span><span>×${ev.peakCombo || 1} peak combo</span><span>${topName}</span>`;
        }
        if (elGoEarned) elGoEarned.textContent = '+' + (ev.earned || 0);
        if (elGoBalance) elGoBalance.textContent = meta.stardust;
        // daily button: show replay hint if today's challenge was already played
        if (elDailyBtn) {
          if (meta.bestDailyDate === todayStr() && meta.bestDailyScore > 0) {
            elDailyBtn.textContent = 'REPLAY DAILY · ' + meta.bestDailyScore.toLocaleString();
          } else {
            elDailyBtn.textContent = 'DAILY CHALLENGE';
          }
        }
        // star chart button: highlight when new items are affordable
        const elOpenChart = $('open-chart');
        if (elOpenChart) {
          const hasNew = META_ITEMS.some(i => !meta.unlocked[i.id] && meta.stardust >= i.cost);
          elOpenChart.classList.toggle('has-unlockable', hasNew);
        }
        saveMeta();
        elOver.classList.remove('hidden');
        blip(160, 0.4, 'sawtooth', 0.2);
        haptic([20, 10, 40]); // game-over pulse
      }
    }
    world.events.length = 0;
  }

  // ---- render -------------------------------------------------------------
  function drawBody(x, y, tier, ghost, popId) {
    const sp = sprite(tier);
    ctx.save();
    ctx.globalAlpha = ghost ? 0.42 : 1;
    const ps = popId !== undefined ? popScale(popId) : 1;
    if (sp && sp.cv) {
      const sz = sp.half * 2 * ps;
      ctx.drawImage(sp.cv, x - sp.half * ps, y - sp.half * ps, sz, sz);
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
    // cosmetic field theme — a subtle wash, never alters gameplay (balance-safe)
    if (meta.theme && META_BY_ID[meta.theme] && META_BY_ID[meta.theme].tint) {
      ctx.save();
      ctx.globalAlpha = 0.16; ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = META_BY_ID[meta.theme].tint; ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.restore();
    }
    // danger line — a subtle glowing threshold, only assertive when threatened
    const danger = world.overTimer > 0.05;
    if (danger && !prevDanger) blip(55, 0.25, 'sine', 0.07); // low warning thud on onset
    prevDanger = danger;
    ctx.save();
    ctx.strokeStyle = danger ? 'rgba(210,74,44,0.9)' : 'rgba(180,150,120,0.24)';
    ctx.lineWidth = danger ? 2.5 : 1.5; ctx.setLineDash([7, 9]);
    if (danger) { ctx.shadowColor = 'rgba(210,74,44,0.9)'; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(FIELD_W, DANGER_Y); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    // danger vignette — red edge bleed builds up as the grace timer ticks
    if (danger) {
      try {
        const frac = Math.min(world.overTimer / (OVER_GRACE * (world.graceMult || 1)), 1);
        const dv = ctx.createRadialGradient(FIELD_W / 2, FIELD_H, FIELD_W * 0.28, FIELD_W / 2, FIELD_H, FIELD_W * 0.9);
        dv.addColorStop(0, 'rgba(0,0,0,0)');
        dv.addColorStop(1, `rgba(210,74,44,${(frac * 0.22).toFixed(3)})`);
        ctx.fillStyle = dv; ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      } catch (_) {}
    }

    // combo flash — warm marigold bloom that builds with cascade chains
    if (comboFlash > 0) {
      ctx.fillStyle = `rgba(240,136,62,${(comboFlash * 0.09).toFixed(3)})`;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      comboFlash = Math.max(0, comboFlash - 0.04);
    }

    for (const b of world.bodies) drawBody(b.x, b.y, b.tier, false, b.id);

    // shockwave rings — quick expanding pulse at each merge point
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life -= 0.06;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      const e = 1 - r.life;
      ctx.globalAlpha = r.life * 0.6;
      ctx.strokeStyle = r.color; ctx.lineWidth = 2.5 * r.life;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.maxR * e, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (world.current && !world.over) {
      // landing ring (mod_guide modifier) — approximate where the piece will rest
      if (meta.equipped['mod_guide']) {
        const cr = TIERS[world.current.tier].r, cx = world.current.x;
        let landY = FIELD_H - cr;
        for (const b of world.bodies) {
          const br = TIERS[b.tier].r;
          if (Math.abs(b.x - cx) < cr + br) { const top = b.y - br - cr; if (top < landY) landY = top; }
        }
        ctx.globalAlpha = 0.4; ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(cx, landY, cr, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      drawBody(world.current.x, SPAWN_Y, world.current.tier, true);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(world.current.x, SPAWN_Y); ctx.lineTo(world.current.x, FIELD_H); ctx.stroke();
      ctx.setLineDash([]);
    }

    // first-drop hint — vanishes the moment the player drops their first piece
    if (world.drops === 0 && !world.over) {
      const pulse = 0.5 + 0.4 * Math.sin(performance.now() / 520);
      ctx.globalAlpha = pulse * 0.72;
      ctx.fillStyle = '#f1e6d0';
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TAP TO DROP', FIELD_W / 2, SPAWN_Y + 36);
      ctx.globalAlpha = 1;
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
      ctx.font = '700 22px "Big Shoulders Display", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // BIG BANG white flash — a blinding wash that fades to reveal the cleared field
    if (bangFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(bangFlash * 0.9).toFixed(3)})`;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      bangFlash = Math.max(0, bangFlash - 0.045);
    }

    ctx.restore();

    shake *= 0.85; if (shake < 0.3) shake = 0;

    // score count-up animation on game-over card
    if (scoreCountUp) {
      const t = Math.min(1, (performance.now() - scoreCountUp.start) / scoreCountUp.dur);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      elFinal.textContent = Math.round(scoreCountUp.to * ease).toLocaleString();
      if (t >= 1) { elFinal.textContent = scoreCountUp.to.toLocaleString(); scoreCountUp = null; }
    }

    // HUD
    elScore.textContent = world.score;
    elBest.textContent = world.best;
    if (elDailyBadge) elDailyBadge.classList.toggle('hidden', !world.daily);
    if (world.next !== nextShown || world.next2 !== nextShown2) { drawNext(); nextShown = world.next; nextShown2 = world.next2; }
    elCombo.textContent = world.combo > 1 ? 'COMBO ×' + world.combo : '';
    if (elNova) {
      elNovaFill.style.width = Math.min(100, world.charge / CHARGE_MAX * 100) + '%';
      const ready = world.superReady;
      elNova.classList.toggle('ready', ready);
      elNova.disabled = !ready;
      if (ready !== novaShown) {
        elNova.querySelector('#nova-label').textContent = ready ? 'SUPERNOVA · READY' : 'SUPERNOVA';
        novaShown = ready;
      }
    }
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
