/**
 * Canonical frequency bands, mirrored from the backend (`acoustics/bands.py`).
 * The colour of each band is part of the design language: warm lows, cool highs.
 */
export const BANDS = [
  { key: "sub_bass", label: "Sub-bass", short: "Sub", low: 20, high: 60, color: "#ff5238" },
  { key: "mid_bass", label: "Mid-bass", short: "Bass", low: 60, high: 200, color: "#ff7a3a" },
  { key: "lower_mids", label: "Lower mids", short: "Low-mid", low: 200, high: 500, color: "#ffa04a" },
  { key: "mids", label: "Mids", short: "Mid", low: 500, high: 1200, color: "#f5c678" },
  { key: "upper_mids", label: "Upper mids", short: "Up-mid", low: 1200, high: 3000, color: "#e9e2c3" },
  { key: "presence", label: "Presence", short: "Pres.", low: 3000, high: 5000, color: "#b8e3d6" },
  { key: "lower_treble", label: "Lower treble", short: "Treble", low: 5000, high: 8000, color: "#85cfe6" },
  { key: "upper_treble", label: "Upper treble", short: "Up-treb.", low: 8000, high: 12000, color: "#7fa6f4" },
  { key: "air", label: "Air", short: "Air", low: 12000, high: 20000, color: "#a88cf6" },
] as const;

export type BandKey = (typeof BANDS)[number]["key"];

export const BAND_COLOR: Record<BandKey, string> = Object.fromEntries(
  BANDS.map((b) => [b.key, b.color]),
) as Record<BandKey, string>;

export const MIN_HZ = 20;
export const MAX_HZ = 20000;

export function bandCenter(band: { low: number; high: number }) {
  return Math.sqrt(band.low * band.high);
}

/** Colour for an arbitrary frequency, interpolated across the spectral scale. */
export function colorForFrequency(hz: number) {
  const t = Math.min(1, Math.max(0, Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)));
  const pos = t * (BANDS.length - 1);
  const i = Math.min(BANDS.length - 2, Math.floor(pos));
  return mixHex(BANDS[i].color, BANDS[i + 1].color, pos - i);
}

export function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

/** Gradient stops spanning the spectrum, for SVG <linearGradient>. */
export const SPECTRAL_STOPS = BANDS.map((b, i) => ({
  offset: i / (BANDS.length - 1),
  color: b.color,
}));
