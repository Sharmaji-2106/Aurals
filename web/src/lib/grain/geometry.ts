"use client";

/**
 * Geometry shared by the product's grain sequence and the motion studio that
 * designed it.
 *
 * Nothing here knows about React or about Auralis's data: it is the silhouette
 * the grain resolves into, the nodal figures it passes through on the way, and
 * the deterministic noise that keeps both identical on every replay.
 */

/** A deterministic pseudo-random in [0,1); same seed, same scene, every replay. */
export function rand(i: number, salt = 0) {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Points lying on the nodal lines of a vibrating square plate.
 *
 * `f = cos(nπu)cos(mπv) − cos(mπu)cos(nπv)` is zero exactly where the plate does
 * not move, which is where sand collects when you bow the edge of one. Rather
 * than reject-sample that set, each grain starts somewhere random and is pushed
 * onto it by a few Newton steps along the gradient — fast, and it spreads the
 * grain evenly along the figure instead of clumping it.
 */
export function chladniPoints(
  count: number,
  n: number,
  m: number,
  salt: number,
  spread: [number, number],
): [number, number][] {
  const PI = Math.PI;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    let u = rand(i, salt);
    let v = rand(i, salt + 1);
    for (let step = 0; step < 12; step += 1) {
      const cnu = Math.cos(n * PI * u);
      const cmv = Math.cos(m * PI * v);
      const cmu = Math.cos(m * PI * u);
      const cnv = Math.cos(n * PI * v);
      const f = cnu * cmv - cmu * cnv;
      const fu = -n * PI * Math.sin(n * PI * u) * cmv + m * PI * Math.sin(m * PI * u) * cnv;
      const fv = -m * PI * cnu * Math.sin(m * PI * v) + n * PI * cmu * Math.sin(n * PI * v);
      const g2 = fu * fu + fv * fv;
      if (g2 < 1e-6) break;
      u -= (f * fu) / g2;
      v -= (f * fv) / g2;
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        // Walked off the plate; start again somewhere else on it.
        u = rand(i, salt + 2 + step);
        v = rand(i, salt + 3 + step);
      }
    }
    out.push([(u - 0.5) * spread[0], (v - 0.5) * spread[1]]);
  }
  return out;
}

/* -------------------------------------------------------- headphones --- */

/**
 * One silhouette, five treatments. Keeping the geometry shared is what makes the
 * concepts comparable: what differs between them is how it is revealed, not what
 * a pair of headphones is.
 *
 * Drawn in a 240 x 180 box, origin top-left, sitting on a baseline at y = 150.
 */
export const HEADPHONE = {
  viewBox: "0 0 240 180",
  /**
   * The headband leaves each cup exactly at the centre of its top edge, so the
   * three strokes read as one object rather than an arc laid over two boxes.
   */
  band: "M52 102C52 44 82 24 120 24s68 20 68 78",
  cupLeft: "M48 102h8a18 18 0 0 1 18 18v26a18 18 0 0 1-18 18H48a18 18 0 0 1-18-18v-26a18 18 0 0 1 18-18z",
  cupRight: "M192 102h-8a18 18 0 0 0-18 18v26a18 18 0 0 0 18 18h8a18 18 0 0 0 18-18v-26a18 18 0 0 0-18-18z",
  driverLeft: { cx: 52, cy: 133, r: 9 },
  driverRight: { cx: 188, cy: 133, r: 9 },
  /** The vertical centre of the whole silhouette, for anything placing it. */
  midY: 94,
} as const;

/** Every stroke of the silhouette, for samplers that want the whole outline. */
export const HEADPHONE_OUTLINE = [HEADPHONE.band, HEADPHONE.cupLeft, HEADPHONE.cupRight] as const;

/**
 * Points along the silhouette, in viewBox coordinates.
 *
 * Measured from real path geometry rather than hand-placed, so the particle
 * concept converges on exactly the shape the other concepts draw.
 */
export function silhouettePoints(count: number): [number, number][] {
  if (typeof document === "undefined") return [];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", HEADPHONE.viewBox);
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.visibility = "hidden";
  const paths = HEADPHONE_OUTLINE.map((d) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
    return path;
  });
  document.body.append(svg);
  const lengths = paths.map((p) => p.getTotalLength());
  const total = lengths.reduce((a, b) => a + b, 0);
  const points: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    let at = (i / count) * total;
    for (let p = 0; p < paths.length; p += 1) {
      if (at <= lengths[p] || p === paths.length - 1) {
        const { x, y } = paths[p].getPointAtLength(Math.min(at, lengths[p]));
        points.push([x, y]);
        break;
      }
      at -= lengths[p];
    }
  }
  svg.remove();
  return points;
}
