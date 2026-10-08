// run from anywhere: node tests/perf10.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
// Per-area render cost at High: draw calls, triangles (incl. shadow pass), frame time; plus hitch tests.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('kolusu.gfx2', JSON.stringify('high')); } catch(e){} });
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(() => { const k=__kolusu; k.noEnemy(false); k.start(); k.G.state='play'; k.G.timers.length=0; document.getElementById('card').hidden=true; k.K.LampFX && k.K.LampFX.stop(); const f=document.getElementById('fade'); f.style.transition='none'; f.style.opacity=0; k.P.wake=0; k.P.y=1.62; k.E.reset(1,{speed:0,vision:0,ko:28},{x:20.6,z:10.6,lv:0}); k.E.wait=1e9; });
  const spots = [['store',9.4,2.4,Math.PI,0],['hall',12,15.6,2.5,0],['dining',4.6,12.9,0.42,0],['study',21,8.2,-1.57,0],['courtyard',12,13,0,0],['backyard',12,-4,Math.PI*0.9,0],['terrace',10,6,Math.PI*0.75,1],['cellar',2,13,0,-1],['frontyard',12,22.5,Math.PI,0],['w-pass',25.2,12.5,0,0],['w-court',29.2,14.2,-1.037,0],['w-office',35,4.3,-0.876,0],['w-wedding',25,17,-1.57,0],['w-gallery',29.2,13.8,-0.988,1],['w-portraits',32.2,17.6,-1.57,1],['w-music',37.5,16.2,-2.17,1],['w-feast',37,15.6,-1.837,0]];
  let tc = 0, tt = 0;
  for (const [n,x,z,yaw,lv] of spots) {
    const r = await p.evaluate(([x,z,yaw,lv]) => new Promise(res => { const k=__kolusu; k.teleport(x,z,yaw,lv); k.P.pitch=0; let n=0, t0=0; function f(t){ if (n===3) t0=t; n++; if (n<13) requestAnimationFrame(f); else res({ms:+((t-t0)/10).toFixed(0), calls:k.renderer.info.render.calls, tris:k.renderer.info.render.triangles}); } requestAnimationFrame(f); }), [x,z,yaw,lv]);
    tc += r.calls; tt += r.tris;
    console.log(n.padEnd(10), String(r.calls).padStart(4), 'calls', String(r.tris).padStart(7), 'tris', String(r.ms).padStart(5), 'ms');
  }
  console.log('TOTAL', tc, 'calls', tt, 'tris');
  const h = await p.evaluate(() => new Promise(res => { const k=__kolusu, progs0 = k.renderer.info.programs.length; k.teleport(12, 15.6, 2.5, 0); let n = 0, times = [], last = performance.now(); function f(t) { times.push(t - last); last = t; n++;
      if (n === 6) k.K.Game.toggleTorch(); if (n === 12) k.K.Game.toggleTorch(); if (n === 18) { const s = k.W.hideSpots[0]; k.hide(s); } if (n === 24) k.unhide();
      if (n < 32) requestAnimationFrame(f); else res({ progs0, progs1: k.renderer.info.programs.length, worst: Math.max(...times.slice(5)).toFixed(0), median: times.slice(5).sort((a,b)=>a-b)[13].toFixed(0) }); } requestAnimationFrame(f); }));
  console.log('hitch test (torch off/on, hide/unhide):', JSON.stringify(h));
  console.log('boot', JSON.stringify(await p.evaluate(() => __kolusu.K.R.stats.boot)), 'bake', JSON.stringify(await p.evaluate(() => __kolusu.W.batchInfo)), 'compileT', JSON.stringify(await p.evaluate(() => __kolusu.K.R.stats.compileT)));
  console.log('ERR', errs.join(' | ') || 'none');
  await b.close();
})();
