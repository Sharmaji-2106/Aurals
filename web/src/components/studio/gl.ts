"use client";

/** The studio's own shader material. The WebGL plumbing lives in lib/grain. */

export {
  GLSL_SPECTRAL,
  VERTEX_PASSTHROUGH,
  context,
  dpr,
  fullQuad,
  program,
  quality,
  resize,
  type Quality,
} from "@/lib/grain/gl";

/** The Vice ramp, matching `VICE_STOPS` in material.ts. */
export const GLSL_VICE = `
vec3 vice(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.227, 0.086, 0.388);
  vec3 c1 = vec3(0.482, 0.184, 0.969);
  vec3 c2 = vec3(0.753, 0.149, 0.827);
  vec3 c3 = vec3(1.000, 0.176, 0.584);
  vec3 c4 = vec3(1.000, 0.416, 0.239);
  vec3 c5 = vec3(1.000, 0.702, 0.278);
  vec3 c6 = vec3(1.000, 0.902, 0.659);
  if (t < 0.16) return mix(c0, c1, t / 0.16);
  if (t < 0.34) return mix(c1, c2, (t - 0.16) / 0.18);
  if (t < 0.52) return mix(c2, c3, (t - 0.34) / 0.18);
  if (t < 0.70) return mix(c3, c4, (t - 0.52) / 0.18);
  if (t < 0.86) return mix(c4, c5, (t - 0.70) / 0.16);
  return mix(c5, c6, (t - 0.86) / 0.14);
}
`;
