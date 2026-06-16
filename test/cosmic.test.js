/* Headless tests for the COSMIC MERGE simulation core. merge.js exports its
 * DOM-free core via module.exports and bails out before any rendering when
 * there's no `document`, so we can drive the physics deterministically here. */

const C = require('../merge.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

const T = C.TIERS, MAX = C.MAX_TIER, W = C.FIELD_W, Hf = C.FIELD_H;
const stepN = (n, h = 1 / 120) => { for (let i = 0; i < n; i++) C.step(h); };

// --- 1. reset + spawn ----------------------------------------------------
C.reset(12345);
ok(C.world.bodies.length === 0, 'reset clears the field');
ok(C.world.current && typeof C.world.current.tier === 'number', 'a current piece is spawned');
ok(typeof C.world.next === 'number', 'a next piece is queued');
ok(C.world.score === 0 && C.world.over === false, 'reset zeroes score and clears game-over');

// --- 2. dropping adds a falling body -------------------------------------
C.reset(1);
const beforeDrop = C.world.bodies.length;
C.moveCurrent(W / 2);
ok(C.dropCurrent() === true, 'dropCurrent succeeds');
ok(C.world.bodies.length === beforeDrop + 1, 'a body is added to the field');
const body = C.world.bodies[0];
const y0 = body.y;
stepN(10);
ok(body.y > y0, 'gravity pulls the dropped body downward');

// --- 3. walls keep bodies inside the field -------------------------------
C.reset(2);
C.moveCurrent(99999);                // try to shove it past the right wall
C.dropCurrent();
stepN(60);
const inside = C.world.bodies.every(b => b.x >= T[b.tier].r - 0.5 && b.x <= W - T[b.tier].r + 0.5);
ok(inside, 'bodies are clamped within the walls');

// --- 4. two same-tier bodies merge into the next tier, scoring -----------
C.reset(3);
C.world.bodies = [
  { id: 901, tier: 0, x: 170, y: Hf - T[0].r, vx: 0, vy: 0, age: 1 },
  { id: 902, tier: 0, x: 190, y: Hf - T[0].r, vx: 0, vy: 0, age: 1 },
];
C.world.score = 0;
stepN(3);
const ones = C.world.bodies.filter(b => b.tier === 1);
ok(C.world.bodies.length === 1 && ones.length === 1, 'two Asteroids merge into one Comet');
ok(C.world.score > 0, 'a merge increases the score (got ' + C.world.score + ')');

// --- 5. max-tier bodies do NOT merge into a higher tier ------------------
C.reset(4);
C.world.bodies = [
  { id: 911, tier: MAX, x: 150, y: Hf - T[MAX].r, vx: 0, vy: 0, age: 1 },
  { id: 912, tier: MAX, x: 150 + T[MAX].r * 0.1, y: Hf - T[MAX].r, vx: 0, vy: 0, age: 1 },
];
const scoreBefore = C.world.score = 0;
stepN(2);
ok(!C.world.bodies.some(b => b.tier > MAX), 'nothing is created above the max tier');

// --- 6. BIG BANG: two black holes detonate, clearing the field + bonus ---
C.reset(5);
C.world.bodies = [
  { id: 921, tier: MAX, x: 180, y: 300, vx: 0, vy: 0, age: 1 },
  { id: 922, tier: MAX, x: 195, y: 300, vx: 0, vy: 0, age: 1 },
  { id: 923, tier: 2, x: 60, y: 500, vx: 0, vy: 0, age: 1 }, // bystander, cleared too
];
C.world.score = 0; C.world.events.length = 0;
stepN(2);
ok(C.world.bodies.length === 0, 'BIG BANG clears the whole field');
ok(C.world.score >= 5000, 'BIG BANG awards a big bonus (got ' + C.world.score + ')');

// --- 7. game over: a resting stack above the danger line ----------------
C.reset(6);
// stack alternating distinct tiers (5,4,5,4… so they never merge) from the
// floor up, tall enough that the top rises above the danger line — computed
// from the radii so it stays correct if body sizes change.
const stack = []; let yy = Hf, id = 950, k = 0;
while (yy > C.DANGER_Y - 20) {
  const tier = (k % 2) ? 4 : 5;
  yy -= T[tier].r;
  stack.push({ id: id++, tier, x: W / 2, y: yy, vx: 0, vy: 0, age: 1 });
  yy -= T[tier].r;
  k++;
}
C.world.bodies = stack;
let sawOver = false;
for (let i = 0; i < 12 * 120 && !sawOver; i++) { C.step(1 / 120); if (C.world.over) sawOver = true; }
ok(sawOver, 'a stack resting above the danger line ends the game');
ok(C.dropCurrent() === false, 'you cannot drop after game over');

// --- 8. randomness is fair game-RNG, deterministic per seed (not a gamble) -
//   Same seed -> identical next-piece sequence (reproducible, not monetized).
function seq(seed) {
  C.reset(seed); const out = [C.world.next];
  for (let i = 0; i < 12; i++) { C.spawnCurrent(); out.push(C.world.next); }
  return out.join(',');
}
ok(seq(777) === seq(777), 'same seed yields the same piece sequence (deterministic)');
ok(seq(1) !== seq(2), 'different seeds yield different sequences (real variety)');

// --- 9. all dropped pieces come from the low tiers (fairness/legibility) --
C.reset(8);
let allLow = true;
for (let i = 0; i < 200; i++) { if (C.pickTier() > 3) allLow = false; }
ok(allLow, 'only low tiers (0-3) ever spawn — you build up, you are never handed a win');

// --- 10. Supernova: an in-run, earned clear (no meta-progression) --------
C.reset(11);
ok(C.useSupernova() === false, 'Supernova does nothing until charged');
// charge it directly, then fire it on a cluttered field
C.world.charge = C.CHARGE_MAX; C.world.superReady = true;
C.world.bodies = [
  { id: 970, tier: 0, x: 100, y: 500, vx: 0, vy: 0, age: 1 }, // debris
  { id: 971, tier: 1, x: 140, y: 500, vx: 0, vy: 0, age: 1 }, // debris
  { id: 972, tier: 4, x: 200, y: 500, vx: 0, vy: 0, age: 1 }, // survives
  { id: 973, tier: 6, x: 300, y: 500, vx: 0, vy: 0, age: 1 }, // survives
];
C.world.score = 0;
ok(C.useSupernova() === true, 'Supernova fires when charged');
ok(C.world.bodies.length === 2 && C.world.bodies.every(b => b.tier > 1), 'Supernova clears only small debris (tiers 0-1)');
ok(C.world.score > 0, 'Supernova awards points for cleared debris (got ' + C.world.score + ')');
ok(C.world.superReady === false && C.world.charge === 0, 'firing resets the charge meter');
ok(C.useSupernova() === false, 'cannot fire again until recharged');

// --- summary -------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
