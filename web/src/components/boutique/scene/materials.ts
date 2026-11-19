import { MATERIAL } from "@/components/boutique/contract";
import * as THREE from "three";

/**
 * The boutique's materials, rebuilt in the browser.
 *
 * Blender's shaders are procedural node graphs and glTF cannot carry them, so
 * the GLB arrives with geometry and names and nothing else useful. Baking the
 * wall's grain into textures would have worked and would have cost several
 * megabytes; generating it here costs about eighty lines and one 512px canvas,
 * and it tiles by construction because it is written as a torus.
 *
 * The grain is the same idea the Blender shader settled on after two wrong
 * turns: noise sampled on coordinates stretched hard along the board. A
 * periodic function — a sine, a wave — gives evenly spaced stripes, which read
 * as fluting rather than as timber, and distorting it enough to break the
 * period turns it into drapery. Stretched noise is irregular at every scale and
 * never repeats within a board.
 */

/* ------------------------------------------------------------------ noise --- */

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Value noise on a torus, so the tile's edges meet. */
function tiling(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);
  const u = fade(xf);
  const v = fade(yf);
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function octaves(x: number, y: number, period: number, seed: number, count: number): number {
  let total = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < count; i += 1) {
    const p = period * 2 ** i;
    total += tiling(x * 2 ** i, y * 2 ** i, p, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.52;
  }
  return total / norm;
}

/* ----------------------------------------------------------------- walnut --- */

const SIZE = 512;

/**
 * One tile of smoked walnut: colour and roughness.
 *
 * `stretch` is how many times longer the figure runs along the board than
 * across it. That single number is what separates wood from marble.
 */
function walnutTiles(stretch: number, seed: number) {
  const colour = document.createElement("canvas");
  const rough = document.createElement("canvas");
  colour.width = colour.height = SIZE;
  rough.width = rough.height = SIZE;
  const cc = colour.getContext("2d");
  const rc = rough.getContext("2d");
  if (!cc || !rc) return null;

  const cImg = cc.createImageData(SIZE, SIZE);
  const rImg = rc.createImageData(SIZE, SIZE);

  // Both stops are dark: smoked walnut shows its figure as a shift in depth,
  // not as a swing from brown to cream.
  const darkR = 0x21;
  const darkG = 0x19;
  const darkB = 0x13;
  const liteR = 0x3f;
  const liteG = 0x2e;
  const liteB = 0x23;

  const period = 8;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = (x / SIZE) * period;
      const v = (y / SIZE) * period;

      // Across the board, tight. Along it, stretched.
      const figure = octaves(u * stretch, v, period * stretch, seed, 4);
      const fibre = octaves(u * stretch * 4.5, v * 4.5, period * stretch * 4, seed + 101, 2);
      const pore = octaves(u * stretch * 16, v * 16, period * stretch * 16, seed + 211, 1);

      // Gentle. The figure should read as a shift in depth across the board,
      // not as stripes — an over-contrasted ramp turns smoked walnut into pine.
      let t = figure * 0.74 + fibre * 0.26;
      t = Math.min(1, Math.max(0, (t - 0.2) / 0.66));

      const i = (y * SIZE + x) * 4;
      const shade = 0.95 + pore * 0.09;
      cImg.data[i] = (darkR + (liteR - darkR) * t) * shade;
      cImg.data[i + 1] = (darkG + (liteG - darkG) * t) * shade;
      cImg.data[i + 2] = (darkB + (liteB - darkB) * t) * shade;
      cImg.data[i + 3] = 255;

      // Roughness follows the figure, so the sheen breaks along the fibres and
      // the surface never reads as uniform satin.
      const r = (0.42 + t * 0.2 + pore * 0.08) * 255;
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = r;
      rImg.data[i + 3] = 255;
    }
  }
  cc.putImageData(cImg, 0, 0);
  rc.putImageData(rImg, 0, 0);
  return { colour, rough };
}

function walnutTexture(stretch: number, seed: number, repeat: [number, number]) {
  const tiles = walnutTiles(stretch, seed);
  if (!tiles) return null;
  const map = new THREE.CanvasTexture(tiles.colour);
  const roughnessMap = new THREE.CanvasTexture(tiles.rough);
  for (const t of [map, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap };
}

/* -------------------------------------------------------------- the library --- */

export type Materials = {
  byName: Map<string, THREE.Material>;
  dispose(): void;
};

/**
 * Build every material once.
 *
 * Everything is disposed together: textures, canvases and materials all belong
 * to the scene's lifetime, and a WebGL context that is never released is the
 * commonest way a page like this leaks.
 */
export function buildMaterials(quality: "high" | "balanced" | "low"): Materials {
  const made: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const byName = new Map<string, THREE.Material>();

  const register = (name: string, material: THREE.Material) => {
    material.name = name;
    made.push(material);
    byName.set(name, material);
    return material;
  };

  // One tile serves the whole wall; the three timbers differ in tint and in
  // how many times the tile repeats, which is enough to stop the eye finding
  // the repeat.
  const detail = quality === "low" ? 0 : 1;
  // UVs are one unit per metre, so `repeat` is tiles per metre: 0.75 puts one
  // tile across about 1.3 m of board, which is wide enough that the eye does
  // not find the repeat and tight enough to keep the grain at timber scale.
  const wall = detail ? walnutTexture(9, 3, [0.75, 0.55]) : null;
  const trim = detail ? walnutTexture(7, 11, [1.6, 1.2]) : null;
  if (wall) textures.push(wall.map, wall.roughnessMap);
  if (trim) textures.push(trim.map, trim.roughnessMap);

  register(
    MATERIAL.walnut,
    new THREE.MeshStandardMaterial({
      color: wall ? 0xffffff : 0x241b15,
      ...(wall ?? {}),
      roughness: wall ? 1 : 0.56,
      metalness: 0,
    }),
  );
  register(
    MATERIAL.walnutMid,
    new THREE.MeshStandardMaterial({
      color: trim ? 0x9e8c78 : 0x30241b,
      ...(trim ?? {}),
      roughness: trim ? 1 : 0.55,
      metalness: 0,
    }),
  );
  register(
    MATERIAL.walnutLight,
    new THREE.MeshStandardMaterial({
      color: trim ? 0xbfa98f : 0x4a382b,
      ...(trim ?? {}),
      roughness: trim ? 1 : 0.52,
      metalness: 0,
    }),
  );
  register(
    MATERIAL.walnutDark,
    new THREE.MeshStandardMaterial({ color: 0x1a120d, roughness: 0.68, metalness: 0 }),
  );

  register(
    MATERIAL.black,
    new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.58, metalness: 0.05 }),
  );
  register(
    MATERIAL.liner,
    new THREE.MeshStandardMaterial({ color: 0x191b20, roughness: 0.78, metalness: 0 }),
  );
  register(
    MATERIAL.linerHero,
    new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.74, metalness: 0 }),
  );
  register(
    MATERIAL.graphite,
    new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.46, metalness: 0.08 }),
  );
  register(
    MATERIAL.graphiteHero,
    new THREE.MeshStandardMaterial({ color: 0x171b22, roughness: 0.42, metalness: 0.08 }),
  );
  register(
    MATERIAL.brass,
    new THREE.MeshStandardMaterial({ color: 0x8c7a5e, roughness: 0.32, metalness: 1 }),
  );
  register(
    MATERIAL.metal,
    new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 0.34, metalness: 1 }),
  );
  register(MATERIAL.floor, new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.5, metalness: 0 }));

  // The engraved curve, and the cove strips. Emissive enough to read as lit,
  // nowhere near enough to read as neon — which is what the first pass of the
  // Blender scene got wrong and had to be dialled back four times.
  register(
    MATERIAL.curve,
    new THREE.MeshStandardMaterial({
      color: 0x8bd5e7,
      emissive: 0x8bd5e7,
      emissiveIntensity: 0.34,
      roughness: 0.4,
    }),
  );
  register(
    MATERIAL.curveHero,
    new THREE.MeshStandardMaterial({
      color: 0xff815e,
      emissive: 0xff815e,
      emissiveIntensity: 0.62,
      roughness: 0.4,
    }),
  );
  register(
    MATERIAL.strip,
    new THREE.MeshStandardMaterial({
      color: 0xe5bb82,
      emissive: 0xe5bb82,
      emissiveIntensity: 0.3,
      roughness: 0.9,
    }),
  );
  register(
    MATERIAL.stripHero,
    new THREE.MeshStandardMaterial({
      color: 0xf2d3a4,
      emissive: 0xf2d3a4,
      emissiveIntensity: 0.42,
      roughness: 0.9,
    }),
  );
  register(MATERIAL.ink, new THREE.MeshStandardMaterial({ color: 0xe8e4de, roughness: 0.74, metalness: 0 }));
  register(
    MATERIAL.inkDim,
    new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 0.78, metalness: 0 }),
  );

  return {
    byName,
    dispose() {
      for (const t of textures) t.dispose();
      for (const m of made) m.dispose();
      byName.clear();
    },
  };
}
