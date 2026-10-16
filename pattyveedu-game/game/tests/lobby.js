// run: node tests/lobby.js [?query] — desktop-size screenshots of the main menu / lobby over time: shots/lobby-<seconds>.png
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
let pw; try { pw = require('playwright'); } catch (e) { pw = require('./node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core'); }
(async () => {
  const b = await pw.chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext(process.env.MOBILE ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 640 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + (process.argv[2] || (process.env.MOBILE ? '' : '?desk')));
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 170000 });
  await p.evaluate(() => { __kolusu.G._lobby.intro = 0; __kolusu.G._lobby.next = 999; });
  const t0 = Date.now();
  for (const s of [1, 4, 8, 13, 20]) {
    await p.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
    await p.screenshot({ path: `shots/lobby-${s}.png`, timeout: 120000 });
    console.log(s, JSON.stringify(await p.evaluate(() => { const L = __kolusu.G._lobby; return { stage: L.stage, dim: L.dim, ex: +L.ex.toFixed(2), scare: L.scare, intro: +L.intro.toFixed(1) }; })));
  }
  console.log('ERR', errs.join('|') || 'none');
  await b.close();
})();

