import { MAX_HZ, MIN_HZ } from "./bands";

/** Map a frequency to [0, 1] on a logarithmic axis. */
export function logX(hz: number, min = MIN_HZ, max = MAX_HZ) {
  return Math.log(hz / min) / Math.log(max / min);
}

export function linear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export type Point = readonly [number, number];

/**
 * A smooth SVG path through points (Catmull-Rom converted to cubic Béziers).
 * `tension` 0 gives straight lines, 1 a loose curve.
 */
export function smoothPath(points: readonly Point[], tension = 0.5): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${fmt(points[0][0])},${fmt(points[0][1])}`;
  const t = tension / 6;
  let d = `M${fmt(points[0][0])},${fmt(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += `C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2[0])},${fmt(p2[1])}`;
  }
  return d;
}

/** Closed area between an upper and a lower line (both left to right). */
export function bandPath(upper: readonly Point[], lower: readonly Point[], tension = 0.5) {
  if (upper.length === 0) return "";
  const top = smoothPath(upper, tension);
  const bottom = smoothPath([...lower].reverse(), tension).replace(/^M/, "L");
  return `${top}${bottom}Z`;
}

function fmt(n: number) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
