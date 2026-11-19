"use client";

import { LogoMark } from "@/components/brand/logo";
import { edgeOffset } from "@/components/final-draw/choreography";
import { CARD } from "@/components/final-draw/contract";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A discovery card, as a physical object.
 *
 * ## Why it has thickness, and how
 *
 * Two ways, for two different jobs. The card that turns over is genuinely
 * extruded, from laminae climbing through its depth, because a painted edge is
 * only correct from the angle it was solved for and that card leaves the angle.
 * Every other card paints its edge with offset box-shadows instead.
 *
 * That split was forced by measurement, not taste. Laminating all twenty cards
 * put eighty planes inside the stage's 3D rendering context, and the sequence
 * ran at fifteen frames a second; the painted edge is free, follows the corner
 * radius just as well, and is indistinguishable while the card lies flat.
 *
 * Thickness is 5.6 px on a 384 px card — 1.5%, which is 2.8 mm on a 190 mm
 * card. Slender on purpose. Thickness is the detail that most readily makes an
 * object look cheap when overdone, and an earlier concept in this project was
 * rejected for exactly that.
 *
 * ## Why the back is the design
 *
 * For most of the sequence every card is face-down, so the back is what the
 * viewer actually spends ten seconds looking at, twenty times over. It carries
 * the Auralis mark — the nine frequency bands, the real brand mark — blind
 * embossed rather than printed on, plus a debossed response curve, because a
 * measured curve is what Auralis is for.
 */

/** Laminae through the thickness, for the one card that is examined closely. */
const HERO_LAMINAE = 11;

/* ------------------------------------------------------------------ back --- */

/**
 * The motif: a frequency response, debossed into the face.
 *
 * This carries the card, and the brand mark does not. That is a reversal of
 * where this design started, and it was forced by looking at it: the Auralis
 * mark is nine bars radiating from a point, which reads as a logo at 24 px in a
 * header and reads as a daisy — or worse, a loading spinner — the moment it is
 * blown up to a third of a card. Three attempts at it in two renderers all
 * arrived at the same flower. A radial mark at that proportion is simply not a
 * centrepiece.
 *
 * A response curve is the better centrepiece anyway. It is literally what
 * Auralis measures, it is unmistakable, it survives a grazing angle because a
 * long groove catches light along its whole length, and it never stops looking
 * like what it is. So the mark becomes a maker's mark in the corner, where it
 * works, and the curve takes the middle.
 *
 * The shape is a signature, not a measurement — a bass shelf, a dip through the
 * lower mids, a presence lift and a treble fall. It stands for what Auralis
 * does and claims nothing about any particular earphone, which is why it is
 * allowed on a card that carries no product identity.
 */
const MOTIF =
  "M4,46 C18,45 30,43 42,39 C56,34 64,47 78,51 C92,55 100,33 114,24 C126,16 134,21 146,30 C158,39 168,52 176,58";

function CardBack({ dim = 0 }: { dim?: number }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[var(--fd-radius)]"
      style={{
        // Satin graphite. The sheen runs across the diagonal so a stack of
        // these reads as one material lit from one place, rather than as
        // twenty independently shaded rectangles.
        background: "linear-gradient(152deg, #1B1F27 0%, #141821 38%, #0E1116 62%, #161A22 100%)",
        boxShadow: [
          "inset 0 0 0 0.75px rgb(255 255 255 / 0.07)",
          "inset 0 1px 0 rgb(255 255 255 / 0.11)",
          "inset 0 -1px 0 rgb(0 0 0 / 0.5)",
          "inset 0 22px 44px -26px rgb(255 255 255 / 0.07)",
        ].join(", "),
      }}
    >
      {/* Microtexture. A fine grain at 2px, barely there, which keeps the
          large flat area from reading as flat vector fill. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07]"
        style={{
          background:
            "repeating-linear-gradient(118deg, rgb(255 255 255 / 0.5) 0px, rgb(255 255 255 / 0.5) 0.5px, transparent 0.5px, transparent 2px)",
        }}
      />

      {/* The light.
          Three sources, as the Blender rig has them: a soft cool key from above
          and to the left, a faint cyan fill from the right, and a low warm rim
          raking across the top-left corner. The warm-against-cool split is what
          makes a dark surface read as lit rather than as underexposed, and it
          is the thing that most separates this from a flat gradient.
          All three are stacked on one element — three separate layers would be
          three more planes per card, and the frame budget is spent elsewhere. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 75% 65% at 0% -8%, rgb(255 180 107 / 0.105) 0%, rgb(255 180 107 / 0.043) 20%, rgb(255 180 107 / 0.012) 44%, transparent 68%)",
            "radial-gradient(ellipse 100% 115% at 18% -12%, rgb(220 230 240 / 0.11) 0%, rgb(220 230 240 / 0.045) 42%, transparent 78%)",
            "radial-gradient(ellipse 60% 130% at 115% 60%, rgb(139 213 231 / 0.045) 0%, rgb(139 213 231 / 0.018) 36%, transparent 76%)",
          ].join(", "),
          boxShadow: [
            "inset 0 0.7px 0 rgb(255 180 107 / 0.18)",
            "inset 0.7px 0 0 rgb(255 180 107 / 0.09)",
            "inset -0.7px 0 0 rgb(139 213 231 / 0.08)",
          ].join(", "),
          borderRadius: "inherit",
        }}
      />

      {/* The maker's mark, locked up with the wordmark where a mark of this
          shape actually works. */}
      <div className="absolute top-[8.5%] left-[7%] flex items-center gap-[5px]">
        <div className="relative" style={{ width: 13, height: 13 }}>
          <LogoMark className="absolute inset-0 size-full translate-y-[-0.6px] opacity-80 brightness-0" />
          <LogoMark className="absolute inset-0 size-full translate-y-[0.6px] opacity-25 brightness-[2.4] grayscale" />
        </div>
        <span className="font-mono text-[7px] tracking-[0.3em] text-white/22 uppercase" aria-hidden="true">
          AURALS
        </span>
      </div>
      <span
        className="absolute top-[8.5%] right-[7%] font-mono text-[7px] tracking-[0.3em] text-white/16 uppercase"
        aria-hidden="true"
      >
        Personal audio
      </span>

      {/* The curve. Debossed: a dark line above the groove and a light line
          below it is how the eye reads a channel cut into a surface. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 180 72"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-x-[11%] top-1/2 -translate-y-1/2"
        style={{ height: "46%" }}
      >
        <path
          d={MOTIF}
          fill="none"
          stroke="rgb(0 0 0 / 0.62)"
          strokeWidth="2.1"
          strokeLinecap="round"
          transform="translate(0,-1.1)"
        />
        <path
          d={MOTIF}
          fill="none"
          stroke="rgb(255 255 255 / 0.13)"
          strokeWidth="1.6"
          strokeLinecap="round"
          transform="translate(0,1)"
        />
        {/* A trace of the spectral scale surviving in the groove, warm at the
            bass end and cool at the top, as Auralis draws it everywhere else. */}
        <defs>
          <linearGradient id="fd-motif" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FF815E" />
            <stop offset="0.45" stopColor="#E5BB82" />
            <stop offset="0.78" stopColor="#8BD5E7" />
            <stop offset="1" stopColor="#987CFF" />
          </linearGradient>
        </defs>
        <path
          d={MOTIF}
          fill="none"
          stroke="url(#fd-motif)"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.17"
        />
      </svg>

      {/* Editorial detailing: hairline rules top and bottom, which frame the
          curve and give the composition its margins. */}
      <div className="absolute inset-x-[7%] top-[20%] h-px bg-white/[0.05]" />
      <div className="absolute inset-x-[7%] bottom-[20%] h-px bg-white/[0.04]" />

      <span
        className="absolute bottom-[8.5%] left-1/2 -translate-x-1/2 font-mono text-[6.5px] tracking-[0.34em] text-white/18 uppercase"
        aria-hidden="true"
      >
        The final draw
      </span>

      {/* Buried cards get darker, so the stack has depth rather than being a
          flat repeat of one identical surface. */}
      {dim > 0 && (
        <div aria-hidden="true" className="absolute inset-0 bg-black" style={{ opacity: dim * 0.42 }} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- front --- */

/**
 * The reveal.
 *
 * Nothing here is decorative-with-a-number-on-it: the brand and model are the
 * catalogue's, the score and its interval are the engine's, the reason is the
 * engine's own sentence, and the artwork is whatever `art` is — in production,
 * the very element that goes on to become the hero of the results page.
 *
 * There is no product photograph for most of this catalogue, and nothing here
 * pretends otherwise. Where no artwork is supplied the well says so.
 */
function CardFront({
  brand,
  model,
  score,
  reason,
  provenance,
  art,
}: {
  brand: string;
  model: string;
  score: { mean: number; low: number; high: number } | null;
  reason: string | null;
  provenance: string;
  art?: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-[var(--fd-radius)]"
      style={{
        background: "linear-gradient(158deg, #1E232C 0%, #15191F 46%, #0D1014 100%)",
        boxShadow: [
          "inset 0 0 0 0.75px rgb(255 255 255 / 0.09)",
          "inset 0 1px 0 rgb(255 255 255 / 0.14)",
          "inset 0 -1px 0 rgb(0 0 0 / 0.55)",
        ].join(", "),
      }}
    >
      {/* A single warm raking highlight, which is what tells you the surface is
          satin rather than matte. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(130% 80% at 14% -14%, rgb(255 229 210 / 0.12), transparent 58%)",
        }}
      />

      <header className="relative flex items-center justify-between px-[7%] pt-[6.5%]">
        <span className="font-mono text-[8px] tracking-[0.3em] text-ember uppercase">
          Your strongest match
        </span>
        <LogoMark className="size-[13px] opacity-55" />
      </header>

      <div className="relative mt-[4%] grid min-h-0 flex-1 grid-cols-[1.08fr_1fr] gap-[5%] px-[7%]">
        {/* The artwork well. */}
        <div
          className="relative overflow-hidden rounded-[8px]"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -12%, rgb(255 255 255 / 0.05), transparent 62%), #0A0B0E",
            // Milled into the card rather than printed on it: a dark lip at the
            // top where the wall faces away from the light, a lit lip at the
            // bottom where it faces into it. Without this the well is a black
            // rectangle, and an empty black rectangle reads as a mistake —
            // whereas an empty recess reads as a place for something.
            boxShadow: [
              "inset 0 1.5px 2px rgb(0 0 0 / 0.75)",
              "inset 0 -0.75px 0 rgb(255 255 255 / 0.1)",
              "inset 0 0 0 0.75px rgb(0 0 0 / 0.5)",
              "inset 0 0 14px rgb(0 0 0 / 0.45)",
            ].join(", "),
          }}
        >
          {art ?? (
            <span className="absolute inset-0 grid place-items-center px-3 text-center font-mono text-[7px] leading-[1.7] tracking-[0.16em] text-ink-faint/70 uppercase">
              No photograph
              <br />
              gathered
            </span>
          )}
        </div>

        {/* The reading. */}
        <div className="flex min-w-0 flex-col justify-center">
          <p className="font-mono text-[8px] tracking-[0.26em] text-ink-faint uppercase">{brand}</p>
          <p className="display mt-[3px] text-[17px] leading-[1.12] tracking-[-0.015em] text-ink">{model}</p>

          {score && (
            <div className="mt-[9%]">
              <div className="flex items-baseline gap-1.5">
                <span className="numeric text-[25px] leading-none text-ink">{score.mean.toFixed(1)}</span>
                <span className="font-mono text-[7.5px] tracking-[0.2em] text-ink-faint uppercase">
                  predicted
                </span>
              </div>
              {/* The interval, drawn across the full 0-100 preference scale, so
                  where the band sits is as informative as how wide it is. A
                  single number would overstate what the model actually knows. */}
              <div className="relative mt-[8px] h-[4px] w-full rounded-full bg-white/[0.06]">
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${score.low}%`,
                    width: `${Math.max(2, score.high - score.low)}%`,
                    background: "linear-gradient(90deg, #FF815E, #E5BB82)",
                    opacity: 0.9,
                  }}
                />
                {/* Where the estimate itself falls inside its own interval. */}
                <div
                  className="absolute top-1/2 h-[9px] w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                  style={{ left: `${score.mean}%` }}
                />
              </div>
              <p className="numeric mt-[6px] text-[7.5px] text-ink-faint">
                {score.low.toFixed(1)}–{score.high.toFixed(1)} interval
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="relative mt-[3%] px-[7%] pb-[6%]">
        <div className="h-px w-full bg-white/[0.06]" />
        {reason && <p className="mt-[3.5%] text-[9px] leading-[1.45] text-ink-muted">{reason}</p>}
        <p className="mt-[2.5%] font-mono text-[6.5px] leading-relaxed tracking-[0.1em] text-ink-faint/80 uppercase">
          {provenance}
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ card --- */

export type CardProps = {
  transform: string;
  /** Casts a contact shadow when it is near the table. */
  shadow: number;
  /** How buried it is in a stack, 0 to 1. */
  dim?: number;
  /**
   * Whether anything can actually see this card's face. A card buried in a
   * stack is covered exactly by the one above it, and printing a face nobody
   * can see is the single most expensive thing this scene could do.
   */
  face?: boolean;
  hero?: boolean;
  front?: {
    brand: string;
    model: string;
    score: { mean: number; low: number; high: number } | null;
    reason: string | null;
    provenance: string;
    art?: ReactNode;
  };
  className?: string;
};

const EDGE = edgeOffset(CARD.thickness);

export function Card({ transform, shadow, dim = 0, face = true, hero = false, front, className }: CardProps) {
  const half = CARD.thickness / 2;
  const edge = EDGE;

  return (
    <div
      data-fd-card={hero ? "hero" : ""}
      className={cn("absolute", className)}
      style={
        {
          width: CARD.width,
          height: CARD.height,
          // Centred on its own position, so `transform` places the card's
          // middle rather than its corner and rotation happens about its heart.
          left: "50%",
          top: "50%",
          marginLeft: -CARD.width / 2,
          marginTop: -CARD.height / 2,
          // Only the card that turns over needs its own 3D rendering context:
          // it has two faces and a real extrusion. Every other card is
          // coplanar — one surface and a painted edge — so leaving it flat lets
          // the compositor rasterise it once and thereafter only transform the
          // result, rather than re-sorting its contents whenever it moves.
          transformStyle: hero ? "preserve-3d" : "flat",
          transform,
          willChange: "transform",
          "--fd-radius": `${CARD.radius}px`,
        } as React.CSSProperties
      }
    >
      {/* Contact shadow. Beneath the card and slightly larger, on the table
          plane, fading as the card lifts. */}
      {shadow > 0.12 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[var(--fd-radius)]"
          style={{
            inset: "-6%",
            transform: `translateZ(${(-half - 1.5).toFixed(2)}px)`,
            background: "radial-gradient(58% 58% at 50% 56%, rgb(0 0 0 / 0.66), transparent 76%)",
            opacity: shadow,
          }}
        />
      )}

      {/* The body, and its edge.
          For every card but the one that turns over, the edge is painted by
          three offset box-shadows rather than built from stacked planes: the
          offsets project exactly onto the thickness direction, they follow the
          corner radius, and they live in a plane that already exists. The three
          bands run from lit just under the top face to dark at the bottom of
          the cut, which is how a stack of dark cardstock actually reads. */}
      <div
        className="absolute inset-0 rounded-[var(--fd-radius)] [backface-visibility:hidden]"
        style={{
          // The half-thickness lift only means anything inside a 3D context;
          // flat cards are coplanar with themselves by definition.
          transform: hero ? `translateZ(${half.toFixed(2)}px)` : undefined,
          // The same base the printed face uses, because a card whose face has
          // been culled must be indistinguishable from one that still has it.
          // The lighter tones belong to the edge, below, not to the surface.
          background: "linear-gradient(152deg, #1B1F27 0%, #141821 38%, #0E1116 62%, #161A22 100%)",
          boxShadow: hero
            ? undefined
            : [
                `${(edge.x * 0.3).toFixed(2)}px ${(edge.y * 0.3).toFixed(2)}px 0 0 #333944`,
                `${(edge.x * 0.62).toFixed(2)}px ${(edge.y * 0.62).toFixed(2)}px 0 0 #272C35`,
                `${edge.x.toFixed(2)}px ${edge.y.toFixed(2)}px 0 0 #171B22`,
              ].join(", "),
        }}
      >
        {face && <CardBack dim={dim} />}
      </div>

      {/* The card that turns over keeps a real extrusion, because a painted
          edge is only correct from the angle it was solved for — and this is
          the one card that leaves that angle. Eleven planes on a single card
          cost nothing; the same trick across twenty of them was what made the
          first cut of this scene run at fifteen frames a second. */}
      {hero &&
        Array.from({ length: HERO_LAMINAE }, (_, i) => {
          const t = i / (HERO_LAMINAE - 1);
          // Stop just short of the printed face. A lamina exactly coplanar with
          // it is a tie the compositor breaks by paint order, and it broke it
          // the wrong way: the top lamina covered the card's own back, leaving
          // the one card that is always visible looking blank.
          const z = -half + t * (CARD.thickness - 0.4);
          return (
            <div
              key={i}
              aria-hidden="true"
              className="absolute inset-0 rounded-[var(--fd-radius)]"
              style={{
                transform: `translateZ(${z.toFixed(3)}px)`,
                background: `linear-gradient(176deg,
                  rgb(${44 + t * 20} ${48 + t * 21} ${57 + t * 23}) 0%,
                  rgb(${20 + t * 11} ${23 + t * 12} ${29 + t * 14}) 100%)`,
              }}
            />
          );
        })}

      {front && (
        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          style={{ transform: `rotateY(180deg) translateZ(${half.toFixed(2)}px)` }}
        >
          <CardFront {...front} />
        </div>
      )}
    </div>
  );
}
