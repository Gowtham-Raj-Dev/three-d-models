// run from anywhere: node tests/lobby3.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 727, height: 319 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.waitForTimeout(3000);
  const st = async (fn, n, wait = 900) => { await p.evaluate(fn); await p.waitForTimeout(wait); await p.screenshot({ path: `shots/lob-${n}.png`, timeout: 120000 }); };
  await st(() => { const L = __kolusu.G._lobby; L.stage = 0; L.next = 99; L.flick = 0; L.intro = 0; }, 'far');
  await st(() => { const L = __kolusu.G._lobby; L.stage = 2; L.next = 99; }, 'mid');
  await st(() => { const L = __kolusu.G._lobby; L.stage = 4; L.next = 99; }, 'near');
  await st(() => { const L = __kolusu.G._lobby; L.stage = 4; L.next = 0.01; L.flick = 0; }, 'dark', 250);
  await st(() => { const L = __kolusu.G._lobby; L.flick = 0; L.scare = 0.55; __kolusu.E.grabPose(); }, 'scare', 300);
  // a tap on a menu item: the click sound path must not throw
  await p.evaluate(() => { const b = document.getElementById('btnHow'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  console.log('ERR', errs.join('|') || 'none'); await b.close();
})();
