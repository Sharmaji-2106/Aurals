"use client";

import { useEffect, useRef } from "react";
import { GLSL_SPECTRAL, VERTEX_PASSTHROUGH, context, dpr, fullQuad, program, quality, resize } from "./gl";
import { ARTWORK, spectral } from "./material";
import { Cover, Headphones, Listening, useFrame } from "./primitives";
import { DURATION_MS, clamp, easeInExpo, easeOutExpo, span, type Sequence } from "./sequence";

/**
 * 03 — SOUND PROPAGATION
 *
 * Three emitters, one field. Wavefronts leave the playlist, cross each other and
 * interfere; where they meet they brighten, and at the edge of the room they give
 * out. Colour follows distance along the spectral ramp, so the near field is warm
 * and the far field is air.
 *
 * A fragment shader, because this is per-pixel interference across the whole
 * surface — the one place in the studio where the GPU is doing work nothing else
 * could do cheaply. Falls back to drawn rings where WebGL is unavailable.
 */

const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_clock;
uniform float u_amp;
uniform float u_reach;
uniform float u_focus;
uniform float u_veil;

${GLSL_SPECTRAL}

/**
 * One emitter: a travelling crest rather than a filled band. Raising the inverted
 * sine to a power is what keeps the front a line — the wider the exponent, the
 * thinner the wave — and the exponential is the room absorbing it.
 */
float front(vec2 p, float k, float speed, float phase, float decay, float sharp) {
  float d = length(p);
  float s = abs(sin(d * k - u_clock * speed + phase));
  return pow(1.0 - s, sharp) * exp(-d * decay);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  uv /= mix(1.0, 0.72, u_focus);
  float d = length(uv);

  float k = mix(86.0, 46.0, u_reach);
  float sharp = mix(16.0, 9.0, u_reach);
  float a = front(uv, k, 6.4, 0.0, 1.7, sharp);
  a += 0.66 * front(uv - vec2(0.16, 0.075), k * 0.94, 5.7, 1.7, 2.0, sharp);
  a += 0.52 * front(uv + vec2(0.14, -0.10), k * 1.07, 7.1, 3.4, 2.1, sharp);

  // Where two fronts cross they add, and only there does the field get bright.
  float crest = clamp(a, 0.0, 1.7) * u_amp;
  crest *= smoothstep(1.02, 0.16, d);
  float core = exp(-d * 16.0) * 0.35 * u_amp;

  vec3 tint = spectral(clamp(0.05 + d * 1.15 - u_reach * 0.06, 0.0, 1.0));
  float alpha = clamp(crest * 0.52 + core, 0.0, 1.0) * u_veil;
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;

type Uniforms = Record<string, WebGLUniformLocation | null>;

export function SoundPropagation({ seq }: { seq: Sequence }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const glRef = useRef<{ gl: WebGLRenderingContext; prog: WebGLProgram; u: Uniforms } | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = context(el);
    const prog = gl ? program(gl, VERTEX_PASSTHROUGH, FRAGMENT) : null;
    if (!gl || !prog) {
      failed.current = true;
      return;
    }
    gl.useProgram(prog);
    const buffer = fullQuad(gl, prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    glRef.current = {
      gl,
      prog,
      u: Object.fromEntries(
        ["u_res", "u_clock", "u_amp", "u_reach", "u_focus", "u_veil"].map((name) => [
          name,
          gl.getUniformLocation(prog, name),
        ]),
      ),
    };
    return () => {
      glRef.current = null;
      gl.deleteBuffer(buffer);
      gl.deleteProgram(prog);
      // Only drop the context when the canvas is really going away. React's
      // development double-invoke tears this effect down with the element still
      // mounted, and `getContext` would then hand back the same dead context,
      // where every later shader compile fails with an empty log.
      if (!el.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useFrame(seq, (t) => {
    const arrive = span(t, 0.03, 0.2);
    const leave = span(t, 0.46, 0.66);
    const amp = span(t, 0.1, 0.4) * (1 - 0.72 * span(t, 0.66, 0.9));
    const reach = span(t, 0.2, 0.62);
    const focus = span(t, 0.6, 0.84);
    const veil = span(t, 0.06, 0.24) * (1 - 0.45 * span(t, 0.78, 1));

    if (hero.current) {
      hero.current.style.opacity = String(arrive * (1 - leave));
      hero.current.style.transform = `translate3d(-50%,-50%,0) scale(${
        (0.78 + 0.22 * easeOutExpo(arrive)) * (1 + 0.5 * easeInExpo(leave))
      })`;
    }

    const live = glRef.current;
    const el = canvas.current;
    if (!live || !el) return;
    const { gl, u } = live;
    resize(el, dpr(quality() === "low" ? 1.5 : 2));
    gl.viewport(0, 0, el.width, el.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_res, el.width, el.height);
    // Driven by the sequence, not by wall time: pausing freezes the field and
    // scrubbing lands on exactly the same frame every time.
    gl.uniform1f(u.u_clock, t * (DURATION_MS / 1000));
    gl.uniform1f(u.u_amp, amp);
    gl.uniform1f(u.u_reach, reach);
    gl.uniform1f(u.u_focus, focus);
    gl.uniform1f(u.u_veil, clamp(veil));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden="true" />
      <PropagationFallback seq={seq} failed={failed} />
      <div
        ref={hero}
        className="absolute top-1/2 left-1/2 w-[min(18%,8rem)] will-change-transform"
        style={{ opacity: 0 }}
      >
        <Cover
          art={ARTWORK[3]}
          className="aspect-square w-full rounded-[13%] ring-1 ring-white/15"
          style={{ boxShadow: "0 30px 90px -28px rgb(0 0 0 / 1)" }}
        />
      </div>
      <Headphones
        seq={seq}
        variant="filament"
        from={0.66}
        to={0.86}
        className="absolute top-[42%] left-1/2 w-[min(42%,17rem)] -translate-x-1/2 -translate-y-1/2"
      />
      <Listening seq={seq} variant="wide" from={0.84} className="absolute inset-x-0 bottom-[19%] px-8" />
    </div>
  );
}

/** Drawn rings, for a device without WebGL. Same idea, fewer wavefronts. */
function PropagationFallback({ seq, failed }: { seq: Sequence; failed: { current: boolean } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
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
    const amp = span(t, 0.1, 0.4) * (1 - 0.8 * span(t, 0.66, 0.9));
    for (let i = 0; i < 14; i += 1) {
      const phase = (t * 1.6 + i / 14) % 1;
      const r = phase * unit * 0.62;
      ctx.beginPath();
      ctx.arc(rect.width / 2, rect.height / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = spectral(clamp(phase * 1.1));
      ctx.globalAlpha = amp * (1 - phase) * 0.5;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  return <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden="true" />;
}
