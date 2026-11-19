/**
 * The Sound Card's arrival, as a function of time — short, because the card
 * accompanies the page rather than holding it up.
 *
 * Like the book, nothing here holds state: `revealAt(t)` returns everything
 * for one instant, so it plays, scrubs and replays without falling out of
 * step.
 *
 *  1. **Arrive** (0–0.8 s): the card glides in, turning toward you.
 *  2. **Scan** (0.2–1.5 s): its artwork appears top to bottom, each mark warm
 *     for a moment.
 *  3. **Shine** (1.2–2.3 s): one sweep of light across the finished card.
 *
 * Then it rests in a three-quarter view, the viewer's to turn.
 */

export type Vec3 = [number, number, number];

export type Phases = {
  arrive: [number, number];
  scan: [number, number];
  shine: [number, number];
  total: number;
};

const PHASES: Phases = { arrive: [0, 0.8], scan: [0.2, 1.5], shine: [1.2, 2.3], total: 2.4 };

/** The timeline. The same for every finish: the card keeps time with the page. */
export function phases(): Phases {
  return PHASES;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function span([a, b]: [number, number], t: number) {
  return clamp01((t - a) / (b - a));
}
function easeOut(v: number) {
  return 1 - Math.pow(1 - v, 3);
}
function easeInOut(v: number) {
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
}

export type RevealFrame = {
  /** 0–1 how far the scan has revealed the front. */
  reveal: number;
  /** 0 invisible → 1 solid. */
  presence: number;
  glow: number;
  /** The passing light: where along the diagonal, and how bright. */
  sweep: number;
  gleam: number;
  /** Rotation about the card's vertical axis. */
  turn: number;
  lean: number;
  /** Lift off its resting height, metres. */
  lift: number;
  camera: { position: Vec3; target: Vec3; fov: number };
  done: boolean;
};

/** The resting pose: three-quarters, showing the card's edge. */
export const REST = { turn: -0.3, lean: 0.04 };

export function revealAt(time: number): RevealFrame {
  const p = PHASES;
  const arrive = easeOut(span(p.arrive, time));
  const scan = easeInOut(span(p.scan, time));
  const shine = span(p.shine, time);
  return {
    reveal: scan,
    presence: clamp01(arrive * 1.6),
    glow: shine,
    sweep: -0.35 + 1.7 * easeInOut(shine),
    gleam: shine > 0 && shine < 1 ? Math.sin(Math.PI * shine) : 0,
    turn: REST.turn - 0.45 * (1 - arrive),
    lean: REST.lean + 0.06 * (1 - arrive),
    lift: -0.006 * (1 - arrive),
    camera: { position: [0.004, 0.003, 0.25], target: [0, 0, 0], fov: 22 },
    done: time >= p.total,
  };
}
