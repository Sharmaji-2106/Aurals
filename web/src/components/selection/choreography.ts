/**
 * Where every card is, at any instant.
 *
 * ## One movement, not four
 *
 * The rail travels once, from off the right edge to its resting place, over a
 * single eased span. The stage marks in `contract` describe what that movement
 * looks like at different moments — cards arriving, cards sweeping through,
 * the rail slowing — but they are not separate animations handing over to one
 * another. A sequence assembled from handovers is exactly where drift and
 * end-of-animation layout jumps come from, and the one unmissable requirement
 * here is that the winner comes to rest on an exact pixel.
 *
 * It does, because `REST_OFFSET` is defined as the value that puts it there and
 * the easing is defined to reach 1. There is no approximation to drift from.
 *
 * ## Depth is a function of position, not of index
 *
 * A card's scale, opacity, lift and turn are read from how far it is from the
 * centre of the frame — continuously. So a card grows as it sweeps through the
 * middle and recedes again as it passes, without anything having to decide
 * which card is "the third one on the left". It is also what stops the rail
 * reading as a row of progressively smaller rectangles.
 */

import {
  CARD,
  HERO_SCALE,
  RAIL_LENGTH,
  SPACING,
  STAGE_START,
  SEQUENCE_SECONDS,
  WINNER_INDEX,
} from "./contract";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function span(time: number, from: number, to: number): number {
  return to <= from ? (time >= to ? 1 : 0) : clamp01((time - from) / (to - from));
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The rail's own easing.
 *
 * A fifth-power ease-out: it leaves quickly, spends most of its time slowing,
 * and arrives without a stop. Lower powers finish too abruptly to read as
 * deliberate; a spring would overshoot, and an overshoot here would push the
 * winner off centre and back, which is the one thing it must not do.
 */
const railEase = (t: number) => 1 - (1 - t) ** 5;

/** Softer, for things that settle rather than travel. */
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/* ------------------------------------------------------------------ rail --- */

/** Where the rail starts: far enough right that nothing is on screen. */
const START_OFFSET = 1520;

/**
 * Where the rail stops.
 *
 * The winner's own slot, negated. By construction this puts card
 * `WINNER_INDEX` at x = 0 — the exact centre of the frame — with no rounding
 * and nothing left to drift.
 */
export const REST_OFFSET = -WINNER_INDEX * SPACING;

/** When the rail stops moving. */
const RAIL_END = STAGE_START.selection;

/** The rail's horizontal offset at `time`. */
export function railOffset(time: number): number {
  return mix(START_OFFSET, REST_OFFSET, railEase(span(time, 0, RAIL_END)));
}

/* ------------------------------------------------------------------ pose --- */

export type Pose = {
  /** Horizontal position of the card's centre, relative to the frame's. */
  x: number;
  /** Vertical lift. Negative is up. */
  y: number;
  /** Depth, in pixels toward the viewer. */
  z: number;
  scale: number;
  opacity: number;
  /** Degrees. Cards away from the centre turn gently away from the viewer. */
  turn: number;
  /** 0 to 1: how much this card is *the* card. Drives every hero treatment. */
  selected: number;
  /** Whether it is worth putting in the DOM at all. */
  visible: boolean;
};

/** How far from centre a card is, in card slots. */
const slots = (x: number) => Math.abs(x) / SPACING;

/**
 * The pose of one card at one instant.
 *
 * `index` is its place on the rail, not its rank.
 */
export function poseAt(time: number, index: number): Pose {
  const x = index * SPACING + railOffset(time);
  const d = slots(x);

  // Scale and opacity fall away from the centre on a curve rather than in
  // steps, so a card passing through the middle swells and subsides.
  //
  // The exponent is the difference between a rail and a row of ghosts. Too
  // steep and the neighbours wash out to grey smudges that say nothing about
  // the collection; this one holds them at roughly 0.78, 0.54 and 0.28 one,
  // two and three slots out — present, clearly subordinate, still legible as
  // real products.
  const nearness = clamp01(1 - d / 3.8);
  const falloff = nearness ** 0.85;
  const baseScale = mix(0.68, 1.0, falloff);
  const baseOpacity = clamp01(falloff);

  // The rail is suggested, never drawn: cards turn slightly away from the
  // viewer as they leave the centre, which reads as a line receding into the
  // room rather than as a row of shrinking rectangles.
  const turn = Math.max(-1, Math.min(1, x / (SPACING * 2.6))) * -15;
  const z = mix(-190, 0, falloff);
  // A shallow arc: the centre of the rail sits a little higher than its ends.
  const y = mix(16, 0, nearness ** 1.6);

  // The card that wins is only special once the rail has stopped. Before that
  // it is one of the candidates, which is what makes the stop meaningful.
  const isWinner = index === WINNER_INDEX;
  const settling = outCubic(span(time, STAGE_START.selection, STAGE_START.reveal + 0.35));
  const selected = isWinner ? settling : 0;

  // As it is chosen, its neighbours draw back — a little further out, a little
  // dimmer — so the centre opens up around it.
  const recede = isWinner ? 0 : inOutCubic(span(time, STAGE_START.selection, STAGE_START.reveal));
  const push = Math.sign(x || 1) * 64 * recede;

  return {
    x: x + push,
    y: y - 12 * selected,
    z: z + 70 * selected,
    scale: baseScale * mix(1, HERO_SCALE / Math.max(baseScale, 0.001), selected),
    opacity: clamp01(baseOpacity * mix(1, 0.62, recede)),
    turn: turn * (1 - selected),
    selected,
    // Cards more than four slots out contribute nothing but cost.
    visible: d < 4.4,
  };
}

/** The transform for a pose. */
export function transformFor(pose: Pose): string {
  return [
    `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, ${pose.z.toFixed(2)}px)`,
    `rotateY(${pose.turn.toFixed(3)}deg)`,
    // The chosen card grows back against the stage's own scale as it is
    // selected.
    //
    // A narrow screen gets a smaller rail, which is right for the sequence and
    // wrong for the result: shrink the winning card and its type shrinks with
    // it until the thing the whole sequence was building towards cannot be
    // read. The boost is a CSS custom property so a resize or a rotation costs
    // nothing — no measurement, no re-render, and no second source of truth
    // about how wide the viewport is.
    `scale(calc(${pose.scale.toFixed(4)} * (1 + (var(--rail-hero-boost, 1) - 1) * ${pose.selected.toFixed(4)})))`,
  ].join(" ");
}

/**
 * Painting order.
 *
 * The cards share a plane, so the browser will not sort them for us; whichever
 * is nearest the centre has to be painted last or a neighbour will overlap the
 * one the whole sequence is about.
 */
export function layerOf(pose: Pose): number {
  return 100 - Math.round(slots(pose.x) * 10);
}

/* ------------------------------------------------------------------ light --- */

/**
 * The warm pool behind the centre.
 *
 * It arrives with the selection and never before it: a studio light coming up
 * on the product is the moment the sequence exists for, and a light that was
 * always on says nothing.
 */
export function keyLight(time: number): number {
  return outCubic(span(time, STAGE_START.selection - 0.25, STAGE_START.reveal + 0.5));
}

/** How far through the reveal's copy: the label, then the name, then the rest. */
export function revealAt(time: number, order: number): number {
  const start = STAGE_START.reveal + order * 0.22;
  return outCubic(span(time, start, start + 0.7));
}

/** A gentle settle for the whole frame once everything has arrived. */
export function holdAt(time: number): number {
  return outCubic(span(time, STAGE_START.reveal, SEQUENCE_SECONDS));
}

/** Every card index on the rail. */
export const RAIL_INDICES: readonly number[] = Array.from({ length: RAIL_LENGTH }, (_, i) => i);

/** The resting footprint of the winning card, for measuring against. */
export const HERO_BOX = {
  width: CARD.width * HERO_SCALE,
  height: CARD.height * HERO_SCALE,
} as const;
