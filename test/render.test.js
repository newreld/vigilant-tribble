/* Presentation-layer smoke test: boots the FULL game (DOM + canvas + input +
 * render loop) inside jsdom with stubbed browser APIs, simulates input and
 * several rendered frames, and asserts nothing throws and the HUD updates.
 * This is the layer the headless core test can't cover. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mergeJs = fs.readFileSync(path.join(root, 'merge.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const dom = new JSDOM(html, { pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;

// stub browser APIs the game touches. NOTE: the game uses bare globals
// (requestAnimationFrame, performance, localStorage), which resolve to Node's
// `global` inside new Function — so stub them there, not just on `window`.
let clock = 0;
let rafCb = null;
const raf = cb => { rafCb = cb; return 1; };
window.requestAnimationFrame = raf; global.requestAnimationFrame = raf;
const perf = { now: () => clock };
Object.defineProperty(window, 'performance', { value: perf, configurable: true });
global.performance = perf;
window.devicePixelRatio = 2;
const _ls = {};
const lsStub = {
  getItem: k => (k in _ls ? _ls[k] : null), setItem: (k, v) => { _ls[k] = String(v); }, removeItem: k => { delete _ls[k]; },
};
Object.defineProperty(window, 'localStorage', { value: lsStub, configurable: true });
global.localStorage = lsStub;
window.AudioContext = class { createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: {}, type: '' }; }
  createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
  get currentTime() { return 0; } get destination() { return {}; } };

// a permissive canvas 2d context stub
const ctxStub = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (() => {})), set: () => true });
const canvas = window.document.getElementById('game');
canvas.getContext = () => ctxStub;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 600, right: 360, bottom: 600 });
Object.defineProperty(canvas, 'clientWidth', { value: 360, configurable: true });
Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });

// run the game
let threwOnBoot = false;
try { new window.Function(mergeJs).call(window); } catch (e) { threwOnBoot = true; console.log('   boot error: ' + e.message); }
ok(!threwOnBoot, 'game boots without throwing');

const G = window.__cosmic;
ok(!!G, 'core exposed on window');
ok(typeof rafCb === 'function', 'render loop was scheduled');

// pump a few frames
function frame(ms) { clock += ms; const cb = rafCb; rafCb = null; if (cb) cb(clock); }
let threwInLoop = false;
try { for (let i = 0; i < 5; i++) frame(16); } catch (e) { threwInLoop = true; console.log('   loop error: ' + e.message); }
ok(!threwInLoop, 'render loop runs without throwing');

// simulate a drop: press to aim, release to drop (the aim model), then pump frames
const pd = new window.Event('pointerdown'); pd.clientX = 180; pd.clientY = 50;
const pu = new window.Event('pointerup'); pu.clientX = 180; pu.clientY = 50;
let threwOnInput = false;
try { canvas.dispatchEvent(pd); canvas.dispatchEvent(pu); for (let i = 0; i < 10; i++) frame(16); } catch (e) { threwOnInput = true; console.log('   input error: ' + e.message); }
ok(!threwOnInput, 'pointer input + simulated frames run without throwing');
ok(G.world.bodies.length >= 1, 'press-to-aim, release-to-drop puts a body into the field');

// force a couple of merges and confirm the HUD score element updates
G.world.bodies = [
  { id: 1, tier: 0, x: 175, y: 580, vx: 0, vy: 0, age: 1 },
  { id: 2, tier: 0, x: 188, y: 580, vx: 0, vy: 0, age: 1 },
];
G.world.score = 0;
let threwOnMerge = false;
try { for (let i = 0; i < 6; i++) frame(16); } catch (e) { threwOnMerge = true; console.log('   merge error: ' + e.message); }
ok(!threwOnMerge, 'merge + its juice/events render without throwing');
ok(G.world.score > 0, 'score increased after a merge');
ok(window.document.getElementById('score').textContent === String(G.world.score), 'HUD score element reflects the score');

// trigger game over and confirm the overlay shows
G.world.over = true; G.world.events.push({ type: 'gameover' });
try { frame(16); } catch (e) {}
ok(!window.document.getElementById('gameover').classList.contains('hidden'), 'game-over overlay appears');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
