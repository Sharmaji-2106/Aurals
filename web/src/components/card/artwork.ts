import type { ArtDirection, LineStyle, Pattern } from "@/components/card/commission";
import type { Library } from "@/components/card/listener";
import { signature, traits } from "@/components/card/reading";
import { parse, type Font } from "opentype.js";
import qrcode from "qrcode-generator";

/**
 * The Sound Card's artwork.
 *
 * A card you can read at a glance. The front says, top to bottom: whose card
 * it is (the playlist), **your sound** — one line from bass to treble against
 * a dashed line for typical music — **what stands out** in three plain words,
 * and **your best match**. The back has a window onto the finish's sky, who
 * you play most, and a code that opens your Listening Edition.
 *
 * Everything is a stroke or a filled shape with a time: when the reveal's
 * scan reaches it, top to bottom. The 3D card and the flat proof both read
 * these, so what you see is exactly what the data drew.
 *
 * Units: the card is 630 × 880 (63 × 88 mm), origin top left, y down. Text is
 * kept large (labels ≥ 14 units, names ≥ 30) because the card is shown at
 * roughly half a pixel per unit.
 */

export const CARD = { w: 630, h: 880, radius: 30, margin: 30 } as const;

export type Pass = "frame" | "relief" | "contours" | "title" | "details";

type Poly = [number, number][];

export type Stroke = {
  points: Poly;
  /** Width at each point (same length as points), in card units. */
  widths: number[];
  pass: Pass;
  /** 0–1: how strongly the cut reads. */
  tone: number;
  /** Laid in foil (the Aurals wordmark) rather than cut bare. */
  foil?: boolean;
  /** Set by `schedule`: when the scan reaches each point, 0–1. */
  times?: number[];
};

/** A filled shape — lettering, dots — drawn solid rather than as lines. */
export type Fill = { polys: Poly[]; tone: number; foil?: boolean; time?: number };

export type Face = {
  strokes: Stroke[];
  fills: Fill[];
  /** Regions the renderer treats specially (the back's window). */
  windows: { x: number; y: number; w: number; h: number; r: number }[];
  /** A square module grid to be stamped (the Edition code). */
  stamp: { x: number; y: number; size: number; modules: boolean[][] } | null;
};

export type Engraving = { front: Face; back: Face };

/* ------------------------------------------------------------- fonts --- */

const fontCache = new Map<string, Promise<Font>>();

export function loadFont(file: string): Promise<Font> {
  let promise = fontCache.get(file);
  if (!promise) {
    promise = fetch(file.startsWith("/") ? file : `/card/fonts/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${file}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => parse(buffer));
    fontCache.set(file, promise);
  }
  return promise;
}

/** A text's glyph outlines as closed polylines, curves flattened. */
function outlines(font: Font, text: string, x: number, baseline: number, size: number, tracking = 0): Poly[] {
  const polys: Poly[] = [];
  let cursor = x;
  const glyphs = font.stringToGlyphs(text);
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const path = glyph.getPath(cursor, baseline, size);
    let current: Poly = [];
    let px = 0;
    let py = 0;
    for (const c of path.commands) {
      if (c.type === "M") {
        if (current.length > 1) polys.push(current);
        current = [[c.x, c.y]];
        px = c.x;
        py = c.y;
      } else if (c.type === "L") {
        current.push([c.x, c.y]);
        px = c.x;
        py = c.y;
      } else if (c.type === "Q") {
        for (let k = 1; k <= 8; k++) {
          const t = k / 8;
          const u = 1 - t;
          current.push([
            u * u * px + 2 * u * t * c.x1 + t * t * c.x,
            u * u * py + 2 * u * t * c.y1 + t * t * c.y,
          ]);
        }
        px = c.x;
        py = c.y;
      } else if (c.type === "C") {
        for (let k = 1; k <= 10; k++) {
          const t = k / 10;
          const u = 1 - t;
          current.push([
            u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          ]);
        }
        px = c.x;
        py = c.y;
      } else if (c.type === "Z") {
        if (current.length > 1) {
          current.push([current[0][0], current[0][1]]);
          polys.push(current);
        }
        current = [];
      }
    }
    if (current.length > 1) polys.push(current);
    const kern = i < glyphs.length - 1 ? font.getKerningValue(glyph, glyphs[i + 1]) : 0;
    cursor += ((glyph.advanceWidth ?? 0) + kern) * (size / font.unitsPerEm) + tracking * size;
  }
  return polys;
}

function textWidth(font: Font, text: string, size: number, tracking = 0) {
  return font.getAdvanceWidth(text, size, { kerning: true }) + tracking * size * Math.max(0, text.length - 1);
}

/* ---------------------------------------------------------- geometry --- */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function stroke(points: Poly, width: number, pass: Pass, tone = 1): Stroke {
  return { points, widths: points.map(() => width), pass, tone };
}

function rect(x: number, y: number, w: number, h: number, r = 0): Poly {
  const pts: Poly = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let k = 0; k <= 6; k++) {
      const a = a0 + (k / 6) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

function circle(cx: number, cy: number, r: number, n = 14): Poly {
  const pts: Poly = [];
  for (let k = 0; k <= n; k++)
    pts.push([cx + r * Math.cos((k / n) * Math.PI * 2), cy + r * Math.sin((k / n) * Math.PI * 2)]);
  return pts;
}

/** Split a densely sampled polyline into the runs that lie inside a box. */
function clipTo(points: Poly, box: { x: number; y: number; w: number; h: number }): Poly[] {
  const inside = ([x, y]: [number, number]) =>
    x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  const runs: Poly[] = [];
  let run: Poly = [];
  for (const p of points) {
    if (inside(p)) run.push(p);
    else if (run.length) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function densify(a: [number, number], b: [number, number], step = 4): Poly {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return Array.from({ length: n + 1 }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / n,
    a[1] + ((b[1] - a[1]) * i) / n,
  ]);
}

export function hashNumber(text: string, mod: number) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % mod;
}

function shorten(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** A smooth curve through points (Catmull-Rom), sampled finely. */
function smooth(points: [number, number][], samples = 24): Poly {
  const out: Poly = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/* ------------------------------------------------------------ writing --- */

type TextOptions = {
  font?: Font;
  anchor?: "start" | "end" | "middle";
  tracking?: number;
  tone?: number;
  foil?: boolean;
};

type Writer = { text: (s: string, x: number, baseline: number, size: number, opts?: TextOptions) => number };

function writer(face: Face, small: Font): Writer {
  return {
    text(s, x, baseline, size, opts = {}) {
      const font = opts.font ?? small;
      const tracking = opts.tracking ?? 0;
      const w = textWidth(font, s, size, tracking);
      const left = opts.anchor === "end" ? x - w : opts.anchor === "middle" ? x - w / 2 : x;
      face.fills.push({
        polys: outlines(font, s, left, baseline, size, tracking),
        tone: opts.tone ?? 1,
        foil: opts.foil,
      });
      return w;
    },
  };
}

/** The largest size, up to `max`, at which `text` fits in `width`. */
function fit(font: Font, text: string, width: number, max: number, tracking = 0) {
  return Math.min(max, (width / Math.max(1, textWidth(font, text, 100, tracking))) * 100);
}

/* ------------------------------------------------------------ pattern --- */

function pattern(kind: Pattern, box: { x: number; y: number; w: number; h: number }): Poly[] {
  const lines: Poly[] = [];
  const { x, y, w, h } = box;
  if (kind === "pinstripe") {
    for (let d = -h; d < w; d += 16) lines.push(densify([x + d, y + h], [x + d + h, y]));
  } else if (kind === "grid") {
    for (let gx = x + 30; gx < x + w; gx += 30) lines.push(densify([gx, y], [gx, y + h]));
    for (let gy = y + 30; gy < y + h; gy += 30) lines.push(densify([x, gy], [x + w, gy]));
  } else if (kind === "rings") {
    for (let r = 24; r < w * 1.3; r += 22) lines.push(circle(x + w, y + h, r, Math.ceil(r / 3)));
  } else if (kind === "waves") {
    for (let gy = y + 18; gy < y + h; gy += 20) {
      const row: Poly = [];
      for (let gx = x; gx <= x + w; gx += 4) row.push([gx, gy + 4 * Math.sin(gx * 0.045 + gy * 0.3)]);
      lines.push(row);
    }
  } else if (kind === "sunburst") {
    const cx = x + w / 2;
    const cy = y + h + 40;
    for (let a = -170; a <= -10; a += 7) {
      const r = (a * Math.PI) / 180;
      lines.push(densify([cx, cy], [cx + Math.cos(r) * w, cy + Math.sin(r) * w]));
    }
  } else if (kind === "dots") {
    for (let gy = y + 14; gy < y + h; gy += 20)
      for (let gx = x + 14 + ((gy / 20) % 2) * 10; gx < x + w; gx += 20) lines.push(circle(gx, gy, 1.2, 6));
  }
  return lines.flatMap((l) => clipTo(l, box));
}

/* --------------------------------------------------------------- line --- */

function drawLine(face: Face, style: LineStyle, curve: Poly, zeroY: number) {
  const push = (pts: Poly, width: number, tone = 1) =>
    face.strokes.push(stroke(pts, width, "contours", tone));
  if (style === "single") {
    push(curve, 5.5);
  } else if (style === "echo") {
    push(
      curve.map(([x, y]) => [x, y + 26]),
      1.6,
      0.35,
    );
    push(
      curve.map(([x, y]) => [x, y + 13]),
      2.2,
      0.6,
    );
    push(curve, 5);
  } else if (style === "ridges") {
    for (let k = 5; k >= 1; k--) {
      const s = 1 - k * 0.14;
      push(
        curve.map(([x, y]) => [x, zeroY + (y - zeroY) * s - k * 11]),
        1.8,
        0.25 + 0.1 * (5 - k),
      );
    }
    push(curve, 4.5);
  } else if (style === "dots") {
    let acc = 0;
    for (let i = 1; i < curve.length; i++) {
      acc += Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]);
      if (acc >= 11) {
        acc = 0;
        face.fills.push({ polys: [circle(curve[i][0], curve[i][1], 3.4, 12)], tone: 1 });
      }
    }
  } else if (style === "bars") {
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const p = curve[Math.round((i / n) * (curve.length - 1))];
      push(
        [
          [p[0], zeroY],
          [p[0], p[1]],
        ],
        7,
        0.85,
      );
    }
    push(curve, 2.2);
  } else if (style === "ribbon") {
    const top = curve.map(([x, y]) => [x, y - 6] as [number, number]);
    const bottom = curve.map(([x, y]) => [x, y + 6] as [number, number]);
    face.fills.push({ polys: [[...top, ...bottom.reverse(), top[0]]], tone: 1 });
  }
}

/* -------------------------------------------------------------- build --- */

export type ArtworkInput = {
  lib: Library;
  art: ArtDirection;
  editionUrl: string;
  /** What the code opens, in two short lines under "Scan" (default: the Listening Edition). */
  scanLabel?: readonly [string, string];
};

export async function engrave({
  lib,
  art,
  editionUrl,
  scanLabel = ["Scan for your", "Listening Edition"],
}: ArtworkInput): Promise<Engraving> {
  const [titleFont, smallFont, scriptFont] = await Promise.all([
    loadFont(art.type.engrave),
    loadFont(art.type.small),
    loadFont("/book/fonts/Allura-Regular.ttf"),
  ]);
  const M = CARD.margin;
  const W = CARD.w;
  const H = CARD.h;
  const up = (s: string) => (art.type.uppercase ? s.toUpperCase() : s);
  const LABEL = { size: 15, tracking: 0.2 };
  const label = (w: Writer, s: string, x: number, y: number, anchor: "start" | "end" | "middle" = "start") =>
    w.text(s.toUpperCase(), x, y, LABEL.size, { tracking: LABEL.tracking, tone: 0.75, anchor });

  /* ---- front ---- */
  const front: Face = { strokes: [], fills: [], windows: [], stamp: null };
  const fw = writer(front, smallFont);
  front.strokes.push(stroke(rect(M, M, W - 2 * M, H - 2 * M, 20), 1.6, "frame"));
  front.strokes.push(stroke(rect(M + 9, M + 9, W - 2 * M - 18, H - 2 * M - 18, 13), 0.6, "frame", 0.6));

  // Header: the house mark, and which card this is.
  fw.text("Aurals", 56, 104, 58, { font: scriptFont, foil: true });
  const edition = `No. ${String(hashNumber(lib.slug, 9000) + 1000)}`;
  label(fw, "Sound Card", W - 56, 78, "end");
  label(fw, edition, W - 56, 100, "end");

  // Title: the playlist, as large as it fits; two lines if it must.
  const title = up(lib.title);
  const titleW = W - 112;
  let size = fit(titleFont, title, titleW, 64, art.type.tracking);
  let lines = [title];
  if (size < 40 && title.includes(" ")) {
    const words = title.split(" ");
    const half = Math.ceil(words.length / 2);
    lines = [words.slice(0, half).join(" "), words.slice(half).join(" ")];
    size = Math.min(...lines.map((l) => fit(titleFont, l, titleW, 56, art.type.tracking)));
  }
  let baseline = 172 + size * 0.7;
  for (const line of lines) {
    fw.text(line, 56, baseline, size, { font: titleFont, tracking: art.type.tracking });
    baseline += size * 1.02;
  }
  fw.text(`${lib.trackCount} songs · ${lib.artists.length} artists`, 58, baseline + 4, 18, { tone: 0.8 });

  // Your sound: the line, in a panel of its own. A two-line title pushes the
  // panel down (never under the count line above it); it keeps its bottom
  // edge, and everything inside scales with its height.
  const panelTop = Math.max(290, Math.round(baseline + 24));
  const panel = { x: 48, y: panelTop, w: W - 96, h: 580 - panelTop };
  const k = panel.h / 290;
  front.strokes.push(stroke(rect(panel.x, panel.y, panel.w, panel.h, 18), 1.1, "relief", 0.8));
  for (const p of pattern(art.pattern, { x: panel.x + 6, y: panel.y + 6, w: panel.w - 12, h: panel.h - 12 }))
    front.strokes.push(stroke(p, 0.7, "relief", 0.16));
  label(fw, "Your sound", panel.x + 22, panel.y + 34);
  const sig = signature(lib);
  const plot = { x0: panel.x + 34, x1: panel.x + panel.w - 34, zero: panel.y + Math.round(165 * k) };
  // Scaled to the listener's own range (never finer than ±2 dB), so a sound
  // close to typical still shows its shape; the dashed line keeps it honest.
  const reach = Math.max(2, ...sig.values.map((v) => Math.abs(v)));
  const perDb = (100 * k) / reach;
  // The reference: typical music, dashed, named at its end.
  for (let x = plot.x0; x < plot.x1; x += 18)
    front.strokes.push(
      stroke(densify([x, plot.zero], [Math.min(plot.x1, x + 10), plot.zero]), 1.3, "relief", 0.55),
    );
  fw.text("typical", plot.x1, plot.zero - 8, 13, { anchor: "end", tone: 0.6 });
  const pts: [number, number][] = sig.values.map((v, i) => [
    plot.x0 + (i / Math.max(1, sig.values.length - 1)) * (plot.x1 - plot.x0),
    plot.zero - v * perDb,
  ]);
  const curve = smooth(
    pts.length > 1
      ? pts
      : [
          [plot.x0, plot.zero],
          [plot.x1, plot.zero],
        ],
  );
  drawLine(front, art.line, curve, plot.zero);
  label(fw, "Bass", plot.x0, panel.y + panel.h - 20);
  label(fw, "Mids", (plot.x0 + plot.x1) / 2, panel.y + panel.h - 20, "middle");
  label(fw, "Treble", plot.x1, panel.y + panel.h - 20, "end");

  // What stands out: three words.
  const found = traits(lib);
  label(fw, "What stands out", 56, 630);
  const words = found.map((t) => up(t.word));
  const gap = 34;
  const wordsW = words.reduce((s, w) => s + textWidth(titleFont, w, 100, art.type.tracking), 0);
  const wSize = Math.min(38, ((W - 112 - gap * (words.length - 1)) / Math.max(1, wordsW)) * 100);
  let wx = 56;
  words.forEach((w, i) => {
    wx += fw.text(w, wx, 680, wSize, { font: titleFont, tracking: art.type.tracking });
    if (i < words.length - 1) {
      front.fills.push({ polys: [circle(wx + gap / 2, 680 - wSize * 0.3, 3, 10)], tone: 0.7 });
      wx += gap;
    }
  });

  // Your best match.
  front.strokes.push(stroke(densify([56, 718], [W - 56, 718]), 0.8, "details", 0.6));
  const top = lib.top;
  if (top) {
    label(fw, "Your best match", 56, 752);
    const name = up(`${top.brand} ${top.model}`);
    const nSize = fit(titleFont, name, W - 112 - 150, 40, art.type.tracking);
    fw.text(name, 56, 800, nSize, { font: titleFont, tracking: art.type.tracking });
    label(fw, "Match", W - 56, 752, "end");
    fw.text(top.predicted_preference.mean.toFixed(0), W - 56, 800, 40, { font: titleFont, anchor: "end" });
  }

  /* ---- back ---- */
  const back: Face = { strokes: [], fills: [], windows: [], stamp: null };
  const bw = writer(back, smallFont);
  back.strokes.push(stroke(rect(M, M, W - 2 * M, H - 2 * M, 20), 1.6, "frame"));
  back.strokes.push(stroke(rect(M + 9, M + 9, W - 2 * M - 18, H - 2 * M - 18, 13), 0.6, "frame", 0.6));
  const win = { x: 56, y: 58, w: W - 112, h: 236, r: 16 };
  back.windows.push(win);
  back.strokes.push(stroke(rect(win.x - 6, win.y - 6, win.w + 12, win.h + 12, win.r + 5), 1.2, "frame"));

  let y = 352;
  const most = lib.artists[0];
  if (most) {
    const name = up(shorten(most.name, 22));
    label(bw, "Most played", 60, y);
    bw.text(name, 60, y + 42, fit(titleFont, name, W - 120, 36, art.type.tracking), {
      font: titleFont,
      tracking: art.type.tracking,
    });
    bw.text(`${most.count} of ${lib.trackCount} songs`, 60, y + 70, 17, { tone: 0.8 });
    y += 120;
  }
  const live = lib.tracks.filter((t) => !t.outlier && t.title);
  const energetic = [...live].sort((a, b) => b.y - a.y)[0];
  const brightest = [...live].sort((a, b) => b.x - a.x)[0];
  for (const [what, track] of [
    ["Most energetic song", energetic],
    ["Brightest song", brightest],
  ] as const) {
    if (!track) continue;
    label(bw, what, 60, y);
    bw.text(shorten(track.title, 34), 60, y + 30, 20, { tone: 0.95 });
    y += 72;
  }

  // The code: your Listening Edition.
  const qr = qrcode(0, "M");
  qr.addData(editionUrl);
  qr.make();
  const count = qr.getModuleCount();
  const modules = Array.from({ length: count }, (_, r) =>
    Array.from({ length: count }, (__, c) => qr.isDark(r, c)),
  );
  const qs = 150;
  back.stamp = { x: W - 64 - qs, y: H - 70 - qs, size: qs, modules };
  back.strokes.push(stroke(rect(back.stamp.x - 10, back.stamp.y - 10, qs + 20, qs + 20, 6), 0.9, "details"));
  label(bw, scanLabel[0], 60, H - 150);
  label(bw, scanLabel[1], 60, H - 128);
  bw.text("Aurals", 58, H - 74, 50, { font: scriptFont, foil: true });

  schedule(front);
  schedule(back);
  return { front, back };
}

/**
 * When the reveal reaches each mark: a scan from the top of the card to the
 * bottom, the frame a moment ahead of everything inside it.
 */
function schedule(face: Face) {
  const at = (y: number) => clamp01((y - 40) / (CARD.h - 80));
  for (const s of face.strokes)
    s.times = s.points.map(([, y]) => (s.pass === "frame" ? at(y) * 0.8 : 0.04 + at(y) * 0.94));
  for (const f of face.fills) {
    let minY = Infinity;
    for (const poly of f.polys) for (const [, y] of poly) minY = Math.min(minY, y);
    f.time = 0.04 + at(minY) * 0.94;
  }
}
