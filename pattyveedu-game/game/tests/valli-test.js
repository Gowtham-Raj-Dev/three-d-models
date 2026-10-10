// run from anywhere: node tests/valli-test.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || /Valli/.test(m.text())) errs.push(m.text()); });
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  console.log('valli ready', await p.evaluate(() => __kolusu.K.Valli.ready));
  await p.evaluate(() => { const k = __kolusu; k.noEnemy(true); k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; });
  for (const [nm, dist, pitch, torch] of [['near', 1.1, -0.38, true], ['far', 4.5, -0.1, true], ['dark', 3.0, -0.12, false]]) {
    await p.evaluate(([dist, pitch, torch]) => { const k = __kolusu, V = k.K.Valli; k.teleport(12, 15.5, 0, 0); k.P.pitch = pitch; k.P.torch = torch; k.camera.position.set(12, 1.62, 15.5);
      V.show(12, 0, 15.5 - dist, { x: 12, z: 15.5 }); V.setOpacity(1); for (let i = 0; i < 20; i++) V.update(1 / 30, k.camera.position); window.__v = setInterval(() => V.setOpacity(1), 50); }, [dist, pitch, torch]);
    await p.waitForTimeout(700); await p.screenshot({ path: `shots/valli-${nm}.png`, timeout: 120000 });
    await p.evaluate(() => clearInterval(window.__v));
  }
  const r = await p.evaluate(() => { const k = __kolusu; k.K.Valli.hide(); for (const [x, z, yaw] of [[12, 17, 0], [12, 3, Math.PI], [7.4, 12, 0], [12, 15.5, Math.PI / 2], [12, 15.5, -Math.PI / 2]]) { k.teleport(x, z, yaw, 0); k.P.pitch = -0.05; k.P.torch = true; if (k.ghost()) return [x, z, yaw]; } return false; });
  await p.waitForTimeout(600); await p.screenshot({ path: 'shots/valli-spawn.png', timeout: 120000 }); const vis = await p.evaluate(() => [__kolusu.K.Valli.group.visible, __kolusu.K.Valli.group.userData.mats[0].opacity.toFixed(2)]); console.log('vis', JSON.stringify(vis)); await p.waitForTimeout(6000); console.log('after', JSON.stringify(await p.evaluate(() => [__kolusu.K.Valli.group.visible]))); 
  console.log('spawn', r, 'ERR', errs.join('|') || 'none');
  await b.close();
})();
