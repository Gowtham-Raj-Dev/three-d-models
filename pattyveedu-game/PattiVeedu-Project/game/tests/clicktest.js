// run from anywhere: node tests/clicktest.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 727, height: 319 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(() => { const A = __kolusu.K.Audio, o = A.ui; window.__ui = []; A.ui = big => { __ui.push(big ? 'BIG' : 'ui'); return o(big); }; });
  const tap = async sel => { const el = await p.$(sel); if (!el) return sel + ':missing'; const vis = await el.isVisible(); if (!vis) return sel + ':hidden'; await el.tap(); await p.waitForTimeout(300); return sel; };
  const seq = [];
  seq.push(await tap('#btnHow')); seq.push(await tap('#menuHow [data-back]'));
  seq.push(await tap('#btnSettings')); seq.push(await tap('#menuSettings [data-cam="off"]')); seq.push(await tap('#menuSettings [data-cam="on"]'));
  seq.push(await tap('#btnCredits')); seq.push(await tap('#credBack'));
  seq.push(await tap('#menuSettings [data-back]'));
  seq.push(await tap('#langSeg button:not(.on), .tseg button'));
  seq.push(await tap('#btnPlay'));
  const r = await p.evaluate(() => ({ ui: __ui.slice(), ctx: __kolusu.K.Audio.ctxReady && __kolusu.K.Audio.ctxReady() }));
  console.log(seq.join(' | '));
  console.log('ui calls', JSON.stringify(r));
  console.log('ERR', errs.length ? errs : 'none');
  await b.close();
})();
