// run: node tests/terrace.js — walks through the terrace door (x = 24, z = 10, first floor) in both directions once it is unbolted and open
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
let pw; try { pw = require('playwright'); } catch (e) { pw = require('./node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core'); }
(async () => {
  const b = await pw.chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 560 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '?desk');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 170000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; k.noEnemy(true); });
  const info = await p.evaluate(() => {
    const k = __kolusu, W = k.W, d = W.doorById.terraceDoor;
    const near = W.solids.filter(s => (s.lv === 1) && s.t === 'b' && s.maxX > 22.5 && s.minX < 25.5 && s.maxZ > 8.5 && s.minZ < 11.5).map(s => ({ x: [+s.minX.toFixed(2), +s.maxX.toFixed(2)], z: [+s.minZ.toFixed(2), +s.maxZ.toFixed(2)], door: !!s.door, wall: !!s.wall }));
    return { keys: Object.keys(d), center: d.center, axis: d.axis, lv: d.lv, y: d.y, box: d.box, near, rooms: W.ROOMS.filter(r => r.lv === 1).map(r => [r.id, r.x0, r.x1, r.z0, r.z1]) };
  });
  console.log(JSON.stringify(info));
  async function walk(label, x, z, yawDeg, open) {
    const r = await p.evaluate(([x, z, yaw, open]) => {
      const k = __kolusu, W = k.W, P = k.P, d = W.doorById.terraceDoor;
      d.locked = false; d.setOpen(open); k.step(120);
      P.x = x; P.z = z; P.lv = 1; P.feet = W.FLOOR[1]; P.yaw = yaw; P.vx = P.vz = 0; window.K.Touch = { x: 0, y: 1, run: false };
      const out = []; for (let i = 0; i < 6; i++) { k.step(30); out.push([+P.x.toFixed(2), +P.z.toFixed(2), P.lv]); }
      window.K.Touch = { x: 0, y: 0 };
      return { open: d.open, out };
    }, [x, z, yawDeg * Math.PI / 180, open]);
    console.log(label, JSON.stringify(r));
  }
  await walk('wing->terrace (door open)', 25.6, 10, 90, true);
  await walk('terrace->wing (door open)', 22.4, 10, -90, true);
  await walk('wing->terrace (door closed)', 25.6, 10, 90, false);
  console.log('ERR', errs.join('|') || 'none');
  await b.close();
})();
