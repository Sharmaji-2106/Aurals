import { BOOK, BOARD_H, BOOK_TOP } from "@/components/book/contract";

/**
 * The cover's hinge, and the spine that flexes with it.
 *
 * A hardcover does not open like a door. The front board is joined to the
 * spine by a strip of leather a few millimetres wide (the joint), and the
 * spine itself is a rounded shell standing proud of the text block. So the
 * board first pivots about the top of the spine, and then — once it is past
 * upright and has nothing holding it up — it falls, pulling the joint and the
 * top of the spine over with it until it lies on the table.
 *
 * That is modelled as two pieces:
 *
 * - `boardPose(c)`: where the board's hinge edge is and which way the board
 *   points, for opening progress `c`. A circle around the spine's top while it
 *   lifts; a drop to the table while it falls.
 * - `spineSection(c)`: the cross-section of the spine's leather, a smooth curve
 *   from the back board around the text block to wherever the front board's
 *   hinge has got to. Closed, it is a rounded C. Open, it is a low hump the
 *   leaves drape over, with its endpaper side up.
 *
 * Neither knows about time. `choreography.ts` decides how `c` moves.
 */

type Vec = { x: number; y: number };

const { board, joint, bulge, shell } = BOOK;

/** Where the closed board's hinge edge sits: its mid-plane, at the joint. */
const PIVOT: Vec = { x: 0, y: BOOK_TOP - board / 2 };
/** Where the open board's hinge edge comes to rest on the table. */
const OPEN_HINGE: Vec = { x: -(bulge + joint), y: board / 2 };

function smoothstep(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export type BoardPose = { x: number; y: number; angle: number };

/** `settle` is extra angle at rest: a small rebound after the board lands. */
export function boardPose(c: number, settle = 0): BoardPose {
  const angle = Math.PI * c;
  const drop = smoothstep(0.5, 1, c);
  // At c = 1 the lifting circle has carried the hinge to (-joint, PIVOT.y);
  // the drop carries it the rest of the way to the table.
  const dx = -joint - OPEN_HINGE.x;
  const dy = PIVOT.y - OPEN_HINGE.y;
  return {
    x: PIVOT.x + joint * Math.cos(angle) - drop * dx,
    y: PIVOT.y + joint * Math.sin(angle) - drop * dy,
    angle: angle - settle,
  };
}

/* -------------------------------------------------------------- the spine --- */

const SAMPLES = 15; // per curved segment

function cubic(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * The spine's mid-surface, as an ordered list of points from the back board's
 * hinge to the front board's. Its outward side (the leather) is on the left
 * of the direction of travel.
 */
export function spineSection(c: number, pose: BoardPose): Vec[] {
  const k = smoothstep(0.28, 1, c);
  const back: Vec = { x: joint, y: shell / 2 };
  const heel: Vec = { x: 0, y: shell / 2 };

  // The apex of the rounding: the C's outermost point while closed; the top
  // of the hump once open.
  const apex: Vec = {
    x: lerp(-bulge + shell / 2, -bulge - 0.0006, k),
    y: lerp(BOOK_TOP / 2, board + BOOK.block * 0.42, k),
  };
  const apexAngle = lerp(Math.PI / 2, Math.PI, k);
  const apexDir: Vec = { x: Math.cos(apexAngle), y: Math.sin(apexAngle) };
  const end: Vec = { x: pose.x, y: pose.y };
  const endDir: Vec = { x: Math.cos(pose.angle), y: Math.sin(pose.angle) };

  // Handle lengths: a quarter-ellipse while closed (0.5523 of each radius),
  // shorter S-curves once the spine has rolled flat.
  const radiusY = BOOK_TOP / 2;
  const h1 = lerp(0.5523 * bulge, 0.0022, k);
  const h2 = lerp(0.5523 * radiusY, 0.003, k);
  const h3 = lerp(0.5523 * radiusY, 0.0022, k);
  const h4 = lerp(joint + 0.5523 * bulge * 0.6, 0.0022, k);

  const lower = [
    heel,
    { x: heel.x - h1, y: heel.y },
    { x: apex.x - apexDir.x * h2, y: apex.y - apexDir.y * h2 },
    apex,
  ] as const;
  const upper = [
    apex,
    { x: apex.x + apexDir.x * h3, y: apex.y + apexDir.y * h3 },
    { x: end.x - endDir.x * h4, y: end.y - endDir.y * h4 },
    end,
  ] as const;

  const points: Vec[] = [back];
  for (let i = 0; i <= SAMPLES; i++) points.push(cubic(lower[0], lower[1], lower[2], lower[3], i / SAMPLES));
  for (let i = 1; i <= SAMPLES; i++) points.push(cubic(upper[0], upper[1], upper[2], upper[3], i / SAMPLES));
  return points;
}

export const SPINE_POINTS = 2 + 2 * SAMPLES;

/**
 * Fill a spine geometry's positions and texture coordinates from a section.
 *
 * Layout: the outer (leather) surface, then the inner (endpaper) surface, then
 * the two end caps that show the shell's thickness at head and tail. Each has
 * its own vertices, so lighting does not smear across the edges.
 */
export function writeSpine(points: Vec[], position: Float32Array, uv: Float32Array) {
  const n = points.length;
  const half = BOARD_H / 2;

  // Normals of the section (outward = left of travel) and arc length.
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const len = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const m = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / m;
    ny[i] = tx / m;
    if (i > 0) len[i] = len[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const total = len[n - 1] || 1;

  let p = 0;
  let t = 0;
  const put = (x: number, y: number, z: number, u: number, v: number) => {
    position[p++] = x;
    position[p++] = y;
    position[p++] = z;
    uv[t++] = u;
    uv[t++] = v;
  };
  const o = shell / 2;
  // Outer and inner surfaces: two rows each (the shape does not vary along z).
  for (const side of [1, -1]) {
    for (const [z, v] of [
      [half, 0],
      [-half, 1],
    ] as const) {
      for (let i = 0; i < n; i++) {
        put(points[i].x + nx[i] * o * side, points[i].y + ny[i] * o * side, z, len[i] / total, v);
      }
    }
  }
  // End caps: outer and inner edge at each end.
  for (const z of [half, -half]) {
    for (const side of [1, -1]) {
      for (let i = 0; i < n; i++) {
        put(
          points[i].x + nx[i] * o * side,
          points[i].y + ny[i] * o * side,
          z,
          len[i] / total,
          side > 0 ? 0 : 0.02,
        );
      }
    }
  }
  return total;
}

/** Index buffer and material groups for `writeSpine`'s layout. */
export function spineTopology(n: number) {
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (flip) index.push(a, d, b, b, d, c);
    else index.push(a, b, d, b, c, d);
  };
  // Outer: rows 0..n-1 (z = +half), n..2n-1 (z = -half). Faces outward.
  for (let i = 0; i < n - 1; i++) quad(i, i + 1, n + i + 1, n + i, false);
  const outerCount = index.length;
  // Inner: faces inward.
  const inner = 2 * n;
  for (let i = 0; i < n - 1; i++) quad(inner + i, inner + i + 1, inner + n + i + 1, inner + n + i, true);
  const innerCount = index.length - outerCount;
  // Caps: +z cap faces +z, -z cap faces -z.
  const cap = 4 * n;
  for (let i = 0; i < n - 1; i++) {
    const oa = cap + i;
    const ia = cap + n + i;
    index.push(oa, ia, oa + 1, oa + 1, ia, ia + 1);
  }
  const cap2 = 6 * n;
  for (let i = 0; i < n - 1; i++) {
    const oa = cap2 + i;
    const ia = cap2 + n + i;
    index.push(oa, oa + 1, ia, oa + 1, ia + 1, ia);
  }
  const capCount = index.length - outerCount - innerCount;
  return {
    index,
    vertexCount: 8 * n,
    groups: [
      { start: 0, count: outerCount, material: 0 },
      { start: outerCount, count: innerCount, material: 1 },
      { start: outerCount + innerCount, count: capCount, material: 2 },
    ],
  };
}
