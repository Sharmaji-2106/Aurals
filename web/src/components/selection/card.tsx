"use client";

import { CARD } from "@/components/selection/contract";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A discovery card, as a manufactured object.
 *
 * ## What the card is made of
 *
 * A dark graphite plate with a satin finish, a milled well for the product, and
 * type set beside it. The material is four layers and no more: a diagonal
 * gradient for the sheen, a very fine grain so the large flat area is not a
 * flat vector fill, a raking highlight from the upper left, and an edge — a
 * light top lip, a dark bottom one, and a hairline all round.
 *
 * Nothing here glows. The card that matters is distinguished by scale, by the
 * light that comes up behind it and by what it is allowed to say — never by a
 * coloured border, which is the cheapest way to make an interface look cheap.
 *
 * ## The well
 *
 * The product is the hero, so it gets 46% of the card and is recessed into it:
 * a dark lip at the top where the wall faces away from the light and a lit one
 * at the bottom where it faces into it. An empty flat rectangle reads as a
 * mistake; an empty *recess* reads as a place where something belongs.
 *
 * This catalogue has no product photographs — all 203 earphones came from
 * measurement files that carry none — so what sits in the well is the project's
 * honest portrait, drawn from the earphone's own measured response. The moment
 * a real photograph exists for a product, `ProductArt` shows it instead and
 * this card needs no change at all.
 */

export type CardFace = {
  brand: string;
  model: string;
  /** The engine's numbers. Only the chosen card is allowed to show them. */
  score: { mean: number; low: number; high: number } | null;
  match: string | null;
  /** One computed reason, in the engine's own words. */
  reason: string | null;
  /** Who measured the response the portrait is drawn from. */
  credit: string | null;
  /** The portrait. In production this is the element that travels. */
  art?: ReactNode;
};

const MATCH_WORD: Record<string, string> = {
  close: "Close match",
  good: "Good match",
  partial: "Partial match",
  poor: "Poor match",
};

export function SelectionCard({
  face,
  selected,
  className,
}: {
  face: CardFace;
  /** 0 while it is one of the candidates, 1 once it is the one. */
  selected: number;
  className?: string;
}) {
  const lit = selected > 0.01;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        width: CARD.width,
        height: CARD.height,
        borderRadius: CARD.radius,
        background: [
          // The sheen. Satin graphite lit from the upper left.
          "linear-gradient(148deg, #20242D 0%, #171B23 34%, #10131A 64%, #181C24 100%)",
        ].join(", "),
        boxShadow: [
          // The edge: a lit top lip, a dark bottom one, a hairline all round.
          "inset 0 1px 0 rgb(255 255 255 / 0.1)",
          "inset 0 -1px 0 rgb(0 0 0 / 0.55)",
          "inset 0 0 0 0.75px rgb(255 255 255 / 0.06)",
          // And the card's separation from the room, which grows as it is
          // chosen — the object lifts rather than lighting up.
          `0 ${(10 + 26 * selected).toFixed(1)}px ${(28 + 54 * selected).toFixed(1)}px -${(
            12 -
            4 * selected
          ).toFixed(1)}px rgb(0 0 0 / ${(0.55 + 0.18 * selected).toFixed(2)})`,
        ].join(", "),
      }}
    >
      {/* The raking highlight. One source, upper left, as everything else in
          this product is lit. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 96% at 8% -16%, rgb(255 238 222 / 0.1), transparent 58%)",
        }}
      />
      {/* A fine grain, barely there. Without it the plate reads as flat fill. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          background:
            "repeating-linear-gradient(122deg, rgb(255 255 255 / 0.5) 0px, rgb(255 255 255 / 0.5) 0.5px, transparent 0.5px, transparent 2.5px)",
        }}
      />
      {/* The warmth the chosen card earns: a wash from below, not an outline. */}
      {lit && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(8deg, rgb(255 129 94 / 0.14), rgb(229 187 130 / 0.05) 42%, transparent 70%)",
            opacity: selected,
          }}
        />
      )}

      <div className="relative flex h-full items-stretch gap-[5%] px-[5%] py-[5%]">
        {/* The well. */}
        <div
          className="relative shrink-0 overflow-hidden"
          style={{
            width: "47.5%",
            borderRadius: CARD.radius - 7,
            background:
              "radial-gradient(118% 92% at 50% -14%, rgb(255 255 255 / 0.05), transparent 60%), #090A0D",
            boxShadow: [
              "inset 0 1.5px 2.5px rgb(0 0 0 / 0.78)",
              "inset 0 -0.75px 0 rgb(255 255 255 / 0.09)",
              "inset 0 0 0 0.75px rgb(0 0 0 / 0.55)",
            ].join(", "),
          }}
        >
          {face.art ?? (
            <span className="absolute inset-0 grid place-items-center px-2 text-center font-mono text-[6.5px] leading-[1.7] tracking-[0.16em] text-ink-faint/70 uppercase">
              No photograph
              <br />
              gathered
            </span>
          )}
        </div>

        {/* The reading. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="font-mono text-[8px] leading-none tracking-[0.3em] text-ink-faint uppercase">
            {face.brand}
          </p>
          <p
            className="display mt-[7px] leading-[1.1] tracking-[-0.015em] text-ink"
            style={{ fontSize: 16.5 + 3 * selected }}
          >
            {face.model}
          </p>

          {/* Only the chosen card quotes a number. A rail of scores would turn
              a curated sequence into a leaderboard. */}
          {lit && face.score && (
            <div style={{ opacity: selected }}>
              <div className="mt-[11px] flex items-baseline gap-1.5">
                <span className="numeric text-[21px] leading-none text-ink">
                  {face.score.mean.toFixed(1)}
                </span>
                {face.match && (
                  <span className="font-mono text-[7.5px] tracking-[0.18em] text-ember uppercase">
                    {MATCH_WORD[face.match] ?? face.match}
                  </span>
                )}
              </div>
              {/* The interval, drawn across the full scale, because where it
                  sits says as much as how wide it is. */}
              <div className="relative mt-[7px] h-[3px] w-full rounded-full bg-white/[0.07]">
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${face.score.low}%`,
                    width: `${Math.max(2, face.score.high - face.score.low)}%`,
                    background: "linear-gradient(90deg, #FF815E, #E5BB82)",
                    opacity: 0.92,
                  }}
                />
                <div
                  className="absolute top-1/2 h-[8px] w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                  style={{ left: `${face.score.mean}%` }}
                />
              </div>
              <p className="numeric mt-[5px] text-[7.5px] text-ink-faint">
                {face.score.low.toFixed(1)}&ndash;{face.score.high.toFixed(1)} interval
              </p>
            </div>
          )}

          {/* Who measured the response the portrait is drawn from. It belongs
              on every card, including the chosen one — the picture is somebody
              else's work and saying so costs one line. */}
          {face.credit && (
            <p
              className="mt-auto pt-[9px] font-mono text-[6px] leading-[1.6] tracking-[0.08em] text-ink-faint/55 uppercase"
              style={{ opacity: lit ? 0.5 + 0.5 * selected : 1 }}
            >
              {face.credit}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
