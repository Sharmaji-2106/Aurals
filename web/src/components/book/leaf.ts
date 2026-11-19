import { BOOK, LEAVES, restLeftY, restRightY } from "@/components/book/contract";

/**
 * How a leaf of paper turns.
 *
 * A leaf is modelled as what paper actually is: a sheet that bends but does
 * not stretch. Each row of the leaf, from the spine to the fore-edge, is a
 * chain of short rigid segments, and the leaf's shape at any instant is just
 * the angle of each segment. Positions are the running sum of those segments,
 * so however the angles change the leaf is always exactly 24 cm wide — the
 * single property that most separates paper from cloth or rubber, and the one
 * a vertex-displacement trick usually gets wrong.
 *
 * The turn is then a matter of choosing angles over time:
 *
 * - **Rest, right:** every segment flat (0 rad), at the leaf's height in the
 *   stack.
 * - **Rest, left:** flat at π, except near the spine, where the leaf has to
 *   drop from the top of the text block down onto the open board. That drop is
 *   a decaying bend whose strength is solved so the leaf lands exactly on the
 *   leaf below it.
 * - **In between:** a blend of the two, plus two terms that vanish at both
 *   ends. A *bend* lifts the fore-edge first (the hand takes the corner) and
 *   later lets it trail (the leaf falls, the air holds the edge back). A
 *   *twist* lets the bottom corner lead early on, which is what turns a hinge
 *   into a page being turned.
 *
 * Everything is a pure function of progress, so a scrubbed frame and a played
 * frame are the same frame.
 */

export const SEGMENTS = 44;
export const ROWS = 12;

const DS = BOOK.pageW / SEGMENTS;
/** How far from the spine the drop onto the open board is spread. */
const DRAPE = 0.07;

export type Leaf = {
  index: number;
  anchorY: number;
  /** Rest-left angle of each segment. */
  restLeft: Float32Array;
  /** Per-leaf character, so six turns do not look like one turn six times. */
  lift: number;
  lag: number;
  twist: number;
  pace: number;
};

/** A smooth bump: 0 at a, 1 at peak, 0 at b. */
function bump(p: number, a: number, peak: number, b: number) {
  if (p <= a || p >= b) return 0;
  const u = p < peak ? (p - a) / (peak - a) : (b - p) / (b - peak);
  return u * u * (3 - 2 * u);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Decaying weight of the drop near the spine: 1 at the spine, 0 at DRAPE. */
function drapeWeight(s: number) {
  const x = s / DRAPE;
  return x >= 1 ? 0 : (1 - x) * (1 - x);
}

/**
 * Solve the drop's strength so the leaf, anchored at `anchorY`, lands at
 * exactly `landY`. Bisection, because the relation is monotonic and a closed
 * form is not worth the obscurity.
 */
function restLeftProfile(anchorY: number, landY: number): Float32Array {
  const drop = anchorY - landY;
  const descent = (alpha: number) => {
    let total = 0;
    for (let j = 0; j < SEGMENTS; j++) total += DS * Math.sin(alpha * drapeWeight((j + 0.5) * DS));
    return total;
  };
  let lo = 0;
  let hi = 1.45;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (descent(mid) < drop) lo = mid;
    else hi = mid;
  }
  const alpha = (lo + hi) / 2;
  const out = new Float32Array(SEGMENTS);
  for (let j = 0; j < SEGMENTS; j++) out[j] = Math.PI + alpha * drapeWeight((j + 0.5) * DS);
  return out;
}

/** Deterministic per-leaf variation: small, so the family resemblance holds. */
function jitter(i: number, salt: number) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function makeLeaves(): Leaf[] {
  return Array.from({ length: LEAVES }, (_, i) => ({
    index: i,
    anchorY: restRightY(i),
    restLeft: restLeftProfile(restRightY(i), restLeftY(i)),
    lift: 0.78 + 0.22 * jitter(i, 1),
    lag: 0.55 + 0.25 * jitter(i, 2),
    twist: 0.32 + 0.2 * jitter(i, 3),
    pace: 0.92 + 0.16 * jitter(i, 4),
  }));
}

/** The base rotation, eased: a deliberate lift, an easy fall. */
function rotation(p: number, pace: number) {
  const u = clamp01((p - 0.05) / 0.9);
  const v = Math.pow(u, pace);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
}

/**
 * Write the leaf's vertex positions for progress `p` into `out`
 * ((SEGMENTS+1) × (ROWS+1) × 3 floats, row-major from the bottom of the page).
 */
export function deformLeaf(leaf: Leaf, p: number, out: Float32Array) {
  const e = rotation(p, leaf.pace);
  const bend = leaf.lift * bump(p, 0, 0.2, 0.56) - leaf.lag * bump(p, 0.36, 0.74, 1);
  const twist = leaf.twist * bump(p, 0, 0.17, 0.5);
  const H = BOOK.pageH;
  let o = 0;
  for (let r = 0; r <= ROWS; r++) {
    const v = r / ROWS;
    const z = H / 2 - v * H;
    // The bottom corner (v = 0, nearest the camera) leads; the head follows.
    const lead = bend + twist * (1 - v);
    let x = 0;
    let y = leaf.anchorY;
    out[o++] = x;
    out[o++] = y;
    out[o++] = z;
    for (let j = 0; j < SEGMENTS; j++) {
      const s = (j + 0.5) / SEGMENTS;
      const theta = e * leaf.restLeft[j] + lead * Math.pow(s, 1.5);
      x += DS * Math.cos(theta);
      y += DS * Math.sin(theta);
      out[o++] = x;
      out[o++] = y;
      out[o++] = z;
    }
  }
}

/** Grid topology and texture coordinates, shared by every leaf. */
export function leafTopology() {
  const cols = SEGMENTS + 1;
  const uv = new Float32Array(cols * (ROWS + 1) * 2);
  let k = 0;
  for (let r = 0; r <= ROWS; r++) {
    for (let j = 0; j < cols; j++) {
      uv[k++] = j / SEGMENTS;
      uv[k++] = r / ROWS;
    }
  }
  const index: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = r * cols + j;
      const b = a + 1;
      const d = a + cols;
      const c = d + 1;
      // Wound so the front faces up while the leaf lies on the right.
      index.push(a, b, d, b, c, d);
    }
  }
  return { uv, index, vertexCount: cols * (ROWS + 1) };
}

/** Where the outer edge of a leaf lies once it rests on the left. */
export function restLeftExtent(leaf: Leaf) {
  let x = 0;
  for (let j = 0; j < SEGMENTS; j++) x += DS * Math.cos(leaf.restLeft[j]);
  return x;
}

/** Leaf progress at a time, from the schedule. */
export function leafProgress(time: number, start: number, duration: number) {
  return clamp01((time - start) / duration);
}
