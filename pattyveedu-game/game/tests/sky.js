// run: node tests/sky.js [?query] — outdoor views (sky, moon, tree line, yard trees): shots/sky-<n>.png
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
let pw; try { pw = require('playwright'); } catch (e) { pw = require('./node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core'); }
(async () => {
  const b = await pw.chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext(process.env.MOBILE ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 640 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 300)); });
  await p.goto(GAME + (process.argv[2] || (process.env.MOBILE ? '' : '?desk')));
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 170000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; k.noEnemy(true); });
  const spots = await p.evaluate(() => { const W = __kolusu.W, out = []; for (let x = -4; x < 50; x += 3) for (let z = -10; z < 32; z += 3) if (W.isOutside(x, z, 0) && !(x > 9 && x < 15 && z > 8 && z < 12)) out.push([x, z, (W.roomAt(x, z, 0) || {}).name]); return out; });
  console.log('outside spots', spots.length, JSON.stringify(spots.slice(0, 40)));
  const views = JSON.parse(process.env.VIEWS || '[[9.4,2.4,3.14,0.12],[9.4,2.4,3.14,1.0],[9.4,2.4,0.8,0.15],[9.4,2.4,-0.8,0.5]]');
  let n = 0;
  for (const [x, z, yaw, pitch] of views) {
    await p.evaluate(([x, z, yaw, pitch]) => { const k = __kolusu; k.teleport(x, z, yaw, 0); k.P.pitch = pitch; k.P.torch = false; k.step(2); }, [x, z, yaw, pitch]);
    await p.waitForTimeout(1200); await p.screenshot({ path: `shots/sky-${n++}.png`, timeout: 120000 });
  }
  console.log('ERR', errs.join(' | ') || 'none');
  await b.close();
})();

