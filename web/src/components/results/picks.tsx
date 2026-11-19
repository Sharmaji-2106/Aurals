"use client";

import { ProductArt } from "@/components/results/product-art";
import {
  MATCH_WORD,
  nameParts,
  Price,
  Rating,
  RegionDots,
  RowActions,
  StandingLine,
  strengths,
} from "@/components/results/recommendations";
import { Lines, Reveal } from "@/components/site/reveal";
import type { Recommendation, Schemas } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { DRIVER_BLURB, DRIVER_NAME, type DriverCategory, type DriverFit } from "@/lib/driver-fit";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

/**
 * Two readings of the same ranking, beside the #1.
 *
 * - **The best of your budget**: the next three earphones, in rank order, whose
 *   stored price sits at the top of the listener's bracket. Only earphones with
 *   a verified price in that currency qualify — nothing is called "under ₹10,000"
 *   on a guess.
 * - **Built for how you listen**: the best-ranked earphone of the driver type the
 *   rule of thumb points to, with the best of every other type a tap away. The
 *   rule of thumb is labelled as one; the earphones are still ordered by measured
 *   response alone.
 */

type BudgetPicksData = NonNullable<Schemas["RecommendationsOut"]["budget_picks"]>;
type DriverPickData = Schemas["DriverPick"];

const EASE = [0.16, 1, 0.3, 1] as const;

function bracketLabel(p: BudgetPicksData) {
  const hi = formatMoney(p.ceiling, p.currency);
  return p.floor > 0 ? `${formatMoney(p.floor, p.currency)} – ${hi}` : `Under ${hi}`;
}

type Shared = {
  saved: Set<string>;
  onSave: (slug: string) => void;
  researched: Set<string>;
  onOpen: (rec: Recommendation) => void;
};

export function BudgetPicks({ picks, ...shared }: { picks: BudgetPicksData } & Shared) {
  if (!picks.items.length) {
    return (
      <p className="mt-16 max-w-xl text-[13px] leading-relaxed text-ink-faint">
        No other earphone with a verified {picks.currency} price sits in {bracketLabel(picks).toLowerCase()}{" "}
        yet, so there is no shortlist for this bracket.
      </p>
    );
  }
  return (
    <section className="mt-24 sm:mt-32" data-section="budget-picks">
      <div className="grid items-end gap-x-16 gap-y-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow eyebrow-rule">
            {picks.basis === "budget" ? "The best of your budget" : "The best of its bracket"}
          </p>
          <h2 className="marquee mt-5 text-[clamp(2.2rem,5vw,4.6rem)]">
            <Lines onView>
              <>{bracketLabel(picks)},</>
              <>
                <em className="voice text-sunset">
                  your top {picks.items.length === 1 ? "pick" : picks.items.length}
                </em>
                .
              </>
            </Lines>
          </h2>
        </div>
        <Reveal delay={0.15}>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-muted lg:pb-2">
            {picks.basis === "budget"
              ? "Near the top of what you said you'd spend, in the order your sound ranks them."
              : "Your #1's price bracket, and the next best inside it."}{" "}
            Only earphones with a verified price count — {picks.priced_in_bracket} of the ranked field are
            priced in this bracket.
          </p>
        </Reveal>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {picks.items.map((rec, i) => (
          <PickCard key={rec.slug} rec={rec} order={i} {...shared} />
        ))}
      </div>
    </section>
  );
}

function PickCard({
  rec,
  order,
  saved,
  onSave,
  researched,
  onOpen,
  tag,
}: { rec: Recommendation; order: number; tag?: string } & Shared) {
  const name = nameParts(rec);
  const why = strengths(rec)[0];
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay: order * 0.09, ease: EASE }}
      className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-white/[0.025] shadow-[inset_0_1px_0_rgb(255_255_255/0.07),inset_0_0_0_1px_rgb(255_255_255/0.06)] transition-[transform,box-shadow] duration-700 ease-(--ease-out-expo) hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_200_160/0.22),0_30px_60px_-34px_rgb(255_120_70/0.55)]"
    >
      <button
        type="button"
        onClick={() => onOpen(rec)}
        className="plinth relative block aspect-[5/4] w-full overflow-hidden text-left"
        aria-label={`${rec.brand} ${rec.model}, in full`}
      >
        <ProductArt
          rec={rec}
          intensity={0.9}
          className="p-[6%] transition-transform duration-1000 ease-(--ease-out-expo) group-hover:scale-[1.04]"
        />
        <span
          className="pointer-events-none absolute top-4 left-5 font-display text-[3.4rem] leading-[0.8] text-transparent"
          style={{ WebkitTextStroke: "1px rgb(238 235 229 / 0.32)" }}
          aria-hidden="true"
        >
          {String(rec.rank).padStart(2, "0")}
        </span>
        <span className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-pit/70 px-3 py-1 text-[11.5px] text-ink backdrop-blur-md">
            <Price price={rec.price} className="text-[11.5px] text-ink" />
          </span>
          {tag && (
            <span className="rounded-full bg-pit/60 px-2.5 py-0.5 text-[10.5px] text-ink-muted backdrop-blur-md">
              {tag}
            </span>
          )}
        </span>
      </button>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-[12px] text-ink-muted">
          {name.lead}
          <span className="text-ink-faint"> · ranked #{rec.rank} for you</span>
        </p>
        <button
          type="button"
          onClick={() => onOpen(rec)}
          className="group/open mt-0.5 flex items-end gap-2 text-left"
        >
          <span className="display truncate text-[1.85rem] leading-[1.08] text-ink">{name.title}</span>
          <ArrowUpRight className="mb-1.5 size-4 shrink-0 text-ink-faint opacity-0 transition-opacity duration-500 group-hover/open:opacity-100" />
        </button>
        {why && (
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-faint">{why.message}</p>
        )}
        <StandingLine rec={rec} className="mt-2" />
        <div className="mt-auto flex items-end justify-between gap-4 pt-5">
          <div className="flex flex-col gap-2.5">
            <RegionDots regions={rec.regions} />
            <span className="text-[11.5px] text-ink-muted">{MATCH_WORD[rec.match]}</span>
          </div>
          <Rating rec={rec} size="sm" />
        </div>
        <div className="mt-5 flex items-center gap-1.5 border-t border-hairline pt-4">
          <RowActions
            rec={rec}
            saved={saved.has(rec.slug)}
            onSave={() => onSave(rec.slug)}
            researched={researched.has(rec.slug)}
          />
        </div>
      </div>
    </motion.article>
  );
}

const ORDER: DriverCategory[] = ["dynamic", "hybrid", "planar", "balanced_armature"];

export function DriverPicks({
  picks,
  fit,
  onRecord,
  eligible,
  ...rest
}: {
  picks: DriverPickData[];
  fit: DriverFit | null;
  /** Ranked earphones whose driver type is on record, and how many were ranked. */
  onRecord: number;
  eligible: number;
} & Shared) {
  const available = ORDER.filter((k) => picks.some((p) => p.category === k));
  const lead: DriverCategory | undefined =
    fit && available.includes(fit.category) ? fit.category : available[0];
  const [chosen, setChosen] = useState<DriverCategory | null>(null);
  const shown = chosen ?? lead;
  const pick = picks.find((p) => p.category === shown);
  if (!pick || !shown) return null;
  const suggested = fit?.category;

  return (
    <section className="mt-24 sm:mt-32" data-section="driver-picks">
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="eyebrow eyebrow-rule">Built for how you listen</p>
          <h2 className="marquee mt-5 text-[clamp(2.2rem,4.6vw,4.2rem)]">
            <Lines onView>
              <>{fit ? "A" : "The best"}</>
              <>
                <em className="voice text-sunset">
                  {DRIVER_NAME[fit?.category ?? shown].toLowerCase()}
                  {(fit?.category ?? shown) === "hybrid" ? " design" : " driver"}
                </em>
                {fit ? " suits you." : " for you."}
              </>
            </Lines>
          </h2>
          {fit ? (
            <Reveal delay={0.1}>
              <div className="mt-7 max-w-lg">
                <p className="text-[15px] leading-relaxed text-ink-muted">
                  {DRIVER_NAME[fit.category]}: {DRIVER_BLURB[fit.category]}.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {fit.because.map((b) => (
                    <li key={b} className="flex gap-3 text-[13.5px] leading-snug text-ink-muted">
                      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-sun" />
                      <span>Because {b}.</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 border-l border-white/15 pl-3 text-[12px] leading-relaxed text-ink-faint">
                  A rule of thumb from how reviewers describe each driver type — not a measurement. How an
                  earphone is built never moves it up or down your ranking; this only reads the ranking by
                  type. Driver type is on record for {onRecord} of the {eligible} earphones ranked, from
                  retailer listings.
                </p>
              </div>
            </Reveal>
          ) : (
            <p className="mt-6 max-w-lg text-[13px] leading-relaxed text-ink-faint">
              Tell AURALS what you play (on the &ldquo;Where does your sound live&rdquo; step) and it will say
              which kind of driver tends to suit it. Meanwhile, the best of each type in your ranking.
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-1.5" role="tablist" aria-label="Driver type">
            {available.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={shown === k}
                onClick={() => setChosen(k)}
                className={cn(
                  "relative rounded-full px-3.5 py-1.5 text-[12px] transition-colors duration-300",
                  shown === k ? "text-ink" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                {shown === k && (
                  <motion.span
                    layoutId="driver-tab"
                    className="absolute inset-0 rounded-full bg-white/[0.08] shadow-[inset_0_0_0_1px_rgb(255_236_222/0.3)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {DRIVER_NAME[k]}
                  {suggested === k && (
                    <span className="size-1.5 rounded-full bg-sun" aria-label="suggested" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pick.item.slug}
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <PickCard
                rec={pick.item}
                order={0}
                tag={`Best ${DRIVER_NAME[shown].toLowerCase()} · of ${pick.ranked}`}
                {...rest}
              />
              <p className="mt-3 text-[11.5px] leading-snug text-ink-faint">{driverLine(pick.item)}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/** What the record says is inside, and where that came from. */
export function driverLine(rec: Recommendation) {
  const config = rec.driver_config as Record<string, unknown> | null | undefined;
  if (!config) return "Driver configuration not recorded.";
  const counts = Object.entries(config)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${v} ${k.replaceAll("_", " ")}`);
  const kinds = Array.isArray(config.kinds)
    ? (config.kinds as string[]).map((k) => k.replaceAll("_", " "))
    : [];
  const inside = counts.length ? counts.join(" + ") : kinds.length ? kinds.join(" + ") : null;
  const where =
    config.source === "retailer-listing" && typeof config.source_url === "string"
      ? ` — per the retailer listing (${new URL(config.source_url).hostname.replace(/^www\./, "")})`
      : "";
  return inside ? `Inside: ${inside}${where}.` : "Driver configuration not recorded.";
}
