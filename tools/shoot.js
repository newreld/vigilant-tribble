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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync('screenshots', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const v of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(3000); // fonts + boot + sprite bake (extra buffer)
      // play: drop a series of pieces across the field so the board isn't empty
      try {
        // wait for the game canvas to be present and interactive
        await page.waitForSelector('#game', { state: 'visible', timeout: 5000 });
        const box = await (await page.$('#game')).boundingBox();
        if (!box || box.width === 0) throw new Error('game canvas has no bounding box');
        console.log(`  ${v.name}: game canvas at x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.width.toFixed(0)} h=${box.height.toFixed(0)}`);
        for (let i = 0; i < 18; i++) {
          const x = box.x + box.width * (0.18 + 0.64 * ((i * 0.37) % 1));
          const y = box.y + 40;
          await page.mouse.move(x, y);
          await page.mouse.down(); await page.mouse.up();
          await page.waitForTimeout(480);
        }
        // verify drops landed (score or bodies)
        const score = await page.evaluate(() => window.__cosmic && window.__cosmic.world.score);
        const bodies = await page.evaluate(() => window.__cosmic && window.__cosmic.world.bodies.length);
        console.log(`  ${v.name}: score=${score} bodies=${bodies}`);
      } catch (e) { console.log('  play step skipped: ' + e.message); }
      await page.waitForTimeout(2000);
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
      // verify the game booted
      const booted = await page.evaluate(() => !!window.__cosmic);
      if (!booted) throw new Error('window.__cosmic not available after boot');
      // populate a profile + trigger game over (injecting all event fields v0.8 expects)
      await page.evaluate(() => {
        const C = window.__cosmic;
        C.meta.stardust = 1850;
        C.metaUnlock('theme_aurora'); // owned + auto-worn; rest stay buyable
        C.world.score = 12345;
        C.world.drops = 34;
        C.world.peakCombo = 5;
        C.world.topTier = 6; // Star
        C.world.events.push({
          type: 'gameover', earned: 167, modified: false,
          drops: 34, peakCombo: 5, topTier: 6,
        });
        C.world.over = true;
      });
      await page.waitForTimeout(500);
      // confirm game-over overlay appeared
      const goVisible = await page.evaluate(() => !document.getElementById('gameover').classList.contains('hidden'));
      if (!goVisible) throw new Error('game-over overlay did not appear');
      await page.screenshot({ path: 'screenshots/gameover.png' });
      console.log('  wrote screenshots/gameover.png');
      // open the Star Chart from the game-over card
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
