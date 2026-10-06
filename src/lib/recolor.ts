import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyGlbEdits, type GlbEdits, type GltfJson } from "@/lib/glb";

/**
 * Recolors a loaded glTF model and saves the result back into the original GLB.
 *
 * A model's colors live in one of two places, and each becomes one or more "parts":
 * - Material colors (glTF baseColorFactor) — e.g. Kenney's nature kit ("leafsDark", "wood"). On a
 *   textured material the color tints the texture, which is how photo-textured models are recolored.
 * - Palette textures — most low-poly kits (Kenney "colormap", KayKit) use one material whose small
 *   texture is a grid of gradient swatches, and every face samples exactly one swatch. Those swatches
 *   are found by flood-filling the texture, so each part of the model (car body, windows, tyres…)
 *   can be recolored on its own while keeping its shading gradient.
 *
 * Saving writes new baseColorFactors and re-encodes edited palettes as PNG (see applyGlbEdits), so
 * the downloaded file looks the same in any glTF viewer or engine.
 */

export interface ColorPart {
  /** "m:<material>" for a material color, "s:<image>:<swatch>" for a palette swatch. */
  key: string;
  kind: "material" | "swatch";
  label: string;
  detail: string;
  /** Original color as #rrggbb (sRGB). */
  original: string;
}

/** Largest per-channel step between neighbouring texels (0–255) that still counts as the same swatch. */
const SWATCH_STEP = 10;
/** Larger textures are artwork, not palettes; they're tinted as a whole. */
const MAX_PALETTE_SIZE = 2048;
/** Photo textures fall apart into thousands of regions; stop early. */
const MAX_REGIONS = 8192;
const MIN_SWATCH_PIXELS = 64;
const MAX_SWATCHES = 64;
/** Share of triangles that must lie entirely inside one swatch for a texture to be treated as a palette. */
const MIN_CLEAN_FACES = 0.97;
const HIGHLIGHT_MS = 900;
const HIGHLIGHT_EMISSIVE = new THREE.Color("#8b5cf6");
const HIGHLIGHT_PIXEL = [196, 181, 253]; // #c4b5fd
const WHITE = new THREE.Color("#ffffff");

type Colored = THREE.Material & { color: THREE.Color; emissive?: THREE.Color; map?: THREE.Texture | null };
type Associations = Map<object, { materials?: number; textures?: number }>;

interface Swatch {
  count: number;
  r: number;
  g: number;
  b: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Palette {
  image: number;
  width: number;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  /** Pristine pixels, RGBA. */
  source: Uint8ClampedArray;
  /** Working pixels, mirrored into the canvas the textures display. */
  pixels: ImageData;
  /** Swatch index per texel. */
  labels: Int32Array;
  swatches: Swatch[];
  textures: THREE.Texture[];
}

interface MeshSwatches {
  palette: Palette;
  /** Swatch index per triangle. */
  swatch: Int32Array;
}

export class ColorEditor {
  readonly parts: ColorPart[];
  private readonly associations: Associations;
  private readonly materials = new Map<number, Colored[]>();
  private readonly baseColors = new Map<number, THREE.Color>();
  private readonly baseEmissive = new Map<Colored, THREE.Color>();
  private readonly palettes = new Map<number, Palette>();
  private readonly faces = new Map<THREE.Object3D, MeshSwatches>();
  private readonly overrides = new Map<string, string>();
  private highlighted: { key: string; frame: number } | null = null;

  constructor(
    gltf: GLTF,
    private readonly file: ArrayBuffer,
    private readonly json: GltfJson,
  ) {
    this.associations = gltf.parser.associations as unknown as Associations;

    // Every drawable object, grouped by the glTF material it uses.
    const uses = new Map<number, { objects: THREE.Mesh[]; triangles: number }>();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const material = mesh.material as Colored | Colored[] | undefined;
      if (!mesh.geometry || !material || Array.isArray(material) || !material.color?.isColor) return;
      const index = this.associations.get(material)?.materials;
      if (index === undefined) return; // glTF default material: nothing in the file to recolor
      let list = this.materials.get(index);
      if (!list) {
        this.materials.set(index, (list = []));
        this.baseColors.set(index, material.color.clone());
      }
      if (!list.includes(material)) {
        list.push(material);
        if (material.emissive) this.baseEmissive.set(material, material.emissive.clone());
      }
      const use = uses.get(index) ?? { objects: [], triangles: 0 };
      use.objects.push(mesh);
      use.triangles += mesh.isMesh ? triangleCount(mesh.geometry) : 0;
      uses.set(index, use);
    });

    const found: { part: ColorPart; weight: number }[] = [];

    // Palette textures: one part per swatch the model actually uses.
    const byImage = new Map<number, number[]>();
    for (const [index, list] of this.materials) {
      const image = list[0].map ? this.imageOf(list[0].map) : undefined;
      if (image !== undefined) byImage.set(image, [...(byImage.get(image) ?? []), index]);
    }
    const paletteMaterials = new Set<number>();
    for (const [image, indices] of byImage) {
      const palette = readPalette(this.materials.get(indices[0])![0].map!, image);
      if (!palette) continue;
      const mapped = mapFaces(palette, indices.flatMap((i) => uses.get(i)?.objects ?? []));
      if (!mapped) continue;
      this.palettes.set(image, palette);
      for (const [object, swatch] of mapped.faces) this.faces.set(object, { palette, swatch });
      for (const [s, weight] of mapped.counts) {
        const { r, g, b, count } = palette.swatches[s];
        const [mr, mg, mb] = [r / count, g / count, b / count];
        found.push({
          part: { key: `s:${image}:${s}`, kind: "swatch", label: colorName(mr, mg, mb), detail: "Texture swatch", original: toHex(mr, mg, mb) },
          weight,
        });
      }
      indices.forEach((i) => paletteMaterials.add(i));
      // Show the editable canvas in place of the decoded image, everywhere the image is used.
      for (const list of this.materials.values()) {
        for (const material of list) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture && this.imageOf(value) === image && !palette.textures.includes(value)) {
              value.image = palette.canvas;
              value.needsUpdate = true;
              palette.textures.push(value);
            }
          }
        }
      }
    }

    // Everything else: one part per material.
    for (const [index, list] of this.materials) {
      if (paletteMaterials.has(index)) continue;
      found.push({
        part: {
          key: `m:${index}`,
          kind: "material",
          label: materialLabel(json.materials?.[index]?.name, index),
          detail: list[0].map ? "Tints the texture" : "Material color",
          original: `#${this.baseColors.get(index)!.getHexString()}`,
        },
        weight: uses.get(index)?.triangles ?? 0,
      });
    }

    found.sort((a, b) => b.weight - a.weight);
    const seen = new Map<string, number>();
    this.parts = found.map(({ part }) => {
      const n = (seen.get(part.label) ?? 0) + 1;
      seen.set(part.label, n);
      return n > 1 ? { ...part, label: `${part.label} ${n}` } : part;
    });
  }

  get changed(): boolean {
    return this.overrides.size > 0;
  }

  /** Sets a part's color (#rrggbb), or restores the original with null. */
  set(key: string, hex: string | null) {
    if (hex) this.overrides.set(key, hex.toLowerCase());
    else this.overrides.delete(key);
    this.render(key, 0);
  }

  /** The part under a picked triangle, if any. */
  partAt(object: THREE.Object3D, faceIndex: number): string | null {
    const faces = this.faces.get(object);
    if (faces) {
      const s = faceIndex >= 0 ? faces.swatch[faceIndex] : undefined;
      return s === undefined || s < 0 ? null : `s:${faces.palette.image}:${s}`;
    }
    const material = (object as THREE.Mesh).material;
    const index = material && !Array.isArray(material) ? this.associations.get(material)?.materials : undefined;
    const key = `m:${index}`;
    return index !== undefined && this.parts.some((p) => p.key === key) ? key : null;
  }

  /** Briefly makes a part glow, so it can be found on the model. */
  highlight(key: string) {
    this.stopHighlight();
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / HIGHLIGHT_MS;
      if (t >= 1) {
        this.highlighted = null;
        this.render(key, 0);
        return;
      }
      this.render(key, Math.sin(Math.PI * t) * 0.85);
      this.highlighted = { key, frame: requestAnimationFrame(tick) };
    };
    this.highlighted = { key, frame: requestAnimationFrame(tick) };
  }

  /** The original GLB with the current colors written into it. */
  async export(): Promise<Uint8Array<ArrayBuffer>> {
    this.stopHighlight();
    const edits: GlbEdits = { materials: new Map(), images: new Map() };
    const images = new Set<number>();
    for (const [key, hex] of this.overrides) {
      const [kind, id] = key.split(":");
      if (kind === "m") {
        const color = new THREE.Color(hex); // linear, like glTF's baseColorFactor
        edits.materials.set(Number(id), [color.r, color.g, color.b]);
      } else {
        images.add(Number(id));
      }
    }
    for (const image of images) {
      const canvas = this.palettes.get(image)!.canvas;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Couldn't encode the recolored texture.");
      edits.images.set(image, { data: new Uint8Array(await blob.arrayBuffer()), mimeType: "image/png" });
    }
    return applyGlbEdits(this.file, edits);
  }

  dispose() {
    if (this.highlighted) cancelAnimationFrame(this.highlighted.frame);
    this.highlighted = null;
    for (const palette of this.palettes.values()) palette.canvas.width = palette.canvas.height = 0;
  }

  private stopHighlight() {
    if (!this.highlighted) return;
    cancelAnimationFrame(this.highlighted.frame);
    const { key } = this.highlighted;
    this.highlighted = null;
    this.render(key, 0);
  }

  /** Draws a part in its current color, optionally glowing (0–1). */
  private render(key: string, glow: number) {
    const hex = this.overrides.get(key) ?? null;
    const [kind, a, b] = key.split(":");
    if (kind === "m") {
      const index = Number(a);
      const color = hex ? new THREE.Color(hex) : this.baseColors.get(index);
      if (!color) return;
      for (const material of this.materials.get(index) ?? []) {
        material.color.copy(color);
        const emissive = this.baseEmissive.get(material);
        if (emissive && material.emissive) material.emissive.copy(emissive).lerp(HIGHLIGHT_EMISSIVE, glow);
        else if (glow) material.color.lerp(WHITE, glow * 0.6);
      }
    } else {
      const palette = this.palettes.get(Number(a));
      if (palette) paintSwatch(palette, Number(b), hex, glow);
    }
  }

  /** The glTF image a texture was decoded from. */
  private imageOf(texture: THREE.Texture): number | undefined {
    const index = this.associations.get(texture)?.textures;
    const def = index === undefined ? undefined : this.json.textures?.[index];
    if (!def) return undefined;
    const ext = def.extensions ?? {};
    return ext.EXT_texture_webp?.source ?? ext.EXT_texture_avif?.source ?? ext.KHR_texture_basisu?.source ?? def.source;
  }
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3);
}

/** Decodes a texture's pixels and splits them into swatches; null if it can't be a palette. */
function readPalette(texture: THREE.Texture, image: number): Palette | null {
  const source = texture.image as { width?: number; height?: number } | null;
  const drawable =
    (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) ||
    (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement);
  if (!drawable || (texture as THREE.CompressedTexture).isCompressedTexture) return null;
  const { width = 0, height = 0 } = source;
  if (!width || !height || width > MAX_PALETTE_SIZE || height > MAX_PALETTE_SIZE) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source as CanvasImageSource, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  const segments = segment(pixels.data, width, height);
  if (!segments) return null;
  return { image, width, canvas, context, source: pixels.data.slice(), pixels, ...segments, textures: [] };
}

/** Flood-fills texels whose neighbours differ by at most SWATCH_STEP per channel. */
function segment(data: Uint8ClampedArray, width: number, height: number): { labels: Int32Array; swatches: Swatch[] } | null {
  const size = width * height;
  const labels = new Int32Array(size).fill(-1);
  const stack = new Int32Array(size);
  const swatches: Swatch[] = [];
  const near = (p: number, q: number) =>
    labels[q] === -1 &&
    Math.abs(data[p * 4] - data[q * 4]) <= SWATCH_STEP &&
    Math.abs(data[p * 4 + 1] - data[q * 4 + 1]) <= SWATCH_STEP &&
    Math.abs(data[p * 4 + 2] - data[q * 4 + 2]) <= SWATCH_STEP;

  for (let seed = 0; seed < size; seed++) {
    if (labels[seed] !== -1) continue;
    if (swatches.length >= MAX_REGIONS) return null;
    const id = swatches.length;
    const s: Swatch = { count: 0, r: 0, g: 0, b: 0, x0: width, y0: height, x1: 0, y1: 0 };
    let top = 0;
    stack[top++] = seed;
    labels[seed] = id;
    while (top) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      s.count++;
      s.r += data[p * 4];
      s.g += data[p * 4 + 1];
      s.b += data[p * 4 + 2];
      if (x < s.x0) s.x0 = x;
      if (x > s.x1) s.x1 = x;
      if (y < s.y0) s.y0 = y;
      if (y > s.y1) s.y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q < 0 || !near(p, q)) continue;
        labels[q] = id;
        stack[top++] = q;
      }
    }
    swatches.push(s);
  }
  return { labels, swatches };
}

/**
 * Finds the swatch under every triangle (sampled at its UV centroid). Returns null unless nearly
 * every triangle lies inside a single, reasonably large swatch — i.e. the texture is a palette.
 */
function mapFaces(palette: Palette, objects: THREE.Mesh[]) {
  const { width, labels, swatches } = palette;
  const height = labels.length / width;
  const faces = new Map<THREE.Object3D, Int32Array>();
  const counts = new Map<number, number>();
  const uv = new THREE.Vector2();
  let total = 0;
  let clean = 0;

  for (const object of objects) {
    if (!object.isMesh) continue;
    const map = (object.material as Colored).map!;
    map.updateMatrix();
    const geometry = object.geometry;
    const index = geometry.index;
    const triangles = triangleCount(geometry);
    total += triangles;
    const attribute = geometry.getAttribute(map.channel ? `uv${map.channel}` : "uv");
    if (!attribute) continue;
    const at = (u: number, v: number) => {
      map.transformUv(uv.set(u, v));
      const x = Math.min(width - 1, Math.max(0, Math.floor(uv.x * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(uv.y * height)));
      return labels[y * width + x];
    };
    const swatch = new Int32Array(triangles);
    for (let t = 0; t < triangles; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const [ua, va, ub, vb, uc, vc] = [attribute.getX(a), attribute.getY(a), attribute.getX(b), attribute.getY(b), attribute.getX(c), attribute.getY(c)];
      const s = at((ua + ub + uc) / 3, (va + vb + vc) / 3);
      swatch[t] = s;
      if (at(ua, va) === s && at(ub, vb) === s && at(uc, vc) === s) clean++;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    faces.set(object, swatch);
  }

  if (!total || clean / total < MIN_CLEAN_FACES || counts.size > MAX_SWATCHES) return null;
  for (const s of counts.keys()) if (swatches[s].count < MIN_SWATCH_PIXELS) return null;
  return { faces, counts };
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Repaints one swatch: the new color, shifted by each texel's original brightness offset (keeps gradients). */
function paintSwatch(palette: Palette, index: number, hex: string | null, glow: number) {
  const s = palette.swatches[index];
  const { source, labels, width } = palette;
  const out = palette.pixels.data;
  const target = hex ? parseInt(hex.slice(1), 16) : 0;
  const [tr, tg, tb] = [(target >> 16) & 255, (target >> 8) & 255, target & 255];
  const base = luma(s.r / s.count, s.g / s.count, s.b / s.count);
  const [hr, hg, hb] = HIGHLIGHT_PIXEL;
  for (let y = s.y0; y <= s.y1; y++) {
    for (let x = s.x0; x <= s.x1; x++) {
      const i = y * width + x;
      if (labels[i] !== index) continue;
      const o = i * 4;
      let r = source[o];
      let g = source[o + 1];
      let b = source[o + 2];
      if (hex) {
        const d = luma(r, g, b) - base;
        r = tr + d;
        g = tg + d;
        b = tb + d;
      }
      if (glow) {
        r += (hr - r) * glow;
        g += (hg - g) * glow;
        b += (hb - b) * glow;
      }
      out[o] = r; // Uint8ClampedArray rounds and clamps
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  palette.context.putImageData(palette.pixels, 0, 0, s.x0, s.y0, s.x1 - s.x0 + 1, s.y1 - s.y0 + 1);
  for (const texture of palette.textures) texture.needsUpdate = true;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

const HUES: [number, string][] = [
  [12, "Red"],
  [40, "Orange"],
  [64, "Yellow"],
  [90, "Lime"],
  [150, "Green"],
  [185, "Teal"],
  [205, "Cyan"],
  [245, "Blue"],
  [270, "Indigo"],
  [300, "Purple"],
  [335, "Pink"],
  [361, "Red"],
];

/** A short human name for an sRGB color (0–255 channels), e.g. "Dark green". */
function colorName(r: number, g: number, b: number): string {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.1) return "Black";
  if (s < 0.12 || d < 0.06) return l > 0.88 ? "White" : l > 0.62 ? "Light gray" : l < 0.3 ? "Dark gray" : "Gray";
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 12 && h < 50 && l < 0.4) return "Brown";
  if (h >= 20 && h < 50 && l > 0.65 && s < 0.7) return "Beige";
  const name = HUES.find(([limit]) => h < limit)![1];
  if (l > 0.75) return `Light ${name.toLowerCase()}`;
  if (l < 0.28) return `Dark ${name.toLowerCase()}`;
  return name;
}

/** "leafsDark" → "Leafs dark", "Aero_Wall_Mat" → "Aero wall". */
function materialLabel(name: string | undefined, index: number): string {
  const words = (name ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.:]+/g, " ")
    .replace(/\s+(mat|mtl|material)$/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : /^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w));
  return words.length ? words.join(" ") : `Material ${index + 1}`;
}
