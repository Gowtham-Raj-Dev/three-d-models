"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Grid, Lightformer, Line, OrbitControls, Sky, Stars, TransformControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { asset } from "@/lib/asset";
import { MotionSampler, motionClip, spliceClips } from "@/lib/builder/motion";
import { recordRestPose, retarget } from "@/lib/retarget";
import { defaultClip, ENVIRONMENTS, GROUNDS, type EnvKey, type Motion, type Part, type PartsIndex, type SceneDoc, type SceneItem, type Vec3 } from "@/lib/builder/types";

export type TransformMode = "translate" | "rotate" | "scale";

export type Placing = { kind: "model"; part: Part; rotation: number } | { kind: "light"; rotation: number };

export interface CameraView {
  position: Vec3;
  target: Vec3;
}

export type AnimationExport = "together" | "separate" | "none";

export interface ExportOptions {
  ground: boolean;
  lights: boolean;
  /** "together": one clip that loops every character at once (what most viewers play); "separate": one clip each. */
  animations: AnimationExport;
  /** Written to the glTF `asset` block. */
  asset: { copyright: string; extras: Record<string, unknown> };
}

/** Imperative handle the editor UI uses for things that need the live three.js scene. */
export interface BuilderApi {
  exportGLB(options: ExportOptions): Promise<ArrayBuffer>;
  screenshot(): Promise<Blob>;
  /** Frames the given items, or the whole scene for null. */
  focus(ids: string[] | null): void;
  getCamera(): CameraView;
  setCamera(view: CameraView): void;
  /** Scene point under a screen position (items first, then the ground), snapped like placement. */
  pointAt(clientX: number, clientY: number): Vec3 | null;
  /** Y position that rests the item on whatever is below it. */
  dropY(id: string): number | null;
}

interface BuilderCanvasProps {
  doc: SceneDoc;
  parts: Map<string, Part>;
  clips: PartsIndex["clips"];
  selectedIds: string[];
  mode: TransformMode;
  space: "world" | "local";
  /** Freezes every animation in the editor. */
  paused: boolean;
  /** Grid step in metres; 0 = free. */
  snap: number;
  showGrid: boolean;
  placing: Placing | null;
  apiRef: RefObject<BuilderApi | null>;
  /** additive: Shift/Ctrl/Cmd-click toggles the item in the selection. */
  onSelect: (id: string | null, additive: boolean) => void;
  onTransform: (updates: ({ id: string } & Pick<SceneItem, "position" | "rotation" | "scale">)[]) => void;
  onPlace: (position: Vec3, keepPlacing: boolean) => void;
  onClips: (glb: string, names: string[]) => void;
  /** Called once the imperative API is available. */
  onReady?: () => void;
}

const ACCENT = "#a78bfa";
const round = (n: number) => Math.round(n * 1000) / 1000;
const toVec = (v: THREE.Vector3 | THREE.Euler): Vec3 => [round(v.x), round(v.y), round(v.z)];

// --- Animation ----------------------------------------------------------------------------------

/**
 * Re-targets a clip's tracks from node names to this instance's node UUIDs. Several copies of the
 * same model share bone names; UUIDs keep each copy's clip bound to its own bones — in the mixer
 * and in the glTF exporter, which both resolve track targets with PropertyBinding.findNode.
 */
function bindToInstance(clip: THREE.AnimationClip, root: THREE.Object3D, name: string): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
    const node = root.getObjectByName(nodeName);
    if (!node) continue;
    const bound = track.clone();
    bound.name = node.uuid + track.name.slice(nodeName.length);
    tracks.push(bound);
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

/** The bound clip the exporter picks up for this instance (null clears it), and the clip it plays while waiting at stops. */
function setExportClip(root: THREE.Object3D, clip: THREE.AnimationClip | null, stopClip: THREE.AnimationClip | null = null) {
  if (clip) root.userData.exportClip = clip;
  else delete root.userData.exportClip;
  if (stopClip) root.userData.stopClip = stopClip;
  else delete root.userData.stopClip;
}

/** The sampler the exporter turns into path keyframes (null clears it). */
function setExportMotion(group: THREE.Object3D, motion: { sampler: MotionSampler; offset: THREE.Quaternion } | null) {
  if (motion) group.userData.motion = motion;
  else delete group.userData.motion;
}

function restorePose(root: THREE.Object3D) {
  root.traverse((o) => {
    const rest = o.userData.rest as { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 } | undefined;
    if (!rest) return;
    o.position.copy(rest.p);
    o.quaternion.copy(rest.q);
    o.scale.copy(rest.s);
  });
}

/** Shared "paused" flag, read every frame (a ref, so toggling it doesn't re-render the scene). */
const PausedContext = createContext<RefObject<boolean>>({ current: false });
/** Scene time in seconds. It stands still while paused, so every moving part (a train's cars) stays in step. */
const ClockContext = createContext<RefObject<number>>({ current: 0 });
/** For an item that travels: whether it is waiting at a stop right now (walk ↔ stop clip blend). */
const WaitingContext = createContext<RefObject<boolean> | null>(null);

function SceneClock({ clockRef }: { clockRef: RefObject<number> }) {
  const paused = useContext(PausedContext);
  // Priority -1 runs before every other frame callback; it doesn't take over rendering.
  useFrame((_, dt) => {
    if (!paused.current) clockRef.current += Math.min(dt, 0.1);
  }, -1);
  return null;
}

/**
 * Plays an item's clip. With a `stopClip` (people who walk and stop), both play and the item's
 * waiting state blends between them.
 */
function ClipBinding({ clip, stopClip, root, label }: { clip: THREE.AnimationClip; stopClip?: THREE.AnimationClip | null; root: THREE.Object3D; label: string }) {
  const paused = useContext(PausedContext);
  const waitingRef = useContext(WaitingContext);
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const actionsRef = useRef<{ move: THREE.AnimationAction; stop: THREE.AnimationAction | null }>(null);
  useEffect(() => {
    const bound = bindToInstance(clip, root, label);
    const move = mixer.clipAction(bound);
    move.setLoop(THREE.LoopRepeat, Infinity).play();
    const boundStop = stopClip ? bindToInstance(stopClip, root, `${label} (waiting)`) : null;
    const stop = boundStop ? mixer.clipAction(boundStop) : null;
    stop?.setLoop(THREE.LoopRepeat, Infinity).play().setEffectiveWeight(0);
    actionsRef.current = { move, stop };
    setExportClip(root, bound, boundStop);
    return () => {
      actionsRef.current = null;
      move.stop();
      stop?.stop();
      mixer.uncacheClip(bound);
      if (boundStop) mixer.uncacheClip(boundStop);
      setExportClip(root, null);
      restorePose(root);
    };
  }, [clip, stopClip, root, mixer, label]);
  useFrame((_, delta) => {
    const dt = paused.current ? 0 : Math.min(delta, 0.1);
    const a = actionsRef.current;
    if (a?.stop) {
      const weight = a.stop.getEffectiveWeight();
      const next = waitingRef?.current ? Math.min(1, weight + dt * 5) : Math.max(0, weight - dt * 5);
      a.stop.setEffectiveWeight(next);
      a.move.setEffectiveWeight(1 - next);
    }
    mixer.update(dt);
  });
  return null;
}

/**
 * Moves an item along its motion path on the scene clock. While the item is selected it rests at its
 * own position, so the gizmo edits the item (and the path, which is relative to it).
 */
function MotionDriver({
  motion,
  position,
  rotation,
  groupRef,
  active,
  waitingRef,
}: {
  motion: Motion;
  position: Vec3;
  rotation: Vec3;
  groupRef: RefObject<THREE.Group | null>;
  active: boolean;
  waitingRef: RefObject<boolean>;
}) {
  const clockRef = useContext(ClockContext);
  const sampler = useMemo(() => new MotionSampler(motion, position), [motion, position]);
  const offset = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])), [rotation]);
  const exportInfo = useMemo(() => ({ sampler, offset }), [sampler, offset]);
  const homedRef = useRef(false);
  const restRef = useRef({ position, rotation });
  useLayoutEffect(() => {
    restRef.current = { position, rotation };
  });
  // Without a motion the part goes back to its own spot (e.g. after "Stop moving").
  useLayoutEffect(
    () => () => {
      const g = groupRef.current;
      if (!g) return;
      setExportMotion(g, null);
      const { position: p, rotation: r } = restRef.current;
      g.position.set(p[0], p[1], p[2]);
      g.rotation.set(r[0], r[1], r[2]);
    },
    [groupRef],
  );
  // The group's ref is attached after this component's effects run, so everything that needs the
  // group happens here, once it exists.
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (g.userData.motion !== exportInfo) setExportMotion(g, exportInfo);
    if (active) {
      waitingRef.current = sampler.pose(clockRef.current, g.position, g.quaternion, offset);
      homedRef.current = false;
    } else if (!homedRef.current) {
      // Selected: rest at the start of the route (the item's own position), facing along it, so the
      // gizmo edits the item and its route together.
      sampler.pose(0, g.position, g.quaternion, offset);
      g.position.set(position[0], position[1], position[2]);
      waitingRef.current = false;
      homedRef.current = true;
    }
  });
  return null;
}

/**
 * The rotation to store for a transformed item. A travelling item's stored rotation is an offset on
 * top of its direction of travel, so the route's own heading at the start is taken back out.
 */
function storedRotation(object: THREE.Object3D): Vec3 {
  const info = object.userData.motion as { sampler: MotionSampler } | undefined;
  if (!info) return toVec(object.rotation);
  const heading = new THREE.Quaternion();
  info.sampler.pose(0, new THREE.Vector3(), heading, new THREE.Quaternion());
  return toVec(new THREE.Euler().setFromQuaternion(heading.invert().multiply(object.quaternion)));
}

/** The loop a selected moving part travels (editor only). */
function MotionPath({ item }: { item: SceneItem }) {
  const points = useMemo(() => {
    const [x, y, z] = item.position;
    const list = item.motion!.path.map((p) => [p[0] + x, p[1] + y + 0.08, p[2] + z] as Vec3);
    return [...list, list[0]];
  }, [item.motion, item.position]);
  return <Line points={points} color={ACCENT} lineWidth={2} dashed dashSize={0.6} gapSize={0.4} depthTest={false} transparent opacity={0.85} renderOrder={998} />;
}

/** Bone rest values, for spliced tracks that one of the two clips doesn't animate. */
function restValue(root: THREE.Object3D) {
  return (trackName: string): number[] | null => {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(trackName);
    const rest = root.getObjectByProperty("uuid", nodeName)?.userData.rest as { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 } | undefined;
    if (!rest) return null;
    return propertyName === "position" ? rest.p.toArray() : propertyName === "quaternion" ? rest.q.toArray() : propertyName === "scale" ? rest.s.toArray() : null;
  };
}

/**
 * The clips to export: every character's own clip, plus — for parts that travel — their path as
 * position / rotation keys, with walk and stop clips spliced into one. With `perItem`, a travelling
 * part's clips merge into one clip, so viewers that play one clip at a time still show it walking.
 */
function collectClips(root: THREE.Object3D, perItem: boolean): THREE.AnimationClip[] {
  const out: THREE.AnimationClip[] = [];
  const claimed = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (claimed.has(o) || !visibleInTree(o)) return;
    const motion = o.userData.motion as { sampler: MotionSampler; offset: THREE.Quaternion } | undefined;
    if (motion) {
      const name = o.name || "Moving part";
      const clips = [motionClip(motion.sampler, o.uuid, motion.offset, `${name}: path`)];
      o.traverse((c) => {
        const move = c.userData.exportClip as THREE.AnimationClip | undefined;
        if (c === o || !move) return;
        claimed.add(c);
        const stop = c.userData.stopClip as THREE.AnimationClip | undefined;
        clips.push(stop ? spliceClips(move, stop, motion.sampler.spans(), motion.sampler.duration, restValue(c), move.name) : move);
      });
      if (perItem && clips.length > 1) out.push(combineLoops(clips, name));
      else out.push(...clips);
      return;
    }
    const clip = o.userData.exportClip as THREE.AnimationClip | undefined;
    if (clip) out.push(clip);
  });
  return out;
}

/**
 * glTF viewers usually play one animation at a time, so one clip per character would leave all but
 * one character frozen. This merges the clips into one whose length is (almost exactly) a whole
 * number of loops of every source clip — each re-timed by at most a few percent — so the whole scene
 * plays and loops seamlessly in any viewer, the way it does in the editor.
 */
function combineLoops(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const durations = clips.map((c) => c.duration).filter((d) => d > 1e-3);
  if (!durations.length) return new THREE.AnimationClip(name, 0, clips.flatMap((c) => c.tracks.map((t) => t.clone())));
  const longest = Math.max(...durations);
  let best = { length: longest, error: Infinity };
  for (let length = longest; length <= Math.max(longest, Math.min(longest * 4, 60)) + 1e-6; length += longest / 200) {
    const error = Math.max(...durations.map((d) => Math.abs(Math.max(1, Math.round(length / d)) * d - length) / length));
    // Prefer the shortest length unless a longer one is clearly smoother.
    if (error < best.error - 0.002) best = { length, error };
    if (best.error < 0.004) break;
  }
  const length = best.length;
  const tracks: THREE.KeyframeTrack[] = [];
  for (const clip of clips) {
    const d = clip.duration;
    if (d <= 1e-3) {
      tracks.push(...clip.tracks.map((t) => t.clone()));
      continue;
    }
    const loops = Math.max(1, Math.round(length / d));
    const stretch = length / (loops * d);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      const times: number[] = [];
      const values: number[] = [];
      for (let loop = 0; loop < loops; loop++) {
        for (let k = 0; k < track.times.length; k++) {
          const t = (track.times[k] + loop * d) * stretch;
          // glTF needs strictly increasing key times; one loop's last key and the next one's first coincide.
          if (times.length && t <= times[times.length - 1] + 1e-5) continue;
          times.push(t);
          for (let v = 0; v < size; v++) values.push(track.values[k * size + v]);
        }
      }
      // Close the loop when the track ends before the clip does.
      if (times[times.length - 1] < length - 1e-4) {
        times.push(length);
        for (let v = 0; v < size; v++) values.push(track.values[v]);
      }
      const Track = track.constructor as new (name: string, times: number[], values: number[], interpolation?: THREE.InterpolationModes) => THREE.KeyframeTrack;
      const merged = new Track(track.name, times, values, track.getInterpolation());
      // glTF cubic-spline tracks carry a custom interpolant; keep it so they still export as CUBICSPLINE.
      type Factory = { createInterpolant: { isInterpolantFactoryMethodGLTFCubicSpline?: boolean } };
      const source = track as unknown as Factory;
      if (source.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline) (merged as unknown as Factory).createInterpolant = source.createInterpolant;
      tracks.push(merged);
    }
  }
  return new THREE.AnimationClip(name, length, tracks);
}

type ClipSource = { clip: THREE.AnimationClip; label: string } | { url: string; label: string } | null;

/** Hands a clip to `children`: an embedded one directly, a Biped clip once its file has loaded. */
function WithClip({ source, root, children }: { source: ClipSource; root: THREE.Object3D; children: (clip: THREE.AnimationClip | null) => ReactNode }) {
  if (!source) return <>{children(null)}</>;
  if ("clip" in source) return <>{children(source.clip)}</>;
  return (
    <RemoteClip url={source.url} root={root}>
      {children}
    </RemoteClip>
  );
}

/** A Biped clip lives in its own file and is rescaled to the avatar first. */
function RemoteClip({ url, root, children }: { url: string; root: THREE.Object3D; children: (clip: THREE.AnimationClip | null) => ReactNode }) {
  const { animations } = useGLTF(url, false, true);
  const clip = useMemo(() => (animations[0] ? retarget(animations[0], root) : null), [animations, root]);
  return <>{children(clip)}</>;
}

// --- Items --------------------------------------------------------------------------------------

function prepareInstance(source: THREE.Object3D): THREE.Object3D {
  // SkeletonUtils.clone rebinds skinned meshes to the cloned bones; geometry and materials stay
  // shared, so the exporter writes each mesh and texture once however often a part is used.
  const root = cloneSkinned(source);
  root.name = "";
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    }
    o.userData.rest = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
  });
  recordRestPose(root);
  return root;
}

function ModelInstance({
  item,
  part,
  clips,
  onClips,
}: {
  item: SceneItem;
  part: Part | undefined;
  clips: PartsIndex["clips"];
  onClips: (glb: string, names: string[]) => void;
}) {
  const gltf = useGLTF(asset(item.glb!), false, true);
  const root = useMemo(() => prepareInstance(gltf.scene), [gltf.scene]);
  const names = useMemo(() => gltf.animations.map((a) => a.name), [gltf.animations]);

  useEffect(() => onClips(item.glb!, names), [item.glb, names, onClips]);

  const set = part?.set ?? null;
  const resolve = (wanted: string | null | undefined): ClipSource => {
    if (!wanted) return null;
    const embedded = gltf.animations.find((a) => a.name === wanted);
    if (embedded) return { clip: embedded, label: embedded.name };
    const remote = set ? clips.find((c) => c.id === wanted && c.set === set) : undefined;
    return remote ? { url: asset(remote.file), label: remote.label } : null;
  };
  const move = resolve(item.animation === undefined ? (set ? `${set}_idle_neutral_01` : defaultClip(names)) : item.animation);
  const stop = item.motion ? resolve(item.motion.stopAnimation) : null;
  const label = `${item.name}: ${move?.label ?? ""}`;

  return (
    <>
      <primitive object={root} />
      <Suspense fallback={null}>
        <WithClip source={move} root={root}>
          {(moveClip) =>
            moveClip && <WithClip source={stop} root={root}>{(stopClip) => <ClipBinding clip={moveClip} stopClip={stopClip} root={root} label={label} />}</WithClip>
          }
        </WithClip>
      </Suspense>
    </>
  );
}

function LoadingBox({ size }: { size: Vec3 }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = 0.25 + Math.sin(clock.elapsedTime * 4) * 0.15;
  });
  return (
    <mesh ref={ref} position={[0, size[1] / 2, 0]} userData={{ editorOnly: true }}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={ACCENT} wireframe transparent opacity={0.3} />
    </mesh>
  );
}

function LightInstance({ item }: { item: SceneItem }) {
  const light = useRef<THREE.PointLight>(null);
  const settings = item.light ?? { color: "#ffa040", intensity: 14, distance: 14 };
  // Per-light phase so neighbouring flames don't flicker in sync.
  const seed = useMemo(() => [...item.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000, 7) / 10, [item.id]);

  useEffect(() => {
    if (light.current) light.current.userData.baseIntensity = settings.intensity;
  }, [settings.intensity]);

  useFrame(({ clock }) => {
    if (!light.current) return;
    if (!settings.flicker) {
      light.current.intensity = settings.intensity;
      return;
    }
    const t = clock.elapsedTime * 9 + seed;
    const flicker = 0.82 + 0.1 * Math.sin(t) + 0.06 * Math.sin(t * 2.7 + 1.3) + 0.05 * Math.sin(t * 6.1);
    light.current.intensity = settings.intensity * flicker;
  });

  return (
    <>
      <pointLight ref={light} color={settings.color} intensity={settings.intensity} distance={settings.distance} decay={2} />
      <mesh userData={{ editorOnly: true }}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshBasicMaterial color={settings.color} toneMapped={false} />
      </mesh>
      <mesh userData={{ editorOnly: true }}>
        <sphereGeometry args={[0.32, 12, 8]} />
        <meshBasicMaterial color={settings.color} wireframe transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </>
  );
}

function ItemNode({
  item,
  part,
  clips,
  selected,
  register,
  onClick,
  onDoubleClick,
  onClips,
}: {
  item: SceneItem;
  part: Part | undefined;
  clips: PartsIndex["clips"];
  /** Selected parts that travel rest at their own position while the gizmo is on them. */
  selected: boolean;
  register: (id: string, object: THREE.Object3D | null) => void;
  onClick: (item: SceneItem, e: ThreeEvent<MouseEvent>) => void;
  onDoubleClick: (item: SceneItem, e: ThreeEvent<MouseEvent>) => void;
  onClips: (glb: string, names: string[]) => void;
}) {
  const id = item.id;
  const groupRef = useRef<THREE.Group | null>(null);
  const waitingRef = useRef(false);
  const ref = useCallback(
    (object: THREE.Group | null) => {
      groupRef.current = object;
      register(id, object);
    },
    [id, register],
  );
  return (
    <group
      ref={ref}
      name={item.name}
      position={item.position}
      rotation={item.rotation}
      scale={item.scale}
      visible={!item.hidden}
      onClick={(e) => onClick(item, e)}
      onDoubleClick={(e) => onDoubleClick(item, e)}
    >
      {item.motion && <MotionDriver motion={item.motion} position={item.position} rotation={item.rotation} groupRef={groupRef} active={!selected} waitingRef={waitingRef} />}
      {item.kind === "light" ? (
        <LightInstance item={item} />
      ) : (
        <WaitingContext.Provider value={item.motion ? waitingRef : null}>
          <Suspense fallback={<LoadingBox size={part?.size ?? [1, 1, 1]} />}>
            <ModelInstance item={item} part={part} clips={clips} onClips={onClips} />
          </Suspense>
        </WaitingContext.Provider>
      )}
    </group>
  );
}

// --- Editor helpers -----------------------------------------------------------------------------

function SelectionBox({ object }: { object: THREE.Object3D }) {
  const helper = useMemo(() => {
    const h = new THREE.BoxHelper(object, ACCENT);
    (h.material as THREE.LineBasicMaterial).depthTest = false;
    (h.material as THREE.LineBasicMaterial).transparent = true;
    (h.material as THREE.LineBasicMaterial).opacity = 0.9;
    h.renderOrder = 999;
    return h;
  }, [object]);
  useEffect(() => () => helper.dispose(), [helper]);
  useFrame(() => helper.update());
  return <primitive object={helper} />;
}

/**
 * Moves / rotates / scales several items together: the gizmo drives an invisible pivot at their
 * centre, and each change of the pivot is applied to every item relative to where the drag began.
 */
function GroupGizmo({
  objects,
  mode,
  snap,
  gizmoRef,
  onStart,
  onCommit,
}: {
  objects: THREE.Object3D[];
  mode: TransformMode;
  snap: number;
  gizmoRef: RefObject<THREE.Object3D | null>;
  onStart: () => void;
  onCommit: () => void;
}) {
  const pivot = useMemo(() => new THREE.Group(), []);
  const start = useRef<{ inverse: THREE.Matrix4; matrices: THREE.Matrix4[] } | null>(null);

  const recenter = useCallback(() => {
    const center = new THREE.Vector3();
    for (const o of objects) center.add(o.position);
    pivot.position.copy(center.divideScalar(Math.max(objects.length, 1)));
    pivot.quaternion.identity();
    pivot.scale.setScalar(1);
    pivot.updateMatrixWorld(true);
  }, [objects, pivot]);
  useLayoutEffect(recenter, [recenter]);

  return (
    <>
      <primitive object={pivot} />
      <TransformControls
        ref={gizmoRef as never}
        object={pivot}
        mode={mode}
        size={0.85}
        translationSnap={snap || null}
        rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
        scaleSnap={snap ? 0.1 : null}
        onMouseDown={() => {
          onStart();
          pivot.updateMatrixWorld(true);
          start.current = {
            inverse: pivot.matrixWorld.clone().invert(),
            matrices: objects.map((o) => {
              o.updateMatrix();
              return o.matrix.clone();
            }),
          };
        }}
        onObjectChange={() => {
          const from = start.current;
          if (!from) return;
          pivot.updateMatrixWorld(true);
          const delta = pivot.matrixWorld.clone().multiply(from.inverse);
          objects.forEach((o, i) => new THREE.Matrix4().multiplyMatrices(delta, from.matrices[i]).decompose(o.position, o.quaternion, o.scale));
        }}
        onMouseUp={() => {
          start.current = null;
          onCommit();
          recenter();
        }}
      />
    </>
  );
}

function Ghost({ placing, groupRef }: { placing: Placing; groupRef: RefObject<THREE.Group | null> }) {
  return (
    <group ref={groupRef} visible={false} rotation={[0, placing.rotation, 0]}>
      {placing.kind === "model" ? (
        <Suspense fallback={<LoadingBox size={placing.part.size} />}>
          <GhostModel glb={placing.part.glb} />
        </Suspense>
      ) : (
        <mesh>
          <sphereGeometry args={[0.25, 16, 12]} />
          <meshBasicMaterial color="#ffb050" transparent opacity={0.7} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function GhostModel({ glb }: { glb: string }) {
  const gltf = useGLTF(asset(glb), false, true);
  const { root, materials } = useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    const materials: THREE.Material[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      const ghost = (m: THREE.Material) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.55;
        c.depthWrite = false;
        materials.push(c);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ghost) : ghost(mesh.material);
    });
    return { root, materials };
  }, [gltf.scene]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return <primitive object={root} />;
}

/** Raycasts the items (for stacking parts on top of each other), then falls back to the ground plane. */
function pickPoint(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  ndc: THREE.Vector2,
  itemsRoot: THREE.Object3D | null,
  groundY: number,
  snap: number,
  ignore?: THREE.Object3D,
): THREE.Vector3 | null {
  raycaster.setFromCamera(ndc, camera);
  let point: THREE.Vector3 | null = null;
  if (itemsRoot) {
    const hits = raycaster.intersectObjects(itemsRoot.children, true);
    for (const hit of hits) {
      if (!(hit.object as THREE.Mesh).isMesh || hit.object.userData.editorOnly || !visibleInTree(hit.object)) continue;
      if (ignore && isDescendant(hit.object, ignore)) continue;
      point = hit.point.clone();
      break;
    }
  }
  if (!point) {
    point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY), point)) return null;
  }
  if (snap > 0) {
    point.x = Math.round(point.x / snap) * snap;
    point.z = Math.round(point.z / snap) * snap;
  }
  return point;
}

/**
 * Every library part file carries its own copy of its kit's texture atlas, so a scene built from one
 * kit holds dozens of identical images. The exporter de-duplicates by image object, so point all
 * pixel-identical textures at one image for the duration of the export. Returns an undo function.
 */
function shareIdenticalImages(root: THREE.Object3D): () => void {
  const textures = new Set<THREE.Texture>();
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture | null)?.isTexture && (value as THREE.Texture).image) textures.add(value as THREE.Texture);
      }
    }
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const keys = new Map<unknown, string | null>();
  const keyOf = (image: CanvasImageSource & { width: number; height: number }) => {
    if (keys.has(image)) return keys.get(image)!;
    let key: string | null = null;
    try {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx!.clearRect(0, 0, image.width, image.height);
      ctx!.drawImage(image, 0, 0);
      const pixels = new Uint32Array(ctx!.getImageData(0, 0, image.width, image.height).data.buffer);
      let h = 0x811c9dc5;
      for (let i = 0; i < pixels.length; i++) h = Math.imul(h ^ pixels[i], 0x01000193);
      key = `${image.width}x${image.height}:${h >>> 0}`;
    } catch {
      key = null;
    }
    keys.set(image, key);
    return key;
  };

  const canonical = new Map<string, unknown>();
  const swapped: [THREE.Texture, unknown][] = [];
  for (const texture of textures) {
    const image = texture.image as CanvasImageSource & { width: number; height: number };
    if (!ctx || !image.width || !image.height) continue;
    const key = keyOf(image);
    if (!key) continue;
    const shared = `${key}:${texture.userData.mimeType ?? ""}:${texture.flipY}`;
    const first = canonical.get(shared);
    if (!first) canonical.set(shared, image);
    else if (first !== image) {
      swapped.push([texture, image]);
      // Only the source reference changes; no GPU re-upload (needsUpdate isn't set).
      texture.source.data = first;
    }
  }
  return () => {
    for (const [texture, image] of swapped) texture.source.data = image;
  };
}

function visibleInTree(o: THREE.Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

function isDescendant(o: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

function Placement({
  placing,
  snap,
  itemsRoot,
  groundY,
  onPlace,
}: {
  placing: Placing;
  snap: number;
  itemsRoot: RefObject<THREE.Group | null>;
  groundY: number;
  onPlace: (position: Vec3, keepPlacing: boolean) => void;
}) {
  const get = useThree((s) => s.get);
  const ghost = useRef<THREE.Group>(null);
  const onPlaceRef = useRef(onPlace);
  useLayoutEffect(() => {
    onPlaceRef.current = onPlace;
  });

  useEffect(() => {
    const { gl } = get();
    const el = gl.domElement;
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    const hit = (e: PointerEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const { raycaster, camera } = get();
      return pickPoint(raycaster, camera, ndc, itemsRoot.current, groundY, snap);
    };
    const onMove = (e: PointerEvent) => {
      const p = hit(e);
      if (!ghost.current) return;
      ghost.current.visible = !!p;
      if (p) ghost.current.position.copy(p);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const p = hit(e);
      if (p) onPlaceRef.current([round(p.x), round(p.y), round(p.z)], e.shiftKey);
    };
    const onLeave = () => {
      if (ghost.current) ghost.current.visible = false;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.style.cursor = "crosshair";
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.style.cursor = "";
    };
  }, [get, itemsRoot, groundY, snap]);

  return <Ghost placing={placing} groupRef={ghost} />;
}

// --- Environment --------------------------------------------------------------------------------

/**
 * Fog distance and the sun's shadow box grow with the ground, so big (AI-generated) scenes stay visible
 * and shaded edge to edge. Grounds up to 200 m — every template — keep the base values.
 */
function Atmosphere({ env, groundSize }: { env: EnvKey; groundSize: number }) {
  const e = ENVIRONMENTS[env];
  const k = Math.max(1, (groundSize - 80) / 120);
  // The camera of a big scene sits far back, so fog recedes faster than the shadow box grows.
  const fogK = Math.max(1, 1 + (groundSize - 200) / 50);
  const sun = e.sun.position.map((n) => n * k) as Vec3;
  const box = 42 * k;
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    const { gl } = get();
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = e.exposure;
  }, [get, e.exposure]);

  const night = env === "night";
  return (
    <>
      <color attach="background" args={[e.background]} />
      {e.fog && <fog attach="fog" args={[e.fog[0], e.fog[1] * fogK, e.fog[2] * fogK]} />}
      {e.sky && <Sky distance={900} sunPosition={e.sky.sunPosition} turbidity={e.sky.turbidity} rayleigh={e.sky.rayleigh} mieCoefficient={0.006} mieDirectionalG={0.82} />}
      {e.stars && <Stars radius={260} depth={80} count={5000} factor={7} saturation={0.4} fade speed={0.4} />}
      {night && (
        <mesh position={[-70, 85, -160]}>
          <sphereGeometry args={[7, 32, 16]} />
          <meshBasicMaterial color="#e9ecff" fog={false} toneMapped={false} />
        </mesh>
      )}
      <hemisphereLight args={e.hemi} />
      <directionalLight
        // Remounted when the shadow box changes: R3F doesn't refresh a shadow camera's projection.
        key={box}
        castShadow
        position={sun}
        color={e.sun.color}
        intensity={e.sun.intensity}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-box}
        shadow-camera-right={box}
        shadow-camera-top={box}
        shadow-camera-bottom={-box}
        shadow-camera-near={1}
        shadow-camera-far={160 * k}
      />
      <Environment key={env} resolution={128} frames={1} environmentIntensity={e.envIntensity}>
        <Lightformer form="rect" intensity={2.4} position={[0, 8, 4]} scale={[10, 5, 1]} color={e.sun.color} />
        <Lightformer form="rect" intensity={1.2} position={[-8, 3, 2]} scale={[5, 6, 1]} color={e.hemi[0]} />
        <Lightformer form="rect" intensity={1.1} position={[8, 3, -2]} scale={[5, 6, 1]} color={e.hemi[0]} />
        <Lightformer form="circle" intensity={0.8} position={[0, -5, 0]} scale={8} color={e.hemi[1]} />
      </Environment>
    </>
  );
}

// --- API bridge ---------------------------------------------------------------------------------

function ApiBridge({
  apiRef,
  exportRoot,
  itemsRoot,
  editorRoot,
  groundRef,
  gizmoRef,
  registry,
  groundY,
  snap,
  onReady,
}: {
  apiRef: RefObject<BuilderApi | null>;
  exportRoot: RefObject<THREE.Group | null>;
  itemsRoot: RefObject<THREE.Group | null>;
  editorRoot: RefObject<THREE.Group | null>;
  groundRef: RefObject<THREE.Mesh | null>;
  gizmoRef: RefObject<THREE.Object3D | null>;
  registry: Map<string, THREE.Object3D>;
  groundY: number;
  snap: number;
  onReady?: () => void;
}) {
  const get = useThree((s) => s.get);
  const onReadyRef = useRef(onReady);
  useLayoutEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const controls = () => get().controls as unknown as OrbitControlsImpl | null;
    const camera = () => get().camera as THREE.PerspectiveCamera;

    /** Hides editor-only objects while `fn` runs, then restores them. */
    const withoutEditorUi = async <T,>(root: THREE.Object3D, extra: (o: THREE.Object3D) => boolean, fn: () => Promise<T> | T): Promise<T> => {
      const hidden: [THREE.Object3D, boolean][] = [];
      const hide = (o: THREE.Object3D | null | undefined) => {
        if (!o) return;
        hidden.push([o, o.visible]);
        o.visible = false;
      };
      root.traverse((o) => {
        if (o.userData.editorOnly || extra(o)) hide(o);
      });
      hide(editorRoot.current);
      hide(gizmoRef.current);
      try {
        return await fn();
      } finally {
        for (const [o, v] of hidden.reverse()) o.visible = v;
      }
    };

    apiRef.current = {
      async exportGLB(options) {
        const root = exportRoot.current;
        if (!root) throw new Error("Scene not ready");
        // Flickering lights export at their set brightness.
        const lights: [THREE.PointLight, number][] = [];
        root.traverse((o) => {
          const l = o as THREE.PointLight;
          if (l.isPointLight && typeof l.userData.baseIntensity === "number") {
            lights.push([l, l.intensity]);
            l.intensity = l.userData.baseIntensity;
          }
        });
        // The editor's ground is a huge plane; export only the part under the scene (plus a margin),
        // so viewers frame the scene instead of an empty field.
        const ground = groundRef.current;
        const groundBefore = ground ? { position: ground.position.clone(), scale: ground.scale.clone() } : null;
        if (options.ground && ground && itemsRoot.current) {
          const box = new THREE.Box3();
          itemsRoot.current.updateWorldMatrix(true, true);
          itemsRoot.current.traverseVisible((o) => {
            if ((o as THREE.Mesh).isMesh && !o.userData.editorOnly) box.expandByObject(o);
          });
          const width = (ground.geometry as THREE.PlaneGeometry).parameters.width;
          if (!box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const side = Math.min(width, Math.max(size.x, size.z) * 1.15 + 4);
            ground.position.set(center.x, ground.position.y, center.z);
            ground.scale.set(side / width, side / width, 1);
            ground.updateMatrixWorld(true);
          }
        }
        try {
          return await withoutEditorUi(
            root,
            (o) => (!options.lights && (o as THREE.Light).isLight) || (!options.ground && o === groundRef.current),
            async () => {
              let animations: THREE.AnimationClip[] = [];
              if (options.animations !== "none") {
                animations = collectClips(root, options.animations === "separate");
                if (options.animations === "together" && animations.length > 1) animations = [combineLoops(animations, "All animations")];
              }
              const exporter = new GLTFExporter();
              const restoreImages = shareIdenticalImages(root);
              exporter.register((writer) => ({
                afterParse() {
                  Object.assign((writer as unknown as { json: { asset: Record<string, unknown> } }).json.asset, {
                    generator: "3D Models — Scene Builder",
                    copyright: options.asset.copyright,
                    extras: options.asset.extras,
                  });
                },
              }));
              // The exporter writes userData into glTF extras; ours is editor bookkeeping (rest poses,
              // bound clips), so leave it out of the file.
              const userData = new Map<THREE.Object3D, Record<string, unknown>>();
              root.traverse((o) => {
                if (Object.keys(o.userData).length) {
                  userData.set(o, o.userData);
                  o.userData = {};
                }
              });
              try {
                return (await exporter.parseAsync(root, { binary: true, animations, onlyVisible: true })) as ArrayBuffer;
              } finally {
                for (const [o, data] of userData) o.userData = data;
                restoreImages();
              }
            },
          );
        } finally {
          for (const [l, i] of lights) l.intensity = i;
          if (ground && groundBefore) {
            ground.position.copy(groundBefore.position);
            ground.scale.copy(groundBefore.scale);
          }
        }
      },

      async screenshot() {
        const { gl, scene } = get();
        return withoutEditorUi(
          exportRoot.current ?? scene,
          () => false,
          () =>
            new Promise<Blob>((resolve, reject) => {
              // Render at least 1920 px wide for the capture; toBlob copies the pixels synchronously,
              // so the on-screen resolution can be restored straight after.
              const pixelRatio = gl.getPixelRatio();
              const size = gl.getSize(new THREE.Vector2());
              gl.setPixelRatio(Math.min(4, Math.max(pixelRatio, 1920 / Math.max(size.x, size.y, 1))));
              try {
                gl.render(scene, camera());
                gl.domElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Capture failed"))), "image/png");
              } finally {
                gl.setPixelRatio(pixelRatio);
              }
            }),
        );
      },

      focus(ids) {
        const targets = (ids?.length ? ids.map((id) => registry.get(id)) : [itemsRoot.current]).filter((o): o is THREE.Object3D => !!o);
        const c = controls();
        if (!targets.length || !c) return;
        const box = new THREE.Box3();
        for (const target of targets) {
          target.updateWorldMatrix(true, true);
          target.traverseVisible((o) => {
            if ((o as THREE.Mesh).isMesh && !o.userData.editorOnly) box.expandByObject(o);
          });
        }
        if (box.isEmpty()) box.setFromCenterAndSize(targets[0].getWorldPosition(new THREE.Vector3()), new THREE.Vector3(1, 1, 1));
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
        const cam = camera();
        const dir = cam.position.clone().sub(c.target).normalize();
        const distance = (radius / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2)) * (ids?.length ? 1.25 : 0.85);
        c.target.copy(center);
        cam.position.copy(center).addScaledVector(dir, distance);
        c.update();
      },

      getCamera() {
        const c = controls();
        const cam = camera();
        return { position: toVec(cam.position), target: c ? toVec(c.target) : [0, 0, 0] };
      },

      setCamera(view) {
        const c = controls();
        const cam = camera();
        cam.position.set(...view.position);
        if (c) {
          c.target.set(...view.target);
          c.update();
        } else {
          cam.lookAt(...view.target);
        }
      },

      pointAt(clientX, clientY) {
        const { gl, raycaster } = get();
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const p = pickPoint(raycaster, camera(), ndc, itemsRoot.current, groundY, snap);
        return p ? [round(p.x), round(p.y), round(p.z)] : null;
      },

      dropY(id) {
        const object = registry.get(id);
        if (!object) return null;
        object.updateWorldMatrix(true, true);
        const box = new THREE.Box3();
        object.traverseVisible((o) => {
          if ((o as THREE.Mesh).isMesh && !o.userData.editorOnly) box.expandByObject(o);
        });
        if (box.isEmpty()) return null;
        // Cast straight down from just above the item's base, ignoring the item itself.
        const center = box.getCenter(new THREE.Vector3());
        const raycaster = new THREE.Raycaster(new THREE.Vector3(center.x, box.min.y + 0.05, center.z), new THREE.Vector3(0, -1, 0));
        let surface = groundY;
        const hits = itemsRoot.current ? raycaster.intersectObjects(itemsRoot.current.children, true) : [];
        for (const hit of hits) {
          if (!(hit.object as THREE.Mesh).isMesh || hit.object.userData.editorOnly || isDescendant(hit.object, object) || !visibleInTree(hit.object)) continue;
          surface = Math.max(surface, hit.point.y);
          break;
        }
        return round(object.position.y + (surface - box.min.y));
      },
    };
    onReadyRef.current?.();
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, exportRoot, itemsRoot, editorRoot, groundRef, gizmoRef, registry, groundY, snap, get]);

  return null;
}

// --- Canvas -------------------------------------------------------------------------------------

export default function BuilderCanvas({
  doc,
  parts,
  clips,
  selectedIds,
  mode,
  space,
  paused,
  snap,
  showGrid,
  placing,
  apiRef,
  onSelect,
  onTransform,
  onPlace,
  onClips,
  onReady,
}: BuilderCanvasProps) {
  const exportRoot = useRef<THREE.Group>(null);
  const itemsRoot = useRef<THREE.Group>(null);
  const editorRoot = useRef<THREE.Group>(null);
  const groundRef = useRef<THREE.Mesh>(null);
  const gizmoRef = useRef<THREE.Object3D>(null);
  // Item id -> its scene group. A new Map on every change so selections recompute when parts mount.
  const [registry, setRegistry] = useState(() => new Map<string, THREE.Object3D>());
  // Clicks that end a gizmo drag or a placement must not also select / deselect items.
  const lastToolUse = useRef(0);
  const placingRef = useRef(placing);
  const pausedRef = useRef(paused);
  useLayoutEffect(() => {
    placingRef.current = placing;
    pausedRef.current = paused;
  });

  const register = useCallback((id: string, object: THREE.Object3D | null) => {
    setRegistry((prev) => {
      if (object ? prev.get(id) === object : !prev.has(id)) return prev;
      const next = new Map(prev);
      if (object) next.set(id, object);
      else next.delete(id);
      return next;
    });
  }, []);

  const onItemClick = useCallback(
    (item: SceneItem, e: ThreeEvent<MouseEvent>) => {
      if (placingRef.current || e.delta > 4 || performance.now() - lastToolUse.current < 250) return;
      e.stopPropagation();
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (item.locked) {
        if (!additive) onSelect(null, false);
        return;
      }
      onSelect(item.id, additive);
    },
    [onSelect],
  );

  const onItemDoubleClick = useCallback(
    (item: SceneItem, e: ThreeEvent<MouseEvent>) => {
      if (placingRef.current || item.locked) return;
      e.stopPropagation();
      apiRef.current?.focus([item.id]);
    },
    [apiRef],
  );

  const handlePlace = useCallback(
    (position: Vec3, keepPlacing: boolean) => {
      lastToolUse.current = performance.now();
      onPlace(position, keepPlacing);
    },
    [onPlace],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => doc.items.filter((i) => selectedSet.has(i.id)), [doc.items, selectedSet]);
  const clockRef = useRef(0);
  const selected = useMemo(
    () => selectedItems.map((item) => ({ item, object: registry.get(item.id) })).filter((s): s is { item: SceneItem; object: THREE.Object3D } => !!s.object),
    [selectedItems, registry],
  );
  const movable = useMemo(() => selected.filter((s) => !s.item.locked), [selected]);
  const movableObjects = useMemo(() => movable.map((s) => s.object), [movable]);
  const ground = GROUNDS[doc.ground.kind];

  const commit = useCallback(() => {
    lastToolUse.current = performance.now();
    onTransform(movable.map(({ item, object }) => ({ id: item.id, position: toVec(object.position), rotation: storedRotation(object), scale: toVec(object.scale) })));
  }, [movable, onTransform]);
  const markToolUse = useCallback(() => {
    lastToolUse.current = performance.now();
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 45, position: [0, 16, 34], near: 0.1, far: 2000 }}
      className="touch-none"
      onPointerMissed={(e) => {
        if (e.type !== "click" || placingRef.current || performance.now() - lastToolUse.current < 250) return;
        if (!(e.shiftKey || e.ctrlKey || e.metaKey)) onSelect(null, false);
      }}
    >
      <PausedContext.Provider value={pausedRef}>
        <ClockContext.Provider value={clockRef}>
          <SceneClock clockRef={clockRef} />
          <Atmosphere env={doc.environment} groundSize={doc.ground.size} />

          <group ref={exportRoot} name={doc.name || "Scene"}>
            <group ref={itemsRoot} name="Items">
              {doc.items.map((item) => (
                <ItemNode
                  key={item.id}
                  item={item}
                  part={item.part ? parts.get(item.part) : undefined}
                  clips={clips}
                  selected={selectedSet.has(item.id)}
                  register={register}
                  onClick={onItemClick}
                  onDoubleClick={onItemDoubleClick}
                  onClips={onClips}
                />
              ))}
            </group>
            {ground.color && (
              <mesh ref={groundRef} name="Ground" rotation-x={-Math.PI / 2} position-y={doc.ground.y} receiveShadow>
                <planeGeometry args={[doc.ground.size, doc.ground.size]} />
                <meshStandardMaterial color={ground.color} roughness={1} metalness={0} />
              </mesh>
            )}
          </group>

          <group ref={editorRoot}>
            {showGrid && (
              <Grid
                position={[0, doc.ground.y + 0.004, 0]}
                cellSize={snap || 1}
                sectionSize={(snap || 1) * 4}
                cellThickness={0.6}
                sectionThickness={1}
                cellColor="#4c4870"
                sectionColor="#7d6bc9"
                fadeDistance={55}
                fadeStrength={1.6}
                infiniteGrid
              />
            )}
            {selected.map(({ item, object }) => (
              <SelectionBox key={item.id} object={object} />
            ))}
            {selectedItems.map((item) => item.motion && <MotionPath key={item.id} item={item} />)}
          </group>

          {!placing && movable.length === 1 && (
            <TransformControls
              ref={gizmoRef as never}
              object={movable[0].object}
              mode={mode}
              space={space}
              size={0.85}
              translationSnap={snap || null}
              rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
              scaleSnap={snap ? 0.1 : null}
              onMouseDown={markToolUse}
              onMouseUp={commit}
            />
          )}
          {!placing && movable.length > 1 && <GroupGizmo objects={movableObjects} mode={mode} snap={snap} gizmoRef={gizmoRef} onStart={markToolUse} onCommit={commit} />}

          {placing && <Placement placing={placing} snap={snap} itemsRoot={itemsRoot} groundY={doc.ground.y} onPlace={handlePlace} />}

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={1} maxDistance={400} />
          <ApiBridge
            apiRef={apiRef}
            exportRoot={exportRoot}
            itemsRoot={itemsRoot}
            editorRoot={editorRoot}
            groundRef={groundRef}
            gizmoRef={gizmoRef}
            registry={registry}
            groundY={doc.ground.y}
            snap={snap}
            onReady={onReady}
          />
        </ClockContext.Provider>
      </PausedContext.Provider>
    </Canvas>
  );
}
