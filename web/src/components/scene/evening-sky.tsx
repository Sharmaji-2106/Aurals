"use client";

import {
  context,
  dpr,
  fullQuad,
  GLSL_SPECTRAL,
  program,
  quality,
  resize,
  VERTEX_PASSTHROUGH,
} from "@/lib/grain/gl";
import { cn } from "@/lib/cn";
import { isMotionValue, type MotionValue } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * The evening, painted live: the sky through its hours, the sun going down
 * into the sea, a city along the shore whose windows and neon come on after
 * dusk, stars at night.
 *
 * The sea is AURALS' own: every wave is a spectrum — a curve of energy across
 * the frequencies, air on the left and bass on the right, as every chart here
 * draws it — rolling in toward you. The sun lays its path across them.
 *
 * One fragment shader on one quad. Driven by numbers that may be motion
 * values (so a page's scroll can set the hour) and repainted at most thirty
 * times a second; when the user prefers reduced motion, the sea stops and the
 * scene is repainted only when its hour or horizon changes.
 */

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uHour;
uniform float uHorizon;
uniform vec2 uLook;
uniform float uSea;
uniform float uCity;
uniform float uMinimal;

${GLSL_SPECTRAL}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Five hours, four sky stops each: horizon, low, mid, zenith.
vec3 hourMix(vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
  float h = clamp(uHour, 0.0, 4.0);
  if (h < 1.0) return mix(a, b, smoothstep(0.0, 1.0, h));
  if (h < 2.0) return mix(b, c, smoothstep(0.0, 1.0, h - 1.0));
  if (h < 3.0) return mix(c, d, smoothstep(0.0, 1.0, h - 2.0));
  return mix(d, e, smoothstep(0.0, 1.0, h - 3.0));
}
float hourMix1(float a, float b, float c, float d, float e) {
  float h = clamp(uHour, 0.0, 4.0);
  if (h < 1.0) return mix(a, b, smoothstep(0.0, 1.0, h));
  if (h < 2.0) return mix(b, c, smoothstep(0.0, 1.0, h - 1.0));
  if (h < 3.0) return mix(c, d, smoothstep(0.0, 1.0, h - 2.0));
  return mix(d, e, smoothstep(0.0, 1.0, h - 3.0));
}

vec3 cHorizon() { return hourMix(vec3(1.0, 0.80, 0.56), vec3(1.0, 0.60, 0.40), vec3(0.95, 0.42, 0.45), vec3(0.47, 0.34, 0.74), vec3(0.17, 0.12, 0.30)); }
vec3 cLow()     { return hourMix(vec3(1.0, 0.52, 0.36), vec3(0.93, 0.34, 0.47), vec3(0.62, 0.22, 0.52), vec3(0.22, 0.23, 0.58), vec3(0.08, 0.09, 0.23)); }
vec3 cMid()     { return hourMix(vec3(0.66, 0.36, 0.55), vec3(0.42, 0.20, 0.53), vec3(0.24, 0.12, 0.40), vec3(0.10, 0.12, 0.35), vec3(0.04, 0.05, 0.15)); }
vec3 cZenith()  { return hourMix(vec3(0.13, 0.15, 0.40), vec3(0.13, 0.12, 0.36), vec3(0.07, 0.07, 0.22), vec3(0.035, 0.05, 0.18), vec3(0.015, 0.018, 0.055)); }
vec3 cSun()     { return hourMix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.78, 0.52), vec3(1.0, 0.52, 0.40), vec3(0.85, 0.38, 0.52), vec3(0.4, 0.25, 0.55)); }

vec3 sky(float h) {
  vec3 col = mix(cHorizon(), cLow(), smoothstep(0.0, 0.11, h));
  col = mix(col, cMid(), smoothstep(0.08, 0.45, h));
  col = mix(col, cZenith(), smoothstep(0.38, 1.0, h));
  return col;
}

// A spectrum, for one wave: a few soft peaks, a gentle tilt, its own shape.
float spectrumCurve(float k, float x) {
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float c = hash1(k * 3.17 + fi * 7.1);
    float w = 0.06 + 0.16 * hash1(k * 1.31 + fi * 3.7);
    float a = 0.35 + 0.65 * hash1(k * 5.77 + fi * 1.9);
    float d = (x - c) / w;
    s += a * exp(-d * d);
  }
  return s * 0.6 + 0.25 * (1.0 - x);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float hor = uHorizon + uLook.y * 0.012;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

  float sunUp = hourMix1(0.17, 0.075, -0.004, -0.09, -0.3);
  float sunPower = clamp(1.0 - uHour / 3.2, 0.0, 1.0);
  float night = smoothstep(2.2, 3.7, uHour);
  float lights = smoothstep(1.4, 3.0, uHour);
  vec2 sunPos = vec2((0.63 - 0.5) * aspect + uLook.x * 0.02, hor + sunUp);
  vec3 sunCol = cSun();

  vec3 col;
  if (uv.y >= hor) {
    /* ---- the sky ---- */
    float h = (uv.y - hor) / max(0.001, 1.0 - hor);
    col = sky(h);
    vec2 ds = p - sunPos;
    ds.y *= mix(1.0, 1.25, smoothstep(0.08, 0.0, uv.y - hor));
    float d = length(ds);
    // Scattered light: a wide warm halo, a tighter bloom, and the long band of
    // light the sun lays along the horizon.
    col += sunCol * (exp(-d * 4.0) * 0.45 + mix(exp(-d * 14.0) * 0.6 + exp(-d * 40.0) * 0.5, exp(-d * 7.0) * 0.35, uMinimal)) * sunPower;
    col += mix(sunCol, cLow(), 0.4) * exp(-(uv.y - hor) * 14.0) * exp(-abs(ds.x) * 1.3) * 0.45 * (sunPower * 0.8 + 0.2);
    // Cloud streaks, lit from beneath near the sun.
    float band = smoothstep(0.04, 0.14, h) * smoothstep(0.62, 0.22, h);
    float c = fbm(vec2(p.x * 1.5 + uTime * 0.006, p.y * 10.0 - p.x * 0.35));
    float streak = smoothstep(0.5, 0.78, c) * band;
    float lit = exp(-abs(ds.x) * 1.4) * sunPower + 0.18;
    vec3 cloud = mix(cMid() * 0.75, mix(cLow(), sunCol, 0.55) * 1.15, clamp(lit, 0.0, 1.0));
    cloud = mix(cloud, vec3(0.1, 0.08, 0.2) + cHorizon() * 0.12, night);
    col = mix(col, cloud, streak * 0.8);
    // The sun.
    float r = 0.052;
    float disc = smoothstep(r, r - 0.003, d);
    vec3 face = mix(vec3(1.25, 1.02, 0.66), vec3(1.15, 0.42, 0.36), smoothstep(r * 0.7, -r, ds.y));
    col = mix(col, face, disc * smoothstep(-0.02, 0.4, sunPower + 0.1) * (1.0 - uMinimal));
    // Stars.
    vec2 g = p * 150.0;
    float rnd = hash(floor(g));
    float tw = 0.55 + 0.45 * sin(uTime * (1.2 + rnd * 2.0) + rnd * 40.0);
    col += vec3(0.85, 0.9, 1.0) * step(0.986, rnd) * smoothstep(0.32, 0.0, length(fract(g) - 0.5)) * tw * night * smoothstep(0.08, 0.5, h);

    /* ---- the city along the shore, left of the sun ---- */
    float cx = uv.x * 150.0;
    float ci = floor(cx);
    float zone = smoothstep(0.58, 0.36, uv.x) * smoothstep(0.0, 0.1, uv.x) * uCity * (1.0 - uMinimal);
    float tall = pow(hash1(ci * 1.7), 3.0) * 0.032 + 0.006;
    float tower = step(0.84, hash1(floor(cx / 7.0) * 3.3)) * (0.022 + 0.03 * hash1(ci * 0.37));
    float stepTop = step(0.5, fract(cx)) * step(0.7, hash1(ci * 9.1)) * 0.004;
    float top = hor + (tall + tower + stepTop) * zone;
    // A farther, paler range behind it.
    float fx = uv.x * 80.0;
    float far = hor + (pow(hash1(floor(fx) * 2.3), 2.0) * 0.016 + 0.004) * smoothstep(0.72, 0.3, uv.x) * smoothstep(0.02, 0.2, uv.x) * uCity * (1.0 - uMinimal);
    if (uv.y < far) col = mix(col, mix(cHorizon(), cMid(), 0.55) * 0.85, 0.65);
    if (uv.y < top) {
      vec3 sil = mix(mix(cMid(), cHorizon(), 0.25) * 0.55, vec3(0.03, 0.025, 0.06), night * 0.85);
      // Windows: a grid, some lit, more as night comes.
      vec2 w = vec2(cx * 3.0, (uv.y - hor) * uRes.y / 3.0);
      float lit = step(1.0 - 0.32 * lights, hash(floor(w) + ci)) * step(fract(w.x), 0.55) * step(fract(w.y), 0.5);
      vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(0.6, 0.9, 1.0), step(0.8, hash(floor(w) * 1.3)));
      sil += warm * lit * lights * 0.8;
      // Neon along some rooflines after dusk.
      float edge = smoothstep(0.0025, 0.0, top - uv.y) * step(0.78, hash1(ci * 4.1)) * step(0.008, top - hor);
      vec3 neon = mix(vec3(1.0, 0.36, 0.6), vec3(0.27, 0.88, 1.0), step(0.5, hash1(ci * 7.7)));
      sil += neon * edge * lights * 1.6;
      col = sil;
    }
    // City glow into the haze, after dark.
    col += vec3(0.6, 0.25, 0.55) * exp(-(uv.y - hor) * 18.0) * zone * lights * 0.35;
  } else {
    /* ---- the sea: every wave a spectrum ---- */
    float dy = hor - uv.y;
    float depth = 5.2;
    float kf = depth / dy;
    float t = uTime * 0.55;
    // The sea's own light: the sky above it, mirrored and dimmed.
    vec3 deep = mix(vec3(0.05, 0.06, 0.17), vec3(0.02, 0.025, 0.07), night);
    col = mix(sky(clamp(dy * 1.2, 0.0, 1.0)) * 0.42, deep, smoothstep(0.0, 0.35, dy)) + cHorizon() * 0.2 * exp(-dy * 9.0);
    float path = exp(-pow((p.x - sunPos.x) / (0.035 + dy * 0.55), 2.0));
    float sunPath = path * (sunPower * 0.9 + 0.1);
    col += sunCol * sunPath * 0.25 * exp(-dy * 2.5);
    float best = 0.0;
    vec3 lineCol = vec3(0.0);
    for (int j = -2; j <= 1; j++) {
      float kk = floor(kf + t) + float(j);
      float denom = kk - t;
      if (denom <= 0.5) continue;
      float dyk = depth / denom;
      float spec = spectrumCurve(kk, uv.x);
      float yk = hor - dyk + dyk * 0.2 * spec;
      float spacing = dyk * dyk / depth * uRes.y;
      float dist = abs(uv.y - yk) * uRes.y;
      float width = 0.6 + 0.9 * smoothstep(4.0, 40.0, spacing);
      float a = smoothstep(width + 0.9, width * 0.25, dist) * smoothstep(1.6, 6.0, spacing);
      if (a > best) {
        best = a;
        vec3 hue = spectral(1.0 - uv.x);
        vec3 c = mix(hue * 0.9, sunCol, path * sunPower * 0.75);
        c = mix(c, mix(hue, vec3(1.0, 0.4, 0.7), 0.35) * 1.1, night * 0.5);
        lineCol = c * (0.7 + 1.5 * path * (sunPower * 0.8 + 0.25)) * mix(0.5, 1.0, smoothstep(0.0, 0.25, dyk));
      }
    }
    col = mix(col, lineCol, best * uSea * (1.0 - uMinimal));
    col += sunCol * path * (sunPower * 0.6 + 0.08) * 0.22 * uMinimal * smoothstep(0.0, 0.3, dy) * (0.8 + 0.2 * sin(kf * 0.9 + t * 2.0));
    // Glitter on the sun's path.
    float glit = pow(noise(vec2(p.x * 260.0 / (0.3 + dy * 3.0), kf * 1.5 + t * 3.0)), 10.0) * 2.2;
    col += sunCol * glit * sunPath * smoothstep(0.0, 0.06, dy) * (1.0 - 0.75 * uMinimal);
    // Haze on the waterline.
    col += cHorizon() * 0.3 * exp(-dy * 70.0);
  }

  // Grade: lift the shadows toward violet, keep the highlights warm; a soft vignette.
  col = col / (1.0 + col * 0.18);
  col += vec3(0.018, 0.01, 0.035);
  vec2 v = uv - vec2(0.5, 0.55);
  col *= 1.0 - 0.38 * dot(v, v) * 1.6;
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

type Value = number | MotionValue<number>;
const read = (v: Value) => (isMotionValue(v) ? v.get() : v);

export function EveningSky({
  hour,
  horizon = 0.42,
  sea = 1,
  city = 1,
  className,
  still = false,
  calm = false,
}: {
  /** 0 golden hour … 4 night; may be a motion value. */
  hour: Value;
  /** Where the horizon sits, as a fraction of the height from the bottom. */
  horizon?: Value;
  /** How strongly the sea's spectrum lines read. */
  sea?: Value;
  city?: Value;
  className?: string;
  /** Paint once per change, no movement. */
  still?: boolean;
  /** Atmosphere only: the light of the hour, no sun disc, no city, no drawn sea. */
  calm?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ hour, horizon, sea, city });
  useEffect(() => {
    live.current = { hour, horizon, sea, city };
  }, [hour, horizon, sea, city]);

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
    const loc = {
      res: u("uRes"),
      time: u("uTime"),
      hour: u("uHour"),
      horizon: u("uHorizon"),
      look: u("uLook"),
      sea: u("uSea"),
      city: u("uCity"),
      minimal: u("uMinimal"),
    };
    const tier = quality();
    const reduce = still || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = tier === "low" ? 0.6 : tier === "balanced" ? 0.85 : 1;
    const ratio = Math.min(dpr(1.5), 1.5) * scale;

    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      look.tx = (e.clientX / window.innerWidth) * 2 - 1;
      look.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (!reduce) window.addEventListener("pointermove", onPointer, { passive: true });

    let frame = 0;
    let last = 0;
    let visible = true;
    let lastKey = "";
    const start = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden) return;
      const { hour: h, horizon: hz, sea: s, city: c } = live.current;
      const state = [read(h), read(hz), read(s), read(c)];
      const key = state.map((n) => n.toFixed(4)).join(",");
      if (reduce) {
        if (key === lastKey && !resize(el, ratio)) return;
      } else if (now - last < 1000 / 30) return;
      last = now;
      lastKey = key;
      resize(el, ratio);
      look.x += (look.tx - look.x) * 0.05;
      look.y += (look.ty - look.y) * 0.05;
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform2f(loc.res, el.width, el.height);
      gl.uniform1f(loc.time, reduce ? 12 : (now - start) / 1000);
      gl.uniform1f(loc.hour, state[0]);
      gl.uniform1f(loc.horizon, state[1]);
      gl.uniform2f(loc.look, look.x, -look.y);
      gl.uniform1f(loc.sea, state[2]);
      gl.uniform1f(loc.city, state[3]);
      gl.uniform1f(loc.minimal, calm ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(draw);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
    };
  }, [still, calm]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("block h-full w-full", className)}
      data-evening-sky=""
    />
  );
}
