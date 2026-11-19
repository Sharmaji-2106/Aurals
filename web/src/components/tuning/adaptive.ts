/**
 * The tuning duel's next-pair logic, in the browser.
 *
 * A line-for-line mirror of `backend/src/auralis/tuning/policy.py` and the probit
 * update in `inference.py` (the backend recomputes everything from the raw choices;
 * this copy only decides what to play next, live). Constants must stay in step.
 */

export const TONAL = ["sub_bass", "mid_bass", "warmth", "vocal_presence", "treble", "air"] as const;
export type Tonal = (typeof TONAL)[number];
export type Offsets = Record<Tonal, number>;
export type Picked = "plus" | "minus" | "same";

export const CHOICE_NOISE = 8;
const SHAPE_SD = 3;
const SAME_WIDTH = 0.75;
export const POP_SD: Record<Tonal, number> = {
  sub_bass: 3,
  mid_bass: 3,
  warmth: 1.5,
  vocal_presence: 1.5,
  treble: 2.5,
  air: 2.5,
};
const PRIORITY: Tonal[] = ["sub_bass", "treble", "vocal_presence", "warmth", "air", "mid_bass"];
export const TRIALS = 8;
const REPEAT_AT = 5;
const REPEAT_OF = 1;
const MIN_STEP = 1.5;
const MAX_STEP = 4;

export type Belief = { mean: number; var: number };
export type Trial = { dimension: Tonal; center_db: number; delta_db: number; repeat_of: number | null };

export const zeros = (): Offsets => ({
  sub_bass: 0,
  mid_bass: 0,
  warmth: 0,
  vocal_presence: 0,
  treble: 0,
  air: 0,
});

function pdf(z: number) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}
/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
function cdf(z: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return 0.5 * (1 + Math.sign(z) * y);
}

export function probitUpdate(
  b: Belief,
  center: number,
  delta: number,
  picked: Picked,
  noise = CHOICE_NOISE,
): Belief {
  if (picked === "same") {
    const v = (SAME_WIDTH * delta) ** 2;
    const precision = 1 / b.var + 1 / v;
    return { mean: (b.mean / b.var + center / v) / precision, var: 1 / precision };
  }
  const y = picked === "plus" ? 1 : -1;
  const a = (4 * delta) / noise;
  const denom = Math.sqrt(1 + a * a * b.var);
  const z = (y * a * (b.mean - center)) / denom;
  const lam = pdf(z) / Math.max(cdf(z), 1e-12);
  return {
    mean: b.mean + (y * a * b.var * lam) / denom,
    var: Math.max(1e-6, b.var * (1 - (a * a * b.var * lam * (lam + z)) / (1 + a * a * b.var))),
  };
}

export function start(shape: Offsets | null): Record<Tonal, Belief> {
  const out = {} as Record<Tonal, Belief>;
  for (const d of TONAL) {
    const prior = POP_SD[d] ** 2;
    if (!shape) out[d] = { mean: 0, var: prior };
    else {
      const sv = SHAPE_SD ** 2;
      const precision = 1 / prior + 1 / sv;
      out[d] = { mean: shape[d] / sv / precision, var: 1 / precision };
    }
  }
  return out;
}

export function nextTrial(beliefs: Record<Tonal, Belief>, history: Trial[]): Trial | null {
  const n = history.length;
  if (n >= TRIALS) return null;
  if (n === REPEAT_AT && n > REPEAT_OF) {
    const first = history[REPEAT_OF];
    return { ...first, repeat_of: REPEAT_OF };
  }
  const last = history.at(-1)?.dimension;
  const score = (d: Tonal) => {
    let rel = beliefs[d].var / POP_SD[d] ** 2;
    if (last === d) rel *= 0.6;
    return rel - PRIORITY.indexOf(d) * 1e-3;
  };
  const dim = [...TONAL].sort((a, b) => score(b) - score(a))[0];
  const b = beliefs[dim];
  const step = Math.min(MAX_STEP, Math.max(MIN_STEP, 1.6 * Math.sqrt(b.var)));
  return {
    dimension: dim,
    center_db: Math.round(b.mean * 10) / 10,
    delta_db: Math.round(step * 2) / 2,
    repeat_of: null,
  };
}

/** The current best guess per dimension, as offsets to play. */
export function means(beliefs: Record<Tonal, Belief>): Offsets {
  return Object.fromEntries(TONAL.map((d) => [d, beliefs[d].mean])) as Offsets;
}

export const LABEL: Record<Tonal, string> = {
  sub_bass: "deep bass",
  mid_bass: "bass punch",
  warmth: "warmth",
  vocal_presence: "vocals",
  treble: "treble",
  air: "air",
};
