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
      await page.waitForTimeout(2000); // fonts + boot + sprite bake
      // play: drop a series of pieces across the field so the board isn't empty
      try {
        const box = await (await page.$('#game')).boundingBox();
        for (let i = 0; i < 16; i++) {
          const x = box.x + box.width * (0.18 + 0.64 * ((i * 0.37) % 1));
          const y = box.y + 36;
          await page.mouse.move(x, y);
          await page.mouse.down(); await page.mouse.up();
          await page.waitForTimeout(430);
        }
      } catch (e) { console.log('  play step skipped: ' + e.message); }
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `screenshots/${v.name}.png` });
      console.log('  wrote screenshots/' + v.name + '.png');
      await ctx.close();
    }
    // UI overlays: game-over card + Star Chart (driven via the exposed core)
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      // populate a profile: some stardust, one cosmetic owned (auto-worn)
      await page.evaluate(() => {
        const C = window.__cosmic;
        C.meta.stardust = 1850;
        C.metaUnlock('theme_aurora'); // owned + auto-worn; rest stay buyable
        C.world.score = 12345;
        C.world.events.push({ type: 'gameover', earned: 167, modified: false });
        C.world.over = true;
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'screenshots/gameover.png' });
      console.log('  wrote screenshots/gameover.png');
      // open the Star Chart from the game-over card
      await page.click('#open-chart');
      await page.waitForTimeout(400);
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
