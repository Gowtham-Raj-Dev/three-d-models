// run from anywhere: node tests/ko2.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  const out = [];
  out.push(await p.evaluate(() => { const k = __kolusu, E = k.E; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62;
    k.teleport(12, 17.5, 0, 0); k.P.pitch = -0.3; E.active = true; E.pos.set(12, 0, 15.6); E.y = 0; E.lv = 0; E.state = 'patrol'; E.catchArmed = false;
    E.knockout(20); k.step(90); return E.state + ' tilt ' + E.model.userData.tilt.toFixed(2) + ' rotX ' + E.model.rotation.x.toFixed(2); }));
  await p.waitForTimeout(500); await p.screenshot({ path: 'shots/rb-ko.png', timeout: 120000 });
  out.push(await p.evaluate(() => { const k = __kolusu, E = k.E; k.step(60 * 21); return E.state + ' getup ' + (E.getup || 0).toFixed(2) + ' tilt ' + E.model.userData.tilt.toFixed(2); }));
  out.push(await p.evaluate(() => { const k = __kolusu, E = k.E; k.step(60 * 3); return E.state + ' tilt ' + E.model.userData.tilt.toFixed(2); }));
  console.log(out.join('\n'), '\nERR', errs.join('|') || 'none');
  await b.close();
})();
