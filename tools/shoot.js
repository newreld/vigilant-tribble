/* "Eyes" for the real game: drives a headless Chromium over the ACTUAL page
 * (real CSS/fonts/canvas/layout), plays a few drops to populate the board, and
 * screenshots it at phone + tablet sizes into screenshots/. Runs in CI (which
 * has network); the PNGs are committed back so they can be reviewed.
 *
 *   node tools/shoot.js
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const PORT = 8123;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' };
const server = http.createServer((q, s) => {
  let u = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  const file = path.join(process.cwd(), decodeURIComponent(u));
  fs.readFile(file, (e, d) => {
    if (e) { s.writeHead(404); s.end(); }
    else { s.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'text/plain' }); s.end(d); }
  });
});

const VIEWS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1000 },
];

// Drop pieces via the core API — bypasses pointer events, works reliably in headless.
async function playDrops(page, name) {
  const booted = await page.evaluate(() => !!window.__cosmic);
  if (!booted) throw new Error('window.__cosmic not available');
  // seed with a fixed value for reproducible screenshots
  await page.evaluate(() => window.__cosmic.reset(0xdeadbeef));
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate((i) => {
      const C = window.__cosmic;
      if (!C || C.world.over || !C.world.current) return false;
      // spread pieces across the field in a repeating pattern
      const x = C.FIELD_W * (0.15 + 0.70 * ((i * 0.37) % 1));
      C.moveCurrent(x);
      return C.dropCurrent();
    }, i);
    if (!ok) break;
    await page.waitForTimeout(350); // let physics settle
  }
  const score = await page.evaluate(() => window.__cosmic.world.score);
  const bodies = await page.evaluate(() => window.__cosmic.world.bodies.length);
  console.log(`  ${name}: score=${score} bodies=${bodies}`);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync('screenshots', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const v of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(3000); // fonts + boot + sprite bake
      try {
        await playDrops(page, v.name);
      } catch (e) { console.log(`  ${v.name} play step skipped: ` + e.message); }
      await page.waitForTimeout(1500); // settle
      await page.screenshot({ path: `screenshots/${v.name}.png` });
      console.log('  wrote screenshots/' + v.name + '.png');
      await ctx.close();
    }

    // UI overlays: game-over card + Star Chart (driven via the exposed core)
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(3000);
      const booted = await page.evaluate(() => !!window.__cosmic);
      if (!booted) throw new Error('window.__cosmic not available after boot');

      // Drop some pieces first so the field isn't empty behind the overlay
      await page.evaluate(() => window.__cosmic.reset(42));
      for (let i = 0; i < 12; i++) {
        await page.evaluate((i) => {
          const C = window.__cosmic;
          if (!C || C.world.over || !C.world.current) return;
          C.moveCurrent(C.FIELD_W * (0.15 + 0.70 * ((i * 0.37) % 1)));
          C.dropCurrent();
        }, i);
        await page.waitForTimeout(320);
      }
      await page.waitForTimeout(800);

      // Inject a populated profile + trigger game-over event
      await page.evaluate(() => {
        const C = window.__cosmic;
        C.meta.stardust = 1850;
        C.metaUnlock('theme_aurora'); // owned + auto-worn; rest stay buyable
        C.world.score = 12345; C.world.best = 12345;
        C.world.drops = 34; C.world.peakCombo = 5; C.world.topTier = 6;
        C.world.over = true;
        C.world.events.push({
          type: 'gameover', earned: 167, modified: false,
          drops: 34, peakCombo: 5, topTier: 6,
          daily: false, isNewDailyBest: false, dailyStreak: 0, streakBonus: 0,
        });
      });
      // Wait for drainEvents() to run (one rAF cycle is enough, 500ms is plenty)
      await page.waitForTimeout(500);
      const goVisible = await page.evaluate(() => !document.getElementById('gameover').classList.contains('hidden'));
      if (!goVisible) throw new Error('game-over overlay did not appear');
      await page.screenshot({ path: 'screenshots/gameover.png' });
      console.log('  wrote screenshots/gameover.png');
      // Open the Star Chart
      await page.click('#open-chart');
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'screenshots/starchart.png' });
      console.log('  wrote screenshots/starchart.png');
      await ctx.close();
    } catch (e) { console.log('  ui-overlay step skipped: ' + e.message); }

    // art-direction moodboard (desktop, full page)
    try {
      const ctx = await browser.newContext({ viewport: { width: 1120, height: 1400 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/docs/moodboard.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1500); // webfonts
      await page.screenshot({ path: 'screenshots/moodboard.png', fullPage: true });
      console.log('  wrote screenshots/moodboard.png');
      await ctx.close();
    } catch (e) { console.log('  moodboard step skipped: ' + e.message); }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
