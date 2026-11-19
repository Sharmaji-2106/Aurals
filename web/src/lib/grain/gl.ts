"use client";

/**
 * A very small WebGL helper: enough for a full-surface fragment shader and for a
 * point cloud, and nothing more. No new dependency is worth the handful of places
 * that need the GPU, and everything else is better served by the compositor.
 */

export type Quality = "high" | "balanced" | "low";

/**
 * How hard to push this device. Deliberately conservative: a phone that reports
 * four cores gets a smaller buffer rather than a dropped frame, and everything
 * still renders.
 */
export function quality(): Quality {
  if (typeof navigator === "undefined") return "balanced";
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse || cores <= 4) return "low";
  return cores >= 8 ? "high" : "balanced";
}

/** Device pixel ratio, capped so a 3x phone screen does not cost 9x the fill. */
export function dpr(cap = 2) {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, cap);
}

export function context(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  const options: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  };
  return (canvas.getContext("webgl", options) ??
    canvas.getContext("experimental-webgl", options)) as WebGLRenderingContext | null;
}

function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const compiled = gl.createShader(type);
  if (!compiled) return null;
  gl.shaderSource(compiled, source);
  gl.compileShader(compiled);
  if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
    console.warn("[motion-studio] shader:", gl.getShaderInfoLog(compiled));
    gl.deleteShader(compiled);
    return null;
  }
  return compiled;
}

export function program(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const v = shader(gl, gl.VERTEX_SHADER, vertex);
  const f = shader(gl, gl.FRAGMENT_SHADER, fragment);
  if (!v || !f) return null;
  const linked = gl.createProgram();
  if (!linked) return null;
  gl.attachShader(linked, v);
  gl.attachShader(linked, f);
  gl.linkProgram(linked);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    console.warn("[motion-studio] link:", gl.getProgramInfoLog(linked));
    return null;
  }
  return linked;
}

/** Two triangles covering clip space, bound to `a_pos`. */
export function fullQuad(gl: WebGLRenderingContext, prog: WebGLProgram) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return buffer;
}

/** Resize the drawing buffer to match the element, returning true when it changed. */
export function resize(canvas: HTMLCanvasElement, ratio: number) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * ratio));
  const h = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}

export const VERTEX_PASSTHROUGH = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** The spectral ramp, as a GLSL function. Matches `lib/bands.ts` exactly. */
export const GLSL_SPECTRAL = `
vec3 spectral(float t) {
  t = clamp(t, 0.0, 1.0) * 8.0;
  vec3 c0 = vec3(1.000, 0.322, 0.220);
  vec3 c1 = vec3(1.000, 0.478, 0.227);
  vec3 c2 = vec3(1.000, 0.627, 0.290);
  vec3 c3 = vec3(0.961, 0.776, 0.471);
  vec3 c4 = vec3(0.914, 0.886, 0.765);
  vec3 c5 = vec3(0.722, 0.890, 0.839);
  vec3 c6 = vec3(0.522, 0.812, 0.902);
  vec3 c7 = vec3(0.498, 0.651, 0.957);
  vec3 c8 = vec3(0.659, 0.549, 0.965);
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  if (t < 4.0) return mix(c3, c4, t - 3.0);
  if (t < 5.0) return mix(c4, c5, t - 4.0);
  if (t < 6.0) return mix(c5, c6, t - 5.0);
  if (t < 7.0) return mix(c6, c7, t - 6.0);
  return mix(c7, c8, t - 7.0);
}
`;
