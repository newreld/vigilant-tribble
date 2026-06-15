/* A bot that actually PLAYS Cosmic Merge via the headless core, so we can feel
 * out the mechanics: scoring curve, merge cadence, combos, BIG BANG, difficulty,
 * and how a round tends to end. Strategy is a simple-but-honest heuristic:
 *   - if a same-tier body is exposed on top, drop onto it to merge;
 *   - otherwise drop into the emptiest column to keep the pile low.
 */
const C = require('../merge.js');
const { world, TIERS, MAX_TIER, FIELD_W, FIELD_H, DANGER_Y } = C;
const H = 1 / 120;

const rOf = t => TIERS[t].r;

// topmost body (smallest y) whose column would catch a piece dropped at x
function surfaceY(x, r) {
  let top = FIELD_H; // empty column => floor
  for (const b of world.bodies) {
    if (Math.abs(b.x - x) < rOf(b.tier) + r) top = Math.min(top, b.y - rOf(b.tier));
  }
  return top;
}

// is body b exposed (nothing resting on top within its horizontal span)?
function exposed(b) {
  for (const o of world.bodies) {
    if (o === b) continue;
    if (Math.abs(o.x - b.x) < rOf(b.tier) && o.y < b.y - rOf(b.tier) * 0.3) return false;
  }
  return true;
}

function chooseX() {
  const cur = world.current; if (!cur) return FIELD_W / 2;
  const t = cur.tier, r = rOf(t);
  const clamp = x => Math.max(r, Math.min(FIELD_W - r, x));

  // 1) aim at an exposed same-tier body to trigger a merge
  let best = null, bestY = -1;
  for (const b of world.bodies) {
    if (b.tier === t && b.tier < MAX_TIER && exposed(b) && b.y > bestY) { best = b; bestY = b.y; }
  }
  if (best) return clamp(best.x);

  // 2) otherwise, drop into the emptiest column (lowest surface = most room)
  let bx = FIELD_W / 2, deepest = -1;
  for (let x = r; x <= FIELD_W - r; x += 8) {
    const s = surfaceY(x, r);
    if (s > deepest) { deepest = s; bx = x; }
  }
  return clamp(bx);
}

// step until the next piece is ready AND the pile is roughly at rest
function settle(cap = 4.0) {
  let t = 0;
  while (t < cap) {
    C.step(H); t += H;
    if (world.over) return;
    const ready = !!world.current && world.dropTimer <= 0;
    let maxv = 0; for (const b of world.bodies) maxv = Math.max(maxv, Math.abs(b.vx) + Math.abs(b.vy));
    if (ready && maxv < 25) return;
  }
}

function playRound(seed) {
  C.reset(seed);
  const stats = { seed, drops: 0, merges: 0, byTier: {}, maxTier: 0,
    maxCombo: 0, bigbangs: 0, score: 0 };
  let guard = 0;
  while (!world.over && guard++ < 2000) {
    if (!world.current) { settle(); if (world.over) break; }
    C.moveCurrent(chooseX());
    if (!C.dropCurrent()) { settle(); continue; }
    stats.drops++;
    settle();
    for (const ev of world.events) {
      if (ev.type === 'merge') {
        stats.merges++;
        stats.byTier[ev.tier] = (stats.byTier[ev.tier] || 0) + 1;
        stats.maxTier = Math.max(stats.maxTier, ev.tier);
      } else if (ev.type === 'bigbang') stats.bigbangs++;
    }
    stats.maxCombo = Math.max(stats.maxCombo, world.combo);
    world.events.length = 0;
  }
  stats.score = world.score;
  return stats;
}

const seeds = [1, 7, 42, 123, 2024, 88, 999, 31415];
const rounds = seeds.map(playRound);
console.log('seed     drops merges maxTier(name)        maxCombo bigbang  score');
for (const r of rounds) {
  console.log(
    String(r.seed).padEnd(8),
    String(r.drops).padStart(5),
    String(r.merges).padStart(6),
    (r.maxTier + ' ' + TIERS[r.maxTier].name).padEnd(20),
    String(r.maxCombo).padStart(8),
    String(r.bigbangs).padStart(7),
    String(r.score).padStart(7),
  );
}
const avg = k => (rounds.reduce((s, r) => s + r[k], 0) / rounds.length).toFixed(1);
console.log('\navg drops=%s merges=%s score=%s   best=%d',
  avg('drops'), avg('merges'), avg('score'), Math.max(...rounds.map(r => r.score)));
// merge distribution by tier across all rounds
const dist = {};
for (const r of rounds) for (const k in r.byTier) dist[k] = (dist[k] || 0) + r.byTier[k];
console.log('merges by tier created:', Object.keys(dist).sort((a,b)=>a-b)
  .map(k => `${TIERS[k].name}:${dist[k]}`).join('  '));
