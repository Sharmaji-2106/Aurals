"use client";

import { ResponseCurve } from "@/components/final-draw/response-curve";
import type { BoutiqueProduct } from "@/components/boutique/contract";
import { MEASURED_COUNT, RECOMMENDER, REFERENCE_TARGET } from "@/components/boutique/products";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { useMemo } from "react";

/**
 * The recommendation, over the boutique.
 *
 * Ordinary React on top of the canvas, not geometry inside it — type belongs in
 * the DOM where it stays crisp, selectable and readable by a screen reader.
 *
 * It is a column against one edge rather than a slab across the middle,
 * because the environment is the reason the overlay is interesting: cover the
 * boutique and this becomes a product page with an expensive background.
 *
 * Everything on it is the engine's: the rank, the score and its interval, the
 * match grade, and the two reasons in the engine's own words. The artwork well
 * shows the earphone's own measured response, credited, because there is no
 * photograph of it anywhere in this catalogue and drawing one would be a lie
 * about hardware.
 */

const MATCH_WORD: Record<string, string> = {
  close: "Close match",
  good: "Good match",
  partial: "Partial match",
  poor: "Poor match",
};

/** The measured curve as an SVG path, in the 180 x 72 box `ResponseCurve` uses. */
function pathFor(curve: readonly number[]): string {
  const lo = Math.min(...curve);
  const hi = Math.max(...curve);
  const span = Math.max(1e-6, hi - lo);
  return curve
    .map((db, i) => {
      const x = 6 + (i / (curve.length - 1)) * 168;
      const y = 66 - ((db - lo) / span) * 60;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function RecommendationOverlay({
  product,
  onClose,
  className,
}: {
  product: BoutiqueProduct;
  onClose: () => void;
  className?: string;
}) {
  const path = useMemo(() => pathFor(product.curve), [product.curve]);
  const credit = [product.measuredBy, product.rig].filter(Boolean).join(" · ");

  return (
    <motion.aside
      initial={{ opacity: 0, x: 36 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 36 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      role="dialog"
      aria-label={`${product.brand} ${product.model}`}
      className={cn(
        "pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-full max-w-[460px] flex-col overflow-y-auto",
        "border-l border-hairline bg-[#0A0B0E]/88 backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 p-7 pb-0">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">
            {product.hero ? "Your strongest match" : `Rank ${product.rank} of ${MEASURED_COUNT}`}
          </p>
          <p className="mt-3 font-mono text-[10px] tracking-[0.26em] text-ink-faint uppercase">
            {product.brand}
          </p>
          <h2 className="display mt-1.5 text-[30px] leading-[1.05] tracking-[-0.02em] text-ink">
            {product.model}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the boutique"
          className="mt-1 shrink-0 rounded-full border border-hairline-strong p-2 text-ink-faint transition-colors hover:border-white/25 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* The artwork well. A measurement, not a photograph, and it says so. */}
      <div className="px-7 pt-6">
        <div
          className="relative aspect-[16/9] w-full overflow-hidden rounded-xl"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -10%, rgb(255 255 255 / 0.05), transparent 62%), #0A0B0E",
            boxShadow: "inset 0 1.5px 2px rgb(0 0 0 / 0.7), inset 0 0 0 0.75px rgb(255 255 255 / 0.05)",
          }}
        >
          <ResponseCurve path={path} className="absolute inset-0" />
        </div>
        <p className="mt-2.5 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-ink-faint uppercase">
          Measured response
          {credit && <> &middot; {credit}</>}
          {product.points && <> &middot; {product.points} points</>}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          AURALS holds no photograph of this earphone. This is its own measured frequency response — the thing
          the recommendation was actually computed from.
        </p>
      </div>

      {/* The reading. */}
      <div className="px-7 pt-7">
        <div className="flex items-baseline gap-3">
          <span className="numeric text-[38px] leading-none text-ink">{product.mean.toFixed(1)}</span>
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-faint uppercase">
              Predicted preference
            </p>
            <p className="font-mono text-[9.5px] tracking-[0.16em] text-ember uppercase">
              {MATCH_WORD[product.match] ?? product.match}
            </p>
          </div>
        </div>

        <div className="relative mt-4 h-[5px] w-full rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${product.low}%`,
              width: `${Math.max(2, product.high - product.low)}%`,
              background: "linear-gradient(90deg, #FF815E, #E5BB82)",
              opacity: 0.9,
            }}
          />
          <div
            className="absolute top-1/2 h-[11px] w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
            style={{ left: `${product.mean}%` }}
          />
        </div>
        <p className="numeric mt-2 text-[10.5px] text-ink-faint">
          {product.low.toFixed(1)}&ndash;{product.high.toFixed(1)} interval &middot; the range is how certain
          your profile is, not how certain the earphone is
        </p>
      </div>

      {/* The engine's own words, labelled as what they are. */}
      <div className="mt-8 space-y-6 px-7">
        {product.strength && (
          <section>
            <p className="font-mono text-[9.5px] tracking-[0.24em] text-ink-faint uppercase">Why it fits</p>
            <p className="mt-2.5 border-l border-ember/60 pl-3.5 text-[13px] leading-relaxed text-ink-muted">
              {product.strength}
            </p>
          </section>
        )}
        {product.tradeoff && (
          <section>
            <p className="font-mono text-[9.5px] tracking-[0.24em] text-ink-faint uppercase">Good to know</p>
            <p className="mt-2.5 border-l border-hairline-strong pl-3.5 text-[13px] leading-relaxed text-ink-muted">
              {product.tradeoff}
            </p>
          </section>
        )}
      </div>

      <div className="mt-auto px-7 pt-10 pb-7">
        <div className="h-px w-full bg-white/[0.06]" />
        <p className="mt-4 font-mono text-[9px] leading-[1.7] tracking-[0.1em] text-ink-faint/80 uppercase">
          Scored by {RECOMMENDER} against {REFERENCE_TARGET}, over {MEASURED_COUNT} measured earphones. No
          price, stock or review data is shown, because none is held.
        </p>
      </div>
    </motion.aside>
  );
}
