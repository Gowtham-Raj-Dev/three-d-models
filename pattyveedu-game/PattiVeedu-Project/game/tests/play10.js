// run from anywhere: node tests/play10.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  p.on('console', m => { if ((m.type() === 'error' || m.type()==='warning') && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('kolusu.gfx2', JSON.stringify('low')); } catch(e){} });
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(() => __kolusu.K.setLang('en'));
  await p.evaluate(() => { __kolusu.noEnemy(true); __kolusu.start(); __kolusu.G.state='play'; __kolusu.G.timers.length=0; document.getElementById('card').hidden=true; const f=document.getElementById('fade'); f.style.transition='none'; f.style.opacity=0; __kolusu.P.wake=0; __kolusu.P.y=1.62; });
  const run = await p.evaluate(() => __kolusu.G.run);
  console.log('run', JSON.stringify(run));
  async function act(label, stand, aim, lv = 0) {
    const r = await p.evaluate(([stand, aim, lv]) => {
      const k = __kolusu, P = k.P; P.hidden=false; k.teleport(stand[0], stand[1], undefined, lv); P.crouch=false; P.y = 1.62; P.wake=0;
      const ey = P.feet + P.y, dx = aim[0]-P.x, dz = aim[2]-P.z, h = Math.hypot(dx,dz);
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(aim[1]-ey, h);
      k.camera.position.set(P.x, ey, P.z); k.camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); k.camera.updateMatrixWorld(true);
      k.findTarget(); const t = k.target();
      const desc = t ? (t.kind + (t.item ? ':'+t.item.id : '') + (t.door ? ':'+t.door.id : '') + (t.lamp ? ':'+t.lamp.sym : '') + (t.pos? ':'+t.pos : '')) : 'NONE';
      if (t) k.interact();
      return { desc, held: P.held, toast: document.getElementById('toast').innerText };
    }, [stand, aim, lv]);
    console.log(label.padEnd(18), '->', r.desc.padEnd(16), '| held:', String(r.held).padEnd(10), '|', r.toast.slice(0,100));
    return r;
  }
  async function walk(label, start, yaw, lv, secs) {
    const r = await p.evaluate(([start, yaw, lv, secs]) => {
      const k = __kolusu, P = k.P; P.hidden=false; k.teleport(start[0], start[1], yaw, lv); P.pitch = 0; P.vx = P.vz = 0;
      k.K.Touch.x = 0; k.K.Touch.y = 1; k.K.Touch.run = false; const trace = [];
      for (let i = 0; i < secs * 60; i++) { k.step(1, 1/60); if (i % 30 === 0) trace.push(`${P.x.toFixed(1)},${P.z.toFixed(1)},y${P.feet.toFixed(2)},L${P.lv}`); }
      k.K.Touch.y = 0;
      return { x: P.x, z: P.z, lv: P.lv, feet: P.feet, trace: trace.join(' ') };
    }, [start, yaw, lv, secs]);
    console.log(label.padEnd(18), `-> end ${r.x.toFixed(2)},${r.z.toFixed(2)} lv ${r.lv} feet ${r.feet.toFixed(2)}`);
    console.log('   ', r.trace);
    return r;
  }
  const frames = ms => p.waitForTimeout(ms);
  async function closeOverlay(){ await p.keyboard.press('Escape'); await frames(200); }
  const shot = async (n) => { await frames(900); await p.screenshot({ path: `shots/v10-${n}.png`, timeout: 120000 }); };

  await act('intro note', [12.5, 2.1], [12.5, 0.58, 2.95]); await closeOverlay();
  await act('clock page', [22.6, 2.72], [23.52, 0.83, 2.72]); await closeOverlay();
  await act('clock (open)', [17.65, 18.4], [17.65, 1.2, 19.45]);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => { const k=__kolusu; k.clockSet(k.G.run.clockStart.h, k.G.run.clockStart.m); k.clockTry(); });
  console.log('wrong try msg:', await p.evaluate(() => document.getElementById('ckMsg').innerText), '| overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => { const k=__kolusu, c=k.G.run.clock; k.clockSet(c.h, c.m); k.clockTry(); });
  console.log('clock running', await p.evaluate(() => __kolusu.W.clock.running), '| overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => __kolusu.step(90, 1/60));
  await act('small key', [17.65, 18.5], [17.65, 0.3, 19.52]);
  await act('guest door', [17.1, 17], [18, 1.1, 17]);
  await act('bucket', [19.05, 18.4], [19.05, 0.15, 19.35]);
  await act('well', [12, 8.45], [12, 0.6, 10]);
  await p.evaluate(() => __kolusu.step(260, 1/60));
  await act('brass key', [12, 8.35], [12, 0.93, 9.05]);
  await act('main: padlock', [12, 19.0], [12, 1.0, 19.88]);
  await act('kolusu', [12.4, 8.2], [12.4, 0.93, 9.12]);
  await act('cradle', [23.0, 3.2], [23.0, 1.15, 4.4]);
  console.log('kolusuHome', await p.evaluate(() => __kolusu.G.flags.kolusuHome));
  await p.evaluate(() => { __kolusu.ring(); }); await p.evaluate(() => __kolusu.step(30, 1/60));
  await act('phone', [16.75, 18.5], [16.75, 0.9, 19.55]); await frames(900);
  console.log('call:', await p.evaluate(() => document.getElementById('toast').innerText));
  await act('note cradle', [7.2, 16.15], [6.45, 0.47, 16.15]); await closeOverlay();
  // ---- new: walk out the kitchen back door into the backyard
  await act('back door', [6.5, 0.9], [6.5, 1.1, 0]);
  await p.evaluate(() => __kolusu.step(60, 1/60));
  await walk('to backyard', [6.5, 1.2], 0, 0, 2.2);
  await act('note night', [16.1, -8.5], [16.1, 0.52, -9.45]); await closeOverlay();
  await act('matchbox', [17.95, -8.7], [17.95, 1.05, -9.7]);
  await p.evaluate(() => { __kolusu.teleport(12, -4, Math.PI * 0.85, 0); __kolusu.P.pitch = 0.05; }); await shot('backyard');
  // ---- roof stair up to the terrace
  await walk('stair up (roof)', [12.8, -0.75], -Math.PI / 2, 0, 5.5);
  await walk('terrace walk', [21.6, -0.75], Math.PI, 1, 2.0);
  await act('clue 2 tank', [17.9, 3.2], [19.02, 5.05, 3.2], 1);
  await act('troom door', [2.7, 14.2], [2.7, 5.1, 15], 1);
  await p.evaluate(() => __kolusu.step(60, 1/60));
  await act('note valli', [4.35, 18.0], [4.35, 4.52, 19.0], 1); await closeOverlay();
  await p.evaluate(() => __kolusu.step(60, 1/60));
  await act('oosi2', [3.3, 16.0], [4.3, 4.63, 16.0], 1);
  await p.evaluate(() => { __kolusu.teleport(10, 6, Math.PI * 0.75, 1); __kolusu.P.pitch = -0.1; }); await shot('terrace');
  await act('drop oosi', [3.3, 16.0], [3.3, 4.2, 17], 1);
  await p.evaluate(() => { const k=__kolusu; if (k.P.held) { k.K.Game.drop(); } });
  await walk('stair down (roof)', [21.3, -0.75], Math.PI / 2, 1, 5.5);
  // ---- lamps
  await act('lamps note', [22.6, 8.75], [23.45, 0.8, 8.75]); await closeOverlay();
  await p.evaluate(() => { const k=__kolusu; k.give('matchbox'); });
  const L = { sun:[12,7.35,[12,6.6]], moon:[15.65,10,[16.5,10]], star:[12,12.65,[12,13.4]], lotus:[8.35,10,[7.5,10]] };
  for (const s of run.order) { const [x,z,st] = L[s]; await act('lamp '+s, st, [x, 0.9, z]); }
  await p.evaluate(() => { const k=__kolusu; const ts = k.G.timers.splice(0); ts.forEach(t => t.fn()); }); await frames(200);
  console.log('pooja door locked?', await p.evaluate(() => __kolusu.W.doorById.pooja.locked));
  await act('almirah key', [16.5, 2.3], [16.5, 0.38, 1.35]);
  await act('clue 4 kolam', [16.5, 4.7], [16.5, 0.01, 3.4]);
  await act('bath almirah', [1.6, 16.2], [0.7, 1.0, 16.2]);
  await p.evaluate(() => __kolusu.step(120, 1/60));
  await act('bolt cutter', [1.5, 16.2], [0.38, 0.985, 16.2]);
  await act('main: chain', [12, 19.0], [12, 1.4, 19.88]);
  await act('pallanguzhi', [8.2, 15.5], [8.2, 0.16, 14.55]);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => { const k=__kolusu; k.pallSet(k.W.pall.syms.map(sy => k.G.run.order.indexOf(sy) + 1)); k.pallTry(); });
  console.log('pall open', await p.evaluate(() => __kolusu.W.pall.target), '| overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.waitForFunction(() => __kolusu.W.pall.open >= 1, { timeout: 60000 });
  await act('clue 1 drawer', [8.2, 15.55], [8.2, 0.06, 14.8]);
  // ---- basement
  await walk('stair down (base)', [0.9, 6.4], Math.PI, 0, 4.5);
  await act('clue 3 cellar', [4.6, 9.3], [5.885, -0.9, 9.3], -1);
  await act('note search', [2.55, 12.6], [2.55, -2.48, 13.55], -1); await closeOverlay();
  await act('oosi1', [3.55, 8.3], [3.55, -2.24, 7.1], -1);
  await p.evaluate(() => { __kolusu.teleport(1.6, 13.4, Math.PI * -0.85 + Math.PI, -1); __kolusu.P.pitch = -0.12; }); await shot('cellar');
  await walk('stair up (base)', [0.9, 13.3], 0, -1, 4.5);
  console.log('found', JSON.stringify(await p.evaluate(() => __kolusu.G.found)));

  // ================= the second wing =================
  const T4 = 4.0;
  const ff = async (n = 60) => { await p.evaluate(n => { const k = __kolusu; for (let r = 0; r < 3; r++) { const ts = k.G.timers.splice(0); ts.forEach(t => t.fn()); } k.step(n, 1/60); }, n); await frames(150); };
  await ff(90);
  await act('wing key', [8.25, 15.55], [8.25, 0.06, 14.73]);
  await act('wing door', [23.0, 10], [24, 1.1, 10]);
  await ff(80);
  await walk('into passage', [23.0, 10], -Math.PI / 2, 0, 1.2);
  await act('sewing door', [41.2, 10], [42, 1.1, 10]); await ff(80);
  await act('oosi3', [44.3, 6.6], [44.85, 0.8, 7.2]);
  await act('drop', [44.3, 6.6], [44.3, 0.1, 6.0]); await p.evaluate(() => { if (__kolusu.P.held) __kolusu.K.Game.drop(); });
  await act('sickle', [42.6, 6.4], [42.55, 0.52, 5.5]);
  await act('granary rope', [26, 5.9], [26, 1.1, 5]); await ff(80);
  await act('fuse1', [28.3, 4.1], [28.75, 1.36, 4.82]);
  await act('fusebox +1', [25.0, 16.4], [24.16, 1.65, 16.4]);
  await act('fusebox look', [25.0, 16.4], [24.16, 1.65, 16.4]);
  await act('office door', [35, 5.9], [35, 1.1, 5]); await ff(80);
  await act('chart', [32.2, 2.6], [31.13, 1.65, 2.6]); await closeOverlay();
  await act('safe (no knob)', [37.3, 1.3], [38.17, 0.8, 1.3]);
  await act('scale', [32.0, 3.3], [32.0, 0.95, 4.2]);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay), 'sack', run.sack);
  { const want = []; let r = run.sack; [16, 8, 4, 2, 1].forEach(v => { if (r >= v) { want.push(v); r -= v; } });
    await p.evaluate(() => document.querySelector('#scWeights button:nth-child(5)').click()); await frames(200);
    console.log('  after 16:', await p.evaluate(() => document.getElementById('scMsg').innerText));
    await p.evaluate(() => document.querySelector('#scWeights button:nth-child(5)').click()); await frames(100);
    for (const v of want) await p.evaluate(v => { const i = [1, 2, 4, 8, 16].indexOf(v); document.querySelectorAll('#scWeights button')[i].click(); }, v);
    await frames(300); console.log('  scale msg:', await p.evaluate(() => document.getElementById('scMsg').innerText));
    await p.screenshot({ path: 'shots/v10-scale.png', timeout: 120000 });
  }
  await ff(120);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay), 'drawer', await p.evaluate(() => __kolusu.W.wing.drawerK));
  await act('safe knob', [32.0, 3.25], [32.0, 0.72, 4.03]);
  await act('fit knob', [37.3, 1.3], [38.17, 0.8, 1.3]);
  await act('safe code', [37.3, 1.3], [38.17, 0.8, 1.3]);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay), 'title', await p.evaluate(() => document.getElementById('kpTitle').innerText));
  await p.keyboard.type('1999'); await p.keyboard.press('Enter'); await frames(200);
  console.log('  wrong:', await p.evaluate(() => document.getElementById('kpMsg').innerText));
  await p.keyboard.type(String(run.years.valli)); await p.keyboard.press('Enter'); await frames(300);
  console.log('safe open', await p.evaluate(() => __kolusu.W.wing.safeT));
  await ff(150); console.log('overlay', await p.evaluate(() => __kolusu.G.overlay)); await closeOverlay();
  await act('big key', [37.4, 1.3], [38.55, 0.76, 1.3]);
  await act('drop bigkey', [37.4, 1.3], [37.4, 0.1, 2]); await p.evaluate(() => { if (__kolusu.P.held) __kolusu.K.Game.drop(); });
  // upstairs by the new staircase
  await walk('stairs up (wing)', [25.9, 19.2], -Math.PI / 2, 0, 5.5);
  await act('thatha door', [26, 5.9], [26, T4 + 1.1, 5], 1); await ff(80);
  await act('ledger', [29.3, 3.95], [30.1, T4 + 0.76, 3.95], 1); await closeOverlay();
  await act('library door', [41.2, 10], [42, T4 + 1.1, 10], 1); await ff(80);
  await act('note portraits', [43.8, 11.0], [43.85, T4 + 0.76, 10.1], 1); await closeOverlay();
  await act('portraits', [33.5, 17.6], [34.885, T4 + 1.85, 17.6], 1);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay), 'order', await p.evaluate(() => __kolusu.W.wing.por.join(',')), JSON.stringify(run.years));
  await p.evaluate(() => document.getElementById('poHang').click()); await frames(200);
  console.log('  wrong msg:', await p.evaluate(() => document.getElementById('poMsg').innerText));
  // selection-sort by clicking cards
  for (let i = 0; i < 4; i++) {
    const j = await p.evaluate(i => { const k = __kolusu, y = k.G.run.years, por = k.W.wing.por; let m = i; for (let q = i + 1; q < 4; q++) if (y[por[q]] < y[por[m]]) m = q; return m; }, i);
    if (j !== i) { await p.evaluate(([i, j]) => { document.querySelectorAll('#poRow button')[i].click(); document.querySelectorAll('#poRow button')[j].click(); }, [i, j]); await frames(100); }
  }
  await p.screenshot({ path: 'shots/v10-portraits.png', timeout: 120000 });
  await p.evaluate(() => document.getElementById('poHang').click()); await frames(300);
  console.log('por done', await p.evaluate(() => __kolusu.W.wing.porDone)); await ff(100);
  await act('fuse2', [34.0, 17.62], [34.78, T4 + 0.76, 17.62], 1);
  await walk('stairs down (wing)', [31.9, 19.2], Math.PI / 2, 1, 5.5);
  await act('fusebox +2', [25.0, 16.4], [24.16, 1.65, 16.4]);
  await p.evaluate(() => __kolusu.teleport(30, 13, 0, 1));
  await act('valli door', [34.5, 5.9], [34.5, T4 + 1.1, 5], 1);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.evaluate(() => document.getElementById('ltTry').click()); await frames(150);
  console.log('  wrong:', await p.evaluate(() => document.getElementById('ltMsg').innerText));
  await p.evaluate(() => { const k = __kolusu, L = k.W.LETTERS; const want = ['வ', 'ள்', 'ளி']; want.forEach((w, i) => { while (L[k.W.wing.letters[i]] !== w) document.querySelectorAll('#ltWheels .wheel')[i].querySelector('button:last-child').click(); }); });
  await p.screenshot({ path: 'shots/v10-letters.png', timeout: 120000 });
  await p.evaluate(() => document.getElementById('ltTry').click()); await ff(100);
  console.log('valli locked', await p.evaluate(() => __kolusu.W.doorById.valli.locked));
  await act('valli note', [33.6, 3.5], [33.6, T4 + 0.51, 4.3], 1); await closeOverlay();
  await act('fuse3', [32.1, 1.4], [32.1, T4 + 0.43, 0.5], 1);
  await p.evaluate(() => __kolusu.teleport(25.0, 16.4, 0, 0));
  await act('fusebox +3', [25.0, 16.4], [24.16, 1.65, 16.4]);
  await act('main switch', [25.0, 16.4], [24.16, 1.65, 16.4]);
  await ff(200);
  await p.evaluate(() => { __kolusu.teleport(29.2, 13.8, -0.988, 0); __kolusu.P.pitch = -0.1; }); await shot('power');
  await act('radio', [44.6, 16.2], [45.5, T4 + 0.78, 16.2], 1);
  await act('radio off', [44.6, 16.2], [45.5, T4 + 0.78, 16.2], 1);
  await act('wash door', [40.5, 5.9], [40.5, 1.1, 5]); await ff(80);
  await act('tank (dry)', [37.9, 8.65], [37.9, 0.9, 10]);
  await act('motor', [39.7, 3.5], [39.7, 0.3, 4.4]);
  await ff(60); await act('tank filling', [37.9, 8.65], [37.9, 0.9, 10]);
  await ff(700);
  console.log('tank full', await p.evaluate(() => __kolusu.W.wing.tankFull));
  await act('tank box', [37.9, 8.65], [37.9, 0.9, 10]); await ff(60); await closeOverlay();
  await act('kolusu2', [37.55, 8.65], [37.55, 1.06, 9.37]);
  await p.evaluate(() => { __kolusu.teleport(36.5, 8.6, -0.6, 0); __kolusu.P.pitch = -0.35; }); await shot('tank');
  await act('cradle 2', [23.0, 3.2], [23.0, 1.15, 4.4]);
  console.log('kolusuHome', await p.evaluate(() => __kolusu.G.flags.kolusuHome), 'N', await p.evaluate(() => __kolusu.G.flags.kolusuN));
  // terrace bolt from both sides
  await act('bolt (terrace side)', [23.2, 10], [24, T4 + 1.1, 10], 1);
  await act('bolt (wing side)', [24.8, 10], [24, T4 + 1.1, 10], 1);
  await act('big key again', [37.4, 1.3], [37.4, 0.05, 2]);
  console.log('held', await p.evaluate(() => __kolusu.P.held));
  await act('main: crossbar', [12, 19.0], [12, 0.72, 19.85]);
  await ff(120);
  await p.evaluate(() => { __kolusu.teleport(12, 17.8, 0, 0); __kolusu.P.pitch = -0.15; }); await shot('crossbar');
  // save / restore round trip
  await p.evaluate(() => __kolusu.save());
  console.log('save bytes', await p.evaluate(() => (localStorage.getItem('kolusu.save1') || '').length));
  await act('main: numlock', [12, 19.0], [12.3, 1.8, 19.88]);
  console.log('overlay', await p.evaluate(() => __kolusu.G.overlay));
  await p.keyboard.type(run.code.join('')); await frames(300);
  await p.keyboard.press('Enter'); await frames(300);
  console.log('locks', JSON.stringify(await p.evaluate(() => __kolusu.W.main.locks)));
  await p.evaluate(() => { __kolusu.G.overlay=null; document.querySelectorAll('.overlay').forEach(o=>o.hidden=true); });
  await act('main: open', [12, 19.0], [12, 1.2, 19.88]);
  console.log('doorOpen', await p.evaluate(() => __kolusu.G.flags.doorOpen), 'state', await p.evaluate(() => __kolusu.G.state));
  await p.evaluate(() => __kolusu.step(90, 1/60));
  await p.evaluate(() => { __kolusu.teleport(12, 22.5, Math.PI, 0); __kolusu.P.pitch = 0.02; }); await shot('frontyard');
  await walk('to the gate', [12, 22.5], Math.PI, 0, 4);
  await frames(7000);
  console.log('final state', await p.evaluate(() => __kolusu.G.state), '|', await p.evaluate(() => document.getElementById('endTitle').innerText));
  await p.screenshot({ path: 'shots/v10-win.png', timeout: 120000 });
  console.log('end title', await p.evaluate(() => document.getElementById('endEyebrow').innerText + ' | ' + document.getElementById('endTitle').innerText), '| notes', await p.evaluate(() => [...__kolusu.G.notes].join(',')));
  console.log('ERRORS:', errs.join('\n') || 'none');
  await b.close();
})();
