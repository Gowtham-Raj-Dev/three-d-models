// run from anywhere: node tests/chase2.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; });
  const out = [];
  for (const [nm, st, d, n] of [['walk', 'patrol', 5, 40], ['chase', 'chase', 7, 30], ['chase2', 'chase', 7, 45]]) {
    const r = await p.evaluate(([st, d, n]) => {
      const k = __kolusu, E = k.E, P = k.P; k.teleport(12, 17.5, 0, 0); P.pitch = -0.08; P.torch = true;
      E.active = true; E.pos.set(12, 0, 17.5 - d); E.y = 0; E.lv = 0; E.state = st; E.path = null; E.catchArmed = false; if (st === 'chase') { E.lastSeen = { x: P.x, z: P.z, lv: 0 }; E.lastSeenT = k.G.time || 0; }
      const z0 = E.pos.z; k.step(n); const u = E.model.userData;
      return { state: E.state, moved: +(E.pos.z - z0).toFixed(2), anim: u.cur, ts: +(u.actions[u.cur].timeScale).toFixed(2), speed: +(E.speed || 0).toFixed(2), stride: u.stride };
    }, [st, d, n]);
    out.push(nm + ' ' + JSON.stringify(r));
    await p.waitForTimeout(400); await p.screenshot({ path: `shots/rb-${nm}.png`, timeout: 120000 });
  }
  console.log(out.join('\n'), '\nERR', errs.join('|') || 'none');
  await b.close();
})();
