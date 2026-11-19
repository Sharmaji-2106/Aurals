import {
  means,
  nextTrial,
  probitUpdate,
  start,
  zeros,
  type Offsets,
  type Picked,
  type Trial,
} from "@/components/tuning/adaptive";
import { describe, expect, it } from "vitest";

/**
 * The browser picks the next pair live; the backend recomputes everything from the
 * raw choices. These sequences were produced by `auralis.tuning.policy` for the same
 * answers — the two must never drift apart.
 */
const PICKS: Picked[] = ["plus", "minus", "plus", "same", "minus", "plus", "plus", "minus"];
const V_SHAPED: Offsets = { sub_bass: 5, mid_bass: 3.5, warmth: -1, vocal_presence: -3, treble: 3, air: 2.5 };

const FROM_PYTHON = {
  v_shaped: {
    trials: [
      ["vocal_presence", -0.6, 2.0, null],
      ["warmth", -0.2, 2.0, null],
      ["treble", 1.2, 3.0, null],
      ["air", 1.0, 3.0, null],
      ["sub_bass", 2.5, 3.5, null],
      ["warmth", -0.2, 2.0, 1],
      ["mid_bass", 1.8, 3.5, null],
      ["vocal_presence", 0.3, 1.5, null],
    ],
    final: {
      sub_bass: 0.866,
      mid_bass: 3.414,
      warmth: -0.16,
      vocal_presence: -0.235,
      treble: 2.66,
      air: 1.014,
    },
  },
  none: {
    trials: [
      ["sub_bass", 0.0, 4.0, null],
      ["treble", 0.0, 4.0, null],
      ["vocal_presence", 0.0, 2.5, null],
      ["warmth", 0.0, 2.5, null],
      ["air", 0.0, 4.0, null],
      ["treble", 0.0, 4.0, 1],
      ["mid_bass", 0.0, 4.0, null],
      ["warmth", 0.0, 2.0, null],
    ],
    final: {
      sub_bass: 2.361,
      mid_bass: 2.361,
      warmth: -0.711,
      vocal_presence: 1.056,
      treble: 0.541,
      air: -1.956,
    },
  },
};

function play(shape: Offsets | null) {
  const beliefs = start(shape);
  const history: Trial[] = [];
  let trial: Trial | null;
  while ((trial = nextTrial(beliefs, history))) {
    const t = trial;
    beliefs[t.dimension] = probitUpdate(beliefs[t.dimension], t.center_db, t.delta_db, PICKS[history.length]);
    history.push(t);
  }
  return { history, final: means(beliefs) };
}

describe("the tuning duel in the browser matches the backend policy", () => {
  it.each([
    ["v_shaped", V_SHAPED],
    ["none", null],
  ] as const)("plays the same pairs and lands in the same place (%s)", (name, shape) => {
    const expected = FROM_PYTHON[name];
    const { history, final } = play(shape);
    expect(history.map((t) => [t.dimension, t.center_db, t.delta_db, t.repeat_of])).toEqual(expected.trials);
    for (const [d, v] of Object.entries(expected.final)) expect(final[d as keyof Offsets]).toBeCloseTo(v, 2);
  });

  it("starts from the population when no shape is picked", () => {
    expect(means(start(null))).toEqual(zeros());
  });
});
