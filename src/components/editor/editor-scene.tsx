"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { frameCamera, Studio, ToneMapping } from "@/components/viewer/scene";
import type { PreparedModel } from "@/lib/gltf-load";

export interface EditorSceneProps {
  model: PreparedModel | null;
  /** Index of the embedded animation to play, or null for the rest pose. */
  clip: number | null;
  playing: boolean;
  autoRotate: boolean;
  wireframe: boolean;
  /** Bump to re-frame the camera. */
  resetKey: number;
  onRenderer: (renderer: THREE.WebGLRenderer) => void;
  onPick: (object: THREE.Object3D, faceIndex: number) => void;
  onMiss: () => void;
}

/** Plays a model's embedded clips; stopping one returns the model to its rest pose. */
class ClipPlayer {
  private readonly mixer: THREE.AnimationMixer;
  private readonly rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];

  constructor(private readonly model: PreparedModel) {
    this.mixer = new THREE.AnimationMixer(model.root);
    model.root.traverse((o) => this.rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  }

  /** Starts clip `index`; returns a function that stops it. */
  play(index: number | null): (() => void) | undefined {
    const clip = index === null ? null : this.model.animations[index];
    if (!clip) return;
    const action = this.mixer.clipAction(clip).reset().play();
    return () => {
      action.stop();
      this.mixer.uncacheAction(clip);
      for (const [o, p, q, s] of this.rest) {
        o.position.copy(p);
        o.quaternion.copy(q);
        o.scale.copy(s);
      }
    };
  }

  setPlaying(on: boolean) {
    this.mixer.timeScale = on ? 1 : 0;
  }

  setWireframe(on: boolean) {
    this.model.root.traverse((o) => {
      const material = (o as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        if ("wireframe" in m) (m as THREE.MeshStandardMaterial).wireframe = on;
      }
    });
  }

  update(dt: number) {
    this.mixer.update(Math.min(dt, 0.1));
  }

  dispose() {
    this.mixer.stopAllAction();
  }
}

function Model({ model, clip, playing, wireframe, resetKey, onPick }: Pick<EditorSceneProps, "clip" | "playing" | "wireframe" | "resetKey" | "onPick"> & { model: PreparedModel }) {
  const get = useThree((s) => s.get);
  // Subscribed only so framing re-runs once OrbitControls registers itself.
  const controls = useThree((s) => s.controls);
  const player = useMemo(() => new ClipPlayer(model), [model]);

  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => player.setPlaying(playing), [player, playing]);
  useEffect(() => player.setWireframe(wireframe), [player, wireframe]);
  useEffect(() => player.play(clip), [player, clip]);

  useLayoutEffect(() => {
    const state = get();
    frameCamera(state.camera as THREE.PerspectiveCamera, state.controls as OrbitControlsImpl | null, model.size, 0.6);
  }, [get, model, controls, resetKey]);

  useFrame((_, dt) => player.update(dt));

  const { size, offset } = model;
  const shadowScale = Math.max(size.x, size.z, size.y * 0.6) * 1.6;

  return (
    <>
      <group position={offset}>
        <primitive
          object={model.root}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            // A drag that orbits the camera isn't a click.
            if (e.delta > 4) return;
            e.stopPropagation();
            onPick(e.object, e.faceIndex ?? -1);
          }}
        />
      </group>
      <ContactShadows position={[0, 0.001, 0]} scale={shadowScale} blur={2.4} opacity={0.55} far={Math.max(size.y, 0.01)} resolution={512} color="#000000" />
    </>
  );
}

export default function EditorScene({ model, autoRotate, onRenderer, onMiss, ...props }: EditorSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 32, position: [0, 1.2, 5] }}
      className="touch-none"
      onCreated={({ gl }) => onRenderer(gl)}
      onPointerMissed={onMiss}
    >
      <ToneMapping />
      <Studio />
      <hemisphereLight args={["#e8e6ff", "#1a1626", 0.35]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 3, -3]} intensity={0.6} color="#a5f3fc" />
      {model && <Model model={model} {...props} />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={autoRotate} autoRotateSpeed={0.9} maxPolarAngle={Math.PI * 0.62} />
    </Canvas>
  );
}
