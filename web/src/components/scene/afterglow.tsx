"use client";

import type { HourName } from "@/components/scene/hours";
import { cn } from "@/lib/cn";
import { context, dpr, fullQuad, program, quality, resize, VERTEX_PASSTHROUGH } from "@/lib/grain/gl";
import { useEffect, useRef } from "react";

/**
 * The evening, abstracted: what remains of the light once the beach is gone.
 *
 * The homepage shows the place — the sun going down over the water. Every
 * other page keeps only its light: slow, silky folds of colour drifting
 * through the dark, in the palette of the page's hour. No horizon, no sun, no
 * objects; nothing to read, just atmosphere under the words.
 *
 * One fragment shader, repainted at most twenty-four times a second, at a
 * reduced resolution (it is soft by nature). Still under reduced motion.
 */

const PALETTES: Record<HourName, { a: string; b: string; c: string; base: string }> = {
  golden: { a: "#ffc977", b: "#ff8a62", c: "#f2a7b8", base: "#120d16" },
  sunset: { a: "#ff8a62", b: "#ff5c8a", c: "#ffc977", base: "#120c18" },
  dusk: { a: "#ff5c8a", b: "#a64fd0", c: "#ffa07d", base: "#100b1c" },
  blue: { a: "#3d6bff", b: "#7b4dff", c: "#d06bd9", base: "#0b0c1f" },
  night: { a: "#2f7dff", b: "#6a3fd0", c: "#ff5c8a", base: "#090a18" },
};

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uBase;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y);
  float t = uTime * 0.018;

  // Domain-warped noise: soft folds, like light through silk.
  vec2 q = vec2(fbm(p * 1.1 + vec2(t, -t * 0.6)), fbm(p * 1.1 + vec2(-t * 0.7, t) + 4.3));
  vec2 r = vec2(fbm(p * 1.4 + q * 1.6 + vec2(1.7, 9.2) + t * 0.5), fbm(p * 1.4 + q * 1.6 + vec2(8.3, 2.8) - t * 0.4));
  float f = fbm(p * 1.2 + r * 1.8);

  // Long ribbons of light along the folds.
  float fold = sin((p.y * 2.2 + p.x * 0.8 + f * 3.4) * 2.4 + t * 2.0);
  float ribbon = smoothstep(0.55, 1.0, fold) * smoothstep(0.25, 0.75, f);
  float glow = smoothstep(0.35, 0.95, f);

  // The light lives toward the edges, away from where the words sit.
  float edge = smoothstep(0.15, 0.95, length((uv - vec2(0.42, 0.55)) * vec2(1.25, 1.0)));
  float lift = 0.35 + 0.65 * edge;

  vec3 col = uBase;
  col += mix(uA, uB, clamp(r.x * 1.3, 0.0, 1.0)) * glow * 0.26 * lift;
  col += mix(uB, uC, clamp(q.y * 1.2, 0.0, 1.0)) * ribbon * 0.36 * lift;
  col += uC * pow(ribbon, 3.0) * 0.12 * lift;

  vec2 v = uv - 0.5;
  col *= 1.0 - 0.45 * dot(v, v);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function Afterglow({ hour, className }: { hour: HourName; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = context(el);
    if (!gl) return;
    const prog = program(gl, VERTEX_PASSTHROUGH, FRAGMENT);
    if (!prog) return;
    gl.useProgram(prog);
    const quad = fullQuad(gl, prog);
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const palette = PALETTES[hour];
    gl.uniform3f(u("uA"), ...rgb(palette.a));
    gl.uniform3f(u("uB"), ...rgb(palette.b));
    gl.uniform3f(u("uC"), ...rgb(palette.c));
    gl.uniform3f(u("uBase"), ...rgb(palette.base));
    const res = u("uRes");
    const time = u("uTime");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ratio = Math.min(dpr(1), 1) * (quality() === "low" ? 0.35 : 0.5);
    const start = performance.now() - 40_000 * Math.random();
    let frame = 0;
    let last = 0;
    let painted = false;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden) return;
      const resized = resize(el, ratio);
      if (reduce && painted && !resized) return;
      if (!reduce && now - last < 1000 / 24) return;
      last = now;
      painted = true;
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform2f(res, el.width, el.height);
      gl.uniform1f(time, reduce ? 30 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
    };
  }, [hour]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("block h-full w-full", className)}
      data-afterglow={hour}
    />
  );
}
