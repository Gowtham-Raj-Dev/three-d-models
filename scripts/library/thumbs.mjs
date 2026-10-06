import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import sharp from "sharp";
import puppeteer from "puppeteer-core";
import { log, ROOT } from "./common.mjs";

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const W = 800, H = 1000;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const ktx2 = new KTX2Loader().setTranscoderPath("/public/decoders/basis/").detectSupport(renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);

window.renderModel = async (url) => {
  const gltf = await loader.loadAsync(url);
  const scene = new THREE.Scene();
  scene.environment = env;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x1a1626, 0.35), gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene, true);
  if (box.isEmpty()) throw new Error("empty scene");
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 1000);
  const radius = Math.max(size.length() / 2, 1e-3);
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const dist = Math.max(radius / Math.sin(vfov / 2), radius / Math.sin(hfov / 2));
  const dir = new THREE.Vector3(0.75, 0.5, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = dist / 100;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL("image/png");
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
  return data;
};
window.ready = true;
</script></body></html>`;

const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".html": "text/html", ".json": "application/json" };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (url === "/__thumb.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(PAGE);
    }
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Chrome/Edge found — set CHROME_PATH to a Chromium-based browser.");
  return found;
}

/**
 * Renders a transparent 3/4-view thumbnail for each job ({ glb: absolute path under ROOT, out: .webp path }).
 * Thumbnails are trimmed to the model and fitted into 480×600.
 */
export async function renderThumbnails(jobs) {
  if (!jobs.length) return [];
  const server = await startServer();
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const failures = [];
  let next = 0;
  let done = 0;
  // A few tabs in parallel: software WebGL is CPU-bound and scales across cores.
  const tab = async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/__thumb.html`);
    await page.waitForFunction("window.ready === true", { timeout: 60000 });
    while (next < jobs.length) {
      const job = jobs[next++];
      const url = "/" + path.relative(ROOT, job.glb).split(path.sep).map(encodeURIComponent).join("/");
      try {
        const dataUrl = await page.evaluate((u) => window.renderModel(u), url);
        const png = Buffer.from(dataUrl.split(",")[1], "base64");
        const trimmed = await sharp(png).trim({ threshold: 1 }).toBuffer();
        fs.mkdirSync(path.dirname(job.out), { recursive: true });
        const info = await sharp(trimmed)
          .resize({ width: 480, height: 600, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82, alphaQuality: 85, effort: 4 })
          .toFile(job.out);
        job.width = info.width;
        job.height = info.height;
      } catch (err) {
        failures.push(job);
        console.error(`✗ thumbnail ${job.glb}: ${err.message}`);
      }
      if (++done % 100 === 0) log(`  thumbnails ${done}/${jobs.length}`);
    }
    await page.close();
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, tab));
  } finally {
    await browser.close();
    server.close();
  }
  return failures;
}
