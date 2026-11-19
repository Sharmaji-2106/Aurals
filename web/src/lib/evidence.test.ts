import { describe, expect, it } from "vitest";
import { evidenceLabel, evidenceLevel, keyTraits, refinements, type Basis } from "./evidence";

const basis = (
  music: Basis["music"],
  answers: Basis["answers"] = "none",
  agreement: Basis["agreement"] = null,
) => ({
  music,
  answers,
  agreement,
});

describe("evidence wording", () => {
  it("puts music first and never uses numbers", () => {
    expect(evidenceLabel(basis("strong"))).toBe("Strong music evidence");
    expect(evidenceLabel(basis("strong", "direct", "agree"))).toBe("Music evidence, confirmed by you");
    expect(evidenceLabel(basis("moderate", "direct", "refine"))).toBe("Music evidence, refined by you");
    expect(evidenceLabel(basis("strong", "direct", "differ"))).toBe("Your music and answers disagree");
    expect(evidenceLabel(basis("none", "direct"))).toBe("From your answers");
    expect(evidenceLabel(basis("none", "indirect"))).toContain("Emerging");
    expect(evidenceLabel(basis("none"))).toBe("Not enough evidence yet");
  });

  it("levels rise with agreement and fall with disagreement", () => {
    expect(evidenceLevel(basis("moderate"))).toBe(2);
    expect(evidenceLevel(basis("moderate", "direct", "agree"))).toBe(3);
    expect(evidenceLevel(basis("strong", "direct", "differ"))).toBe(2);
    expect(evidenceLevel(basis("none", "direct"))).toBe(1);
    expect(evidenceLevel(basis("none"))).toBe(0);
  });
});

describe("keyTraits", () => {
  const dim = (key: string, value: number, group = "tonal", confidence = 0.8) => ({
    key: key as never,
    value,
    confidence,
    group: group as never,
    basis: basis("strong"),
  });

  it("names the strongest leanings, then sensitivity and priorities", () => {
    const traits = keyTraits([
      dim("sub_bass", 0.8),
      dim("vocal_presence", 0.66),
      dim("treble", 0.52),
      dim("treble_tolerance", 0.2, "tolerance"),
      dim("soundstage", 0.9, "priority"),
    ]);
    expect(traits.map((t) => t.title)).toEqual([
      "Deep sub-bass",
      "Vocals a step forward",
      "Sensitive to bright highs",
      "Space matters to you",
    ]);
  });

  it("stays quiet about weak evidence", () => {
    expect(keyTraits([dim("sub_bass", 0.9, "tonal", 0.1)])).toEqual([]);
  });
});

describe("refinements", () => {
  const point = (band: string, offset_db: number, b = basis("strong", "direct", "refine")) => ({
    band: band as never,
    offset_db,
    basis: b,
  });

  it("compares music, answers and result by region", () => {
    const bands = [
      "sub_bass",
      "mid_bass",
      "lower_mids",
      "upper_mids",
      "presence",
      "lower_treble",
      "upper_treble",
      "air",
    ];
    const music = bands.map((b) => point(b, b.endsWith("bass") ? -1 : 0));
    const answers = bands.map((b) => point(b, b.endsWith("bass") ? 3 : 0));
    const combined = bands.map((b) =>
      point(
        b,
        b.endsWith("bass") ? -0.5 : 0,
        basis("strong", "direct", b.endsWith("bass") ? "differ" : "agree"),
      ),
    );
    const rows = refinements(combined, music, answers);
    const bass = rows.find((r) => r.key === "bass")!;
    expect(bass).toMatchObject({ music: -1, said: 3, final: -0.5, verdict: "You disagree · music holds" });
    expect(rows.find((r) => r.key === "vocals")!.verdict).toBe("Confirmed");
    expect(refinements(combined, null, answers)).toEqual([]);
  });
});
