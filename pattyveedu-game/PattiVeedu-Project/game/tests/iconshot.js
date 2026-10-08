// run from anywhere: node tests/iconshot.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '?desk');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; k.P.wake = 0; k.P.y = 1.62; k.teleport(12, 15.5, 0, 0); k.E.pos.x = 12; k.E.pos.z = 14; k.E.y = 0; k.E.lv = 0; k.G.caught(); });
  const shots = await p.evaluate(async () => {
    const k = __kolusu, E = k.E, R = k.renderer, orig = R.render.bind(R); R.render = () => {};
    k.G.state = 'iconshot'; document.getElementById('hud').hidden = true;
    const cam = k.camera, out = [], u = E.model.userData;
    for (let f = 0; f < 40; f++) { E.t += 1 / 30; E.tickModel(1 / 30, 1.62, cam.position); }
    // only her, in the dark: a warm lantern glow from below and a red light behind
    for (const o of k.scene.children) if (o !== E.model && !o.isCamera) o.userData._v = o.visible, o.visible = false;
    k.scene.background = new THREE.Color(0x000000); k.scene.fog = null;
    const low = new THREE.PointLight(0xffa060, 1.4, 4, 2), rim = new THREE.PointLight(0x9ab0c8, 0.0, 3, 2), fill = new THREE.AmbientLight(0x30343a, 0.7);
    k.scene.add(low, rim, fill);
    if (u.lamp) u.lamp.visible = false; if (u.light) u.light.intensity = 0;
    cam.fov = 26; cam.aspect = 1; cam.updateProjectionMatrix();
    for (const [dx, dy, dist, roll] of [[0, 0, 0.78, 0], [0.12, -0.04, 0.72, 0], [-0.1, 0.03, 0.75, 0]]) {
      const hv = new THREE.Vector3(); E.headPos(hv); hv.y += 0.02;
      // camera straight in front of her face
      const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(u.bones.head.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion())); 
      const toCam = new THREE.Vector3().subVectors(cam.position, hv).normalize();
      cam.position.copy(hv).addScaledVector(toCam, dist).add(new THREE.Vector3(dx, dy, 0)); cam.lookAt(hv.clone().add(new THREE.Vector3(0, -0.03, 0))); cam.updateMatrixWorld(true);
      low.position.copy(hv).addScaledVector(toCam, 0.45).add(new THREE.Vector3(0.3, -0.6, 0)); rim.position.copy(hv).addScaledVector(toCam, -0.35).add(new THREE.Vector3(-0.2, 0.25, 0));
      E.tickModel(1 / 30, 1.62, cam.position); if (u.light) u.light.intensity = 0;
      for (const e of u.eyes) { e.material.color.setHex(0xff2a1a); e.material.opacity = 1; }
      orig(k.scene, cam); out.push(R.domElement.toDataURL('image/png'));
    }
    return out;
  });
  shots.forEach((d, i) => fs.writeFileSync(`shots/icon-src-${i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log('ERR', errs.join('|') || 'none'); await b.close();
})();
