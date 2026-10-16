// run: node tests/scout.js '[[x,z,yaw,pitch,lv,torch],...]' out.png — portrait stills of candidate camera spots, numbered left to right, for planning shots
process.chdir(__dirname);
const GAME = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href;
let pw; try { pw = require('playwright'); } catch (e) { pw = require('./node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core'); }
const fs = require('fs');
(async () => {
  const views = JSON.parse(process.argv[2]), out = process.argv[3];
  const b = await pw.chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 360, height: 640 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME + '?desk');
  await p.waitForFunction(() => window.__kolusu && __kolusu.G.state === 'menu', null, { timeout: 170000 });
  await p.evaluate(() => { const k = __kolusu; k.start(); k.G.state = 'play'; k.G.timers.length = 0; document.getElementById('card').hidden = true; const f = document.getElementById('fade'); f.style.transition = 'none'; f.style.opacity = 0; k.P.wake = 0; k.P.y = 1.62; k.noEnemy(true);
    const st = document.createElement('style'); st.textContent = '.topbar,#roomLbl,#timeChip,#toast,#cross,#prompt,#stam,#joy,#joyHint,#hud,#deskKeys,#clickToPlay,#voiceSub,#hideTxt,#card,#rotate{display:none!important}'; document.head.appendChild(st); k.camera.fov = 78; k.camera.updateProjectionMatrix(); });
  const imgs = [];
  for (const [i, [x, z, yaw, pitch, lv = 0, torch = 0]] of views.entries()) {
    await p.evaluate(([x, z, yaw, pitch, lv, torch]) => { const k = __kolusu; k.teleport(x, z, yaw, lv); k.P.pitch = pitch; k.P.torch = !!torch; k.step(3); }, [x, z, yaw, pitch, lv, torch]);
    await p.waitForTimeout(900);
    imgs.push(await p.screenshot({ type: 'jpeg', quality: 75 }));
  }
  const sharp = require('D:/Gowtham/My-Live-Websites/games.codelove.in/node_modules/sharp');
  const cols = Math.min(views.length, 6), tw = 240, th = 427;
  const comp = [];
  for (let i = 0; i < imgs.length; i++) {
    const label = Buffer.from(`<svg width="${tw}" height="26"><rect width="${tw}" height="26" fill="#000" opacity=".7"/><text x="6" y="19" font-size="16" fill="#ffd27a" font-family="Arial">${i}: ${views[i].join(',')}</text></svg>`);
    comp.push({ input: await sharp(imgs[i]).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th }, { input: label, left: (i % cols) * tw, top: Math.floor(i / cols) * th });
  }
  await sharp({ create: { width: cols * tw, height: Math.ceil(imgs.length / cols) * th, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 85 }).toFile(out);
  console.log('sheet', out, 'ERR', errs.join('|') || 'none');
  await b.close();
})();
