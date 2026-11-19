"use client";

import { useEffect, useState } from "react";

/**
 * The colours of a product photograph's product: what the shell and faceplate
 * are actually made of, read from the pixels.
 *
 * Used to set the backdrop an earphone is shown on, so a blue-faceplate pair
 * stands in blue light and a black-and-gold one in warm graphite, rather than
 * every product in the same house sweep. It only ever chooses a backdrop: the
 * photograph itself is never recoloured by it.
 *
 * Three kinds of photograph reach the catalogue, and each needs its background
 * told apart from its product differently:
 *
 * - `matte`: a cutout with a transparent background (alpha decides);
 * - `studio`: a product on a plain, near-white sweep (the border decides);
 * - `scene`: a product in a setting — a desk, a hand, a coloured card — where
 *   no background can be removed honestly, so the whole frame's centre is read.
 */

export type ImageKind = "matte" | "studio" | "scene";

export type Palette = {
  kind: ImageKind;
  /** The product's dominant colour. */
  base: string;
  /** A second, distinct colour on the product (a faceplate pattern, a ring), if any. */
  accent: string | null;
  /** Backdrop tones, light to deep, derived from the product's colours. */
  light: string;
  mid: string;
  deep: string;
  /** The product's bounds within the image, 0–1, where a background could be told apart. */
  bounds: { x: number; y: number; w: number; h: number };
  /** True when the product is mostly black, grey or silver. */
  neutral: boolean;
};

type Rgb = [number, number, number];

function hsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

const css = (h: number, s: number, l: number) =>
  `hsl(${h.toFixed(0)} ${(Math.max(0, Math.min(1, s)) * 100).toFixed(0)}% ${(Math.max(0, Math.min(1, l)) * 100).toFixed(0)}%)`;
const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

const SIZE = 96;
const BUCKETS = 24;

/** Reads a decoded image. Synchronous and cheap: it works on a 96 px thumbnail. */
export function analyse(image: CanvasImageSource & { width: number; height: number }): Palette | null {
  const scale = SIZE / Math.max(image.width, image.height);
  const w = Math.max(8, Math.round(image.width * scale));
  const h = Math.max(8, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // a cross-origin image without CORS cannot be read
  }
  const at = (x: number, y: number): [number, number, number, number] => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  // What kind of photograph, from its alpha and its border.
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++;
  const border: Rgb[] = [];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) border.push(at(x, y).slice(0, 3) as Rgb);
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) border.push(at(x, y).slice(0, 3) as Rgb);
  const mean = border
    .reduce<Rgb>((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0])
    .map((v) => v / border.length) as Rgb;
  const spread = Math.sqrt(
    border.reduce((s, p) => s + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2, 0) /
      border.length,
  );
  // A studio sweep: most of the border is near-white, even where a cable or a
  // watermark reaches the edge. Measured as a share, so a few dark pixels on
  // the border do not turn a white-background photograph into a scene.
  const whiteShare = border.filter((p) => Math.min(...p) > 226).length / border.length;
  const plain = Math.min(...mean) > 222 && spread < 30;
  const kind: ImageKind = clear / (w * h) > 0.05 ? "matte" : whiteShare > 0.82 || plain ? "studio" : "scene";
  if (kind === "studio" && !plain) mean.splice(0, 3, 250, 250, 250);

  // Which pixels are the product.
  const product = (x: number, y: number) => {
    const [r, g, b, a] = at(x, y);
    if (kind === "matte") return a > 200;
    if (kind === "studio") return Math.hypot(r - mean[0], g - mean[1], b - mean[2]) > 42;
    // A scene: the middle of the frame, where the product nearly always is.
    return x > w * 0.18 && x < w * 0.82 && y > h * 0.18 && y < h * 0.82;
  };

  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  const hue = Array.from({ length: BUCKETS }, () => ({ weight: 0, sum: [0, 0, 0] as Rgb }));
  let chroma = 0;
  let count = 0;
  const all: Rgb = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!product(x, y)) continue;
      const px = at(x, y).slice(0, 3) as Rgb;
      count++;
      all[0] += px[0];
      all[1] += px[1];
      all[2] += px[2];
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      const [hh, s, l] = hsl(px);
      // Highlights and deep shadows carry no colour worth reading.
      if (s < 0.22 || l < 0.1 || l > 0.9) continue;
      const bucket = hue[Math.floor(hh / (360 / BUCKETS)) % BUCKETS];
      const wgt = s * (1 - Math.abs(l - 0.5));
      bucket.weight += wgt;
      bucket.sum[0] += px[0] * wgt;
      bucket.sum[1] += px[1] * wgt;
      bucket.sum[2] += px[2] * wgt;
      chroma += wgt;
    }
  }
  if (count < 12) return null;

  const average = all.map((v) => v / count) as Rgb;
  const ranked = hue
    .map((b, i) => ({ ...b, i }))
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const colour = (b: (typeof ranked)[number]) => b.sum.map((v) => v / b.weight) as Rgb;
  // Colourful enough to call it the product's colour, rather than a reflection.
  const neutral = !ranked.length || chroma / count < 0.06;
  const top = ranked[0];
  const second = ranked.find(
    (b) =>
      top &&
      Math.min(Math.abs(b.i - top.i), BUCKETS - Math.abs(b.i - top.i)) >= 3 &&
      b.weight > top.weight * 0.25,
  );

  const baseRgb = neutral ? average : colour(top);
  const accentRgb = neutral
    ? top && top.weight / count > 0.012
      ? colour(top)
      : null
    : second
      ? colour(second)
      : null;
  const [bh, bs] = hsl(baseRgb);
  const [ah, as] = accentRgb ? hsl(accentRgb) : [bh, bs];

  // The backdrop: the product's own hue, quieter and lighter, so the product
  // still stands out from it. A neutral product borrows its accent's hue, or
  // a warm graphite when it has none.
  let tones: [string, string, string];
  if (!neutral) {
    tones = [
      css(bh, Math.min(0.62, bs * 0.7 + 0.08), 0.86),
      css(bh, Math.min(0.6, bs * 0.65 + 0.1), 0.68),
      css(bh, Math.min(0.55, bs * 0.6 + 0.1), 0.2),
    ];
  } else if (accentRgb) {
    tones = [
      css(ah, Math.min(0.32, as * 0.4), 0.87),
      css(ah, Math.min(0.3, as * 0.38), 0.7),
      css(ah, Math.min(0.3, as * 0.4), 0.17),
    ];
  } else {
    tones = [css(32, 0.12, 0.88), css(28, 0.08, 0.7), css(240, 0.08, 0.16)];
  }

  return {
    kind,
    base: hex(baseRgb),
    accent: accentRgb ? hex(accentRgb) : null,
    light: tones[0],
    mid: tones[1],
    deep: tones[2],
    bounds:
      kind === "scene" || x1 <= x0
        ? { x: 0, y: 0, w: 1, h: 1 }
        : { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h },
    neutral,
  };
}

const cache = new Map<string, Promise<Palette | null>>();

/** Loads and reads an image once per address; later calls share the answer. */
export function paletteOf(src: string): Promise<Palette | null> {
  let hit = cache.get(src);
  if (!hit) {
    hit = new Promise<Palette | null>((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(analyse(img));
      img.onerror = () => resolve(null);
      img.src = src;
    });
    cache.set(src, hit);
  }
  return hit;
}

/** The palette of a photograph, once it has been read (null until then, or without one). */
export function usePalette(src: string | null | undefined): Palette | null {
  const [state, setState] = useState<{ src: string; palette: Palette | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    void paletteOf(src).then((palette) => live && setState({ src, palette }));
    return () => {
      live = false;
    };
  }, [src]);
  return state && state.src === src ? state.palette : null;
}
