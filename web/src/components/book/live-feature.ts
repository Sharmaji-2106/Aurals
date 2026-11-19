"use client";

import { registerImage, type BookFeature, type ImageId } from "@/components/book/edition";
import type { BookRun } from "@/components/book/run";
import type { Recommendation } from "@/lib/api/client";
import { formatMoney } from "@/lib/currency";
import { analyse, type Palette } from "@/lib/palette";

/**
 * The book's last spread, for any earphone the engine chose.
 *
 * The prototype's spread was made by hand for one product: a photograph, a
 * cutout matted from it in an image editor, and the pair's position measured
 * once. Here the same three things are derived, in the browser, from whatever
 * photograph the catalogue holds for the listener's match:
 *
 * - the photograph is registered as one of the book's own images;
 * - its colours give the plate page its paper (`lib/palette`);
 * - a photograph on a white sweep has that sweep lifted to transparency by a
 *   flood fill from its border — only background connected to the edge goes, so
 *   white shells and faceplates enclosed by an outline stay — and a cutout or a
 *   photograph in a setting is used as it is;
 * - the product's bounds in the frame tell the camera where to close in.
 *
 * Every line printed beside it comes from the catalogue and the engine; nothing
 * is written about the product that the data does not say.
 */

const DRIVER_NAMES: Record<string, [string, string]> = {
  dynamic: ["dynamic", "dynamic"],
  balanced_armature: ["balanced armature", "balanced armatures"],
  ba: ["balanced armature", "balanced armatures"],
  planar: ["planar", "planars"],
  electrostatic: ["electrostatic", "electrostatics"],
  bone_conduction: ["bone conduction", "bone conduction"],
};

function drivers(config: Record<string, unknown> | null | undefined) {
  if (!config) return null;
  const parts = Object.entries(config)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([kind, n]) => {
      const [one, many] = DRIVER_NAMES[kind] ?? [kind.replace(/_/g, " "), kind.replace(/_/g, " ")];
      return `${n} ${(n as number) === 1 ? one : many}`;
    });
  return parts.length ? parts.join(" + ") : null;
}

const REGION_NAMES: Record<string, string> = {
  bass: "Bass",
  lower_mids: "Lower mids",
  vocals: "Vocals and presence",
  treble: "Treble",
  air: "Air",
};

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${src} could not be loaded`));
    img.src = src;
  });
}

/** A white studio sweep lifted to transparency, from the border inwards. */
function liftSweep(img: HTMLImageElement): string {
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  const frame = ctx.getImageData(0, 0, w, h);
  const d = frame.data;
  const sweep = (i: number) => {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    return Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 22;
  };
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (p: number) => {
    if (seen[p] || !sweep(p * 4)) return;
    seen[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  // Sweep enclosed by the product — the inside of a cable loop — is not
  // connected to the border. A large region of pure studio white is lifted too;
  // a white shell has shading and highlights small enough to stay.
  const pure = (i: number) => Math.min(d[i], d[i + 1], d[i + 2]) > 240;
  const minimum = Math.round(w * h * 0.0025);
  const region = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !sweep(start * 4)) continue;
    let n = 0;
    let clean = 0;
    region[n++] = start;
    seen[start] = 2;
    for (let k = 0; k < n; k++) {
      const p = region[k];
      if (pure(p * 4)) clean++;
      const x = p % w;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        p >= w ? p - w : -1,
        p < w * (h - 1) ? p + w : -1,
      ]) {
        if (q < 0 || seen[q] || !sweep(q * 4)) continue;
        seen[q] = 2;
        region[n++] = q;
      }
    }
    // Small, or shaded like a surface rather than flat like the sweep: keep it.
    if (n < minimum || clean / n < 0.85) for (let k = 0; k < n; k++) seen[region[k]] = 3;
  }
  for (let p = 0; p < w * h; p++) if (seen[p] === 3) seen[p] = 0;
  // Clear the sweep, and soften the edge one pixel deep so the outline is not
  // a hard stair-step: a light pixel touching the sweep keeps its colour and
  // loses some opacity in proportion to how light it is.
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (seen[p]) {
      d[i + 3] = 0;
      continue;
    }
    const x = p % w;
    const edge =
      (x > 0 && seen[p - 1]) ||
      (x < w - 1 && seen[p + 1]) ||
      (p >= w && seen[p - w]) ||
      (p < w * (h - 1) && seen[p + w]);
    if (edge) {
      const light = Math.min(d[i], d[i + 1], d[i + 2]) / 255;
      d[i + 3] = Math.round(d[i + 3] * Math.min(1, Math.max(0.35, (1 - light) * 3)));
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/png");
}

export type PreparedFeature = { feature: BookFeature; palette: Palette | null };

/** The selection spread for one recommendation, ready to print. */
export async function prepareFeature(rec: Recommendation, run: BookRun): Promise<PreparedFeature> {
  let plate: ImageId | null = null;
  let cutout = "";
  let pair = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  let palette: Palette | null = null;

  if (rec.image) {
    const src = `/api/iem-images/${rec.image.path}`;
    try {
      const img = await load(src);
      palette = analyse(img);
      const id: ImageId = `catalogue/${rec.slug}`;
      registerImage({
        id,
        brand: rec.brand,
        model: rec.model,
        catalogueSlug: rec.slug,
        file: src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: `${rec.brand} ${rec.model}`,
        source: {
          kind: "catalogue",
          name: rec.image.credit || rec.image.source,
          pageUrl: rec.image.source_url ?? "",
          imageUrl: src,
          retrievedOn: "",
        },
        processing: "Shown as gathered for the catalogue; only its background may be lifted for the ending.",
        licence: "As recorded with the catalogue's photograph.",
      });
      plate = id;
      cutout = palette?.kind === "studio" ? liftSweep(img) : src;
      if (palette && palette.kind !== "scene") pair = palette.bounds;
      else pair = { x: 0, y: 0, w: 1, h: 1 };
    } catch {
      plate = null; // the page then says no photograph is available
    }
  }

  const facts: { label: string; value: string }[] = [];
  const config = drivers(rec.driver_config);
  if (config) facts.push({ label: "Drivers", value: config });
  facts.push({ label: "Measured by", value: rec.measurement.source });
  if (rec.measurement.rig) facts.push({ label: "Rig", value: rec.measurement.rig });
  if (rec.measurement.variant) facts.push({ label: "Configuration", value: rec.measurement.variant });

  const price = rec.price
    ? {
        value: formatMoney(Number(rec.price.amount), rec.price.currency),
        note: [
          rec.price.source ? `Listed at ${rec.price.source}` : "Listed price",
          rec.price.observed_at
            ? new Date(rec.price.observed_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : null;

  const feature: BookFeature = {
    slug: rec.slug,
    brand: rec.brand,
    model: rec.model,
    headline: ["Written for the way", "you listen."],
    facts,
    factsSource: { name: "the AURALS catalogue", url: "", retrievedOn: run.capturedOn },
    measurement: rec.measurement.rig ? { by: rec.measurement.source, rig: rec.measurement.rig } : null,
    recommendation: {
      rank: rec.rank,
      of: run.measured,
      mean: rec.predicted_preference.mean,
      low: rec.predicted_preference.low,
      high: rec.predicted_preference.high,
      match: rec.match,
      listener: `you (${run.tracksAnalysed} tracks analysed)`,
    },
    plate,
    cutout,
    pair,
    shadow: null,
    plateGround: palette && palette.kind !== "scene" ? palette.light : "#F1E5D1",
    price,
    mood: null,
    fit: rec.reasons
      .filter((r) => r.kind === "match" && r.error_db != null && r.tolerance_db != null)
      .slice(0, 3)
      .map(
        (r) =>
          `${REGION_NAMES[r.region ?? ""] ?? r.region}: within ${Math.abs(r.error_db!).toFixed(1)} dB of your target, inside a ±${r.tolerance_db!.toFixed(1)} dB range.`,
      ),
    introduction: null,
    provenance: "recommendation",
  };
  return { feature, palette };
}
