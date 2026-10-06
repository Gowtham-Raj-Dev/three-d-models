// TEMPORARY: model inspection grid (removed before shipping).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadModels, makeProto } from "../shared/assets";

export async function runViewer(canvas: HTMLCanvasElement, keys: string[], view: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const w = canvas.clientWidth || 1280;
  const h = canvas.clientHeight || 720;
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#30343c");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene.add(new THREE.HemisphereLight("#ffffff", "#334", 0.4));
  const sun = new THREE.DirectionalLight("#fff", 1.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const models = await loadModels(keys, renderer, () => {}, {});
  const cols = Math.ceil(Math.sqrt(keys.length * 1.6));
  keys.forEach((k, i) => {
    const m = models.get(k);
    if (!m) return;
    const p = makeProto(m.scene, m.animations, { box: {} } as never);
    const s = Math.max(p.size.x, p.size.y, p.size.z);
    p.object.scale.setScalar(1.6 / s);
    const cx = (i % cols) * 2.4 - (cols - 1) * 1.2;
    const cz = Math.floor(i / cols) * 2.4;
    p.object.position.set(cx, 0, cz);
    scene.add(p.object);
    const ax = new THREE.AxesHelper(1.1);
    ax.position.set(cx, 0.02, cz);
    scene.add(ax);
  });
  const rows = Math.ceil(keys.length / cols);
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
  const cz = ((rows - 1) * 2.4) / 2;
  if (view === "top") cam.position.set(0, cols * 1.9, cz + 0.01);
  else if (view === "side") cam.position.set(cols * 2.8, 2, cz);
  else cam.position.set(0, cols * 1.4, cz + cols * 2.4);
  cam.lookAt(0, 0, cz);
  renderer.render(scene, cam);
  (window as unknown as { __viewerDone: boolean }).__viewerDone = true;
}
