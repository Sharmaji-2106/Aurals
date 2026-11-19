import { describe, expect, it } from "vitest";
import { BANDS, colorForFrequency, MAX_HZ, MIN_HZ } from "./bands";
import { budgetStops } from "./currency";
import { formatDuration, formatHz, formatSigned } from "./format";
import { bandPath, logX, smoothPath } from "./scale";

describe("bands", () => {
  it("tile the audible range without gaps", () => {
    expect(BANDS[0].low).toBe(MIN_HZ);
    expect(BANDS.at(-1)!.high).toBe(MAX_HZ);
    BANDS.slice(1).forEach((band, i) => expect(band.low).toBe(BANDS[i].high));
  });

  it("interpolates colours across the spectrum", () => {
    expect(colorForFrequency(MIN_HZ)).toBe("rgb(255 82 56)");
    expect(colorForFrequency(1e9)).toBe("rgb(168 140 246)");
  });
});

describe("scale", () => {
  it("maps frequency logarithmically", () => {
    expect(logX(MIN_HZ)).toBe(0);
    expect(logX(MAX_HZ)).toBeCloseTo(1);
    expect(logX(Math.sqrt(MIN_HZ * MAX_HZ))).toBeCloseTo(0.5);
  });

  it("builds one cubic segment per gap", () => {
    const d = smoothPath([
      [0, 0],
      [10, 5],
      [20, 0],
    ]);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });

  it("closes band areas", () => {
    const d = bandPath(
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 1],
        [1, 1],
      ],
    );
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("format", () => {
  it("formats frequencies", () => {
    expect(formatHz(20)).toBe("20");
    expect(formatHz(1000)).toBe("1k");
    expect(formatHz(2500)).toBe("2.5k");
  });

  it("formats signed values without negative zero", () => {
    expect(formatSigned(1.26)).toBe("+1.3");
    expect(formatSigned(-0.04)).toBe("0.0");
    expect(formatSigned(-2)).toBe("-2.0");
  });

  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("");
  });
});

describe("budget stops", () => {
  it("are increasing in every currency", () => {
    for (const currency of ["USD", "INR", "JPY", "KRW"]) {
      const stops = budgetStops(currency);
      stops.slice(1).forEach((stop, i) => expect(stop).toBeGreaterThan(stops[i]));
    }
  });
});
