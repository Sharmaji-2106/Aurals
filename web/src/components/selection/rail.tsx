"use client";

import { SelectionCard } from "@/components/selection/card";
import {
  HERO_BOX,
  RAIL_INDICES,
  holdAt,
  keyLight,
  layerOf,
  poseAt,
  revealAt,
  transformFor,
} from "@/components/selection/choreography";
import { SKIP_TO, WINNER_INDEX, type RailProduct } from "@/components/selection/contract";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * The Selection Rail.
 *
 * A line of cards crossing a dark studio, slowing, and stopping with the
 * engine's highest-ranked recommendation exactly in the middle of the frame.
 *
 * There is no renderer here and no animation library driving the cards: one
 * transform string per card per frame, handed to the compositor. The
 * environment is four gradients. That is the entire scene, and it is why a
 * sequence this cinematic costs almost nothing to run.
 */

export type RailEntry = {
  product: RailProduct;
  /** The portrait. On the winning card this is the element that travels. */
  art?: ReactNode;
};

export type RailProps = {
  /** Seconds from the start. The only input the scene has. */
  time: number;
  /** One per rail slot, in the order they arrive. */
  entries: readonly RailEntry[];
  /** No clock, no movement: render the settled reveal and nothing else. */
  still?: boolean;
  className?: string;
};

export function SelectionRail({ time, entries, still = false, className }: RailProps) {
  const at = still ? SKIP_TO : time;
  const light = keyLight(at);
  const hold = holdAt(at);

  return (
    <div
      className={cn("relative isolate size-full overflow-hidden", className)}
      style={{
        // A studio, not a black rectangle. Three things give it depth: a cool
        // wall falling away above, a warmer floor coming up below, and a seam
        // between them at the height the cards stand on.
        background:
          "linear-gradient(180deg, #0A0C11 0%, #090A0F 38%, #0B0D13 56%, #0D0F15 72%, #08090C 100%)",
      }}
    >
      {/* The wall's own fall-off, so the upper half is lit rather than merely
          dark, and darkest at the corners. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(76% 58% at 50% 26%, rgb(150 172 214 / 0.065), transparent 72%)",
        }}
      />

      {/* The floor. A soft sweep coming toward the viewer, brightest under the
          centre of the rail — this is the only "rail" there is, and it reads as
          a surface the cards stand on rather than as a drawn line. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "46%",
          background:
            "radial-gradient(58% 128% at 50% 0%, rgb(186 202 232 / 0.075), rgb(150 168 200 / 0.022) 46%, transparent 78%)",
        }}
      />

      {/* The seam where wall meets floor, just below the cards. A horizon is
          most of what makes a dark space read as a room. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: "62%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgb(198 212 238 / 0.04) 30%, rgb(198 212 238 / 0.07) 50%, rgb(198 212 238 / 0.04) 70%, transparent)",
        }}
      />

      {/* The key. It comes up with the selection and not before: a light that
          was always on says nothing about the moment it is meant to mark. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(34% 40% at 50% 46%, rgb(255 184 136 / 0.2), rgb(255 150 110 / 0.07) 46%, transparent 74%)",
          opacity: light,
        }}
      />

      {/* And the pool it throws on the floor directly beneath the chosen card,
          which is what stops that card looking as though it is floating. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
        style={{
          top: "58%",
          width: 760,
          height: 200,
          background: "radial-gradient(50% 50% at 50% 0%, rgb(255 176 128 / 0.1), transparent 72%)",
          opacity: light,
        }}
      />

      {/* The cards. */}
      <div className="absolute inset-0" style={{ perspective: "1800px", perspectiveOrigin: "50% 50%" }}>
        {/* The rail is recomposed for the frame, not cropped by it. A narrower
            viewport gets a smaller rail so the neighbouring cards stay
            discoverable, and the chosen card scales back up as it settles so
            the reveal is legible on every screen. */}
        <div
          className="absolute inset-0 [--rail-hero-boost:1] [--rail-scale:1] max-[1180px]:[--rail-hero-boost:1.05] max-[1180px]:[--rail-scale:0.9] max-[900px]:[--rail-hero-boost:1.2] max-[900px]:[--rail-scale:0.76] max-[620px]:[--rail-hero-boost:1.5] max-[620px]:[--rail-scale:0.58]"
          style={{ transformStyle: "preserve-3d", transform: "scale(var(--rail-scale, 1))" }}
        >
          {RAIL_INDICES.map((index) => {
            const entry = entries[index];
            if (!entry) return null;
            const pose = poseAt(at, index);
            if (!pose.visible || pose.opacity <= 0.01) return null;

            const winner = index === WINNER_INDEX;
            const credit = entry.product.measuredBy
              ? [entry.product.measuredBy, entry.product.rig].filter(Boolean).join(" · ")
              : null;

            return (
              <div
                key={entry.product.slug}
                data-rail-card={entry.product.slug}
                data-rail-winner={winner ? "true" : undefined}
                className="absolute top-1/2 left-1/2"
                style={{
                  marginLeft: -HERO_BOX.width / 2,
                  marginTop: -HERO_BOX.height / 2,
                  // The box is the hero's, always, so every card shares one
                  // measurable footprint and the centre never shifts when the
                  // chosen one grows into it.
                  width: HERO_BOX.width,
                  height: HERO_BOX.height,
                  display: "grid",
                  placeItems: "center",
                  transform: transformFor(pose),
                  opacity: pose.opacity,
                  zIndex: layerOf(pose),
                  willChange: "transform, opacity",
                }}
              >
                <SelectionCard
                  selected={pose.selected}
                  face={{
                    brand: entry.product.brand,
                    model: entry.product.model,
                    score: winner
                      ? {
                          mean: entry.product.mean,
                          low: entry.product.low,
                          high: entry.product.high,
                        }
                      : null,
                    match: winner ? entry.product.match : null,
                    reason: winner ? entry.product.strength : null,
                    credit,
                    art: entry.art,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* The frame's edges.
          Cards leave and enter through a fall-off rather than being sliced by
          the viewport. A hard cut at the edge of the screen is the detail that
          most reliably gives away a row of divs. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[14%]"
        style={{ background: "linear-gradient(90deg, #08090C 0%, rgb(8 9 12 / 0.72) 42%, transparent 100%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[14%]"
        style={{
          background: "linear-gradient(270deg, #08090C 0%, rgb(8 9 12 / 0.72) 42%, transparent 100%)",
        }}
      />

      {/* The copy, which arrives in order: what this is, then what it says. */}
      <Reveal at={at} entries={entries} />

      {/* A vignette, so the composition closes at the edges rather than running
          out of the frame. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(118% 88% at 50% 50%, transparent 38%, rgb(3 4 8 / 0.58) 100%)",
          opacity: 0.85 + 0.15 * hold,
        }}
      />
    </div>
  );
}

/**
 * The reveal's words.
 *
 * Above the card and below it, never on it — the card is a product shot and
 * type laid over a product shot is a poster, not a presentation. Each line
 * arrives a beat after the last so the eye is led rather than confronted.
 */
function Reveal({ at, entries }: { at: number; entries: readonly RailEntry[] }) {
  const winner = entries[WINNER_INDEX]?.product;
  if (!winner) return null;

  const label = revealAt(at, 0);
  const reason = revealAt(at, 2);

  return (
    <>
      {/* Nothing is rendered until it has something to say. Keeping the words
          in the DOM at zero opacity would have a screen reader announce "your
          strongest match" while the rail was still travelling and nothing had
          been chosen. */}
      {label > 0.004 && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
          style={{
            top: "27%",
            opacity: label,
            transform: `translateY(${((1 - label) * 10).toFixed(2)}px)`,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-ember/60" />
            <span className="font-mono text-[10px] tracking-[0.34em] text-ember uppercase">
              Your strongest match
            </span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-ember/60" />
          </div>
        </div>
      )}

      {winner.strength && reason > 0.004 && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-8"
          style={{
            bottom: "25%",
            opacity: reason,
            transform: `translateY(${((1 - reason) * -10).toFixed(2)}px)`,
          }}
        >
          <p className="max-w-[480px] text-center text-[13px] leading-relaxed text-ink-muted">
            {winner.strength}
          </p>
        </div>
      )}
    </>
  );
}
