import { BOOK, BLOCK_TOP, FINAL_FOV, T, TURNS } from "@/components/book/contract";
import { leafProgress } from "@/components/book/leaf";

/**
 * Everything that moves, as a function of the clock.
 *
 * Nothing here holds state. `frameAt(time, viewport)` returns the complete
 * state of the scene at that instant — lights, cover, leaves, camera, how flat
 * the final page is lit, how far the DOM has faded in — and the scene simply
 * applies it. That is the whole reason replay, pause, scrub and skip cannot
 * leave the book half-open or a page mid-air: there is no animation running
 * that could be interrupted, only a time that can be set.
 */

export type Vec3 = readonly [number, number, number];

export type Viewport = { width: number; height: number; fov: number };

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a: number, b: number, v: number) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function span([a, b]: readonly [number, number], v: number) {
  return clamp01((v - a) / (b - a));
}

/* ------------------------------------------------------------------ cover --- */

/**
 * Opening progress and the rebound after landing.
 *
 * A cubic Hermite through three states: still at rest, passing upright at an
 * unhurried constant speed (a hand is carrying it), and arriving at the table
 * still moving (it has fallen the last half). Then the board's outer edge
 * rebounds a fraction of a degree and settles, which is most of what makes it
 * read as a heavy object rather than an animated plane.
 */
export function coverAt(time: number) {
  const [start, end] = T.cover;
  const landing = start + (end - start) * 0.86;
  const u = clamp01((time - start) / (landing - start));
  const keys = [
    { u: 0, c: 0, m: 0 },
    { u: 0.58, c: 0.52, m: 1.05 },
    { u: 1, c: 1, m: 1.5 },
  ];
  let c = 1;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (u <= b.u) {
      const h = b.u - a.u;
      const s = (u - a.u) / h;
      const s2 = s * s;
      const s3 = s2 * s;
      c =
        (2 * s3 - 3 * s2 + 1) * a.c +
        (s3 - 2 * s2 + s) * h * a.m +
        (-2 * s3 + 3 * s2) * b.c +
        (s3 - s2) * h * b.m;
      break;
    }
  }
  const since = time - landing;
  const settle =
    since > 0 ? 0.03 * Math.exp(-since / 0.07) * Math.abs(Math.sin((since * Math.PI) / 0.11)) : 0;
  return { c: clamp01(c), settle };
}

/* ----------------------------------------------------------------- leaves --- */

export function leavesAt(time: number): number[] {
  return TURNS.map((turn) => leafProgress(time, turn.start, turn.duration));
}

/* ----------------------------------------------------------------- lights --- */

export type Lighting = {
  /** The room's baked light: the horizon glow. */
  room: number;
  environment: number;
  key: number;
  rim: number;
  fill: number;
  /** Where the sweep light is along the cover, 0 → 1, and how bright. */
  sweep: number;
  sweepLevel: number;
  /** 0 = lit as a scene, 1 = the page shown exactly as its artwork. */
  flatten: number;
  vignette: number;
  /** How far out of focus the horizon is, in backdrop pixels. */
  focus: number;
};

export function lightingAt(time: number): Lighting {
  // The terrace comes up out of dusk (never black: the sky is already lit);
  // then a warm edge on the book; then the sun finds it.
  const room = 0.42 + 0.58 * smoothstep(T.room[0], T.room[1], time);
  const up = smoothstep(T.lightsUp[0], T.lightsUp[1], time);
  const rim = smoothstep(0.2, 1.1, time);
  const sweep = span(T.sweep, time);
  const flatten = smoothstep(T.flatten[0], T.flatten[1], time);
  return {
    room,
    environment: Math.max(room * 0.35, up),
    key: up * up,
    rim,
    fill: up,
    sweep,
    sweepLevel: Math.sin(Math.PI * sweep) ** 2,
    flatten,
    vignette: 1 - smoothstep(7.4, 8.2, time),
    // A rack focus: the opening frame is focused toward the sea, then the lens
    // finds the book and the horizon softens behind it.
    focus: 1.5 + 9 * smoothstep(T.focus[0], T.focus[1], time),
  };
}

/* ----------------------------------------------------------------- camera --- */

/**
 * Where the final frame puts the camera: straight down at the open spread,
 * with the right-hand page exactly where the DOM will draw it.
 *
 * The DOM lays the spread out at the viewport's centre, covering the screen on
 * landscape displays and fitting its width on portrait ones. The camera is
 * placed so the right-hand page's projection matches that rectangle to the
 * pixel — its gutter on the centre line, its width the DOM page's width. The
 * left page lies a centimetre lower (it rests on the open board, not on the
 * text block), so it projects fractionally smaller; the handoff settles that
 * difference rather than pretending it is not there.
 */
export function spreadLayout(width: number, height: number) {
  const aspect = width / height;
  const spreadAspect = (2 * BOOK.pageW) / BOOK.pageH;
  const mode: "cover" | "contain" = aspect >= 1.2 && aspect <= 1.95 ? "cover" : "contain";
  // A little bleed when covering: the left page lies lower in the book and so
  // projects ~1% smaller; without it a sliver of table shows above and below
  // that page in the last frame.
  const spreadW =
    mode === "cover"
      ? Math.max(width, height * spreadAspect) * 1.025
      : Math.min(width, height * spreadAspect);
  const pageW = spreadW / 2;
  const pageH = (pageW * BOOK.pageH) / BOOK.pageW;
  return {
    mode,
    pageW,
    pageH,
    top: (height - pageH) / 2,
    gutter: width / 2,
  };
}

export function finalCamera(viewport: Viewport) {
  const { pageW } = spreadLayout(viewport.width, viewport.height);
  const focal = viewport.height / 2 / Math.tan((FINAL_FOV * Math.PI) / 360);
  const distance = (focal * BOOK.pageW) / pageW;
  return {
    position: [0, BLOCK_TOP + distance, 0] as Vec3,
    target: [0, BLOCK_TOP, 0] as Vec3,
  };
}

type Key = { t: number; position: Vec3; target: Vec3; fov: number };

/**
 * The camera's journey. One continuous path through these marks — a
 * Catmull-Rom spline in time, at rest only at the first and last — so the
 * move never stops and restarts between acts.
 */
function keys(viewport: Viewport): Key[] {
  const final = finalCamera(viewport);
  // The marks are composed for a 16:10 screen. A narrower one sees less
  // across at the same distance, so the camera backs away along its own line
  // of sight until the subject fits the same width: the whole open book while
  // it is open, the closed book (about half as wide) before that.
  const aspect = viewport.width / viewport.height;
  const open = Math.max(1, 1.6 / aspect);
  const closed = Math.max(1, (1.6 / aspect) * 0.76);
  const key = (t: number, position: Vec3, target: Vec3, fov: number, back: number): Key => ({
    t,
    target,
    fov,
    position: [0, 1, 2].map((i) => target[i] + (position[i] - target[i]) * back) as unknown as Vec3,
  });
  // Focal lengths, as a full-frame camera would see them. It opens low, at the
  // height of the glass, looking past the book to the sun on the sea — the
  // horizon a little above the middle of the frame, the book in front of it.
  // It tracks left and rises as if walking round the table, which turns the
  // balustrade and the coast against each other, and reaches a three-quarter
  // view as the cover lifts; then climbs over the pages, ending at the
  // composition the page itself was laid out for.
  return [
    key(0, [-0.17, 0.17, 0.52], [0.33, 0.06, -0.36], 38, closed),
    key(1.8, [-0.33, 0.23, 0.47], [0.16, 0.03, -0.12], 34, closed),
    key(3.4, [-0.2, 0.42, 0.62], [0.0, 0.012, -0.01], 28, open),
    key(5.0, [-0.02, 0.53, 0.56], [0.0, 0.012, 0.004], 27, open),
    // The settle pulls back to take in the whole spread, so the zoom that
    // follows is a real approach and not only a change of angle.
    key(6.5, [0.005, 0.68, 0.48], [0.0, 0.012, 0.004], 26.5, open),
    key(7.0, [0.0, 0.74, 0.4], [0.0, 0.013, 0.0], FINAL_FOV, open),
    { t: 8.2, position: final.position, target: final.target, fov: FINAL_FOV },
  ];
}

function hermite(p0: number, m0: number, p1: number, m1: number, s: number, h: number) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1
  );
}

function along(path: Key[], time: number, pick: (k: Key) => readonly number[]): number[] {
  const last = path.length - 1;
  if (time <= path[0].t) return [...pick(path[0])];
  if (time >= path[last].t) return [...pick(path[last])];
  let i = 0;
  while (time > path[i + 1].t) i++;
  const a = path[i];
  const b = path[i + 1];
  const tangent = (k: number, axis: number) => {
    if (k === 0 || k === last) return 0;
    const prev = path[k - 1];
    const next = path[k + 1];
    return (pick(next)[axis] - pick(prev)[axis]) / (next.t - prev.t);
  };
  const h = b.t - a.t;
  const s = (time - a.t) / h;
  return pick(a).map((_, axis) =>
    hermite(pick(a)[axis], tangent(i, axis), pick(b)[axis], tangent(i + 1, axis), s, h),
  );
}

export function cameraAt(time: number, viewport: Viewport) {
  const path = keys(viewport);
  const position = along(path, time, (k) => k.position) as unknown as Vec3;
  const target = along(path, time, (k) => k.target) as unknown as Vec3;
  const [fov] = along(path, time, (k) => [k.fov]);
  // Looking straight down has no "up"; the page's head (-z) becomes up as the
  // camera rises over it, so the final frame reads the right way round.
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const elevation = Math.atan2(-dy, Math.hypot(dx, dz));
  const k = smoothstep(1.05, 1.5, elevation);
  const up: Vec3 = [0, 1 - k, -k];
  return { position, target, up, fov };
}

/* -------------------------------------------------------------------- DOM --- */

export function handoffAt(time: number) {
  return smoothstep(T.handoff[0], T.handoff[1], time);
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * The ending, after the DOM has taken over: each phase's progress, eased.
 *
 * The push is a slow ease in and out — a dolly that starts and arrives. The
 * pull is a long ease out, so the camera leaves quickly and settles slowly onto
 * the product card, which is how a pullback reads as an arrival rather than a
 * retreat. The scroll eases in and out, as a hand on a trackpad does.
 */
export function finaleAt(time: number) {
  return {
    push: easeInOut(span(T.push, time)),
    sheen: span(T.sheen, time),
    theme: span(T.theme, time),
    pull: easeOut(span(T.pull, time)),
    scroll: easeInOut(span(T.scroll, time)),
  };
}
