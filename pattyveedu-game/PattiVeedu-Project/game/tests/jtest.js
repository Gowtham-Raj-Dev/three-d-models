// run from anywhere: node tests/jtest.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const errs = [];
  for (const [W, H, dpr, tag, lang] of [[727, 319, 2.75, 'phone', 'ta'], [1280, 720, 1, 'desk', 'en']]) {
    const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: tag === 'phone', hasTouch: tag === 'phone' })).newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(GAME + '' + (tag === 'desk' ? '?desk' : ''));
    await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
    await p.evaluate(l => { const k = __kolusu; k.K.setLang(l); k.noEnemy(true); k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.renderer.render = () => {};
      for (const id of ['well', 'lamps', 'clock', 'valli', 'search', 'night', 'cradle', 'chart', 'ledger', 'portraits', 'valliroom', 'tankbox', 'safeletter']) k.G.notes.add(id); k.G.found[1] = true; }, lang);
    const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `shots/j-${tag}-${n}.png`, timeout: 120000 }); };
    await p.evaluate(() => __kolusu.K.Game.journal()); await shot('diary');
    const info = await p.evaluate(() => { document.querySelector('.jtabs [data-jt="letters"]').click(); return 1; }); await shot('letters');
    const r1 = await p.evaluate(() => ({ items: document.querySelectorAll('#noteList .jitem').length, lpager: !document.getElementById('jlPager').hidden, lpage: document.getElementById('jlPage').textContent, rpage: document.getElementById('jrPage').textContent, rpager: !document.getElementById('jrPager').hidden, scroll: [...document.querySelectorAll('#journal *')].filter(e => e.scrollHeight > e.clientHeight + 2 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)).map(e => e.id || e.className) }));
    await p.evaluate(() => { const items = [...document.querySelectorAll('#noteList .jitem')]; const it = items.find(x => /ledger|கணக்கு/i.test(x.textContent)); if (it) it.click(); else { document.getElementById('jlPrev').click(); const it2 = [...document.querySelectorAll('#noteList .jitem')].find(x => /ledger|கணக்கு/i.test(x.textContent)); it2 && it2.click(); } }); await shot('letter-long');
    const r2 = await p.evaluate(() => ({ rpage: document.getElementById('jrPage').textContent, rpager: !document.getElementById('jrPager').hidden }));
    await p.evaluate(() => { if (!document.getElementById('jrNext').disabled) document.getElementById('jrNext').click(); }); await shot('letter-p2');
    await p.evaluate(() => document.querySelector('.jtabs [data-jt="map"]').click()); await shot('map');
    await p.evaluate(() => { document.getElementById('jClose').click(); __kolusu.G.overlay = null; }); 
    // the pick-up reading popup with the longest letter
    const r3 = await p.evaluate(() => { const k = __kolusu; let best = null, len = 0; for (const id of ['safeletter', 'ledger', 'valliroom', 'night', 'search', 'valli', 'cradle']) { const l = k.K.t('note_' + id).length; if (l > len) { len = l; best = id; } } k.K.Game._openNote(best); return { best, len, pages: document.getElementById('notePage').textContent, pager: !document.getElementById('notePager').hidden }; });
    await shot('note');
    console.log(tag, JSON.stringify(r1), JSON.stringify(r2), JSON.stringify(r3));
    await p.close();
  }
  console.log('ERR', errs.join('|') || 'none'); await b.close();
})();
