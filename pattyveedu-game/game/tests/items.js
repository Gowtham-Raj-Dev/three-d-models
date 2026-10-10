// run from anywhere: node tests/items.js   (needs: npm install in this folder)
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 600 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(GAME + '?desk');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 150000 });
  const shots = await p.evaluate(() => {
    const k = __kolusu, R = k.renderer, orig = R.render.bind(R); R.render = () => {}; k.G.state = 'x';
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1a1614);
    sc.add(new THREE.HemisphereLight(0xfff2e0, 0x302820, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(1, 2, 1.5); sc.add(dl);
    const ids = ['smallkey', 'brasskey', 'almirahkey', 'wingkey', 'bigkey', 'matchbox', 'oosi1', 'fuse1', 'safeknob', 'kolusu1', 'sickle', 'boltcutter', 'bucket'];
    const out = [], info = [];
    for (const id of ids) {
      const m = k.W.itemMesh(id); sc.add(m); m.position.set(0, 0, 0);
      const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).length();
      let calls = 0; m.traverse(o => { if (o.isMesh) calls++; });
      const cam = new THREE.PerspectiveCamera(35, 2, 0.01, 10); cam.position.set(c.x + sz * 0.55, c.y + sz * 0.75, c.z + sz * 0.95); cam.lookAt(c);
      R.setSize(400, 200, false); orig(sc, cam); out.push(R.domElement.toDataURL('image/jpeg', 0.9)); info.push(id + ':' + calls); sc.remove(m);
    }
    return { out, info };
  });
  shots.out.forEach((d, i) => fs.writeFileSync(`shots/item-${i}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(shots.info.join(' '), 'ERR', errs.join('|') || 'none'); await b.close();
})();
