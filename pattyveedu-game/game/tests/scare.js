// run from anywhere: node tests/scare.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; k.teleport(12, 15.5, 0, 0); k.E.pos.x = 12; k.E.pos.z = 14; k.E.y = 0; k.E.lv = 0; k.G.caught(); });
  for (const ms of [300, 900]) { await p.waitForTimeout(ms); await p.screenshot({ path: `shots/scare-${ms}.png`, timeout: 120000 }); }
  console.log('state', await p.evaluate(() => __kolusu.G.state), 'ERR', errs.join('|') || 'none');
  await b.close();
})();
