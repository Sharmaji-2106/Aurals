/**
 * Plain-language portraits of a sound profile. Every phrase is chosen by thresholds on
 * the profile's own numbers, so the words can always be traced back to data.
 */

type Dim = { key: string; value: number; confidence: number };
type Descriptor = { key: string; value: { median: number } };

const byKey = <T extends { key: string }>(items: readonly T[]) => new Map(items.map((i) => [i.key, i]));

/** Two or three short sentences: the headline of someone's sound. */
export function portrait(dimensions: readonly Dim[]): string[] {
  const d = byKey(dimensions);
  const v = (k: string) => d.get(k)?.value ?? 0.5;
  const c = (k: string) => d.get(k)?.confidence ?? 0;
  const tonalConfidence = Math.max(c("sub_bass"), c("treble"), c("vocal_presence"));
  if (tonalConfidence < 0.3) return ["A sound still taking shape."];

  const parts: string[] = [];
  // Values are estimated population percentiles: 0.5 is the reference target.
  const bass = (v("sub_bass") + v("mid_bass")) / 2;
  if (bass >= 0.85) parts.push("Deep, physical bass.");
  else if (bass >= 0.66) parts.push("Generous bass.");
  else if (bass <= 0.15) parts.push("Light, tight bass.");
  else if (bass <= 0.34) parts.push("Restrained bass.");
  else parts.push("Balanced bass.");

  if (v("vocal_presence") >= 0.8) parts.push("Vocals up front.");
  else if (v("vocal_presence") <= 0.2) parts.push("Relaxed vocals.");
  else if (v("warmth") >= 0.78) parts.push("A warm, full middle.");
  else if (v("vocal_presence") >= 0.64) parts.push("Vocals a step forward.");
  else if (v("vocal_presence") <= 0.36) parts.push("Vocals a step back.");

  if (c("treble_tolerance") >= 0.3 && v("treble_tolerance") < 0.3) parts.push("Smooth, forgiving highs.");
  else if (v("treble") >= 0.78) parts.push("Crisp, sparkling highs.");
  else if (v("treble") <= 0.25) parts.push("Soft highs.");
  else parts.push("Clean, even highs.");

  return parts.slice(0, 3);
}

/** What the library itself sounds like, from its descriptors. */
export function musicCharacter(descriptors: readonly Descriptor[]): string {
  const d = byKey(descriptors);
  const v = (k: string) => d.get(k)?.value.median ?? 0.5;
  const traits: string[] = [];
  if (v("brightness") >= 0.58) traits.push("bright");
  else if (v("brightness") <= 0.42) traits.push("dark");
  if (v("warmth") >= 0.58) traits.push("warm");
  if (v("energy") >= 0.58) traits.push("energetic");
  else if (v("energy") <= 0.42) traits.push("calm");
  if (v("dynamics") >= 0.6) traits.push("dynamic");
  if (!traits.length) return "Your library sits close to typical music.";
  const list = traits.length > 1 ? `${traits.slice(0, -1).join(", ")} and ${traits.at(-1)}` : traits[0];
  return `Your library leans ${list}.`;
}
