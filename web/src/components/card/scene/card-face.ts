import { CARD, type Face } from "@/components/card/artwork";
import * as THREE from "three";

/**
 * One face of the card, painted into the two textures its material reads.
 *
 * - **Engraving** (half-float RGBA): the mark's coverage (G), and — each
 *   multiplied by that coverage — when the reveal reaches it (R, 0–1; 2 marks
 *   the code, which is stamped all at once), its strength (B) and whether it is
 *   foil (A). Weighted by coverage so filtering and mipmaps average only over
 *   the mark itself: R/G is the mark's time at any distance.
 * - **Relief** (RGBA8): the finished marks as a gently raised surface —
 *   coverage, softened, turned into slopes (RGB, a normal map) — with the
 *   softened height in A, for the soft shadow each raised mark casts.
 *
 * Painted once, on the CPU, when the card is made; nothing here runs per frame.
 */

export type FaceMaps = { engraving: THREE.DataTexture; relief: THREE.DataTexture };

/** Texels per card unit (0.1 mm). */
const SCALE = 1.8;
/** Code texels carry this time: past the end of any reveal. */
export const HALLMARK_TIME = 2;

function canvas2d(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return ctx;
}

const encode = (t: number, b: number) => {
  const v = Math.round(Math.min(1, Math.max(0, t)) * 65535);
  return `rgb(${v >> 8} ${v & 255} ${b})`;
};

export function paintFace(face: Face): FaceMaps {
  const w = Math.round(CARD.w * SCALE);
  const h = Math.round(CARD.h * SCALE);

  // Two paintings of the same marks. Coverage: white on nothing, exactly as
  // drawn. Data: each mark's time and strength as colour, drawn a little wider
  // on an opaque ground, so every covered texel reads a clean value from the
  // inside of its mark.
  const cover = canvas2d(w, h);
  const data = canvas2d(w, h);
  data.fillStyle = "#000";
  data.fillRect(0, 0, CARD.w, CARD.h);
  cover.strokeStyle = "#fff";
  cover.fillStyle = "#fff";
  const pad = 2.5 / SCALE;
  for (const s of face.strokes) {
    const times = s.times ?? s.points.map(() => 0);
    const b = s.foil ? 255 : Math.round(40 + 200 * s.tone);
    for (let i = 1; i < s.points.length; i++) {
      const width = Math.max(0.45, (s.widths[i - 1] + s.widths[i]) / 2);
      const [x0, y0] = s.points[i - 1];
      const [x1, y1] = s.points[i];
      data.strokeStyle = encode((times[i - 1] + times[i]) / 2, b);
      data.lineWidth = width + pad;
      data.beginPath();
      data.moveTo(x0, y0);
      data.lineTo(x1, y1);
      data.stroke();
      cover.lineWidth = width;
      cover.beginPath();
      cover.moveTo(x0, y0);
      cover.lineTo(x1, y1);
      cover.stroke();
    }
  }
  for (const f of face.fills) {
    const b = f.foil ? 255 : Math.round(40 + 200 * f.tone);
    const path = new Path2D();
    for (const poly of f.polys) {
      path.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
      path.closePath();
    }
    cover.fill(path, "nonzero");
    data.fillStyle = encode(f.time ?? 0, b);
    data.strokeStyle = data.fillStyle;
    data.lineWidth = pad;
    data.fill(path, "nonzero");
    data.stroke(path);
  }
  const stamp = face.stamp;
  if (stamp) {
    const cell = stamp.size / stamp.modules.length;
    data.fillStyle = "rgb(255 255 254)";
    stamp.modules.forEach((row, r) =>
      row.forEach((on, c) => {
        if (!on) return;
        cover.fillRect(stamp.x + c * cell, stamp.y + r * cell, cell + 0.05, cell + 0.05);
        data.fillRect(stamp.x + c * cell - pad / 2, stamp.y + r * cell - pad / 2, cell + pad, cell + pad);
      }),
    );
  }
  const coverPx = cover.getImageData(0, 0, w, h).data;
  const dataPx = data.getImageData(0, 0, w, h).data;
  const inStamp = (x: number, y: number) =>
    !!stamp &&
    x >= stamp.x * SCALE - 2 &&
    x <= (stamp.x + stamp.size) * SCALE + 2 &&
    y >= stamp.y * SCALE - 2 &&
    y <= (stamp.y + stamp.size) * SCALE + 2;

  /* ---- the engraving texture (rows flipped: texture v runs up) ---- */
  const engraving = new Uint16Array(w * h * 4);
  const height = new Float32Array(w * h);
  const half = THREE.DataUtils.toHalfFloat;
  for (let y = 0; y < h; y++) {
    const row = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = (row + x) * 4;
      const coverage = coverPx[i * 4 + 3] / 255;
      height[i] = coverage;
      if (coverage === 0) continue;
      const r = dataPx[i * 4];
      const g = dataPx[i * 4 + 1];
      const b = dataPx[i * 4 + 2];
      const hallmark = r === 255 && g === 255 && b === 254 && inStamp(x, y);
      const t = hallmark ? HALLMARK_TIME : (r * 256 + g) / 65535;
      engraving[o] = half(t * coverage);
      engraving[o + 1] = half(coverage);
      engraving[o + 2] = half((b === 255 ? 1 : Math.max(0, (b - 40) / 200)) * coverage);
      engraving[o + 3] = half((b === 255 ? 1 : 0) * coverage);
    }
  }

  /* ---- relief: coverage → softened height → slopes ---- */
  const soft = blur(blur(height, w, h, 2), w, h, 1);
  const relief = new Uint8Array(w * h * 4);
  const strength = 5;
  for (let y = 0; y < h; y++) {
    const row = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const l = soft[y * w + Math.max(0, x - 1)];
      const r = soft[y * w + Math.min(w - 1, x + 1)];
      const u = soft[Math.max(0, y - 1) * w + x];
      const d = soft[Math.min(h - 1, y + 1) * w + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (row + x) * 4;
      relief[o] = Math.round((nx * 0.5 + 0.5) * 255);
      relief[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      relief[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      relief[o + 3] = Math.round(Math.min(1, soft[y * w + x]) * 255);
    }
  }

  const engravingTex = new THREE.DataTexture(engraving, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  engravingTex.colorSpace = THREE.NoColorSpace;
  engravingTex.minFilter = THREE.LinearMipmapLinearFilter;
  engravingTex.magFilter = THREE.LinearFilter;
  engravingTex.generateMipmaps = true;
  engravingTex.anisotropy = 8;
  engravingTex.needsUpdate = true;
  const reliefTex = new THREE.DataTexture(relief, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  reliefTex.colorSpace = THREE.NoColorSpace;
  reliefTex.minFilter = THREE.LinearMipmapLinearFilter;
  reliefTex.magFilter = THREE.LinearFilter;
  reliefTex.generateMipmaps = true;
  reliefTex.anisotropy = 8;
  reliefTex.needsUpdate = true;
  return { engraving: engravingTex, relief: reliefTex };
}

/** Separable box blur of radius r. */
function blur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return dst;
}
