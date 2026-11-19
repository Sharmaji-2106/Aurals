import { describe, expect, it } from "vitest";
import { musicCharacter, portrait } from "./portrait";

const dim = (key: string, value: number, confidence = 0.7) => ({ key, value, confidence });

describe("portrait", () => {
  it("describes a bass-heavy, treble-sensitive profile", () => {
    const words = portrait([
      dim("sub_bass", 0.9),
      dim("mid_bass", 0.84),
      dim("vocal_presence", 0.45),
      dim("warmth", 0.5),
      dim("treble", 0.36),
      dim("treble_tolerance", 0.2),
    ]);
    expect(words).toEqual(["Deep, physical bass.", "Smooth, forgiving highs."]);
  });

  it("admits when there is too little evidence", () => {
    expect(portrait([dim("sub_bass", 0.9, 0.1), dim("treble", 0.5, 0.1)])).toEqual([
      "A sound still taking shape.",
    ]);
  });
});

describe("musicCharacter", () => {
  it("lists leaning traits", () => {
    const d = (key: string, median: number) => ({ key, value: { median } });
    expect(musicCharacter([d("brightness", 0.7), d("energy", 0.66), d("warmth", 0.5)])).toBe(
      "Your library leans bright and energetic.",
    );
    expect(musicCharacter([d("brightness", 0.5)])).toContain("typical");
  });
});
