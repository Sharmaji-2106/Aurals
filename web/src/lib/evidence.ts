/**
 * Evidence in words. The model reports what each value rests on (how strong the music
 * evidence is, whether the listener answered, whether the two agree); these helpers
 * turn that into language and a coarse 0–3 level. Never into a percentage: the
 * underlying certainty is a heuristic and is not presented as a measured probability.
 */
import type { CurvePoint, Dimension } from "@/lib/api/client";

export type Basis = CurvePoint["basis"];
export type Level = 0 | 1 | 2 | 3;

const MUSIC_LEVEL: Record<Basis["music"], Level> = { strong: 3, moderate: 2, limited: 1, none: 0 };

/** 3 strong · 2 solid · 1 emerging · 0 none. */
export function evidenceLevel(basis: Basis): Level {
  const music = MUSIC_LEVEL[basis.music];
  if (music === 0) return basis.answers === "none" ? 0 : 1;
  if (basis.agreement === "agree") return Math.min(3, music + 1) as Level;
  if (basis.agreement === "differ") return Math.max(1, music - 1) as Level;
  return music;
}

/** A short label for what a value rests on. */
export function evidenceLabel(basis: Basis): string {
  const music = basis.music;
  const answered = basis.answers !== "none";
  const solidMusic = music === "strong" || music === "moderate";
  if (solidMusic && basis.agreement === "differ") return "Your music and answers disagree";
  if (solidMusic && basis.agreement === "agree") return "Music evidence, confirmed by you";
  if (solidMusic && answered) return "Music evidence, refined by you";
  if (music === "strong") return "Strong music evidence";
  if (music === "moderate") return "Music evidence";
  if (music === "limited") return answered ? "Limited music evidence, plus your answers" : "Limited evidence";
  if (basis.answers === "direct") return "From your answers";
  if (basis.answers === "indirect") return "Emerging, inferred from your answers";
  return "Not enough evidence yet";
}

/** One sentence on how the answers relate to the music for a band or dimension. */
export function relation(basis: Basis): string | null {
  const solidMusic = basis.music === "strong" || basis.music === "moderate";
  if (!solidMusic || basis.answers === "none") return null;
  if (basis.agreement === "agree") return "Your answers confirm what your music shows.";
  if (basis.agreement === "differ")
    return basis.music === "strong"
      ? "Your answers point the other way; your music holds most of it."
      : "Your answers point the other way, so this stays uncertain.";
  return "Your answers refine what your music shows.";
}

/** Dots for a level, as used next to evidence labels. */
export function levelDots(level: Level) {
  return [1, 2, 3].map((i) => i <= level);
}

type TraitDim = Pick<Dimension, "key" | "value" | "confidence" | "group" | "basis">;

// [slightly low, low, slightly high, high]
const TRAIT_WORDS: Partial<Record<Dimension["key"], [string, string, string, string]>> = {
  sub_bass: ["A little less sub-bass", "Restrained sub-bass", "A little extra sub-bass", "Deep sub-bass"],
  mid_bass: ["Slightly lean mid-bass", "Lean mid-bass", "Slightly punchy mid-bass", "Punchy mid-bass"],
  warmth: [
    "A cleaner lower midrange",
    "Clean, lean lower mids",
    "A little extra warmth",
    "Warm, full lower mids",
  ],
  vocal_presence: ["Vocals a step back", "Laid-back vocals", "Vocals a step forward", "Forward vocals"],
  treble: ["Slightly smooth treble", "Smooth treble", "Slightly crisp treble", "Crisp treble"],
  air: ["A softer top end", "Soft top end", "A little extra air", "Airy top end"],
  energy: [
    "A calmer presentation",
    "Relaxed presentation",
    "A livelier presentation",
    "Energetic presentation",
  ],
};

const PRIORITY_WORDS: Partial<Record<Dimension["key"], string>> = {
  detail: "Detail matters to you",
  soundstage: "Space matters to you",
  naturalness: "Realism matters to you",
};

export type Trait = { key: string; title: string; basis: Basis };

/** The few characteristics that most define a profile, strongest first. */
export function keyTraits(dimensions: readonly TraitDim[], limit = 4): Trait[] {
  const traits: (Trait & { rank: number })[] = [];
  for (const d of dimensions) {
    const words = TRAIT_WORDS[d.key];
    const lean = d.value - 0.5;
    // Percentile scale: 0.12 is about a third of the population spread, 0.23 about two thirds.
    if (!words || d.confidence < 0.3 || Math.abs(lean) < 0.12) continue;
    traits.push({
      key: d.key,
      title: words[(lean > 0 ? 2 : 0) + (Math.abs(lean) < 0.23 ? 0 : 1)],
      basis: d.basis,
      rank: Math.abs(lean) * d.confidence,
    });
  }
  traits.sort((a, b) => b.rank - a.rank);

  const extra: Trait[] = [];
  const tolerance = dimensions.find((d) => d.key === "treble_tolerance");
  if (tolerance && tolerance.confidence >= 0.3) {
    if (tolerance.value < 0.35)
      extra.push({ key: tolerance.key, title: "Sensitive to bright highs", basis: tolerance.basis });
    else if (tolerance.value > 0.72)
      extra.push({ key: tolerance.key, title: "Comfortable with bright highs", basis: tolerance.basis });
  }
  const priority = dimensions
    .filter((d) => d.group === "priority" && d.confidence >= 0.3 && d.value >= 0.7)
    .sort((a, b) => b.value - a.value)[0];
  if (priority && PRIORITY_WORDS[priority.key])
    extra.push({ key: priority.key, title: PRIORITY_WORDS[priority.key]!, basis: priority.basis });

  return [...traits.slice(0, Math.max(2, limit - extra.length)), ...extra].slice(0, limit);
}

type Point = Pick<CurvePoint, "band" | "offset_db" | "basis">;

const GROUPS = [
  { key: "bass", label: "Bass", bands: ["sub_bass", "mid_bass"] },
  { key: "body", label: "Body", bands: ["lower_mids"] },
  { key: "vocals", label: "Vocals", bands: ["upper_mids", "presence"] },
  { key: "treble", label: "Treble", bands: ["lower_treble", "upper_treble"] },
  { key: "air", label: "Air", bands: ["air"] },
] as const;

export type Refinement = {
  key: string;
  label: string;
  music: number;
  said: number;
  final: number;
  agreement: Basis["agreement"];
  verdict: string;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/**
 * Region by region: what the music suggested, what the listener said, where it landed.
 * Only meaningful when both sources exist.
 */
export function refinements(
  combined: readonly Point[],
  music: readonly Point[] | null | undefined,
  answers: readonly Point[] | null | undefined,
): Refinement[] {
  if (!music || !answers) return [];
  const at = (curve: readonly Point[], bands: readonly string[]) =>
    mean(bands.map((b) => curve.find((c) => c.band === b)?.offset_db ?? 0));
  return GROUPS.map((g) => {
    const bases = g.bands.map((b) => combined.find((c) => c.band === b)?.basis).filter(Boolean) as Basis[];
    const agreement: Basis["agreement"] = bases.some((b) => b.agreement === "differ")
      ? "differ"
      : bases.some((b) => b.agreement === "refine")
        ? "refine"
        : bases.some((b) => b.agreement === "agree")
          ? "agree"
          : null;
    const r = {
      key: g.key,
      label: g.label,
      music: at(music, g.bands),
      said: at(answers, g.bands),
      final: at(combined, g.bands),
      agreement,
    };
    const moved = r.final - r.music;
    const strongMusic = bases.every((b) => b.music === "strong");
    let verdict = "From your music";
    if (agreement === "agree") verdict = "Confirmed";
    else if (agreement === "differ") verdict = strongMusic ? "You disagree · music holds" : "You disagree";
    else if (agreement === "refine")
      verdict = Math.abs(moved) >= 0.3 ? (moved > 0 ? "Refined up" : "Refined down") : "Held by your music";
    else if (bases.every((b) => b.music === "limited" || b.music === "none")) verdict = "Mostly your answers";
    return { ...r, verdict };
  });
}
