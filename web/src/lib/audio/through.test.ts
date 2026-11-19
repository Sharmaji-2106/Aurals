import { describe, expect, it } from "vitest";
import { firFor, type ListeningCurve } from "@/lib/audio/through";

const SR = 48_000;
const freqs = Array.from({ length: 121 }, (_, i) => 20 * 10 ** (i / 40));

/** Magnitude (dB) of an FIR at `hz`, by direct DFT. */
function responseDb(fir: Float32Array, hz: number) {
  let re = 0;
  let im = 0;
  for (let n = 0; n < fir.length; n++) {
    const w = (2 * Math.PI * hz * n) / SR;
    re += fir[n] * Math.cos(w);
    im -= fir[n] * Math.sin(w);
  }
  return 20 * Math.log10(Math.hypot(re, im));
}

describe("an earphone's tuning as a filter", () => {
  it("a flat curve passes music unchanged", () => {
    const fir = firFor({ freqs_hz: freqs, gain_db: freqs.map(() => 0) }, SR);
    for (const hz of [50, 500, 5000, 15000]) expect(Math.abs(responseDb(fir, hz))).toBeLessThan(0.1);
  });

  it("follows a bass shelf and a treble dip", () => {
    const curve: ListeningCurve = {
      freqs_hz: freqs,
      gain_db: freqs.map(
        (f) => 6 / (1 + (f / 150) ** 2) - 4 * Math.exp(-0.5 * (Math.log2(f / 6000) / 0.3) ** 2),
      ),
    };
    const fir = firFor(curve, SR);
    expect(responseDb(fir, 40)).toBeGreaterThan(5);
    expect(Math.abs(responseDb(fir, 1000))).toBeLessThan(0.5);
    expect(responseDb(fir, 6000)).toBeLessThan(-3);
  });

  it("is linear phase: symmetric about its centre", () => {
    const fir = firFor({ freqs_hz: freqs, gain_db: freqs.map((f) => Math.log2(f / 1000)) }, SR);
    const half = fir.length / 2;
    for (const t of [1, 10, 100, 1000]) expect(fir[half + t]).toBeCloseTo(fir[half - t], 6);
  });
});
