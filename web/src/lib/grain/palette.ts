"use client";

import { BANDS, mixHex } from "@/lib/bands";

/**
 * The product's spectral ramp, warmed at both ends.
 *
 * The nine band colours are Auralis's own and are left exactly where they are —
 * warm lows, cool highs, in the order the frequency axis runs everywhere else in
 * the app. What is added is a bookend at each extreme: a magenta below sub-bass
 * and a deeper violet above air. That is enough to give the listening moment the
 * night-sunset character it was designed with, without it reading as a different
 * product from the screens on either side of it.
 *
 * Used by the grain sequence only. Charts, measurements and the signature line
 * keep the unmodified band colours, because those map to real frequencies.
 */
export const WARM_STOPS: { offset: number; color: string }[] = [
  { offset: 0, color: "#ff2d6b" },
  ...BANDS.map((band, i) => ({
    offset: 0.1 + (i / (BANDS.length - 1)) * 0.82,
    color: band.color,
  })),
  { offset: 1, color: "#7b3ff7" },
];

export function warmSpectral(t: number) {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < WARM_STOPS.length - 2 && x > WARM_STOPS[i + 1].offset) i += 1;
  const a = WARM_STOPS[i];
  const b = WARM_STOPS[i + 1];
  return mixHex(a.color, b.color, (x - a.offset) / (b.offset - a.offset));
}

/** The same ramp in GLSL, kept in step with `WARM_STOPS` above. */
export const GLSL_WARM = `
vec3 warmSpectral(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 m0 = vec3(1.000, 0.176, 0.420);  // magenta, below sub-bass
  vec3 c0 = vec3(1.000, 0.322, 0.220);  // sub-bass
  vec3 c1 = vec3(1.000, 0.478, 0.227);
  vec3 c2 = vec3(1.000, 0.627, 0.290);
  vec3 c3 = vec3(0.961, 0.776, 0.471);
  vec3 c4 = vec3(0.914, 0.886, 0.765);
  vec3 c5 = vec3(0.722, 0.890, 0.839);
  vec3 c6 = vec3(0.522, 0.812, 0.902);
  vec3 c7 = vec3(0.498, 0.651, 0.957);
  vec3 c8 = vec3(0.659, 0.549, 0.965);  // air
  vec3 m1 = vec3(0.482, 0.247, 0.969);  // violet, above air
  if (t < 0.10) return mix(m0, c0, t / 0.10);
  if (t > 0.92) return mix(c8, m1, (t - 0.92) / 0.08);
  float u = (t - 0.10) / 0.82 * 8.0;
  if (u < 1.0) return mix(c0, c1, u);
  if (u < 2.0) return mix(c1, c2, u - 1.0);
  if (u < 3.0) return mix(c2, c3, u - 2.0);
  if (u < 4.0) return mix(c3, c4, u - 3.0);
  if (u < 5.0) return mix(c4, c5, u - 4.0);
  if (u < 6.0) return mix(c5, c6, u - 5.0);
  if (u < 7.0) return mix(c6, c7, u - 6.0);
  return mix(c7, c8, u - 7.0);
}
`;
