/**
 * The Final Draw — the boundary between the shell and the scene.
 *
 * Two stacks of discovery cards converge, riffle into one, and the top card
 * rises and turns over to show the listener's strongest match.
 *
 * Everything here is a pure function of one number: `time`, in seconds from the
 * start. Nothing keeps its own clock, no card remembers where it has travelled,
 * and no movement is triggered by an event. Pause is "stop advancing time",
 * replay is "set it to zero", skip is "set it to a mark", scrubbing works
 * because the frame at t is the same frame every time you visit t, and a speed
 * change cannot desynchronise anything because there is only one clock to
 * scale.
 *
 * That discipline is inherited from the earlier cascade work, where it was what
 * made pause, replay, skip, scrub and speed free rather than five separate
 * features that each had to be debugged.
 */

/* ----------------------------------------------------------------- stages --- */

/**
 * The stages, in order. Named as the brief names them, because these strings
 * are what the studio's stage navigator shows and what the capture harness
 * files its frames under.
 */
export type Stage =
  "idle" | "entering" | "converging" | "interleaving" | "settling" | "drawing" | "flipping" | "revealed";

export const STAGES: readonly Stage[] = [
  "idle",
  "entering",
  "converging",
  "interleaving",
  "settling",
  "drawing",
  "flipping",
  "revealed",
];

/** What each stage is called in the interface. */
export const STAGE_LABEL: Record<Stage, string> = {
  idle: "Empty stage",
  entering: "Deck entrance",
  converging: "Convergence",
  interleaving: "Interleaving",
  settling: "Unified stack",
  drawing: "Final draw",
  flipping: "Flip",
  revealed: "Reveal",
};

/**
 * When each stage begins, in seconds.
 *
 * These are not arbitrary. The riffle's length is set by how long twenty-two
 * cards take to cross at a pace a viewer can follow — measured by watching it,
 * not guessed — and every mark after it is pushed by that. `choreography.test`
 * fails if a stage boundary stops agreeing with the motion it is supposed to
 * describe, which is the only thing keeping this list honest.
 */
export const STAGE_START: Record<Stage, number> = {
  idle: 0,
  entering: 0.35,
  converging: 2.1,
  interleaving: 3.4,
  settling: 7.0,
  drawing: 7.9,
  flipping: 9.1,
  revealed: 10.4,
};

/** Total length, after which it holds on the revealed card. */
export const SEQUENCE_SECONDS = 14;

/** Skip always lands on a complete, settled, readable reveal. */
export const SKIP_TO = 11.6;

/** The speeds the studio offers, as the brief specifies them. */
export const SPEEDS = [0.75, 1, 1.25] as const;
export type Speed = (typeof SPEEDS)[number];

/** Which stage `time` falls in. Derived, never stored. */
export function stageAt(time: number): Stage {
  let current: Stage = "idle";
  for (const stage of STAGES) {
    if (time >= STAGE_START[stage]) current = stage;
    else break;
  }
  return current;
}

/** How far through the whole sequence, 0 to 1. */
export function progressAt(time: number): number {
  return Math.min(1, Math.max(0, time / SEQUENCE_SECONDS));
}

/* ------------------------------------------------------------------ deck --- */

/** Cards per deck. Ten each reads as a substantial stack without crowding. */
export const PER_DECK = 10;

/** Both decks together — the unified stack's height. */
export const CARD_COUNT = PER_DECK * 2;

/** Which deck a card came from. */
export type Side = "left" | "right";

/**
 * A card's identity. Fixed for the life of the sequence; only its pose moves.
 *
 * `slot` is its index in the finished unified stack, counting from the bottom.
 * Interleaving means left card i lands at 2i and right card i at 2i+1, which is
 * what a riffle actually produces and what makes the merge legible: the stack
 * alternates, so you can see that two things became one thing.
 */
export type CardId = {
  /** Stable key. */
  readonly key: string;
  readonly side: Side;
  /** Index within its own deck, from the bottom. */
  readonly index: number;
  /** Index in the finished unified stack, from the bottom. */
  readonly slot: number;
  /** The last card to land is the one that turns over. */
  readonly isHero: boolean;
};

/** The cast, built once. */
export const CARDS: readonly CardId[] = Array.from({ length: CARD_COUNT }, (_, slot) => {
  const side: Side = slot % 2 === 0 ? "left" : "right";
  const index = Math.floor(slot / 2);
  return {
    key: `${side}-${index}`,
    side,
    index,
    slot,
    isHero: slot === CARD_COUNT - 1,
  };
});

/** The card that turns over. The top of the finished stack. */
export const HERO = CARDS[CARD_COUNT - 1];

/* ------------------------------------------------------------ dimensions --- */

/**
 * The card, in pixels at the reference viewport.
 *
 * 190 x 125 mm is the physical reference from the art direction; 1.52:1 is that
 * ratio, kept exactly. The thickness is the part that matters most and is
 * easiest to get wrong: 2.8 mm on a 190 mm card is 1.47% of the width, which at
 * 384 px is 5.6 px. A card reads as premium because it is slender — the previous
 * concept failed partly because its objects were too thick — so this number is
 * deliberately small, and the edge is built from stacked laminae rather than
 * being faked with a shadow, so it is a real extrusion that catches light.
 */
export const CARD = {
  width: 340,
  height: 224,
  thickness: 5.6,
  radius: 19,
} as const;

/**
 * Air between cards in a stack.
 *
 * Physically there is none — cards in a stack touch. This is a visual device:
 * without it twenty laminated bodies merge into one extruded brick and the
 * stack stops reading as a count of things. It is kept small because it is a
 * lie that accumulates: every tenth of a pixel here is two more pixels of stack
 * height, and the stack was visibly too tall at 1.15.
 */
export const STACK_GAP = 0.8;

/** The tilt of the table. Undone exactly when the hero card turns to face you. */
export const STAGE_TILT = { x: 56, z: 11 } as const;

export type WinningIem = {
  readonly brand: string;
  readonly model: string;
  /** Predicted preference with its 10-90 interval, from the engine. */
  readonly score: { mean: number; low: number; high: number } | null;
  /** One computed reason, in the engine's own words. */
  readonly reason: string | null;
  /** Where these values came from. Always shown; never invented. */
  readonly provenance: string;
};
