/**
 * Deterministic, clearly synthetic curves for the landing-page illustrations.
 * They explain the idea; they are never presented as anyone's data.
 */
import { MAX_HZ, MIN_HZ } from "@/lib/bands";

export const ILLUSTRATION_FREQS: number[] = Array.from(
  { length: 41 },
  (_, i) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / 40),
);
const T = ILLUSTRATION_FREQS.map((_, i) => i / 40);

const gauss = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function rand(n: number) {
  const v = Math.sin(n * 91.7) * 43758.5453;
  return v - Math.floor(v);
}

/** A typical "music" shape: bass-weighted, gently falling towards the treble. */
export const MUSIC = T.map((t) => 0.55 * gauss(t, 0.17, 0.2) + 0.22 * gauss(t, 0.5, 0.25) - 0.62 * t + 0.12);

export const SONGS = Array.from({ length: 14 }, (_, k) => ({
  id: `song-${k}`,
  values: T.map(
    (t) =>
      MUSIC[Math.round(t * 40)] +
      0.2 * Math.sin(t * (5 + 7 * rand(k + 1)) + 6 * rand(k + 2)) +
      (rand(k + 3) - 0.5) * 0.55 * (t - 0.5) +
      0.28 * (rand(k + 4) - 0.3) * gauss(t, 0.1 + 0.8 * rand(k + 5), 0.05),
  ),
}));

export const SPREAD = T.map((t) => 0.13 + 0.08 * Math.abs(Math.sin(t * 6 + 1)));

/** The same shape, refined by answers: a little more low end, a softer top. */
export const PREFERENCE = T.map(
  (t, i) => MUSIC[i] + 0.2 * gauss(t, 0.12, 0.14) - 0.16 * sigmoid((t - 0.72) * 12),
);

/** A made-up "measured earphone" close to the preference, with a treble peak. */
export const MEASURED = T.map(
  (t, i) => PREFERENCE[i] + 0.05 * Math.sin(t * 16) + 0.2 * gauss(t, 0.8, 0.045) - 0.04,
);

/** Per-band fit of the illustrative earphone (0–1), for the match chapter. */
export const MATCH_FIT: Record<string, number> = {
  sub_bass: 0.92,
  mid_bass: 0.95,
  lower_mids: 0.9,
  mids: 0.93,
  upper_mids: 0.88,
  presence: 0.8,
  lower_treble: 0.45,
  upper_treble: 0.7,
  air: 0.85,
};
