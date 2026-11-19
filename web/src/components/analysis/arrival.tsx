"use client";

import type { LinkPreview, Submission, SubmissionTrack } from "@/lib/api/client";
import { plural } from "@/lib/format";
import { clamp, easeInExpo, easeOutExpo, lerp, span } from "@/lib/grain/ease";
import { HEADPHONE, rand, silhouettePoints } from "@/lib/grain/geometry";
import { context, dpr, program, quality, resize } from "@/lib/grain/gl";
import { GLSL_WARM, WARM_STOPS } from "@/lib/grain/palette";
import { useLinkPreviews } from "@/lib/api/hooks";
import { canonicalUrl, thumbnailUrl } from "@/lib/youtube";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The handoff from a pasted playlist to the scanner.
 *
 * The songs that were actually imported ride past the camera as a wall of
 * covers, come apart into grain, and the grain drifts on a divergence-free
 * current — shearing and folding the way ink does in water. Then it is drawn
 * across the frame into the outline of a pair of headphones and hands the
 * object over to a clean stroke.
 *
 * It is a presentation layer and nothing more. It never reports progress, never
 * shows a count the pipeline has not produced, and the scanner behind it holds
 * the real state the whole time — so dismissing the sequence at any point leaves
 * a correct screen. It waits for the resolver to actually find songs before it
 * begins, bows out if the submission fails, and plays once per submission.
 */

const DURATION_MS = 8800;
/** How long to hold the waiting state before the real screen is more use. */
const BAIL_MS = 14000;
const SEEN_KEY = "auralis:arrival";

/** The room both halves of the sequence are lit in. Shared, so the handover
 *  from waiting to moving is not also a change of scene. */
const BACKDROP = "radial-gradient(135% 105% at 50% 4%, #120a20 0%, #09060f 46%, #050406 100%)";

const GRAINS = { high: 16000, balanced: 9000, low: 4000 } as const;
const SILHOUETTE_SCALE = 0.74;
/** Fitted to the frame: scale, then lift above centre. */
const FIT = { roomy: [1, 0.055], compact: [0.74, 0.12] } as const;
const COMPACT_BELOW = 340;
/** Share of the grain that is never part of the object. */
const CHAFF = 0.26;
/** The viewBox centre sits 4 units above the point the grain is centred on. */
const VIEWBOX_OFFSET = (4 / 240) * SILHOUETTE_SCALE;
/**
 * Where the covers sit, in centred min-dimension units with real depth.
 *
 * Ordered from the middle outward, so a three-song playlist takes the three
 * central seats and still reads as a composition rather than a corner of one.
 */
const SEATS = [
  { x: -0.02, y: 0.01, s: 0.2, z: 70 },
  { x: -0.205, y: -0.1, s: 0.15, z: 30 },
  { x: 0.175, y: 0.095, s: 0.162, z: 42 },
  { x: 0.145, y: -0.16, s: 0.126, z: -40 },
  { x: -0.18, y: 0.14, s: 0.134, z: -20 },
  { x: 0.3, y: -0.045, s: 0.11, z: -90 },
  { x: -0.325, y: 0.035, s: 0.105, z: -100 },
  { x: 0.05, y: 0.215, s: 0.115, z: -60 },
  { x: -0.09, y: -0.205, s: 0.108, z: -70 },
  { x: 0.265, y: 0.195, s: 0.084, z: -180 },
  { x: -0.295, y: -0.195, s: 0.08, z: -190 },
  { x: 0.355, y: -0.2, s: 0.07, z: -240 },
  { x: -0.4, y: 0.185, s: 0.066, z: -250 },
  { x: 0.42, y: 0.08, s: 0.062, z: -280 },
  { x: -0.405, y: -0.08, s: 0.06, z: -290 },
  { x: 0.09, y: -0.3, s: 0.058, z: -300 },
  { x: -0.13, y: 0.305, s: 0.055, z: -330 },
  { x: 0.2, y: -0.33, s: 0.05, z: -360 },
];

const VERTEX = `
attribute vec2 a_origin;
attribute vec2 a_target;
attribute vec2 a_fuzz;
attribute vec2 a_seed;
attribute vec2 a_meta;      // tint, chaff

uniform vec2 u_scale;
uniform vec2 u_fit;
uniform float u_clock;
uniform float u_gate;
uniform float u_sweep;
uniform float u_crisp;
uniform float u_zoom;
uniform float u_point;
uniform float u_veil;

varying float v_tint;
varying float v_alpha;
varying float v_flare;

const float TAU = 6.2831853;

void main() {
  float a0 = a_seed.x * TAU;
  float chaff = a_meta.y;

  // The scatter around the line is what makes the grain read as material. It is
  // withdrawn as the object resolves, so the outline tightens to exactly true.
  vec2 shape = (a_target + a_fuzz * (1.0 - u_crisp)) * u_fit.x + vec2(0.0, u_fit.y);

  // The current. Displacement along a divergence-free field, so the grain shears
  // and folds rather than simply spreading. The clock starts as the covers come
  // apart, so the grain first appears where its cover was.
  float st = max(0.0, u_clock - 1.1);
  float ft = st * 0.5;
  float dpdy = -0.26 * 2.2 * sin(2.7 * a_origin.x + ft) * sin(2.2 * a_origin.y - ft * 0.74)
               - 0.13 * 3.9 * sin(4.6 * a_origin.x - ft * 0.58) * sin(3.9 * a_origin.y + ft * 0.88);
  float dpdx = 0.26 * 2.7 * cos(2.7 * a_origin.x + ft) * cos(2.2 * a_origin.y - ft * 0.74)
               + 0.13 * 4.6 * cos(4.6 * a_origin.x - ft * 0.58) * cos(3.9 * a_origin.y + ft * 0.88);
  // The field has a net translation at any instant, which would carry the whole
  // cloud off the frame. Subtracting its value at the centre leaves the shear —
  // the part that actually folds the grain — and removes the drift.
  float c_dpdy = -0.26 * 2.2 * sin(ft) * sin(-ft * 0.74)
                 - 0.13 * 3.9 * sin(-ft * 0.58) * sin(ft * 0.88);
  float c_dpdx = 0.26 * 2.7 * cos(ft) * cos(-ft * 0.74)
                 + 0.13 * 4.6 * cos(-ft * 0.58) * cos(ft * 0.88);
  vec2 flow = vec2(dpdy - c_dpdy, -(dpdx - c_dpdx));

  float age = 1.0 - exp(-st * 0.62);            // bounded, so the cloud never flees
  // Each grain is carried at its own rate. Advecting them all equally would
  // preserve the square blocks the covers left behind; this is what diffuses them.
  float lag = 0.55 + a_seed.y * 1.0;
  vec2 smoke = a_origin * (1.0 + age * 0.34)
             + flow * age * 0.36 * lag
             + vec2(sin(a0 * 3.1), cos(a0 * 2.3)) * age * 0.06
             + vec2(0.0, age * 0.015);
  // The body holds together. The falloff is wide on purpose: a tight one leaves
  // a visible rim where the grain piles against it.
  smoke *= 1.0 - 0.22 * smoothstep(0.3, 0.95, length(smoke));

  // A grain settles when the write reaches its own column, so the object is
  // drawn across the frame rather than faded up.
  float column = shape.x + 0.5;
  float local = clamp((u_sweep - column) / 0.22, 0.0, 1.0);
  float settle = local * local * (3.0 - 2.0 * local) * u_gate;

  vec2 blown = smoke * 1.7 + vec2(1.15, (a_seed.y - 0.5) * 0.5);
  vec2 p = mix(smoke, mix(shape, blown, chaff), settle);

  gl_Position = vec4(p * u_zoom * 2.0 * u_scale, 0.0, 1.0);

  // Grain, not bokeh: small, with a few brighter embers carrying the light.
  float ember = step(0.955, a_seed.y);
  float size = mix(1.0, 2.5, ember) * (0.62 + a_seed.x * 0.5);
  gl_PointSize = u_point * size * mix(1.0, 1.22, settle) * mix(1.0, 0.55, u_crisp);

  float flicker = 0.58 + 0.42 * sin(u_clock * (1.9 + a_seed.y * 6.0) + a_seed.x * 21.0);
  v_tint = a_meta.x;
  v_flare = exp(-pow((local - 0.5) * 3.4, 2.0)) * u_gate;  // a flash as it lands
  v_alpha = u_veil * flicker * mix(0.58, 1.0, settle)
          * (1.0 - chaff * settle)
          * (1.0 - u_crisp * mix(1.0, 0.82, chaff));
}
`;

const FRAGMENT = `
precision mediump float;
varying float v_tint;
varying float v_alpha;
varying float v_flare;

${GLSL_WARM}

void main() {
  // A square footprint with a soft shoulder reads as grain; a disc reads as bokeh.
  vec2 d = gl_PointCoord - 0.5;
  float m = max(abs(d.x), abs(d.y));
  if (m > 0.5) discard;
  float soft = 1.0 - smoothstep(0.3, 0.5, m);

  vec3 tint = warmSpectral(v_tint);
  tint = mix(tint, vec3(1.0, 0.95, 0.86), v_flare * 0.65);
  float alpha = clamp(soft * v_alpha * (1.0 + v_flare * 0.9), 0.0, 1.0);
  gl_FragColor = vec4(tint * alpha, alpha);
}
`;

function seen(id: string) {
  try {
    return sessionStorage.getItem(SEEN_KEY) === id;
  } catch {
    return false;
  }
}

function remember(id: string) {
  try {
    sessionStorage.setItem(SEEN_KEY, id);
  } catch {
    // Private browsing: the sequence simply plays again. Nothing depends on it.
  }
}

export function Arrival({ submission }: { submission: Submission }) {
  const reduced = useReducedMotion();
  // Read once: a replay on re-render would be a different kind of surprise.
  const [already] = useState(() => seen(submission.id));
  const [done, setDone] = useState(false);

  const id = submission.id;
  const covers = submission.tracks.filter((track) => track.video_id).slice(0, SEATS.length);
  // Nothing to introduce until the resolver has finished finding songs, and
  // nothing to celebrate if the submission has fallen over.
  //
  // Waiting for the resolver to *finish* rather than to produce its first song
  // matters more than it looks. `tracks` grows with every poll while it works,
  // the grain's buffers are sized from how many there are, and its effects are
  // keyed on that count — so starting early tore the whole sequence down and
  // restarted it each time another song arrived, several times over, visibly.
  // It is also the wrong picture: the composition seats the songs that were
  // actually imported, and a cast of one is not that.
  const resolving = submission.status === "queued" || submission.status === "resolving";
  const ready = covers.length > 0 && !resolving;

  // What the listener pasted, so the wait can show it.
  //
  // `/music` already fetched exactly these previews to validate the links, and
  // they are cached indefinitely under the same key — so on the way here they
  // come back from the cache rather than from the network, and the real
  // playlist name is on screen in a frame instead of in five seconds. The
  // resolver cannot supply it: it only learns the title at the moment it also
  // gets the songs, which is the moment this screen stops being needed.
  const links = useMemo(
    () => submission.sources.map((source) => canonicalUrl({ kind: source.kind, id: source.external_id })),
    [submission.sources],
  );
  const previews = useLinkPreviews(ready ? [] : links);
  const named = previews.map((p) => p.data ?? null);
  const stop = submission.status === "failed" || already || !!reduced;

  const finish = useCallback(() => {
    remember(id);
    setDone(true);
  }, [id]);

  // While the resolver works there is nothing to show but the fact that we are
  // waiting. If it takes unusually long, the real screen behind this one — which
  // is already correct — is more use than an overlay.
  useEffect(() => {
    if (stop || ready) return;
    const bail = window.setTimeout(finish, BAIL_MS);
    return () => window.clearTimeout(bail);
  }, [stop, ready, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  if (stop || done) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0">
        {ready ? (
          <Grain tracks={covers} onDone={finish} />
        ) : (
          <Waiting sources={submission.sources} previews={named} />
        )}
      </div>
      {/* Never a trap: this is the only thing in the overlay you can click. */}
      <button
        type="button"
        onClick={finish}
        className="fixed right-5 bottom-5 z-[51] rounded-full border border-hairline-strong bg-canvas/80 px-4 py-2 text-[12px] text-ink-muted backdrop-blur transition-colors hover:border-white/25 hover:text-ink"
      >
        Skip
      </button>
    </div>
  );
}

/**
 * While the resolver works.
 *
 * Opening a playlist takes about five seconds, and the first version of this
 * held a flat panel and a pulsing line for all of it — which is most of why the
 * sequence that follows felt rushed: nothing happened, and then everything did.
 *
 * So it says what is actually going on. The links are real, their titles arrive
 * as the resolver reads them, and the counts are the ones the source reported.
 * No invented progress and no bar: there is no honest denominator until the
 * playlist has been opened, which is the very thing being waited for.
 */
function Waiting({
  sources,
  previews,
}: {
  sources: Submission["sources"];
  previews: (LinkPreview | null)[];
}) {
  return (
    <div className="absolute inset-0" style={{ background: BACKDROP }}>
      <div className="absolute inset-x-0 top-[18%] flex flex-col items-center gap-8 px-6">
        <p className="eyebrow">Opening your links…</p>

        {sources.length > 0 && (
          <ul className="flex w-full max-w-lg flex-col gap-3">
            {sources.slice(0, 5).map((source, i) => {
              const preview = previews[i] ?? null;
              const cover = preview?.thumbnail_video_id
                ? thumbnailUrl(preview.thumbnail_video_id)
                : (preview?.thumbnail_url ?? null);
              return (
                <li
                  key={`${source.kind}:${source.external_id}`}
                  className="flex items-center gap-4 border-b border-hairline pb-3"
                >
                  <span className="relative block h-11 w-[72px] shrink-0 overflow-hidden rounded-[5px] bg-elevated">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        loading="eager"
                        decoding="async"
                        draggable={false}
                        className="size-full object-cover opacity-80"
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] text-ink">
                      {preview?.title ?? source.title ?? (source.kind === "video" ? "A song" : "A playlist")}
                    </span>
                    {preview?.author && (
                      <span className="truncate text-[12px] text-ink-faint">{preview.author}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.16em] uppercase">
                    {source.status === "failed" ? (
                      <span className="text-ink-faint">unavailable</span>
                    ) : source.total_entries ? (
                      <span className="text-ember">{plural(source.total_entries, "song")}</span>
                    ) : (
                      <span className="text-ink-faint">opening</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <span className="absolute top-1/2 left-1/2 h-px w-56 -translate-x-1/2 animate-pulse bg-linear-to-r from-transparent via-ember to-transparent" />
    </div>
  );
}

function Grain({ tracks, onDone }: { tracks: SubmissionTrack[]; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const object = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLSpanElement>(null);
  const live = useRef<{
    gl: WebGLRenderingContext;
    u: Record<string, WebGLUniformLocation | null>;
    count: number;
  } | null>(null);
  const ended = useRef(onDone);
  useEffect(() => {
    ended.current = onDone;
  });

  const seatCount = tracks.length;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const seats = SEATS.slice(0, seatCount);
    const grains = GRAINS[quality()];
    const silhouette = silhouettePoints(grains);
    if (!silhouette.length || !seats.length) return;
    const origin = new Float32Array(grains * 2);
    const target = new Float32Array(grains * 2);
    const fuzz = new Float32Array(grains * 2);
    const seed = new Float32Array(grains * 2);
    const meta = new Float32Array(grains * 2);
    for (let i = 0; i < grains; i += 1) {
      const seat = seats[i % seats.length];
      origin[i * 2] = seat.x + (rand(i, 1) - 0.5) * seat.s;
      origin[i * 2 + 1] = -(seat.y + (rand(i, 2) - 0.5) * seat.s);
      const [sx, sy] = silhouette[i];
      target[i * 2] = ((sx - 120) / 240) * SILHOUETTE_SCALE;
      target[i * 2 + 1] = -((sy - 94) / 240) * SILHOUETTE_SCALE;
      fuzz[i * 2] = (rand(i, 5) - 0.5) * 0.011;
      fuzz[i * 2 + 1] = (rand(i, 6) - 0.5) * 0.011;
      seed[i * 2] = rand(i, 3);
      seed[i * 2 + 1] = rand(i, 4);
      meta[i * 2] = clamp((sx - 18) / 204);
      meta[i * 2 + 1] = rand(i, 7) < CHAFF ? 1 : 0;
    }

    const gl = context(el);
    const prog = gl ? program(gl, VERTEX, FRAGMENT) : null;
    if (!gl || !prog) return;
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    live.current = {
      gl,
      count: grains,
      u: Object.fromEntries(
        ["u_scale", "u_fit", "u_clock", "u_gate", "u_sweep", "u_crisp", "u_zoom", "u_point", "u_veil"].map(
          (name) => [name, gl.getUniformLocation(prog, name)],
        ),
      ),
    };
    return () => {
      live.current = null;
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(prog);
      // Only drop the context when the canvas is really going away: React's
      // development double-invoke tears this down with the element still
      // mounted, and `getContext` would hand back the same dead context.
      if (!el.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [seatCount]);

  // One clock, one loop. Everything in the scene is a function of its position,
  // so the sequence cannot drift out of step with itself or be left half-run.
  useEffect(() => {
    const seats = SEATS.slice(0, seatCount);
    let frame = 0;

    const render = (t: number) => {
      const box = root.current;
      if (!box) return;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const unit = Math.min(w, h);

      const arrive = span(t, 0.01, 0.17);
      const breakUp = span(t, 0.17, 0.36);
      const gate = span(t, 0.55, 0.585);
      const sweepAt = -0.35 + 1.75 * clamp((t - 0.565) / 0.155);
      const crisp = span(t, 0.72, 0.84);
      const handoff = span(t, 0.9, 1);
      const [fitScale, fitLift] = h < COMPACT_BELOW ? FIT.compact : FIT.roomy;
      const zoom = lerp(0.78, 1, easeOutExpo(span(t, 0, 0.64))) + 0.07 * span(t, 0.68, 1);

      // The overlay opens into the scanner it has been standing in front of.
      box.style.opacity = String(span(t, 0, 0.06) * (1 - handoff));

      if (plane.current) {
        const dolly = lerp(-260, 210, easeOutExpo(span(t, 0, 0.44)));
        const swing = Math.sin(t * 2.2) * 2.4 * (1 - breakUp);
        plane.current.style.transform = `translate3d(0,0,${dolly}px) rotateY(${swing}deg) rotateX(${swing * -0.3}deg)`;
      }

      tiles.current.forEach((node, i) => {
        const seat = seats[i];
        if (!node || !seat || !unit) return;
        const near = 1 - Math.abs(seat.z) / 460;
        const enter = clamp((arrive - i * 0.028) / 0.74);
        const eased = easeOutExpo(enter);
        const fade = clamp((breakUp - (1 - near) * 0.2) / 0.68);
        const driftX = Math.sin(t * 2.4 + i * 1.27) * unit * 0.013 * near;
        const driftY = Math.cos(t * 1.9 + i * 0.81) * unit * 0.011 * near;
        const spread = 1 + 0.3 * easeInExpo(fade);
        const size = seat.s * unit;
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
        node.style.opacity = String(eased * (1 - fade) * (0.5 + 0.5 * near));
        node.style.transform =
          `translate3d(${seat.x * unit * spread - size / 2 + driftX}px,` +
          `${seat.y * unit * spread - size / 2 + driftY}px,${seat.z}px) ` +
          `scale(${(0.84 + 0.16 * eased) * (1 + 0.16 * easeInExpo(fade))})`;
        node.style.filter = `blur(${fade * 10}px) saturate(${0.72 + 0.4 * near})`;
      });

      if (object.current && unit) {
        const width = SILHOUETTE_SCALE * fitScale * unit * zoom;
        const height = width * (180 / 240);
        object.current.style.width = `${width}px`;
        object.current.style.height = `${height}px`;
        object.current.style.opacity = String(crisp * (1 - handoff));
        object.current.style.transform =
          `translate3d(${w / 2 - width / 2}px,` +
          `${h / 2 - height / 2 - (fitLift + VIEWBOX_OFFSET * fitScale) * unit * zoom}px,0)`;
      }

      if (words.current) {
        const show = span(t, 0.8, 0.9);
        words.current.style.opacity = String(show * (1 - handoff));
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
      gl.uniform1f(u.u_gate, gate);
      gl.uniform1f(u.u_sweep, sweepAt);
      gl.uniform1f(u.u_crisp, crisp);
      gl.uniform1f(u.u_zoom, zoom);
      gl.uniform1f(u.u_point, Math.max(1.2, (el.height / 760) * 2.4));
      gl.uniform1f(u.u_veil, span(t, 0.14, 0.27) * (1 - handoff));
      gl.drawArrays(gl.POINTS, 0, scene.count);
    };

    const started = performance.now();
    const draw = (now: number) => {
      const t = Math.min(1, (now - started) / DURATION_MS);
      render(t);
      if (t >= 1) {
        ended.current();
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [seatCount]);

  return (
    <div
      ref={root}
      className="absolute inset-0 overflow-hidden"
      style={{
        opacity: 0,
        background: BACKDROP,
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />

      {/* The wall, in real depth, with the camera travelling into it. */}
      <div className="absolute inset-0" style={{ perspective: "1500px", perspectiveOrigin: "50% 48%" }}>
        <div
          ref={plane}
          className="absolute top-1/2 left-1/2 size-0 will-change-transform"
          style={{ transformStyle: "preserve-3d" }}
        >
          {tracks.map((track, i) => (
            <div
              key={track.id}
              ref={(el) => {
                tiles.current[i] = el;
              }}
              className="absolute will-change-transform"
              style={{ opacity: 0 }}
            >
              <span
                className="relative block size-full overflow-hidden rounded-[6%] bg-elevated"
                style={{
                  boxShadow: "0 24px 70px -26px rgb(0 0 0 / 1)",
                  outline: "1px solid rgb(255 255 255 / 0.1)",
                  outlineOffset: "-1px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(track.video_id)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  className="size-full object-cover"
                />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The resolved object. The same geometry the grain was aiming at. */}
      <div ref={object} className="absolute top-0 left-0 will-change-transform" style={{ opacity: 0 }}>
        <svg viewBox={HEADPHONE.viewBox} fill="none" className="size-full overflow-visible">
          <defs>
            {/* Horizontal, across exactly the span the grain was tinted over, so
                the handover from grain to stroke changes nothing but texture. */}
            <linearGradient id="arrival-ramp" x1="18" y1="0" x2="222" y2="0" gradientUnits="userSpaceOnUse">
              {WARM_STOPS.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
            <filter id="arrival-bloom" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#arrival-bloom)" stroke="url(#arrival-ramp)" strokeWidth="2.6" strokeLinecap="round">
            <path d={HEADPHONE.band} />
            <path d={HEADPHONE.cupLeft} />
            <path d={HEADPHONE.cupRight} />
          </g>
          <circle {...HEADPHONE.driverLeft} r={3} fill="#f5e6c8" opacity="0.8" />
          <circle {...HEADPHONE.driverRight} r={3} fill="#f5e6c8" opacity="0.8" />
        </svg>
      </div>

      <div
        ref={words}
        className="absolute inset-x-0 bottom-[7%] px-6 text-center will-change-transform sm:bottom-[10%] sm:px-8"
        style={{ opacity: 0 }}
      >
        <p className="eyebrow">{plural(tracks.length, "song")} from your playlist</p>
        <p className="display mt-2 text-[clamp(1.5rem,4vw,3rem)] leading-none sm:mt-3">
          Listening to your <em className="text-ember-soft">music</em>
        </p>
        <span
          ref={rule}
          className="mx-auto mt-3.5 block h-px w-28 origin-center bg-linear-to-r from-transparent via-ember to-transparent sm:mt-5 sm:w-44"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
