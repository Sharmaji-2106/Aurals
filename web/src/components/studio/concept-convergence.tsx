"use client";

import { useEffect, useRef } from "react";
import { GLSL_VICE, context, dpr, program, quality, resize } from "./gl";
import {
  ARTWORK,
  HEADPHONE,
  VICE_STOPS,
  VICE_TEAL,
  chladniPoints,
  rand,
  silhouettePoints,
  vice,
} from "./material";
import { Cover, useFrame } from "./primitives";
import { DURATION_MS, clamp, easeInExpo, easeOutExpo, lerp, span, type Sequence } from "./sequence";

/**
 * 05 — THE SHAPE OF YOUR SOUND
 *
 * Many songs become one object. A wall of covers rides toward the viewer, comes
 * apart into grain, and the grain is drawn across the frame into the outline of
 * a pair of headphones — left to right, as if something were writing it.
 *
 * Then it resolves. The scatter collapses onto the line and the grain hands the
 * object over to a clean stroke, so what you are left with is a finished product
 * shot rather than a cloud of dust in the shape of one.
 *
 * Runs its own palette: night violet through magenta into sunset gold.
 */

const COUNT = { high: 18000, balanced: 10000, low: 4400 } as const;
const SILHOUETTE_SCALE = 0.74;
/** How the object is fitted to the frame: scale, then lift above centre. */
const FIT = { roomy: [1, 0.055], compact: [0.74, 0.12] } as const;
const COMPACT_BELOW = 340;
/** Share of the field that is never part of the object. */
const CHAFF = 0.26;

/** What the grain does between leaving the covers and reaching the object. */
export const GRAIN_PATTERNS = [
  { id: "smoke", label: "Smoke" },
  { id: "chladni", label: "Chladni" },
  { id: "rows", label: "Signal rows" },
] as const;

export type GrainPattern = (typeof GRAIN_PATTERNS)[number]["id"];
const PATTERN_INDEX: Record<GrainPattern, number> = { chladni: 0, smoke: 1, rows: 2 };

/** The two plate modes the Chladni figure travels between. */
const MODES: [number, number][] = [
  [3, 5],
  [5, 8],
];
const PLATE: [number, number] = [0.82, 0.62];
const LANES = 16;
/** The viewBox centre sits 4 units above the point the grain is centred on. */
const VIEWBOX_OFFSET = (4 / 240) * SILHOUETTE_SCALE;

/**
 * The wall, before it comes apart: eighteen covers across four depth bands,
 * placed rather than scattered. Centred min-dimension units; `z` is real depth,
 * so the camera can move through them.
 */
const SOURCES = [
  { x: -0.02, y: 0.01, s: 0.2, z: 70, art: 0 },
  { x: -0.205, y: -0.1, s: 0.15, z: 30, art: 1 },
  { x: 0.175, y: 0.095, s: 0.162, z: 42, art: 2 },
  { x: 0.145, y: -0.16, s: 0.126, z: -40, art: 3 },
  { x: -0.18, y: 0.14, s: 0.134, z: -20, art: 4 },
  { x: 0.3, y: -0.045, s: 0.11, z: -90, art: 5 },
  { x: -0.325, y: 0.035, s: 0.105, z: -100, art: 6 },
  { x: 0.05, y: 0.215, s: 0.115, z: -60, art: 7 },
  { x: -0.09, y: -0.205, s: 0.108, z: -70, art: 8 },
  { x: 0.265, y: 0.195, s: 0.084, z: -180, art: 9 },
  { x: -0.295, y: -0.195, s: 0.08, z: -190, art: 10 },
  { x: 0.355, y: -0.2, s: 0.07, z: -240, art: 11 },
  { x: -0.4, y: 0.185, s: 0.066, z: -250, art: 12 },
  { x: 0.42, y: 0.08, s: 0.062, z: -280, art: 13 },
  { x: -0.405, y: -0.08, s: 0.06, z: -290, art: 14 },
  { x: 0.09, y: -0.3, s: 0.058, z: -300, art: 15 },
  { x: -0.13, y: 0.305, s: 0.055, z: -330, art: 4 },
  { x: 0.2, y: -0.33, s: 0.05, z: -360, art: 9 },
];

const VERTEX = `
attribute vec2 a_origin;
attribute vec2 a_target;
attribute vec2 a_fuzz;
attribute vec2 a_seed;
attribute vec2 a_meta;      // tint, chaff
attribute vec2 a_plateA;    // nodal position, first mode
attribute vec2 a_plateB;    // nodal position, second mode

uniform vec2 u_scale;
uniform vec2 u_fit;
uniform float u_clock;
uniform float u_orbit;
uniform float u_gate;
uniform float u_sweep;
uniform float u_crisp;
uniform float u_zoom;
uniform float u_point;
uniform float u_veil;
uniform float u_pattern;

varying float v_tint;
varying float v_alpha;
varying float v_flare;

const float TAU = 6.2831853;

/**
 * The plate. Grain sits on the nodal lines of one mode and travels to the next
 * as the note climbs, with a small transverse tremble so the plate reads as
 * ringing rather than as a printed figure.
 */
vec2 patternChladni(float a0) {
  float note = 0.5 - 0.5 * cos(u_clock * 0.72);          // the frequency sweeping
  vec2 p = mix(a_plateA, a_plateB, smoothstep(0.15, 0.85, note));
  float tremble = sin(u_clock * 9.0 + a0 * 3.0) * 0.0055 * (0.4 + 0.6 * note);
  return p + vec2(tremble, tremble * 0.6);
}

/**
 * Smoke. Displacement along a divergence-free field, so the grain shears and
 * folds the way ink does. The age term saturates and a soft containment pulls
 * the far edges back, or the cloud simply leaves the frame.
 */
vec2 patternSmoke(vec2 home, float a0) {
  float t = u_clock * 0.42;
  float a = 2.7, b = 2.2, c = 4.6, d = 3.9;
  float dpdy = -0.26 * b * sin(a * home.x + t) * sin(b * home.y - t * 0.74)
               - 0.13 * d * sin(c * home.x - t * 0.58) * sin(d * home.y + t * 0.88);
  float dpdx = 0.26 * a * cos(a * home.x + t) * cos(b * home.y - t * 0.74)
               + 0.13 * c * cos(c * home.x - t * 0.58) * cos(d * home.y + t * 0.88);
  vec2 flow = vec2(dpdy, -dpdx);

  float age = 1.0 - exp(-u_clock * 0.5);          // bounded, so it never flees
  // Each grain is carried at its own rate. Advecting them all equally would
  // preserve the square blocks the covers left behind; this is what diffuses
  // them into a cloud.
  float lag = 0.55 + a_seed.y * 1.0;
  vec2 p = home * (1.0 + age * 0.32)
         + flow * age * 0.34 * lag
         + vec2(sin(a0 * 3.1), cos(a0 * 2.3)) * age * 0.055
         + vec2(sin(a0) * 0.012, cos(a0) * 0.012 + age * 0.03);
  // The body holds together. The falloff is wide on purpose: a tight one leaves
  // a visible rim where the grain piles against it.
  float r = length(p);
  return p * (1.0 - 0.22 * smoothstep(0.3, 0.95, r));
}

/**
 * Signal rows. Lanes scrolling at their own rates, spaced closer toward the
 * middle, carrying bursts of brighter grain — a spectrogram being read rather
 * than a block of noise. The gain comes back with it, so lanes can differ.
 */
vec2 patternRows(float a0, out float gain) {
  float lane = floor(a_seed.y * ${LANES}.0);
  float u = lane / (${LANES}.0 - 1.0) - 0.5;
  // Eased spacing: the middle lanes crowd, the outer ones open out.
  float y = sign(u) * pow(abs(u) * 2.0, 1.22) * 0.4;
  y += sin(lane * 2.3) * 0.004;

  float speed = 0.16 + fract(lane * 0.3717) * 0.38;
  float x = fract(a_seed.x + u_clock * speed) - 0.5;

  // Not every lane carries the same traffic, and some grain travels in packets.
  // The lanes carry a spectrum, not a flat field: the low end is dense and the
  // top sparse, and the whole thing breathes the way a live readout does.
  float band = 0.5 - u;                                        // 0 at top, 1 at bottom
  float energy = 0.3 + 0.7 * pow(band, 1.3) * (0.62 + 0.38 * sin(u_clock * 1.25 + lane * 0.8));
  // Traffic arrives in packets rather than as a continuous stream.
  float packet = floor((a_seed.x * 3.0 + lane * 0.37) * 9.0);
  float on = step(0.4, fract(sin(packet * 91.7 + lane * 3.1) * 43758.5453)) * 0.78 + 0.34;
  float edge = 1.0 - smoothstep(0.34, 0.5, abs(x));
  gain = clamp(energy * on * edge * 3.2, 0.0, 2.2);

  return vec2(x * 0.96, y * (0.94 + 0.06 * sin(u_clock * 0.9 + lane)));
}

void main() {
  float a0 = a_seed.x * TAU;
  float tintV = a_meta.x;
  float a_chaff = a_meta.y;

  // The scatter around the line is what makes the grain read as material. It is
  // withdrawn as the object resolves, so the outline tightens to exactly true.
  vec2 shape = (a_target + a_fuzz * (1.0 - u_crisp)) * u_fit.x + vec2(0.0, u_fit.y);

  // A grain settles when the write reaches its own column, so the object is
  // drawn across the frame rather than faded up.
  float column = shape.x + 0.5;
  float local = clamp((u_sweep - column) / 0.22, 0.0, 1.0);
  float settle = local * local * (3.0 - 2.0 * local) * u_gate;

  float gain = 1.0;
  vec2 drift;
  if (u_pattern < 0.5) {
    drift = patternChladni(a0);
  } else if (u_pattern < 1.5) {
    drift = patternSmoke(a_origin, a0);
  } else {
    drift = patternRows(a0, gain);
  }

  vec2 p = mix(a_origin, drift, u_orbit);

  // Where a grain ends up: on the line, or carried off past the edge.
  vec2 blown = drift * 1.7 + vec2(1.15, (a_seed.y - 0.5) * 0.5);
  p = mix(p, mix(shape, blown, a_chaff), settle);

  gl_Position = vec4(p * u_zoom * 2.0 * u_scale, 0.0, 1.0);

  // Grain, not bokeh: small, with a few brighter embers carrying the light.
  float ember = step(0.955, a_seed.y);
  float size = mix(1.0, 2.5, ember) * (0.62 + a_seed.x * 0.5);
  gl_PointSize = u_point * size * mix(1.0, 1.22, settle) * mix(1.0, 0.55, u_crisp);

  float flicker = 0.58 + 0.42 * sin(u_clock * (1.9 + a_seed.y * 6.0) + a_seed.x * 21.0);
  v_tint = tintV;
  v_flare = exp(-pow((local - 0.5) * 3.4, 2.0)) * u_gate;  // a flash as it lands
  // A pattern's own weighting only applies while the pattern is on screen; by
  // the time the object is being written every grain counts the same.
  float shaped = mix(gain, 1.0, max(settle, 1.0 - u_orbit));
  v_alpha = u_veil * flicker * shaped * mix(0.58, 1.0, settle)
          * (1.0 - a_chaff * settle)
          * (1.0 - u_crisp * mix(1.0, 0.82, a_chaff));
}
`;

const FRAGMENT = `
precision mediump float;
varying float v_tint;
varying float v_alpha;
varying float v_flare;

${GLSL_VICE}

void main() {
  // A square footprint with a soft shoulder reads as grain; a disc reads as bokeh.
  vec2 d = gl_PointCoord - 0.5;
  float m = max(abs(d.x), abs(d.y));
  if (m > 0.5) discard;
  float soft = 1.0 - smoothstep(0.3, 0.5, m);

  vec3 tint = vice(v_tint);
  tint = mix(tint, vec3(1.0, 0.95, 0.86), v_flare * 0.65);
  float alpha = clamp(soft * v_alpha * (1.0 + v_flare * 0.9), 0.0, 1.0);
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;

export function Convergence({ seq, variant }: { seq: Sequence; variant?: string }) {
  const pattern = (variant ?? "smoke") as GrainPattern;
  const canvas = useRef<HTMLCanvasElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const covers = useRef<(HTMLDivElement | null)[]>([]);
  const object = useRef<HTMLDivElement>(null);
  const horizon = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLSpanElement>(null);
  const failed = useRef(false);
  const live = useRef<{
    gl: WebGLRenderingContext;
    u: Record<string, WebGLUniformLocation | null>;
    count: number;
  } | null>(null);

  useEffect(() => {
    const count = COUNT[quality()];
    const silhouette = silhouettePoints(count);
    const el = canvas.current;
    if (!silhouette.length || !el) {
      failed.current = true;
      return;
    }
    const origin = new Float32Array(count * 2);
    const target = new Float32Array(count * 2);
    const fuzz = new Float32Array(count * 2);
    const seed = new Float32Array(count * 2);
    const meta = new Float32Array(count * 2);
    const plateA = new Float32Array(count * 2);
    const plateB = new Float32Array(count * 2);
    const nodalA = chladniPoints(count, MODES[0][0], MODES[0][1], 11, PLATE);
    const nodalB = chladniPoints(count, MODES[1][0], MODES[1][1], 23, PLATE);
    for (let i = 0; i < count; i += 1) {
      const src = SOURCES[i % SOURCES.length];
      origin[i * 2] = src.x + (rand(i, 1) - 0.5) * src.s;
      origin[i * 2 + 1] = -(src.y + (rand(i, 2) - 0.5) * src.s);
      const [sx, sy] = silhouette[i];
      target[i * 2] = ((sx - 120) / 240) * SILHOUETTE_SCALE;
      target[i * 2 + 1] = -((sy - 94) / 240) * SILHOUETTE_SCALE;
      fuzz[i * 2] = (rand(i, 5) - 0.5) * 0.011;
      fuzz[i * 2 + 1] = (rand(i, 6) - 0.5) * 0.011;
      seed[i * 2] = rand(i, 3);
      seed[i * 2 + 1] = rand(i, 4);
      meta[i * 2] = clamp((sx - 18) / 204);
      meta[i * 2 + 1] = rand(i, 7) < CHAFF ? 1 : 0;
      plateA[i * 2] = nodalA[i][0];
      plateA[i * 2 + 1] = nodalA[i][1];
      plateB[i * 2] = nodalB[i][0];
      plateB[i * 2 + 1] = nodalB[i][1];
    }

    const gl = context(el);
    const prog = gl ? program(gl, VERTEX, FRAGMENT) : null;
    if (!gl || !prog) {
      failed.current = true;
      return;
    }
    gl.useProgram(prog);
    const buffers: WebGLBuffer[] = [];
    const attach = (name: string, data: Float32Array, size: number) => {
      const buffer = gl.createBuffer();
      if (!buffer) return;
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    attach("a_origin", origin, 2);
    attach("a_target", target, 2);
    attach("a_fuzz", fuzz, 2);
    attach("a_seed", seed, 2);
    attach("a_meta", meta, 2);
    attach("a_plateA", plateA, 2);
    attach("a_plateB", plateB, 2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    live.current = {
      gl,
      count,
      u: Object.fromEntries(
        [
          "u_scale",
          "u_fit",
          "u_clock",
          "u_orbit",
          "u_gate",
          "u_sweep",
          "u_crisp",
          "u_zoom",
          "u_point",
          "u_veil",
          "u_pattern",
        ].map((name) => [name, gl.getUniformLocation(prog, name)]),
      ),
    };
    return () => {
      live.current = null;
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(prog);
      if (!el.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useFrame(seq, (t) => {
    const stage = canvas.current?.parentElement;
    const w = stage?.clientWidth ?? 0;
    const h = stage?.clientHeight ?? 0;
    const unit = Math.min(w, h);

    const arrive = span(t, 0.01, 0.16);
    const breakUp = span(t, 0.16, 0.33);
    const orbit = span(t, 0.18, 0.5);
    const gate = span(t, 0.545, 0.575);
    const sweepAt = -0.35 + 1.75 * clamp((t - 0.555) / 0.145);
    // The handover: scatter withdrawn, grain stood down, stroke brought up.
    const crisp = span(t, 0.7, 0.82);
    const compact = h < COMPACT_BELOW;
    const [fitScale, fitLift] = compact ? FIT.compact : FIT.roomy;
    // One continuous push forward, all the way through. Nothing cuts.
    const zoom = lerp(0.78, 1, easeOutExpo(span(t, 0.0, 0.62))) + 0.07 * span(t, 0.66, 1);
    const veil = span(t, 0.14, 0.26) * (1 - 0.1 * span(t, 0.95, 1));

    // The camera travels into the wall before the wall gives way.
    if (plane.current) {
      const dolly = lerp(-260, 210, easeOutExpo(span(t, 0.0, 0.42)));
      const swing = Math.sin(t * 2.2) * 2.4 * (1 - breakUp);
      plane.current.style.transform = `translate3d(0,0,${dolly}px) rotateY(${swing}deg) rotateX(${swing * -0.3}deg)`;
    }

    covers.current.forEach((node, i) => {
      if (!node || !unit) return;
      const src = SOURCES[i];
      const near = 1 - Math.abs(src.z) / 460;
      const enter = clamp((arrive - i * 0.028) / 0.74);
      const eased = easeOutExpo(enter);
      const fade = clamp((breakUp - (1 - near) * 0.2) / 0.68);
      const driftX = Math.sin(t * 2.4 + i * 1.27) * unit * 0.013 * near;
      const driftY = Math.cos(t * 1.9 + i * 0.81) * unit * 0.011 * near;
      const spread = 1 + 0.3 * easeInExpo(fade);
      const size = src.s * unit;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.opacity = String(eased * (1 - fade) * (0.5 + 0.5 * near));
      node.style.transform =
        `translate3d(${src.x * unit * spread - size / 2 + driftX}px,` +
        `${src.y * unit * spread - size / 2 + driftY}px,${src.z}px) ` +
        `scale(${(0.84 + 0.16 * eased) * (1 + 0.16 * easeInExpo(fade))})`;
      node.style.filter = `blur(${fade * 10}px) saturate(${0.72 + 0.4 * near})`;
    });

    // The finished object, handed the scene by the grain that drew it.
    if (object.current && unit) {
      const width = SILHOUETTE_SCALE * fitScale * unit * zoom;
      object.current.style.width = `${width}px`;
      object.current.style.height = `${width * (180 / 240)}px`;
      object.current.style.opacity = String(crisp);
      object.current.style.transform =
        `translate3d(${w / 2 - width / 2}px,` +
        `${h / 2 - (width * (180 / 240)) / 2 - (fitLift + VIEWBOX_OFFSET * fitScale) * unit * zoom}px,0)`;
    }

    if (horizon.current) {
      horizon.current.style.opacity = String(0.22 + 0.6 * span(t, 0.5, 0.76) * (1 - 0.3 * span(t, 0.9, 1)));
    }
    if (words.current) {
      const show = span(t, 0.8, 0.9);
      words.current.style.opacity = String(show);
      words.current.style.transform = `translate3d(0,${(1 - easeOutExpo(show)) * 16}px,0)`;
    }
    if (rule.current) rule.current.style.transform = `scaleX(${span(t, 0.82, 0.94)})`;

    const scene = live.current;
    const el = canvas.current;
    if (!scene || !el) return;
    const { gl, u } = scene;
    resize(el, dpr(quality() === "low" ? 1.5 : 2));
    gl.viewport(0, 0, el.width, el.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const aspect = el.width / el.height;
    gl.uniform2f(u.u_scale, aspect > 1 ? 1 / aspect : 1, aspect > 1 ? 1 : aspect);
    gl.uniform2f(u.u_fit, fitScale, fitLift);
    gl.uniform1f(u.u_clock, t * (DURATION_MS / 1000));
    gl.uniform1f(u.u_orbit, easeOutExpo(orbit));
    gl.uniform1f(u.u_gate, gate);
    gl.uniform1f(u.u_sweep, sweepAt);
    gl.uniform1f(u.u_crisp, crisp);
    gl.uniform1f(u.u_zoom, zoom);
    gl.uniform1f(u.u_point, Math.max(1.2, (el.height / 760) * 2.4));
    gl.uniform1f(u.u_veil, veil);
    gl.uniform1f(u.u_pattern, PATTERN_INDEX[pattern]);
    gl.drawArrays(gl.POINTS, 0, scene.count);
  });

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: "radial-gradient(135% 105% at 50% 4%, #150b28 0%, #0a0616 46%, #040208 100%)",
      }}
    >
      {/* A horizon beneath everything, the way a sunset sits under a skyline. */}
      <div
        ref={horizon}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          opacity: 0.22,
          background:
            "radial-gradient(90% 150% at 50% 128%, rgb(255 45 149 / 0.5) 0%, rgb(123 47 247 / 0.22) 38%, transparent 70%)",
        }}
      />

      <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden="true" />
      <ConvergenceFallback seq={seq} failed={failed} pattern={pattern} />

      {/* The wall, in real depth, with the camera travelling into it. */}
      <div className="absolute inset-0" style={{ perspective: "1500px", perspectiveOrigin: "50% 48%" }}>
        <div
          ref={plane}
          className="absolute top-1/2 left-1/2 size-0 will-change-transform"
          style={{ transformStyle: "preserve-3d" }}
        >
          {SOURCES.map((src, i) => (
            <div
              key={`${src.art}-${i}`}
              ref={(el) => {
                covers.current[i] = el;
              }}
              className="absolute will-change-transform"
              style={{ opacity: 0 }}
            >
              <Cover
                art={ARTWORK[src.art]}
                className="size-full rounded-[6%]"
                style={{
                  boxShadow: "0 24px 70px -26px rgb(0 0 0 / 1)",
                  outline: "1px solid rgb(255 255 255 / 0.1)",
                  outlineOffset: "-1px",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* The resolved object. Same geometry the grain was aiming at. */}
      <div ref={object} className="absolute top-0 left-0 will-change-transform" style={{ opacity: 0 }}>
        <svg viewBox={HEADPHONE.viewBox} fill="none" className="size-full overflow-visible">
          <defs>
            <linearGradient id="vice-object" x1="30" y1="164" x2="210" y2="24" gradientUnits="userSpaceOnUse">
              {VICE_STOPS.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
            <filter id="vice-bloom" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#vice-bloom)" stroke="url(#vice-object)" strokeWidth="2.6" strokeLinecap="round">
            <path d={HEADPHONE.band} />
            <path d={HEADPHONE.cupLeft} />
            <path d={HEADPHONE.cupRight} />
          </g>
          <circle {...HEADPHONE.driverLeft} r={3} fill="#ffe6a8" opacity="0.8" />
          <circle {...HEADPHONE.driverRight} r={3} fill="#ffe6a8" opacity="0.8" />
        </svg>
      </div>

      <div
        ref={words}
        className="absolute inset-x-0 bottom-[5%] px-6 text-center will-change-transform sm:bottom-[8%] sm:px-8"
        style={{ opacity: 0 }}
      >
        <p
          className="font-mono text-[9px] tracking-[0.26em] uppercase sm:text-[10px] sm:tracking-[0.42em]"
          style={{ color: VICE_TEAL }}
        >
          {ARTWORK.length} songs · one shape
        </p>
        <p className="mt-2 font-display text-[clamp(1.35rem,3.7vw,3rem)] leading-none tracking-[-0.015em] text-ink sm:mt-3">
          Listening to your <em style={{ color: "#ff6a3d" }}>music</em>
        </p>
        <span
          ref={rule}
          className="mx-auto mt-3.5 block h-px w-28 origin-center sm:mt-5 sm:w-44"
          style={{
            transform: "scaleX(0)",
            background: "linear-gradient(to right, transparent, #ff2d95, #ffb347, transparent)",
          }}
        />
      </div>
    </div>
  );
}

/** Canvas grain, for a device without WebGL. Fewer motes, same choreography. */
function ConvergenceFallback({
  seq,
  failed,
  pattern,
}: {
  seq: Sequence;
  failed: { current: boolean };
  pattern: GrainPattern;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cloud = useRef<
    {
      pa: [number, number];
      pb: [number, number];
      ox: number;
      oy: number;
      tx: number;
      ty: number;
      a: number;
      r: number;
      c: string;
      chaff: number;
    }[]
  >([]);

  useEffect(() => {
    const nodalA = chladniPoints(1400, MODES[0][0], MODES[0][1], 11, PLATE);
    const nodalB = chladniPoints(1400, MODES[1][0], MODES[1][1], 23, PLATE);
    cloud.current = silhouettePoints(1400).map(([sx, sy], i) => {
      const src = SOURCES[i % SOURCES.length];
      return {
        pa: nodalA[i],
        pb: nodalB[i],
        ox: src.x + (rand(i, 1) - 0.5) * src.s,
        oy: src.y + (rand(i, 2) - 0.5) * src.s,
        tx: ((sx - 120) / 240) * SILHOUETTE_SCALE,
        ty: ((sy - 94) / 240) * SILHOUETTE_SCALE,
        a: rand(i, 3),
        r: rand(i, 4),
        c: vice(clamp((sx - 18) / 204)),
        chaff: rand(i, 7) < CHAFF ? 1 : 0,
      };
    });
  }, []);

  useFrame(seq, (t) => {
    const el = canvas.current;
    if (!el || !failed.current) return;
    const ratio = dpr(1.5);
    const rect = el.getBoundingClientRect();
    el.width = Math.round(rect.width * ratio);
    el.height = Math.round(rect.height * ratio);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const unit = Math.min(rect.width, rect.height);
    const compact = rect.height < COMPACT_BELOW;
    const [fitScale, fitLift] = compact ? FIT.compact : FIT.roomy;
    const orbit = easeOutExpo(span(t, 0.18, 0.5));
    const gate = span(t, 0.545, 0.575);
    const sweepAt = -0.35 + 1.75 * clamp((t - 0.555) / 0.145);
    const zoom = lerp(0.78, 1, easeOutExpo(span(t, 0, 0.62))) + 0.07 * span(t, 0.66, 1);
    const veil = span(t, 0.14, 0.26) * (1 - span(t, 0.7, 0.82));
    const clock = t * (DURATION_MS / 1000);
    const note = 0.5 - 0.5 * Math.cos(clock * 0.72);
    const blend = clamp((note - 0.15) / 0.7);
    for (const g of cloud.current) {
      let sx: number;
      let sy: number;
      if (pattern === "rows") {
        const lane = Math.floor(g.r * 16);
        sx = ((g.a + clock * (0.16 + ((lane * 0.3717) % 1) * 0.34)) % 1) - 0.5;
        sy = (lane / 15 - 0.5) * 0.66;
      } else if (pattern === "smoke") {
        const age = clock * 0.5;
        sx = g.ox + Math.sin(2.7 * g.ox + clock * 0.42) * 0.22 * age;
        sy = g.oy + Math.cos(2.2 * g.oy - clock * 0.31) * 0.18 * age + age * 0.035;
      } else {
        sx = g.pa[0] + (g.pb[0] - g.pa[0]) * blend;
        sy = g.pa[1] + (g.pb[1] - g.pa[1]) * blend;
      }
      const shapeX = g.tx * fitScale;
      const shapeY = g.ty * fitScale - fitLift;
      const local = clamp((sweepAt - (shapeX + 0.5)) / 0.22) * gate;
      const settle = local * local * (3 - 2 * local);
      const destX = g.chaff ? sx * 1.7 + 1.15 : shapeX;
      const destY = g.chaff ? sy * 1.7 : shapeY;
      const x = ((g.ox + (sx - g.ox) * orbit) * (1 - settle) + destX * settle) * zoom;
      const y = ((g.oy + (sy - g.oy) * orbit) * (1 - settle) + destY * settle) * zoom;
      ctx.globalAlpha = veil * (0.4 + 0.6 * settle) * (g.chaff ? 1 - settle : 1);
      ctx.fillStyle = g.c;
      ctx.fillRect(rect.width / 2 + x * unit, rect.height / 2 + y * unit, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden="true" />;
}
