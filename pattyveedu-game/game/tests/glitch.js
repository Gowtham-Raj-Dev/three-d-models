// run: node tests/glitch.js [?query]  — walks the enemy through every state frame by frame and reports sudden jumps of her bones/body
// (a pop between two frames), skinned vertices flying off, and NaNs. Frames: 1/60 s.
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
let pw; try { pw = require('playwright'); } catch (e) { pw = require('./node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core'); }
(async () => {
  const b = await pw.chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 370 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + (process.argv[2] || ''));
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 170000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; });
  const res = await p.evaluate(() => {
    const k = __kolusu, E = k.E, P = k.P, T = E.model.constructor, V = E.model.position.constructor;
    const kind = E.kind, u0 = E.model.userData;
    const parts = []; E.model.traverse(o => { if (o.isBone || o.isSkinnedMesh) parts.push(o); });
    const bones = parts.filter(o => o.isBone), skins = parts.filter(o => o.isSkinnedMesh);
    const inv = new E.model.matrix.constructor(), v = new V(), prev = new Map(), flags = [], seq = [];
    const sample = (m) => { const out = new Map(); E.model.updateMatrixWorld(true); inv.copy(E.model.matrixWorld).invert(); for (const b of bones) { b.getWorldPosition(v); v.applyMatrix4(inv); out.set(b, v.clone()); } return out; };
    const setup = (st) => {
      P.hidden = true; k.teleport(12, 22, 0, 0);
      E.active = true; E.pos.set(12, 0, 12); E.y = 0; E.lv = 0; E.state = st; E.catchArmed = false; E.yaw = 0; E.wait = 3; E.getup = 0; E.path = null; E.calm = false;
      if (st === 'patrol' || st === 'investigate') { E.path = [{ x: 12, z: 8, lv: 0 }, { x: 16, z: 8, lv: 0 }, { x: 16, z: 14, lv: 0 }]; E.pi = 0; }
      if (st === 'ko') E.koT = 1.2;
      if (st === 'chase') { P.hidden = false; k.teleport(12, 16, 0, 0); E.lastSeen = { x: P.x, z: P.z, lv: 0 }; E.lastSeenT = k.G.simT || 0; }
    };
    const order = ['wait', 'patrol', 'chase', 'search', 'ko', 'wait', 'investigate', 'chase', 'ko', 'search'];
    let frame = 0, last = null;
    for (const st of order) {
      setup(st);
      for (let i = 0; i < 150; i++, frame++) {
        k.step(1); E.model.updateMatrixWorld(true);
        const cur = sample(); let worst = 0, wb = '';
        if (last) for (const [b, p0] of last) { const d = cur.get(b).distanceTo(p0); if (d > worst) { worst = d; wb = b.name; } }
        last = cur;
        let bad = false; for (const b of bones) { const q = cur.get(b); if (!Number.isFinite(q.x + q.y + q.z) || q.length() > 4) bad = true; }
        // skinned vertices: how far from the model origin
        let far = 0; for (const sm of skins) { const pa = sm.geometry.attributes.position, n = pa.count, step = Math.max(1, Math.floor(n / 600)); sm.updateMatrixWorld(true); for (let j = 0; j < n; j += step) { sm.boneTransform(j, v); v.applyMatrix4(sm.matrixWorld).applyMatrix4(inv); far = Math.max(far, v.length()); if (!Number.isFinite(v.x + v.y + v.z)) bad = true; } }
        seq.push([frame, E.state, E.model.userData.cur, +worst.toFixed(3), wb, +far.toFixed(2), bad]);
      }
    }
    return { kind, seq };
  });
  const jumps = res.seq.filter(s => s[3] > 0.18 || s[6] || s[5] > 3.2);
  const byMax = res.seq.slice().sort((a, b) => b[3] - a[3]).slice(0, 8);
  console.log('kind', res.kind, 'frames', res.seq.length);
  console.log('flagged (jump>0.18m / bad / far>3.2m):', jumps.length); jumps.slice(0, 30).forEach(s => console.log(' ', JSON.stringify(s)));
  console.log('largest frame-to-frame bone moves:'); byMax.forEach(s => console.log(' ', JSON.stringify(s)));
  console.log('ERR', errs.join('|') || 'none');
  await b.close();
})();
