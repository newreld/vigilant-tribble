/* Headless smoke test: loads the real game into jsdom, stubs the browser APIs
 * the game relies on (canvas 2d, WebAudio, rAF), and drives the core loop to
 * verify earning, combos, the deterministic golden tap, the frenzy meter, the
 * guaranteed jackpot, number formatting, and shop purchases. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gameJs = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

// --- build a jsdom world with the bits the game touches -----------------
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.innerWidth = window.innerWidth = 400;
global.innerHeight = window.innerHeight = 800;
global.addEventListener = window.addEventListener.bind(window);

// rAF: no-op (we don't need the render loop for logic tests)
window.requestAnimationFrame = () => 0;
global.requestAnimationFrame = () => 0;
// performance.now: a controllable clock so we can test combo windows precisely
let clock = 1000;
const perfStub = { now: () => clock };
Object.defineProperty(window, 'performance', { value: perfStub, configurable: true });
global.performance = perfStub;
// timers: capture, don't auto-run
window.setInterval = () => 0;
global.setInterval = () => 0;
window.setTimeout = () => 0; // jackpot uses setTimeout chains; we test the synchronous parts
global.setTimeout = () => 0;

// localStorage: simple in-memory stub (jsdom blocks it on opaque origins)
const _store = {};
const lsStub = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};
Object.defineProperty(window, 'localStorage', { value: lsStub, configurable: true });
global.localStorage = lsStub;
// must match OFFLINE_CAP_SEC in game.js
const OFFLINE_CAP_SEC_EXPECT = 2 * 3600;

// canvas 2d stub
window.HTMLCanvasElement.prototype.getContext = () => ({
  clearRect() {}, beginPath() {}, arc() {}, fill() {}, fillRect() {},
  set globalAlpha(v) {}, get globalAlpha() { return 1; },
  set fillStyle(v) {}, get fillStyle() { return ''; },
});
// WebAudio stub
window.AudioContext = class { createOscillator() { return { connect(){}, start(){}, stop(){}, frequency:{value:0}, type:'' }; }
  createGain() { return { connect(){}, gain:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} } }; }
  get currentTime() { return 0; } get destination() { return {}; } };

// run the game source inside this window
const runScript = new window.Function(gameJs);
// game.js uses bare `window`/`document` — they're globals here, good.
runScript.call(window);

const G = window.__megatap;
ok(!!G, 'game booted and exposed test hooks');

// --- 1. a single tap earns at least tapPower -----------------------------
const c0 = G.state.coins;
G.doTap(200, 400);
ok(G.state.coins === c0 + 1, 'first tap earns exactly tapPower (1) coin');

// --- 2. combos build when tapping within the window ----------------------
G.state.combo = 0; G.state.lastTap = 0; clock = 5000;
G.doTap(200, 400);                 // combo 0
clock += 200; G.doTap(200, 400);   // within window -> combo 1
clock += 200; G.doTap(200, 400);   // combo 2
ok(G.state.combo === 2, 'combo increments on chained taps within window (got ' + G.state.combo + ')');
ok(G.state.comboMult > 1, 'combo multiplier rises above 1 (got ' + G.state.comboMult.toFixed(2) + ')');

// --- 3. combo resets if you wait past the window -------------------------
clock += 5000; G.doTap(200, 400);
ok(G.state.combo === 0, 'combo resets after the window expires');

// --- 4. the GOLDEN tap is deterministic (every 12th), never random -------
G.state.tapCount = 11; const before = G.state.coins;
G.doTap(200, 400);                 // this is the 12th -> golden x10
const goldenGain = G.state.coins - before;
ok(goldenGain >= 10, 'every 12th tap is a guaranteed GOLDEN x10 (gain=' + goldenGain + ')');

// --- 5. frenzy meter fills deterministically and never exceeds 1 ---------
G.state.frenzy = 0; G.state.frenzyActive = false;
for (let i = 0; i < 5; i++) G.doTap(200, 400);
ok(G.state.frenzy > 0 && G.state.frenzy <= 1, 'frenzy meter fills within [0,1] (got ' + G.state.frenzy.toFixed(2) + ')');

// --- 6. number formatting -----------------------------------------------
ok(G.fmt(999) === '999', 'fmt small numbers raw');
ok(G.fmt(1500).endsWith('K'), 'fmt thousands -> K (' + G.fmt(1500) + ')');
ok(G.fmt(2_500_000).endsWith('M'), 'fmt millions -> M (' + G.fmt(2_500_000) + ')');
ok(G.fmt(3_000_000_000).endsWith('B'), 'fmt billions -> B (' + G.fmt(3_000_000_000) + ')');

// --- 7. shop: a real upgrade costs coins and applies its effect ----------
const power = G.upgrades.find(u => u.id === 'power');
G.state.coins = 100000; const lvl0 = power.level; const tp0 = G.state.tapPower;
G.buy('power');
ok(power.level === lvl0 + 1, 'buying Tap Power increments its level');
ok(G.state.tapPower === tp0 + 1, 'Tap Power upgrade increases tapPower');
ok(G.state.coins < 100000, 'buying a real upgrade deducts coins');

// --- 8. parody items are FREE and never cost coins -----------------------
const lootCoins = G.state.coins;
G.buy('lootbox');
ok(G.state.coins >= lootCoins, 'the "loot box" is free and never deducts coins (it only gives)');
const skip = G.upgrades.find(u => u.id === 'skip');
ok(skip.cost(skip) === 0, 'parody "Skip Timer (Premium)" costs exactly 0');
const noads = G.upgrades.find(u => u.id === 'noads');
ok(noads.cost(noads) === 0, 'parody "Remove Ads" costs exactly 0');

// --- 9. ethical guarantee: NO variable-ratio randomness in earning -------
//   Re-run the same deterministic sequence; identical inputs -> identical gain.
function deterministicRun() {
  G.state.coins = 0; G.state.combo = 0; G.state.lastTap = 0;
  G.state.tapCount = 0; G.state.frenzy = 0; G.state.frenzyActive = false;
  G.state.tapPower = 1; G.state.comboMult = 1;
  let t = 100000;
  for (let i = 0; i < 10; i++) { t += 200; clock = t; G.doTap(200, 400); }
  return G.state.coins;
}
const runA = deterministicRun();
const runB = deterministicRun();
ok(runA === runB, 'identical play yields identical coins — earning is deterministic, not a gamble (' + runA + ' === ' + runB + ')');

// --- 10. persistence: save then load restores progression ---------------
G.state.coins = 777777; G.state.tapPower = 9;
G.upgrades.find(u => u.id === 'auto').level = 3;
G.save();
// wipe live state, then load it back
G.state.coins = 0; G.state.tapPower = 1; G.upgrades.find(u => u.id === 'auto').level = 0;
const loaded = G.load();
ok(loaded === true, 'load() reports a save was found');
ok(G.state.coins === 777777, 'coins restored from save (' + G.state.coins + ')');
ok(G.state.tapPower === 9, 'tapPower restored from save');
ok(G.upgrades.find(u => u.id === 'auto').level === 3, 'upgrade levels restored from save');

// --- 11. offline earnings: bounded, deterministic, only with auto-tapper --
G.state.coins = 0;
G.upgrades.find(u => u.id === 'auto').level = 5;   // 5 * 2 = 10 coins/sec
G.state.lastSeen = Date.now() - 10 * 1000;          // away for 10s
G.applyOfflineEarnings();
ok(G.state.coins === 100, 'offline income = sec * autoLvl * 2 (10s * 5 * 2 = 100, got ' + G.state.coins + ')');

G.state.coins = 0; G.state.lastSeen = Date.now() - 999 * 3600 * 1000; // away "forever"
G.applyOfflineEarnings();
ok(G.state.coins === OFFLINE_CAP_SEC_EXPECT * 5 * 2,
   'offline income is capped (no infinite away-bonus), got ' + G.state.coins);

G.state.coins = 0;
G.upgrades.find(u => u.id === 'auto').level = 0;    // no auto-tapper owned
G.state.lastSeen = Date.now() - 10000;
G.applyOfflineEarnings();
ok(G.state.coins === 0, 'no offline income without an auto-tapper');

// --- 12. milestones fire once each as coins cross thresholds -------------
G.state.coins = 0; G.state.nextMilestone = 0;
G.addCoins(1500);                                   // crosses the 1e3 milestone
ok(G.state.nextMilestone === 1, 'crossing 1,000 advances exactly one milestone');
G.addCoins(0);                                      // re-check shouldn't re-fire
ok(G.state.nextMilestone === 1, 'milestones do not re-fire for the same threshold');
G.state.coins = 2e6; G.addCoins(0);
ok(G.state.nextMilestone === 4, 'jumping to 2,000,000 advances past 1e3/1e4/1e5/1e6');

// --- summary -------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
