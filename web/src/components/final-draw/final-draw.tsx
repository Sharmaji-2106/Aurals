"use client";

import { Card } from "@/components/final-draw/card";
import {
  LAYER,
  landedAt,
  poseAt,
  releaseAt,
  stageTransform,
  transformFor,
} from "@/components/final-draw/choreography";
import { CARDS, CARD_COUNT, SKIP_TO, type CardId, type WinningIem } from "@/components/final-draw/contract";
import { cn } from "@/lib/cn";
import { useMemo, type ReactNode } from "react";

/**
 * The Final Draw.
 *
 * A fixed camera over a tipped table, and twenty cards whose poses are read
 * from the clock. There is no renderer here and no animation library driving
 * the cards: a transform string per card per frame, which the compositor
 * handles, and which is why this holds frame rate where a WebGL version of the
 * same idea did not.
 *
 * The decision to build this in the DOM rather than in WebGL was not about
 * cost. The winning card has to arrive at the exact place the recommendation
 * occupies on the results page, as the same element, with its layout morphing
 * on the way. A canvas cannot become an HTML hero; a div can. Everything else
 * followed from that.
 */

const MAX_Z = (CARD_COUNT - 1) * LAYER;

export type FinalDrawProps = {
  /** Seconds from the start. The only input the scene has. */
  time: number;
  winner: WinningIem;
  /**
   * The artwork for the winning card's face. In production this is a
   * `layoutId`-bearing element, so the artwork the sequence reveals is
   * literally the artwork that ends up on the results page.
   */
  art?: ReactNode;
  /** No clock, no movement: render the settled reveal and nothing else. */
  still?: boolean;
  className?: string;
};

export function FinalDraw({ time, winner, art, still = false, className }: FinalDrawProps) {
  const at = still ? SKIP_TO : time;

  // Which cards actually need a printed face.
  //
  // Cards lying flat in a stack share a footprint exactly, so every one of them
  // except the topmost is completely hidden by the card above it. Rendering
  // twenty faces to show four is most of the cost of this scene — each face is
  // a dozen elements inside a 3D rendering context, which the compositor cannot
  // flatten away. So the face goes only where it can be seen: on whatever is on
  // top of each of the three stations, on anything in flight between them, and
  // always on the card that turns over.
  const faces = useMemo(() => {
    const shown = new Set<string>();
    let topLeft: CardId | null = null;
    let topRight: CardId | null = null;
    let topStack: CardId | null = null;

    for (const card of CARDS) {
      if (card.isHero) {
        shown.add(card.key);
        continue;
      }
      const released = at >= releaseAt(card.slot);
      const landed = at >= landedAt(card.slot);

      if (released && !landed) {
        // In the air, and seen against whatever is beneath it.
        shown.add(card.key);
        continue;
      }
      if (landed) {
        if (!topStack || card.slot > topStack.slot) topStack = card;
        continue;
      }
      // Still waiting in its own deck.
      if (card.side === "left") {
        if (!topLeft || card.index > topLeft.index) topLeft = card;
      } else if (!topRight || card.index > topRight.index) topRight = card;
    }

    for (const card of [topLeft, topRight, topStack]) {
      if (card) shown.add(card.key);
    }
    return shown;
  }, [at]);

  return (
    <div
      className={cn("relative isolate size-full overflow-hidden", className)}
      style={{
        background: "radial-gradient(115% 78% at 50% 112%, #0E1016 0%, #08090C 46%, #050609 100%)",
      }}
    >
      {/* The lighting, as three separate pieces rather than one gradient.
          A soft cool key from above and slightly left, the warm pool that
          establishes the centre before anything arrives, and a low warm rim
          from behind — the warm-against-cool split is what stops a dark scene
          reading as merely underexposed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(58% 42% at 41% 8%, rgb(176 198 238 / 0.075), transparent 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(40% 32% at 50% 58%, rgb(255 186 142 / 0.1), transparent 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          background: "radial-gradient(66% 26% at 62% 86%, rgb(255 142 94 / 0.052), transparent 76%)",
        }}
      />

      <div className="absolute inset-0" style={{ perspective: "1500px", perspectiveOrigin: "50% 46%" }}>
        {/* The composition is recomposed for the screen, not cropped by it. A
            narrow viewport gets a smaller table so both decks stay in frame
            with their separation intact — the interleave is the whole point of
            the sequence and it is unreadable with the decks off the edges. The
            winning card scales back up as it turns, so the reveal is full size
            and legible on every screen.

            In CSS rather than measured in JavaScript, so a resize or a rotation
            costs nothing: no observer, no re-render, and no second opinion
            about how wide the viewport is. */}
        <div
          className="absolute inset-0 [--fd-hero-zoom:calc(1/var(--fd-scale))] [--fd-scale:1] max-[1180px]:[--fd-scale:0.76] max-[900px]:[--fd-scale:0.56] max-[620px]:[--fd-scale:0.34]"
          style={{ transformStyle: "preserve-3d", transform: stageTransform() }}
        >
          {/* The table: a pool of light the cards sit in, not a room. */}
          <div
            aria-hidden="true"
            className="absolute top-1/2 left-1/2"
            style={{
              width: 1900,
              height: 1250,
              transform: "translate(-50%, -50%) translateZ(-1px)",
              background: "radial-gradient(42% 42% at 50% 50%, rgb(146 160 190 / 0.065), transparent 72%)",
            }}
          />

          {CARDS.map((card) => {
            const pose = poseAt(at, card);
            if (!pose.visible) return null;

            // Light comes from above, and cards above shade the ones below, so
            // depth in the stack reads as depth rather than as repetition.
            // Quantised, because `dim` is otherwise a new number sixty times a
            // second and every card's face would be re-rendered for a change
            // far below the threshold of vision.
            const shade = Math.max(0, Math.min(1, 1 - pose.z / MAX_Z)) * 0.52;
            const dim = Math.round(shade * 25) / 25;

            return (
              <Card
                key={card.key}
                transform={transformFor(pose)}
                shadow={pose.shadow}
                dim={dim}
                face={faces.has(card.key)}
                hero={card.isHero}
                front={
                  card.isHero
                    ? {
                        brand: winner.brand,
                        model: winner.model,
                        score: winner.score,
                        reason: winner.reason,
                        provenance: winner.provenance,
                        art,
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      {/* A vignette, so the composition closes at the edges instead of running
          out of the frame. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(118% 92% at 50% 44%, transparent 42%, rgb(3 4 8 / 0.62) 100%)",
        }}
      />
    </div>
  );
}
