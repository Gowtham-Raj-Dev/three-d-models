"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { recordRestPose, retarget } from "@/lib/retarget";

export interface SceneProps {
  url: string;
  animationUrl: string | null;
  playing: boolean;
  autoRotate: boolean;
  wireframe: boolean;
  skeleton: boolean;
  /** Bump to re-frame the camera. */
  resetKey: number;
  interactive?: boolean;
  /** Initial camera azimuth in radians (0 = front). */
  azimuth?: number;
  onLoaded?: () => void;
  /** Stop rendering (e.g. while another view covers this one). */
  paused?: boolean;
}

const FADE = 0.35;

function EmbeddedClipPlayer({
  name,
  animations,
  mixer,
}: {
  name: string;
  animations: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}) {
  const cleanName = name.replace(/^embedded:/, "");
  const clip = useMemo(
    () => animations.find((a) => a.name === cleanName) ?? animations[0] ?? null,
    [animations, cleanName],
  );

  useEffect(() => {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(FADE).play();
    return () => {
      action.fadeOut(FADE);
    };
  }, [clip, mixer]);

  return null;
}

function ExternalClipPlayer({ url, root, mixer }: { url: string; root: THREE.Object3D; mixer: THREE.AnimationMixer }) {
  const { animations } = useGLTF(url, false, true);
  const clip = useMemo(() => (animations[0] ? retarget(animations[0], root) : null), [animations, root]);

  useEffect(() => {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(FADE).play();
    return () => {
      action.fadeOut(FADE);
    };
  }, [clip, mixer]);

  return null;
}

/** A per-viewer copy of a loaded model plus the three.js objects that drive it. */
class Rig {
  readonly scene: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly skeleton: THREE.SkeletonHelper;
  readonly size: THREE.Vector3;
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor(source: THREE.Object3D) {
    this.scene = cloneSkinned(source);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Skinned bounds don't follow the animation; never cull.
      mesh.frustumCulled = false;
      // Own copies so wireframe toggles don't leak into the shared GLTF cache.
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const mat = m.clone() as THREE.MeshStandardMaterial;
        // Alpha-tested hair looks smooth with MSAA alpha-to-coverage.
        if (mat.alphaTest > 0) mat.alphaToCoverage = true;
        this.materials.push(mat);
        return mat;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
    });
    recordRestPose(this.scene);

    // Ground the model and centre it on the origin.
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.scene, true);
    const center = box.getCenter(new THREE.Vector3());
    this.scene.position.set(-center.x, -box.min.y, -center.z);
    this.size = box.getSize(new THREE.Vector3());

    this.mixer = new THREE.AnimationMixer(this.scene);
    this.skeleton = new THREE.SkeletonHelper(this.scene);
  }

  setWireframe(on: boolean) {
    for (const m of this.materials) m.wireframe = on;
  }

  setPlaying(on: boolean) {
    this.mixer.timeScale = on ? 1 : 0;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.skeleton.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** Places the camera so the whole model fits, looking at its vertical centre. */
export function frameCamera(camera: THREE.PerspectiveCamera, controls: OrbitControlsImpl | null, size: THREE.Vector3, azimuth: number) {
  const radius = size.length() / 2;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect, 0.6);
  const fitH = radius / Math.sin(fov / 2);
  const fitW = radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect));
  const distance = Math.max(fitH, fitW) * 0.92;
  const target = new THREE.Vector3(0, size.y * 0.5, 0);
  const dir = new THREE.Vector3(Math.sin(azimuth), 0.12, Math.cos(azimuth)).normalize();
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(target);
    controls.minDistance = radius * 0.35;
    controls.maxDistance = distance * 3;
    controls.update();
  } else {
    camera.lookAt(target);
  }
}

function Model({
  url,
  animationUrl,
  playing,
  wireframe,
  skeleton,
  resetKey,
  azimuth = 0,
  onLoaded,
}: Pick<SceneProps, "url" | "animationUrl" | "playing" | "wireframe" | "skeleton" | "resetKey" | "azimuth" | "onLoaded">) {
  const gltf = useGLTF(url, false, true);
  const get = useThree((s) => s.get);
  // Subscribed only so framing re-runs once OrbitControls registers itself.
  const controls = useThree((s) => s.controls);
  const rig = useMemo(() => new Rig(gltf.scene), [gltf.scene]);

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => rig.setWireframe(wireframe), [rig, wireframe]);
  useEffect(() => rig.setPlaying(playing), [rig, playing]);

  useLayoutEffect(() => {
    const state = get();
    frameCamera(state.camera as THREE.PerspectiveCamera, state.controls as OrbitControlsImpl | null, rig.size, azimuth);
  }, [get, rig, controls, resetKey, azimuth]);

  useEffect(() => {
    onLoaded?.();
  }, [rig, onLoaded]);

  useFrame((_, dt) => rig.mixer.update(Math.min(dt, 0.1)));

  const { size } = rig;
  const shadowScale = Math.max(size.x, size.z, size.y * 0.6) * 1.6;

  return (
    <>
      <primitive object={rig.scene} />
      {skeleton && <primitive object={rig.skeleton} />}
      {animationUrl && (animationUrl.startsWith("embedded:") || gltf.animations.some((a) => a.name === animationUrl)) && gltf.animations.length > 0 ? (
        <EmbeddedClipPlayer key={animationUrl} name={animationUrl} animations={gltf.animations} mixer={rig.mixer} />
      ) : animationUrl ? (
        <Suspense fallback={null}>
          <ExternalClipPlayer key={animationUrl} url={animationUrl} root={rig.scene} mixer={rig.mixer} />
        </Suspense>
      ) : gltf.animations.length > 0 ? (
        <EmbeddedClipPlayer key="default-embedded" name={gltf.animations[0].name} animations={gltf.animations} mixer={rig.mixer} />
      ) : null}
      <ContactShadows position={[0, 0.001, 0]} scale={shadowScale} blur={2.4} opacity={0.55} far={size.y} resolution={512} color="#000000" />
    </>
  );
}

export function ToneMapping() {
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    const { gl } = get();
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [get]);
  return null;
}

export function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#14121c"]} />
      <Lightformer form="rect" intensity={3} position={[0, 6, 3]} scale={[8, 4, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-6, 2, 2]} scale={[4, 6, 1]} color="#dcd6ff" />
      <Lightformer form="rect" intensity={1.4} position={[6, 2, 1]} scale={[4, 6, 1]} color="#d4f6ff" />
      <Lightformer form="rect" intensity={2} position={[0, 2, -6]} scale={[8, 3, 1]} color="#b8a6ff" />
      <Lightformer form="circle" intensity={1.2} position={[0, -4, 0]} scale={6} />
    </Environment>
  );
}

export default function Scene({ interactive = true, autoRotate, paused = false, ...props }: SceneProps) {
  // Fetch the clip in parallel with the model instead of after it.
  useEffect(() => {
    if (props.animationUrl) useGLTF.preload(props.animationUrl, false, true);
  }, [props.animationUrl]);

  return (
    <Canvas
      frameloop={paused ? "never" : "always"}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 32, position: [0, 1.2, 5] }}
      // The hero lets vertical swipes scroll the page; full viewers capture every gesture.
      className={interactive ? "touch-none" : "touch-pan-y"}
    >
      <ToneMapping />
      <Studio />
      <hemisphereLight args={["#e8e6ff", "#1a1626", 0.35]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 3, -3]} intensity={0.6} color="#a5f3fc" />
      <Suspense fallback={null}>
        <Model {...props} />
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={interactive}
        enableZoom={interactive}
        autoRotate={autoRotate}
        autoRotateSpeed={0.9}
        minPolarAngle={interactive ? 0 : Math.PI * 0.45}
        maxPolarAngle={interactive ? Math.PI * 0.62 : Math.PI * 0.45}
      />
    </Canvas>
  );
}
