/**
 * The book, and the one timeline everything in the reveal reads from.
 *
 * Every length here is in metres and physical: a 24 × 30 cm art book, boards of
 * 3.6 mm grey board under leather, a 24 mm text block. The material maps in
 * `public/book/tex` are generated at 0.1475 mm per pixel from these same
 * numbers (`design/book/make_textures.py`), so a change here that is not made
 * there will stretch the leather.
 *
 * Every time is in seconds from the first frame. Nothing in the reveal starts
 * a timer of its own: the cover, each leaf, the lights, the camera and the
 * handoff are all functions of one clock, which is why the sequence can be
 * paused, scrubbed, replayed and skipped without any of it falling out of step.
 */

export const BOOK = {
  /** One page, spine to fore-edge. */
  pageW: 0.24,
  /** One page, head to tail. */
  pageH: 0.3,
  /** How far the boards overhang the pages. */
  square: 0.003,
  /** The board starts this far from the text block's spine: the hinge. */
  joint: 0.009,
  /** Board thickness. */
  board: 0.0036,
  /** Text block thickness: about a hundred and twenty leaves of heavy art paper. */
  block: 0.024,
  /** One leaf of 150 gsm art paper, with a little air. */
  leaf: 0.0002,
  /** How far the rounded spine stands proud of the text block. */
  bulge: 0.007,
  /** The spine's leather, over its board. */
  shell: 0.0016,
} as const;

export const BOARD_W = BOOK.pageW + BOOK.square - BOOK.joint;

/**
 * The spine texture's layout, as `design/book/make_textures.py` paints it: the
 * closed spine's leather is this long from hinge to hinge, and the rounding's
 * apex — where the lettering is centred — falls this far along it. Measured
 * from `binding.ts`'s curve; a unit test keeps the two in step.
 */
export const SPINE_TEXTURE = { arc: 0.052, apex: 0.5273 } as const;
export const BOARD_H = BOOK.pageH + 2 * BOOK.square;

/** Leaves that turn on camera. The rest of the block never moves. */
export const LEAVES = 10;

/** The top of the text block: where the selected page lies. */
export const BLOCK_TOP = BOOK.board + BOOK.block;

/** Leaf i (0 turns first) rests on the right at this height. */
export function restRightY(i: number) {
  return BLOCK_TOP + (LEAVES - i) * BOOK.leaf;
}

/** Leaf i comes to rest on the left, on the open board, at this height. */
export function restLeftY(i: number) {
  return BOOK.board + (i + 1) * BOOK.leaf + 0.00005;
}

/** The underside of the closed front board, clear of every leaf. */
export const FRONT_BOARD_BOTTOM = restRightY(0) + BOOK.leaf + 0.0001;
export const BOOK_TOP = FRONT_BOARD_BOTTOM + BOOK.board;

/* --------------------------------------------------------------- timeline --- */

export const STAGES = ["reveal", "open", "turn", "spread", "macro", "theme", "card", "sound"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_START: Record<Stage, number> = {
  reveal: 0,
  open: 1.8,
  turn: 3.4,
  spread: 6.45,
  macro: 8.75,
  theme: 9.95,
  card: 10.85,
  sound: 12.55,
};

export const STAGE_LABEL: Record<Stage, string> = {
  reveal: "The closed book",
  open: "The cover opens",
  turn: "Pages turn",
  spread: "The selection",
  macro: "Into the product",
  theme: "Into the app",
  card: "The product card",
  sound: "The Sound Card",
};

/** The emotional arc the brief asks for, one word per act. */
export const ARC: Record<Stage, string> = {
  reveal: "Anticipation",
  open: "Opening",
  turn: "Discovery",
  spread: "Discovery",
  macro: "Reveal",
  theme: "Reveal",
  card: "Recommendation",
  sound: "Keepsake",
};

/**
 * The Sound Card's reveal, after the page has risen to it: as long as the
 * sample listener's card takes (its pace comes from their music; a unit test
 * keeps this in step with `components/card/reveal.ts`).
 */
export const CARD_SECONDS = 2.6;

export const SEQUENCE_SECONDS = 13.95 + CARD_SECONDS;
/** Skip lands on the finished page, not on a frame of the film. */
export const SKIP_TO = SEQUENCE_SECONDS;

/** The field of view the last 3D frame is composed at (the handoff's maths uses it). */
export const FINAL_FOV = 26;

export const T = {
  /** The terrace comes up out of dusk; then the sun finds the book. */
  room: [0.0, 1.5],
  lightsUp: [0.3, 1.8],
  /** The lens racks from the horizon to the book. */
  focus: [0.15, 1.7],
  /** A soft highlight crosses the foil. */
  sweep: [0.95, 2.4],
  /** The front board, from lift to rest. */
  cover: [1.8, 3.4],
  /** Lighting evens out so the page reads as the page the DOM will be. */
  flatten: [7.25, 8.2],
  /** The DOM fades in over a still frame of the spread. */
  handoff: [8.25, 8.6],
  /** The camera pushes into the photograph until the earphones fill the frame. */
  push: [8.75, 10.05],
  /** A controlled highlight travels across the faceplates. */
  sheen: [9.55, 10.25],
  /** The world changes colour: paper, sunset, dusk, the app's own night. */
  theme: [9.95, 10.95],
  /** The camera pulls back; the product becomes the product card on /match. */
  pull: [10.85, 12.2],
  /** The page rises from the product card to the Sound Card. */
  scroll: [12.55, 13.95],
  /** The Sound Card is engraved, lit, turned over and set down. */
  card: [13.95, 13.95 + CARD_SECONDS],
} as const;

/**
 * When each leaf turns. Deliberate at first, quickening into a riffle through
 * the middle of the book, and slow again for the last — which is the page
 * that matters.
 */
export const TURNS: readonly { start: number; duration: number }[] = [
  { start: 3.45, duration: 1.0 },
  { start: 4.05, duration: 0.9 },
  { start: 4.5, duration: 0.76 },
  { start: 4.86, duration: 0.64 },
  { start: 4.99, duration: 0.62 },
  { start: 5.12, duration: 0.62 },
  { start: 5.25, duration: 0.62 },
  { start: 5.38, duration: 0.63 },
  { start: 5.52, duration: 0.66 },
  { start: 5.66, duration: 1.04 },
];

export const SPEEDS = [0.25, 0.5, 1, 2] as const;
