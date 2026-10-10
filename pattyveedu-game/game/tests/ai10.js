// run from anywhere: node tests/ai10.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  const r = await p.evaluate(() => {
    const k=__kolusu, E=k.E, N=k.K.Nav, W=k.W, out={};
    k.start(); k.G.state='play'; k.G.timers.length=0; k.P.wake=0; document.getElementById('card').hidden=true;
    const run = (secs, stopFn) => { for (let i=0;i<secs*60;i++){ E.update(1/60); W.update(1/60, i/60); if (stopFn && stopFn()) return i/60; } return -1; };
    out.wingReachLocked = N.reach(12, 13, 0, 30, 10, 0);
    W.doorById.wing.locked = false; W.doorById.wing.setOpen(true, true);
    out.wingReachOpen = N.reach(12, 13, 0, 30, 10, 0); out.wingUpReach = N.reach(12, 13, 0, 40, 6.2, 1);
    out.terraceToWingUp = N.reach(20.5, 10, 1, 40, 6.2, 1);
    W.doorById.terraceDoor.locked = false; out.terraceToWingUpUnbolted = N.reach(20.5, 10, 1, 40, 6.2, 1); W.doorById.terraceDoor.locked = true;
    // A* timing for long routes
    let t = performance.now(); const pth = N.find(4, 12.6, -1, 42, 3.2, 1); out.longPathMs = (performance.now() - t).toFixed(2); out.longPathNodes = pth && pth.length; out.iters = N.iters;
    // Paatti hunts the player up the wing stairs into the library
    for (const id of ['library', 'loft', 'thatha', 'music', 'office', 'wash', 'sewing', 'feast', 'granary']) W.doorById[id].locked = false;
    k.teleport(40.5, 13.8, 0, 1); k.P.held=null; k.P.hidden=false; k.P.torch=true;
    E.reset(1,{speed:1,vision:1,ko:28},{x:26,z:10,lv:0}); E.wait=0;
    E.hear(40.5, 13.8, 40, 1); out.heardLib = E.state;
    let tr = []; const tC = run(70, () => { if (Math.random() < 0.01) tr.push(E.pos.x.toFixed(0)+','+E.pos.z.toFixed(0)+'L'+E.lv); return k.G.state==='caught'; });
    out.libCaughtAt = tC.toFixed(1); out.libTrace = tr.slice(0, 14).join(' ');
    // patrol for 6 simulated minutes with the player hidden in the wing: count wing visits, check she keeps moving
    k.G.state='play'; E.catchArmed=false; k.teleport(45.3, 11.4, 0, 0); k.P.hidden = true; k.P.hideSpot = W.hideSpots.find(h => h.id === 'sewing-wardrobe');
    E.reset(1,{speed:1,vision:1,ko:28},{x:12,z:18.6,lv:0}); E.wait=0;
    const cells = new Set(); let wingT = 0, stuck = 0, lastX = E.pos.x, lastZ = E.pos.z, still = 0, maxStill = 0; let t0 = performance.now();
    for (let i = 0; i < 360 * 60; i++) { E.update(1/60); if (E.pos.x > 24) wingT += 1/60; if (i % 60 === 0) { cells.add(Math.round(E.pos.x/3)+','+Math.round(E.pos.z/3)+','+E.lv); const mv = Math.hypot(E.pos.x - lastX, E.pos.z - lastZ); if (mv < 0.05) still++; else still = 0; maxStill = Math.max(maxStill, still); lastX = E.pos.x; lastZ = E.pos.z; } }
    out.patrolCpuMsPerFrame = ((performance.now() - t0) / (360 * 60)).toFixed(3);
    out.patrolCells = cells.size; out.wingShare = (wingT / 360).toFixed(2); out.maxStillSec = maxStill;
    // radio lure
    k.P.hidden = false; k.P.hideSpot = null; k.teleport(27, 3, 0, 0);
    E.reset(1,{speed:1,vision:1,ko:28},{x:35,z:13.8,lv:0}); E.wait=0; E.catchArmed=false;
    W.wing.power = true; W.wing.radioT = 25;
    E.hear(45.5, 16.2, 30, 1); out.radioState = E.state; out.radioTarget = JSON.stringify(E.target);
    run(25); out.afterRadio = [E.pos.x.toFixed(1), E.pos.z.toFixed(1), E.lv];
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('ERR', errs.join(' | ') || 'none');
  await b.close();
})();
