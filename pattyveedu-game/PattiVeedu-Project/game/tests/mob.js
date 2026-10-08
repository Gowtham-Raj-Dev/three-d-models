// run from anywhere: node tests/mob.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
// every screen on the user's phone size (727x319 css, dpr 2.75)
const { chromium } = require('playwright');
(async () => {
  const W = +(process.argv[2] || 727), H = +(process.argv[3] || 319), tag = process.argv[4] || 'm', lang = process.argv[5] || 'ta';
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(l => __kolusu.K.setLang(l), lang);
  await p.waitForTimeout(2500);
  const snap = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `shots/${tag}-${lang}-${n}.png`, timeout: 120000 }); };
  const over = () => p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false; const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; const st = getComputedStyle(e); if (st.visibility === 'hidden') return false; return (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) && !e.closest('#menuGrain,#menuWhisper,#touchLayer,svg,.drips') && st.position !== 'fixed'; }).slice(0, 8).map(e => (e.id || e.className || e.tagName) + ' ' + JSON.stringify(e.getBoundingClientRect()).slice(0, 80)));
  const scrollers = () => p.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.offsetParent).map(e => (e.id || e.className) + ` ${e.clientHeight}/${e.scrollHeight}`));
  await snap('menu'); console.log('menu over', await over(), 'scroll', await scrollers());
  await p.evaluate(() => document.getElementById('btnHow').click()); await snap('how'); console.log('how scroll', await scrollers());
  await p.evaluate(() => { document.querySelector('#menuHow [data-back]').click(); document.getElementById('btnSettings').click(); }); await snap('settings'); console.log('settings scroll', await scrollers());
  await p.evaluate(() => document.getElementById('btnCredits').click()); await snap('credits'); console.log('credits scroll', await scrollers());
  await p.evaluate(() => { document.getElementById('credBack').click(); document.querySelector('#menuSettings [data-back]').click(); const k = __kolusu; k.noEnemy(true); k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.toast(k.K.t('t_start'), 9); });
  await snap('hud'); console.log('hud over', await over());
  await p.evaluate(() => { __kolusu.renderer.render = () => {}; __kolusu.K.Game.pause(); }); await snap('pause'); console.log('pause scroll', await scrollers());
  await p.evaluate(() => { document.getElementById('pResume').click(); __kolusu.K.Game.journal(); }); await snap('journal'); console.log('journal scroll', await scrollers());
  await p.evaluate(() => { const k = __kolusu; document.getElementById('journal').hidden = true; k.G.overlay = null; const P = k.P; k.teleport(29.3, 3.95, 0, 1); P.y = 1.62; const aim = [30.1, 4.76, 3.95], ey = P.feet + P.y, dx = aim[0] - P.x, dz = aim[2] - P.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(aim[1] - ey, Math.hypot(dx, dz)); k.camera.position.set(P.x, ey, P.z); k.camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); k.camera.updateMatrixWorld(true); k.findTarget(); k.interact(); }); await snap('note'); console.log('note scroll', await scrollers(), 'ov', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => { const k = __kolusu; document.getElementById('note').hidden = true; k.G.overlay = null; k.K.Game.pause(); document.querySelector('#pause .ctlOpen').click(); }); await snap('controls'); console.log('ov', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => { const b = document.getElementById('ctlBtn'); b.value = 1.3; b.oninput(); const a = document.getElementById('ctlAlpha'); a.value = 0.6; a.oninput(); document.querySelector('.handSeg button[data-hand="l"]').click(); }); await snap('controls2');
  await p.evaluate(() => { document.getElementById('ctlReset').click(); document.getElementById('ctlDone').click(); }); console.log('after done ov', await p.evaluate(() => __kolusu.G.overlay));
  console.log('ERR', errs.join(' | ') || 'none');
  await b.close();
})();
