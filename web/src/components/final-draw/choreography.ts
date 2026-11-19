/**
 * Where every card is, at any instant.
 *
 * One function — `poseAt(time, card)` — and no state anywhere. The scene is a
 * projection of the clock, so seeking backwards reconstructs exactly the frame
 * you left, and nothing can be left half-played.
 *
 * ## The riffle
 *
 * A riffle is not a metronome. You hold two packets, bend them, and release;
 * the cards come away slowly at first and then faster and faster as the bend
 * straightens out. That accelerating ripple is most of what makes a riffle read
 * as a physical act rather than a loop of identical steps, so the release times
 * here are spaced by a power curve rather than evenly: the gap between the first
 * two cards is about 0.36 s and between the last two about 0.11 s.
 *
 * Cards land alternating — left, right, left, right — because that is what a
 * riffle produces, and because it is the only arrangement that lets a viewer
 * see that two stacks became one stack. Two packets merely stacked on top of
 * each other would be indistinguishable from one packet moved.
 *
 * ## Depletion
 *
 * Cards leave each deck from the bottom, so a waiting card sits lower every
 * time one below it goes. The decks visibly sink as they feed the merge, which
 * is both what actually happens and the clearest possible signal that the
 * middle stack is being built out of the two outer ones.
 */

import {
  CARD,
  CARD_COUNT,
  PER_DECK,
  STACK_GAP,
  STAGE_START,
  STAGE_TILT,
  type CardId,
  type Side,
} from "./contract";

/* ------------------------------------------------------------- easing --- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Progress through a window, clamped at both ends. */
function span(time: number, from: number, to: number): number {
  return to <= from ? (time >= to ? 1 : 0) : clamp01((time - from) / (to - from));
}

/** Decisive arrival, no bounce. Cards stop when they meet the stack. */
const outQuart = (t: number) => 1 - (1 - t) ** 4;
/** A little softer, for things that glide rather than land. */
const outCubic = (t: number) => 1 - (1 - t) ** 3;
/** Deliberate, weighted movement with no snap at either end. */
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Mass: slow to commit, then committed. For the turn. */
const inOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* -------------------------------------------------------------- layout --- */

/** One card's worth of height in a stack. */
export const LAYER = CARD.thickness + STACK_GAP;

/** Off-stage, where the decks come from. */
const DECK_X_OFFSTAGE = 1080;
/** Two clearly separate stacks. */
const DECK_X_SETTLED = 400;
/**
 * Converged — but still a clear gap between the inner edges.
 *
 * A real riffle brings the two packets corner to corner, and the first attempt
 * here did the same. On screen that failed: the growing middle stack is itself a
 * full card wide, so packets brought corner to corner overlap it on both sides
 * and the whole thing reads as one confused mass rather than as two things
 * becoming one.
 *
 * So this is a deliberate departure from the physical act. The packets hold
 * just over a card's width from the centre, which leaves the merge happening in
 * clear ground between three distinct masses. Legibility wins over fidelity
 * here: a viewer who cannot see the interleave has not been shown anything.
 */
const DECK_X_NEAR = 358;

/** The opposing angle that makes them read as two physical objects. */
const SPIN_SETTLED = 6.5;
const SPIN_NEAR = 2;

/** A slight opposing offset along the table, so the composition is not a line. */
const DECK_Y_SETTLED = 20;

const sign = (side: Side) => (side === "left" ? -1 : 1);

/* --------------------------------------------------------------- riffle --- */

/** How long the releases are spread over. The last card still needs to fly. */
const RIFFLE_SPAN = 3;
/** How long a card is in the air. */
const FLIGHT = 0.6;
/**
 * Below 1 the early gaps are wide and the late gaps narrow — the bend
 * straightening out. At 0.72 the ripple accelerates about threefold across the
 * stack, which is roughly what a hand riffle does.
 */
const RIFFLE_CURVE = 0.72;

/** When the card at `slot` is released into the merge. */
export function releaseAt(slot: number): number {
  const through = CARD_COUNT > 1 ? slot / (CARD_COUNT - 1) : 0;
  return STAGE_START.interleaving + RIFFLE_SPAN * through ** RIFFLE_CURVE;
}

/** When it has arrived. */
export function landedAt(slot: number): number {
  return releaseAt(slot) + FLIGHT;
}

/** How many cards of this deck have left by `time`. */
function departedFrom(side: Side, time: number): number {
  let gone = 0;
  for (let index = 0; index < PER_DECK; index += 1) {
    const slot = index * 2 + (side === "left" ? 0 : 1);
    if (releaseAt(slot) <= time) gone += 1;
  }
  return gone;
}

/* ----------------------------------------------------------------- draw --- */

/** How far the drawn card slides clear of the stack, along the table. */
const DRAW_SLIDE = 140;
/** And how far it rises above it. */
const DRAW_RISE = 110;

/**
 * Where the card hangs once it has turned, measured up the table normal.
 *
 * Clear of the finished stack — which is 19 layers, about 128 px — so the two
 * never intersect, but no higher than it needs to be: height along the normal
 * projects upward on screen, and the first cut of this sequence pushed the
 * revealed card clean off the top of the viewport.
 */
const HERO_REST_Z = 168;

/**
 * Where the turned card ends up, in screen space, once it is facing you.
 *
 * Applied after the upright rotation, so these are plain screen pixels: the
 * card is parallel to the viewport by then. Tuned by looking at captured
 * frames, which is the only way to tune a composition.
 */
const HERO_SCREEN = { x: 0, y: 112, z: 148 };

/* ----------------------------------------------------------------- pose --- */

export type Pose = {
  /** Position on the table, in pixels. */
  x: number;
  y: number;
  /** Height above the table. */
  z: number;
  /** Rotation within the table plane, in degrees. */
  spin: number;
  /** 0 lying on the table, 1 turned square to the camera. */
  upright: number;
  /** 0 showing its back, 180 showing its face. */
  flip: number;
  /** Screen-space offset applied after the turn. */
  screen: { x: number; y: number; z: number };
  /** Contact shadow strength, 1 on the table and 0 in the air. */
  shadow: number;
  /** Whether it is on stage at all. */
  visible: boolean;
};

/**
 * The pose of one card at one instant.
 *
 * Read top to bottom as the card's own life: it waits off stage, rides its deck
 * in, converges, is released into the merge, and — if it is the last one — rises
 * and turns over.
 */
export function poseAt(time: number, card: CardId): Pose {
  const side = card.side;
  const dir = sign(side);

  /* --- the deck's own journey, which a waiting card rides ---------------- */

  const converging = inOutCubic(span(time, STAGE_START.converging, STAGE_START.converging + 1.15));

  // Staggered slightly between the two decks so they do not arrive as a pair.
  const enterDelay = side === "right" ? 0.14 : 0;
  const enteringSelf = outQuart(
    span(time, STAGE_START.entering + enterDelay, STAGE_START.entering + enterDelay + 1.45),
  );

  const deckX = dir * mix(mix(DECK_X_OFFSTAGE, DECK_X_SETTLED, enteringSelf), DECK_X_NEAR, converging);
  const deckY = dir * mix(DECK_Y_SETTLED, 0, converging);
  const deckSpin = dir * mix(mix(SPIN_SETTLED * 1.6, SPIN_SETTLED, enteringSelf), SPIN_NEAR, converging);

  // The deck lifts a little as it closes in, so the merge happens just off the
  // table rather than scraping along it.
  const deckLift = mix(0, 14, converging);

  // Where this card sits in its own deck, accounting for everything below it
  // having already gone.
  const below = departedFrom(side, time);
  const standing = Math.max(0, card.index - below);
  const deckZ = deckLift + standing * LAYER;

  /* --- the flight into the merge ---------------------------------------- */

  const release = releaseAt(card.slot);
  const flight = span(time, release, release + FLIGHT);
  const flown = outQuart(flight);

  const restX = 0;
  const restY = 0;
  const restZ = card.slot * LAYER;
  const restSpin = 0;

  let x = mix(deckX, restX, flown);
  let y = mix(deckY, restY, flown);
  let spin = mix(deckSpin, restSpin, flown);

  // An arc, so the card travels over the growing stack instead of through it.
  // Highest at mid-flight and zero at both ends, so it never fights the
  // endpoints.
  const arc = Math.sin(Math.PI * flight) * 26;
  let z = mix(deckZ, restZ, outCubic(flight)) + arc;

  /* --- the draw and the turn, for the one card that gets them ----------- */

  let upright = 0;
  let flip = 0;
  let screen = { x: 0, y: 0, z: 0 };

  if (card.isHero) {
    const draw = inOutCubic(span(time, STAGE_START.drawing, STAGE_START.flipping));
    y += DRAW_SLIDE * draw;
    z += DRAW_RISE * draw;

    const turn = inOutQuart(span(time, STAGE_START.flipping, STAGE_START.revealed));
    upright = turn;
    flip = 180 * turn;
    screen = {
      x: HERO_SCREEN.x * turn,
      y: HERO_SCREEN.y * turn,
      z: HERO_SCREEN.z * turn,
    };

    // Once it is upright its position on the table no longer means anything to
    // the eye, so hand the composition over to the screen-space offset rather
    // than leaving two systems arguing about where the card is.
    const handover = outCubic(turn);
    x = mix(x, 0, handover);
    y = mix(y, 0, handover);
    z = mix(z, HERO_REST_Z, handover);
    spin = mix(spin, 0, handover);
  }

  /* --- presentation ------------------------------------------------------ */

  // Only what is actually near the table casts a contact shadow. A card
  // halfway up a stack is resting on another card, not on the floor, and
  // twenty overlapping shadow planes cost real frames to say nothing.
  const height = Math.max(0, z - LAYER * 1.5);
  const shadow = clamp01(1 - height / 46) * (1 - upright * 0.9);

  // Before the decks enter, nothing is on stage. A card is also invisible until
  // its own deck has started moving, which keeps the opening frame truly empty.
  const visible = time >= STAGE_START.entering;

  return { x, y, z, spin, upright, flip, screen, shadow, visible };
}

/* ------------------------------------------------------------ transforms --- */

/**
 * The CSS transform for a pose.
 *
 * Order matters and is not arbitrary. The stage tips the table with
 * `rotateX(tilt.x) rotateZ(-tilt.z)`, and the inverse of a composition is its
 * factors reversed and negated, so the undo is `rotateZ(tilt.z)
 * rotateX(-tilt.x)` — which is exactly what the card applies, scaled by how far
 * it has turned. At `upright = 1` the two cancel and the card is precisely
 * parallel to the viewport. That matters for
 * more than looks: the shared-element handoff into the results page measures
 * this card's bounding box, and a box is only a faithful measurement of a
 * rectangle that is square to the screen.
 *
 * Because the card is screen-parallel by then, the `translate3d` that follows
 * the upright rotation moves it in plain screen pixels, which is what makes the
 * final composition tunable by eye.
 */
export function transformFor(pose: Pose): string {
  return [
    `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, ${pose.z.toFixed(2)}px)`,
    `rotateZ(${pose.spin.toFixed(3)}deg)`,
    `rotateZ(${(STAGE_TILT.z * pose.upright).toFixed(3)}deg)`,
    `rotateX(${(-STAGE_TILT.x * pose.upright).toFixed(3)}deg)`,
    `translate3d(${pose.screen.x.toFixed(2)}px, ${pose.screen.y.toFixed(2)}px, ${pose.screen.z.toFixed(2)}px)`,
    // Undo the stage's scale, but only for the card that turns to face you.
    //
    // A narrow screen gets a smaller composition, which is right for the decks
    // and wrong for the reveal: shrinking the winning card shrinks its type
    // until the thing the whole sequence was building towards cannot be read.
    // So the hero scales back up as it turns, ending at its natural size on
    // every screen. It is expressed in CSS rather than computed here so that a
    // resize costs nothing — no measurement, no re-render, no second source of
    // truth about how wide the viewport is.
    `scale(calc(1 + (var(--fd-hero-zoom, 1) - 1) * ${pose.upright.toFixed(4)}))`,
    `rotateY(${pose.flip.toFixed(3)}deg)`,
  ].join(" ");
}

/**
 * The card's edge, as an offset rather than as geometry.
 *
 * A card lying on the table is a flat plane; its thickness shows as a band
 * along one side, and where that band falls on screen is fixed, because every
 * card on the table shares the stage's orientation. So the edge can be painted
 * by the card's own `box-shadow` instead of being built from extra planes —
 * and a `box-shadow` follows `border-radius`, so the corners come out right.
 *
 * This is not a micro-optimisation. Measured: twenty cards carrying four
 * laminae each put eighty planes inside the stage's 3D rendering context, which
 * the compositor has to sort and rasterise on every frame that any card moves,
 * and the sequence ran at 15 FPS. Painting the same edge costs nothing, because
 * it happens in a plane that already exists.
 *
 * The function solves for the local offset whose screen projection equals the
 * thickness direction. Writing it out rather than hard-coding the numbers
 * means the edge stays correct if the stage's tilt is ever changed — and it
 * would otherwise be silently, subtly wrong.
 */
export function edgeOffset(depth: number): { x: number; y: number } {
  const rx = (STAGE_TILT.x * Math.PI) / 180;
  const rz = (-STAGE_TILT.z * Math.PI) / 180;

  // Where the local axes land on screen under `rotateX(tilt.x) rotateZ(-tilt.z)`.
  const ax = { x: Math.cos(rz), y: Math.sin(rz) * Math.cos(rx) };
  const ay = { x: -Math.sin(rz), y: Math.cos(rz) * Math.cos(rx) };
  // The table normal, pointing up off the table, projects straight up the screen.
  const an = { x: 0, y: -Math.sin(rx) };

  // Solve [ax ay] . (dx, dy) = -depth * an, the direction the body extends
  // *away* from its top face.
  const det = ax.x * ay.y - ay.x * ax.y;
  const tx = -depth * an.x;
  const ty = -depth * an.y;
  return {
    x: (tx * ay.y - ay.x * ty) / det,
    y: (ax.x * ty - tx * ax.y) / det,
  };
}

/**
 * How far down the screen the whole composition sits.
 *
 * Tipping a plane away from the viewer moves everything standing on it up the
 * screen, so a stage centred in its container does not produce a composition
 * centred in the frame. This offset puts the action back in the middle of the
 * picture.
 */
const STAGE_DROP = 36;

/** The stage's own transform: the table, scaled to the screen, dropped, tipped away and turned. */
export function stageTransform(): string {
  return `scale(var(--fd-scale, 1)) translateY(${STAGE_DROP}px) rotateX(${STAGE_TILT.x}deg) rotateZ(${-STAGE_TILT.z}deg)`;
}
