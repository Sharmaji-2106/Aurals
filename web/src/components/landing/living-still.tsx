"use client";

import { context, dpr, fullQuad, program, quality, VERTEX_PASSTHROUGH } from "@/lib/grain/gl";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, type CSSProperties } from "react";

/**
 * A still frame of the sea, alive: a cinemagraph made in the browser.
 *
 * The film only moves when the page scrolls; at rest it would be a photograph.
 * This draws the same frame (cover-fitted exactly as `FilmCanvas` does, so the
 * two are interchangeable) through a shader that moves only what would move:
 *
 * - **the water**, below the horizon: displaced by drifting noise laid on the
 *   sea's own ground plane — large and quick near the camera, vanishing into
 *   the distance — so swells seem to roll in;
 * - **the glitter**: the brightest water twinkles, as sun on moving water does;
 * - **the sky**: the clouds sway a hair, slowly.
 *
 * Nothing moves at the horizon line itself, so there is no seam. Under reduced
 * motion, on low-power devices, or without WebGL, the frame is simply shown.
 */

const FRAGMENT = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_img;
uniform float u_time;
uniform float u_horizon;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  // Cover-fit, as the film canvas draws it; v runs from the top.
  float scale = max(u_res.x / u_img.x, u_res.y / u_img.y);
  vec2 size = u_img * scale;
  vec2 offset = (u_res - size) * 0.5;
  vec2 frag = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = (frag - offset) / size;

  float t = u_time;
  float water = clamp((uv.y - u_horizon) / (1.0 - u_horizon), 0.0, 1.0);
  float sky = clamp((u_horizon - uv.y) / u_horizon, 0.0, 1.0);

  // The sea's ground plane: x spreads and z compresses toward the horizon.
  float depth = water + 0.06;
  vec2 ground = vec2((uv.x - 0.5) / depth, 1.0 / depth);
  vec2 roll = vec2(0.0, t * 0.55);
  float a = noise(ground * vec2(2.2, 1.1) + roll);
  float b = noise(ground * vec2(5.0, 2.6) + roll * 1.7 + 4.0);
  float swell = (a - 0.5) * 0.7 + (b - 0.5) * 0.3;
  float reach = smoothstep(0.0, 0.08, water) * pow(water, 1.25);
  vec2 disp = vec2(swell * 0.0028, swell * 0.0062) * reach;

  // Clouds: a slow sway, nothing that could smear.
  disp.x += sin(t * 0.07 + uv.y * 5.0) * 0.0012 * smoothstep(0.05, 0.25, sky);

  vec2 at = clamp(uv + disp, vec2(0.001), vec2(0.999));
  vec3 col = texture2D(u_tex, at).rgb;

  // Glitter: the brightest water twinkles.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float tw = noise(ground * vec2(26.0, 11.0) + vec2(t * 1.6, t * 2.3));
  float sparkle = pow(tw, 6.0) * smoothstep(0.5, 0.82, luma) * smoothstep(0.0, 0.05, water);
  col *= 1.0 + 0.22 * (tw - 0.5) * smoothstep(0.55, 0.85, luma) * step(0.001, water);
  col += vec3(1.0, 0.93, 0.82) * sparkle * 0.9;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function LivingStill({
  src,
  horizon,
  active = true,
  className,
  style,
}: {
  /** A single frame image (the film's own frame). */
  src: string;
  /** Where the horizon is in the image, 0 (top) to 1 (bottom). */
  horizon: number;
  /** Paused (and cheap) while false — e.g. once the film has taken over. */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const running = useRef(active);
  useEffect(() => {
    running.current = active;
  }, [active]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || reduce || quality() === "low") return;
    const gl = context(el);
    if (!gl) return;
    const prog = program(gl, VERTEX_PASSTHROUGH, FRAGMENT);
    if (!prog) return;
    gl.useProgram(prog);
    const quad = fullQuad(gl, prog);
    const tex = gl.createTexture();
    const u = (name: string) => gl.getUniformLocation(prog, name);
    let frame = 0;
    let ready = false;
    let visible = true;
    const t0 = performance.now();
    const img = new Image();
    img.decoding = "async";
    let disposed = false;
    img.onload = () => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform2f(u("u_img"), img.naturalWidth, img.naturalHeight);
      gl.uniform1f(u("u_horizon"), horizon);
      ready = true;
      el.style.opacity = "1";
    };
    img.src = src;

    const ratio = dpr(1.5);
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!ready || !visible || !running.current) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * ratio));
      const h = Math.max(1, Math.round(rect.height * ratio));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u("u_res"), w, h);
      gl.uniform1f(u("u_time"), (performance.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(tick);
    const onVisibility = () => (visible = document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      img.onload = null;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteTexture(tex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
    };
  }, [src, horizon, reduce]);

  return (
    <div aria-hidden="true" className={cn("absolute inset-0 overflow-hidden", className)} style={style}>
      {/* The frame itself, at once — the living version fades over it when ready. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      <canvas ref={canvas} className="absolute inset-0 size-full opacity-0 transition-opacity duration-700" />
    </div>
  );
}
