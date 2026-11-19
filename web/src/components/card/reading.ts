import type { Library } from "@/components/card/listener";

/**
 * What the Sound Card says, in plain words.
 *
 * - **The line**: the listener's sound — the six tonal dimensions of their
 *   sound profile, from deep bass to air, as dB above or below the reference
 *   target. The same line the results page draws.
 * - **Traits**: the three ways their music stands furthest from typical music,
 *   each from a measured descriptor (0.5 = typical) or its loudness. Nothing is
 *   a trait unless a number says so; when little stands out, the card says the
 *   music is balanced rather than inventing a character.
 */

export type Signature = {
  /** dB against the reference target, deep bass → air. */
  values: number[];
  labels: string[];
};

export function signature(lib: Library): Signature {
  const dims = (
    lib.snapshot.sound as unknown as {
      data: { dimensions: { key: string; label: string; group: string; mean: number }[] };
    }
  ).data.dimensions.filter((d) => d.group === "tonal");
  return { values: dims.map((d) => d.mean), labels: dims.map((d) => d.label) };
}

export type Trait = { key: string; word: string; note: string; strength: number };

const WORDS: Record<string, { high: [string, string]; low: [string, string] }> = {
  brightness: {
    high: ["Bright", "more sparkle up top than most music"],
    low: ["Mellow", "softer, gentler highs than most music"],
  },
  warmth: {
    high: ["Warm", "a full, rich body in the low mids"],
    low: ["Lean", "a lighter, tighter low end than most music"],
  },
  energy: { high: ["Energetic", "busy, driving songs"], low: ["Calm", "gentle, unhurried songs"] },
  dynamics: {
    high: ["Dynamic", "big swings between quiet and loud"],
    low: ["Punchy", "tightly mixed, consistently strong"],
  },
  width: { high: ["Spacious", "a wide, open stereo image"], low: ["Intimate", "a close, centred sound"] },
  density: { high: ["Layered", "many instruments at once"], low: ["Sparse", "few elements, lots of air"] },
};

export function traits(lib: Library, count = 3): Trait[] {
  const found: Trait[] = [];
  for (const [key, words] of Object.entries(WORDS)) {
    const v = lib.descriptors[key]?.median;
    if (v === undefined) continue;
    const strength = Math.abs(v - 0.5);
    if (strength < 0.05) continue;
    const [word, note] = v > 0.5 ? words.high : words.low;
    found.push({ key, word, note, strength });
  }
  const lufs = lib.measures.integrated_lufs?.median;
  if (lufs !== undefined && lufs >= -10)
    found.push({
      key: "loudness",
      word: "Loud",
      note: `mastered loud (${lufs.toFixed(1)} LUFS), like most modern pop`,
      strength: (lufs + 10) / 10 + 0.06,
    });
  if (lufs !== undefined && lufs <= -16)
    found.push({
      key: "loudness",
      word: "Quiet",
      note: `mastered quietly (${lufs.toFixed(1)} LUFS), with room to breathe`,
      strength: (-16 - lufs) / 10 + 0.06,
    });
  found.sort((a, b) => b.strength - a.strength);
  const out = found.slice(0, count);
  if (out.length < count)
    out.push({
      key: "balanced",
      word: "Balanced",
      note: "close to typical music everywhere else",
      strength: 0,
    });
  return out.slice(0, count);
}
