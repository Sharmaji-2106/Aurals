import type { Variant } from "@/components/tune/listening-example";

/**
 * Which questions get a listening example, and what the two treatments are.
 *
 * Only questions about tone get one: "how important is detail to you" is a question
 * about priorities, and an audio demo would not help answer it. Each pair is a real
 * filter chain applied to the same bed and level-matched, with the two sides placed
 * either side of neutral so neither is the default.
 *
 * These are illustrations. They do not set or weight an answer — the listener still
 * answers the question themselves, and only that answer reaches the model.
 */
export const QUESTION_EXAMPLES: Record<string, Variant[]> = {
  bass_amount: [
    { id: "light", label: "Lighter low end", filters: [{ type: "lowshelf", frequency: 110, gain: -5 }] },
    { id: "full", label: "Fuller low end", filters: [{ type: "lowshelf", frequency: 110, gain: 6 }] },
  ],
  bass_character: [
    {
      id: "rumble",
      label: "Deep rumble",
      filters: [{ type: "peaking", frequency: 45, gain: 7.5, q: 0.8 }],
    },
    {
      id: "punch",
      label: "Punch and thump",
      filters: [{ type: "peaking", frequency: 110, gain: 6.5, q: 1.3 }],
    },
  ],
  vocals: [
    {
      id: "blended",
      label: "Blended in",
      filters: [{ type: "peaking", frequency: 2400, gain: -4.5, q: 0.9 }],
    },
    {
      id: "forward",
      label: "Front and centre",
      filters: [{ type: "peaking", frequency: 2400, gain: 4.5, q: 0.9 }],
    },
  ],
  treble_feel: [
    { id: "smooth", label: "Smoother highs", filters: [{ type: "highshelf", frequency: 7000, gain: -5 }] },
    { id: "crisp", label: "Crisper highs", filters: [{ type: "highshelf", frequency: 7000, gain: 5 }] },
  ],
  tone: [
    {
      id: "warm",
      label: "Warm and smooth",
      filters: [
        { type: "lowshelf", frequency: 300, gain: 3.5 },
        { type: "highshelf", frequency: 5000, gain: -4 },
      ],
    },
    {
      id: "crisp",
      label: "Clean and crisp",
      filters: [
        { type: "lowshelf", frequency: 300, gain: -3.5 },
        { type: "highshelf", frequency: 5000, gain: 4 },
      ],
    },
  ],
};
