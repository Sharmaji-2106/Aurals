import type { UseCaseKey } from "@/lib/use-cases";

/**
 * Which driver technology tends to suit what a listener plays — a RULE OF THUMB.
 *
 * Driver type does not determine how an earphone sounds: its measured frequency
 * response does, and that alone ranks every recommendation. What the type does
 * shape, by long reviewer consensus rather than controlled study, is how a few
 * things are commonly described:
 *
 * - **dynamic** — one moving diaphragm: bass with physical slam and natural decay,
 *   coherent timbre (no crossover between drivers);
 * - **balanced armature** — tiny, efficient, often several per side: precise mids
 *   and detail, compact shells; the traditional stage monitor;
 * - **planar** — a thin, evenly driven film: fast, unsmeared transients and even,
 *   resolving treble;
 * - **hybrid** — a dynamic for bass with armatures (or planars, ESTs) above it:
 *   bass weight and detail at once, at the cost of a crossover.
 *
 * Each card and each leaning of the listener's sound adds points to the types
 * reviewers associate with it; the most points wins. Every interface that shows
 * the result labels it as a rule of thumb, and names the reasons it used.
 */

export type DriverCategory = "dynamic" | "balanced_armature" | "planar" | "hybrid";

export const DRIVER_NAME: Record<DriverCategory, string> = {
  dynamic: "Dynamic",
  balanced_armature: "Balanced armature",
  planar: "Planar magnetic",
  hybrid: "Hybrid",
};

export const DRIVER_BLURB: Record<DriverCategory, string> = {
  dynamic: "one moving diaphragm — bass with weight and natural decay, one coherent voice",
  balanced_armature: "small, precise drivers — controlled mids and detail in a compact shell",
  planar: "a thin film driven evenly — fast attack and even, resolving treble",
  hybrid: "a dynamic for the bass, other drivers above — weight and detail together",
};

type Points = Partial<Record<DriverCategory, number>>;

/** What reviewers tend to associate with each card. */
const BY_USE: Record<UseCaseKey, { points: Points; because: string }> = {
  pop: { points: { hybrid: 2, dynamic: 1 }, because: "pop rewards clean vocals over a punchy low end" },
  hip_hop: { points: { dynamic: 3, hybrid: 1 }, because: "hip-hop lives on sub-bass slam" },
  rock_metal: {
    points: { planar: 2, hybrid: 1, dynamic: 1 },
    because: "dense guitars and fast drums favour quick, unsmeared attack",
  },
  electronic: { points: { dynamic: 2, planar: 2 }, because: "electronic music wants deep bass and speed" },
  bollywood: {
    points: { hybrid: 2, dynamic: 1 },
    because: "film music puts voices up front over rich percussion",
  },
  classical: {
    points: { dynamic: 2, planar: 1, hybrid: 1 },
    because: "orchestral music is judged on natural instrument tone",
  },
  jazz_acoustic: { points: { dynamic: 2, hybrid: 1 }, because: "acoustic music is all timbre and texture" },
  cinematic_gaming: { points: { dynamic: 2, hybrid: 1 }, because: "cinematic games want impact and scale" },
  competitive_gaming: {
    points: { hybrid: 1, planar: 1, balanced_armature: 1 },
    because: "competitive play wants separation and detail",
  },
  production: {
    points: { dynamic: 2, balanced_armature: 1 },
    because: "mixing favours one coherent driver with no crossover",
  },
  stage_monitoring: {
    points: { balanced_armature: 3 },
    because: "stage monitors are traditionally multi-armature: compact and efficient",
  },
  everyday: { points: { dynamic: 2 }, because: "everyday listening favours an easy, coherent sound" },
  podcasts: { points: { dynamic: 1, balanced_armature: 1 }, because: "voices need clear, natural mids" },
};

type Dim = { key: string; value: number; confidence: number };

export type DriverFit = {
  category: DriverCategory;
  /** The reasons that carried it, most important first. */
  because: string[];
  /** The close second, when there is one. */
  alternative: DriverCategory | null;
};

const ORDER: DriverCategory[] = ["dynamic", "hybrid", "planar", "balanced_armature"];

export function driverFit(
  useCases: readonly UseCaseKey[],
  primary: UseCaseKey | null,
  dimensions?: readonly Dim[],
): DriverFit | null {
  const score: Record<DriverCategory, number> = { dynamic: 0, balanced_armature: 0, planar: 0, hybrid: 0 };
  const reasons: { weight: number; text: string; to: DriverCategory[] }[] = [];
  const add = (points: Points, text: string, weight = 1) => {
    const to = Object.keys(points) as DriverCategory[];
    for (const k of to) score[k] += (points[k] ?? 0) * weight;
    reasons.push({ weight: Math.max(...Object.values(points)) * weight, text, to });
  };

  for (const key of useCases) {
    const use = BY_USE[key];
    if (use) add(use.points, use.because, key === primary && useCases.length > 1 ? 2 : 1);
  }

  // The listener's own sound: only leanings measured with some confidence.
  const dim = new Map((dimensions ?? []).map((d) => [d.key, d]));
  const lean = (k: string) => {
    const d = dim.get(k);
    return d && d.confidence >= 0.3 ? d.value : null;
  };
  const bass = [lean("sub_bass"), lean("mid_bass")].filter((v): v is number => v !== null);
  const bassy = bass.length ? bass.reduce((a, b) => a + b, 0) / bass.length : null;
  if (bassy !== null && bassy >= 0.7) add({ dynamic: 2, hybrid: 1 }, "your sound leans on deep bass");
  const detail = Math.max(lean("detail") ?? 0, lean("treble") ?? 0);
  if (detail >= 0.7) add({ planar: 1, hybrid: 1 }, "you like detail and sparkle up top");
  const natural = lean("naturalness");
  if (natural !== null && natural >= 0.65) add({ dynamic: 1 }, "you value a natural, unforced tone");
  const vocals = lean("vocal_presence");
  if (vocals !== null && vocals >= 0.72) add({ hybrid: 1, balanced_armature: 1 }, "you like vocals up front");

  if (!reasons.length) return null;
  const ranked = [...ORDER].sort((a, b) => score[b] - score[a] || ORDER.indexOf(a) - ORDER.indexOf(b));
  const [best, second] = ranked;
  if (score[best] <= 0) return null;
  const because = reasons
    .filter((r) => r.to.includes(best))
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.text);
  return {
    category: best,
    because: [...new Set(because)].slice(0, 3),
    alternative: score[second] >= score[best] - 1 && score[second] > 0 ? second : null,
  };
}
