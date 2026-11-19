/**
 * The Selection Rail — the boundary between the shell and the sequence.
 *
 * A line of cards travels right to left through a dark studio, decelerating
 * until the engine's highest-ranked recommendation comes to rest exactly in the
 * centre of the frame.
 *
 * Everything is a pure function of one number: `time`, in seconds. Nothing
 * keeps its own state, no card remembers how far it has come, and no movement
 * is triggered by an event. That discipline is inherited from the earlier
 * sequences in this project, and it is what makes the one hard requirement here
 * cheap: the winner lands on an exact pixel because its resting position is
 * computed, not approximated, and the rail's offset at the final instant is
 * defined to be precisely the value that puts it there.
 */

/* ----------------------------------------------------------------- stages --- */

export type Stage = "arrival" | "travel" | "deceleration" | "selection" | "reveal";

export const STAGES: readonly Stage[] = ["arrival", "travel", "deceleration", "selection", "reveal"];

export const STAGE_LABEL: Record<Stage, string> = {
  arrival: "Arrival",
  travel: "The sequence",
  deceleration: "Deceleration",
  selection: "The selection",
  reveal: "Product reveal",
};

/**
 * When each stage begins, in seconds.
 *
 * The rail's travel is one continuous movement from `arrival` to the end of
 * `deceleration` — the stage marks describe what the viewer is seeing, not
 * separate animations that hand over to one another. A sequence assembled from
 * handovers is where drift and layout jumps come from.
 */
export const STAGE_START: Record<Stage, number> = {
  arrival: 0,
  travel: 1.5,
  deceleration: 4.3,
  selection: 6.5,
  reveal: 7.5,
};

/** Total length, after which it holds on the revealed card. */
export const SEQUENCE_SECONDS = 11.5;

/** Skip always lands on a settled, complete reveal. */
export const SKIP_TO = 8.8;

export const SPEEDS = [0.75, 1, 1.25] as const;

/* ------------------------------------------------------------------- rail --- */

/**
 * The card, in pixels at the reference viewport.
 *
 * 1.65:1 landscape, as the art direction calls for. The resting card is larger
 * than the ones around it, and the difference is carried by scale rather than
 * by a second set of dimensions, so there is only ever one box to measure.
 */
export const CARD = {
  width: 362,
  height: 219,
  radius: 17,
} as const;

/** Centre-to-centre distance along the rail. Generous: the rail is spacious. */
/**
 * Centre-to-centre distance along the rail.
 *
 * Chosen so that five cards are meaningfully in frame at 1280 px — the brief's
 * narrower check — rather than only at its 1440 px reference. At 452 the rail
 * looked spacious on paper and showed three cards on a laptop.
 */
export const SPACING = 404;

/** How far the winner's resting scale exceeds its neighbours'. */
export const HERO_SCALE = 1.12;

/**
 * Where the winner sits in the order the cards arrive.
 *
 * Not last. If the highest-ranked card were the final one on the rail there
 * would be nothing to its right when the rail stopped, and the composition
 * would be lopsided — a row that runs off one edge and stops dead at the other.
 * Two further candidates travel behind it so the centre has company on both
 * sides.
 */
export const WINNER_INDEX = 6;

/** How many cards ride the rail. Five or so are meaningfully visible at once. */
export const RAIL_LENGTH = 9;

/* ------------------------------------------------------------------ types --- */

export type RailProduct = {
  readonly slug: string;
  readonly rank: number;
  readonly brand: string;
  readonly model: string;
  readonly match: string;
  readonly mean: number;
  readonly low: number;
  readonly high: number;
  readonly strength: string | null;
  readonly tradeoff: string | null;
  readonly measuredBy: string | null;
  readonly rig: string | null;
};

/** Which stage `time` falls in. Derived, never stored. */
export function stageAt(time: number): Stage {
  let current: Stage = "arrival";
  for (const stage of STAGES) {
    if (time >= STAGE_START[stage]) current = stage;
    else break;
  }
  return current;
}
