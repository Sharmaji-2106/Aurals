"use client";

import { ListenButton } from "@/components/listen/listening";
import { ProductArt, ProductArtCredit } from "@/components/results/product-art";
import type { Recommendation } from "@/lib/api/client";
import { BAND_COLOR, type BandKey } from "@/lib/bands";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { formatSigned } from "@/lib/format";
import { ArrowUpRight, Bookmark, BookOpen } from "lucide-react";
import { animate, AnimatePresence, motion, useInView } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The recommendation showcase.
 *
 * Everything said here comes from the engine's own output: the ranked order, the
 * predicted preference with its interval, the region-by-region reasons it
 * generated from computed numbers, and the measurement each one rests on.
 * Nothing about comfort, build or soundstage is claimed, because nothing in the
 * data supports it.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export const MATCH_WORD: Record<Recommendation["match"], string> = {
  close: "Close match",
  good: "Good match",
  partial: "Partial match",
  poor: "Poor match",
};

type Region = Recommendation["regions"][number];

/** Each scoring region takes the colour of the band at its heart. */
const REGION_BAND: Record<Region["region"], BandKey> = {
  bass: "mid_bass",
  lower_mids: "lower_mids",
  vocals: "upper_mids",
  treble: "lower_treble",
  air: "air",
};

const FIT_WORD: Record<Region["fit"], string> = {
  within: "inside your range",
  above: "above your range",
  below: "below your range",
  unreliable: "not measured reliably",
};

/**
 * A name in two parts: who made it, and what it is called.
 *
 * The catalogue stores a collaboration as a brand plus a model that begins
 * "x Partner …". Set as a headline that leaves a model starting with a stray
 * "x", so the multiplication sign moves up to sit with the maker instead.
 */
export function nameParts(rec: { brand: string; model: string }) {
  const collab = /^x\s+(.+)$/i.exec(rec.model);
  return collab ? { lead: `${rec.brand} ×`, title: collab[1] } : { lead: rec.brand, title: rec.model };
}

/** Why it caught your ear: the regions the engine found agreement in. */
export const strengths = (rec: Recommendation) => rec.reasons.filter((r) => r.kind === "match");
/** Good to know: where it departs, plus anything the engine flagged. */
export const tradeoffs = (rec: Recommendation) =>
  rec.reasons.filter((r) => r.kind === "mismatch" || r.kind === "note");

export function Price({ price, className }: { price: Recommendation["price"]; className?: string }) {
  return (
    <span className={cn("numeric text-[12px] text-ink-faint", className)}>
      {price ? formatMoney(Number(price.amount), price.currency) : "no verified price"}
    </span>
  );
}

function SaveButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] transition-[background-color,box-shadow,color] duration-500",
        on
          ? "bg-ember/12 text-ink shadow-[inset_0_0_0_1px_rgb(255_107_61/0.55)]"
          : "text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13)] hover:bg-white/[0.05] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)]",
      )}
    >
      <Bookmark
        className={cn("size-3.5 transition-transform duration-500", on && "scale-110 fill-current")}
      />
      {on ? "Saved" : label}
    </button>
  );
}

/* ------------------------------------------------------- shared readouts --- */

/**
 * The predicted preference as a figure and the interval it sits in.
 *
 * The bar is the model's whole 0–100 scale, so the width of the lit segment is
 * the real width of the interval and its position is where it really falls.
 */
export function Rating({ rec, size = "lg" }: { rec: Recommendation; size?: "lg" | "sm" }) {
  const p = rec.predicted_preference;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return (
    <div className={cn("min-w-0", size === "sm" && "w-28")}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "numeric leading-none tracking-[-0.03em] text-ink",
            size === "lg" ? "text-[3.25rem]" : "text-[1.375rem]",
          )}
        >
          {size === "lg" ? <CountUp value={p.mean} /> : p.mean.toFixed(1)}
        </span>
        {size === "lg" && <span className="numeric text-[11px] text-ink-faint">of 100</span>}
      </div>
      <div
        className={cn("relative h-px bg-white/12", size === "lg" ? "mt-4" : "mt-2")}
        role="img"
        aria-label={`Rated ${p.mean.toFixed(1)}, with an interval of ${p.low.toFixed(1)} to ${p.high.toFixed(1)}`}
      >
        <motion.span
          className="absolute -top-px h-[3px] origin-left rounded-full bg-linear-to-r from-ember to-band-mids"
          style={{ left: `${clamp(p.low)}%`, width: `${clamp(p.high) - clamp(p.low)}%` }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
        />
        <span className="absolute -top-[5px] h-[11px] w-px bg-ink" style={{ left: `${clamp(p.mean)}%` }} />
      </div>
      {size === "lg" && (
        <p className="numeric mt-2.5 text-[11px] text-ink-faint">
          {p.low.toFixed(1)}–{p.high.toFixed(1)} interval
        </p>
      )}
    </div>
  );
}

/**
 * How the measured response sits against the listener's target, region by region.
 *
 * Each track is centred on the target. The shaded span is the range the
 * listener's evidence allows (± tolerance); the marker is where the earphone
 * was measured to land. Inside the span is agreement, outside it is a
 * compromise — the same figures as the table in the technical view, drawn so
 * the answer can be read without reading numbers.
 */
function RegionFit({ regions }: { regions: Region[] }) {
  const reach = Math.max(3, ...regions.map((r) => Math.max(Math.abs(r.error_db ?? 0), r.tolerance_db) * 1.3));
  const pos = (db: number) => 50 + (Math.max(-reach, Math.min(reach, db)) / reach) * 50;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Against your target</p>
        <p className="numeric text-[10px] tracking-[0.08em] text-ink-faint">
          −{reach.toFixed(0)} dB · target · +{reach.toFixed(0)} dB
        </p>
      </div>
      <ul className="mt-4 flex flex-col">
        {regions.map((region, i) => {
          const color = BAND_COLOR[REGION_BAND[region.region]];
          const known = region.error_db != null && region.fit !== "unreliable";
          const inside = region.fit === "within";
          return (
            <li key={region.region} className="border-t border-hairline py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="flex items-center gap-2.5 text-[13px] text-ink">
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                  {region.label}
                </span>
                <span className="flex items-baseline gap-3 text-[12px]">
                  <span className="numeric text-ink-muted">
                    {region.error_db == null ? "—" : `${formatSigned(region.error_db)} dB`}
                  </span>
                  <span
                    className={cn(
                      "w-[8.75rem] text-right",
                      inside || region.fit === "unreliable" ? "text-ink-faint" : "text-warn",
                    )}
                  >
                    {FIT_WORD[region.fit]}
                  </span>
                </span>
              </div>
              <span className="relative mt-2 block h-4" aria-hidden="true">
                <span className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                {/* The range the evidence allows. */}
                <span
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${pos(-region.tolerance_db)}%`,
                    width: `${pos(region.tolerance_db) - pos(-region.tolerance_db)}%`,
                    background: `color-mix(in oklab, ${color} 22%, transparent)`,
                  }}
                />
                <span className="absolute top-1/2 left-1/2 h-3.5 w-px -translate-y-1/2 bg-white/35" />
                {known && (
                  <motion.span
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background: inside ? color : "#08080a",
                      boxShadow: inside
                        ? `0 0 0 3px color-mix(in oklab, ${color} 20%, transparent)`
                        : "inset 0 0 0 1.5px var(--color-warn)",
                    }}
                    initial={{ left: "50%", opacity: 0 }}
                    whileInView={{ left: `${pos(region.error_db!)}%`, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.1, delay: 0.25 + i * 0.07, ease: EASE }}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Five marks, one per region: lit where the earphone lands inside the listener's range. */
export function RegionDots({ regions, className }: { regions: Region[]; className?: string }) {
  const inside = regions.filter((r) => r.fit === "within").length;
  return (
    <span
      className={cn("flex items-center gap-1.5", className)}
      role="img"
      aria-label={`${inside} of ${regions.length} regions inside your range`}
    >
      {regions.map((region) => {
        const color = BAND_COLOR[REGION_BAND[region.region]];
        return (
          <span
            key={region.region}
            title={`${region.label}: ${FIT_WORD[region.fit]}`}
            className="h-3 w-[3px] rounded-full"
            style={
              region.fit === "within"
                ? { background: color }
                : region.fit === "unreliable"
                  ? { background: "rgb(255 255 255 / 0.1)" }
                  : { background: "transparent", boxShadow: "inset 0 0 0 1px var(--color-warn)" }
            }
          />
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------ spotlight --- */

/**
 * The strongest match, given the room a product reveal deserves. Its portrait is
 * its own measured response — see `iem-portrait` for why that is the honest
 * image to show.
 */
export function Spotlight({
  rec,
  saved,
  onSave,
  hasEvidence,
  artLayoutId,
  className,
}: {
  rec: Recommendation;
  saved: boolean;
  onSave: () => void;
  hasEvidence: boolean;
  /**
   * Shared with the discovery sequence's hero. When both ends carry the same
   * id, motion measures the two positions and moves the artwork between them,
   * so the earphone the sequence revealed arrives here rather than being
   * replaced by a copy of itself.
   */
  artLayoutId?: string;
  className?: string;
}) {
  const why = strengths(rec).slice(0, 3);
  const caveat = tradeoffs(rec)[0];
  const name = nameParts(rec);

  return (
    <section className={cn("relative", className)}>
      <div className="grid items-start gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The object, on its plinth. Light falls from above; the body is the curve. */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 1.2, ease: EASE }}
          className="relative min-w-0 lg:sticky lg:top-28"
        >
          <motion.div
            layoutId={artLayoutId}
            data-art={rec.slug}
            className="plinth relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] sm:aspect-[5/4]"
          >
            <ProductArt rec={rec} />
          </motion.div>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6 sm:p-8">
            <span
              className="font-display text-[clamp(3.5rem,7vw,6rem)] leading-[0.8] text-transparent"
              style={{ WebkitTextStroke: "1px rgb(238 235 229 / 0.3)" }}
              aria-hidden="true"
            >
              01
            </span>
            <span className="numeric text-right text-[10px] leading-relaxed tracking-[0.14em] text-ink-faint uppercase">
              Measured by
              <br />
              <span className="text-ink-muted">{rec.measurement.source}</span>
              {rec.measurement.converted_to && (
                <>
                  <br />
                  <span className="text-ink-faint">converted from a clone coupler</span>
                </>
              )}
            </span>
          </div>
          {!rec.image && (
            <p className="mt-3 text-[11px] leading-snug text-ink-faint">
              Drawn from its measured frequency response: bass at the base, air at the crown.
            </p>
          )}
          <ProductArtCredit rec={rec} className="mt-3" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 1.2, delay: 0.12, ease: EASE }}
          className="flex min-w-0 flex-col lg:pt-4"
        >
          <p className="eyebrow eyebrow-rule">Your strongest match</p>
          <h2 className="marquee mt-6 text-[clamp(3rem,6.2vw,6rem)]">
            <span className="block text-[0.42em] leading-[1.1] tracking-[-0.01em] text-ink-muted">
              {name.lead}
            </span>
            <em className="voice text-sunset">{name.title}</em>
          </h2>

          <div className="mt-9 flex flex-wrap items-end gap-x-10 gap-y-6">
            <Rating rec={rec} />
            <div className="flex flex-col gap-1.5 pb-[1.6rem]">
              <span className="text-[15px] text-ink">{MATCH_WORD[rec.match]}</span>
              <Price price={rec.price} />
            </div>
          </div>
          <StandingLine rec={rec} className="mt-5" />

          <div className="mt-10">
            <RegionFit regions={rec.regions} />
          </div>

          {why.length > 0 && (
            <div className="mt-9">
              <p className="eyebrow">Why it fits</p>
              <ul className="mt-4 flex flex-col gap-3.5">
                {why.map((reason, i) => (
                  <li key={i} className="flex gap-3.5 text-[14px] leading-relaxed text-ink-muted">
                    <span
                      className="mt-[0.62em] h-px w-4 shrink-0"
                      style={{
                        background: reason.region
                          ? BAND_COLOR[REGION_BAND[reason.region]]
                          : "var(--color-band-presence)",
                      }}
                    />
                    {reason.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {caveat && (
            <p className="mt-7 border-l border-warn/40 pl-4 text-[13px] leading-relaxed text-ink-faint">
              <span className="text-ink-muted">Good to know.</span> {caveat.message}
            </p>
          )}

          <div className="mt-9 flex flex-wrap items-center gap-2.5">
            <ListenButton slug={rec.slug} label={`${rec.brand} ${rec.model}`} variant="solid" />
            <SaveButton on={saved} onToggle={onSave} label="Save this" />
            {hasEvidence && (
              <Link
                href={`/research/${rec.slug}`}
                className="flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.13)] transition-[background-color,box-shadow,color] duration-500 hover:bg-white/[0.05] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)]"
              >
                <BookOpen className="size-3.5" /> What reviewers said
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- collection --- */

/**
 * The rest of the ranking, as an index beside a single stage.
 *
 * A grid of nine identical cards made every earphone look like every other. As
 * a list they can be read down like a ranking — name, verdict, figure — and the
 * one you are pointing at takes the stage beside it at full size, so there is
 * one portrait to study rather than nine to glance at. On a narrow screen there
 * is no room for a stage, so each row carries its own small portrait instead.
 */
export function Collection({
  items,
  saved,
  onSave,
  researched,
  onOpen,
  openId,
}: {
  items: Recommendation[];
  saved: Set<string>;
  onSave: (slug: string) => void;
  researched: Set<string>;
  onOpen: (rec: Recommendation) => void;
  openId: string | null;
}) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const active = items.find((r) => r.slug === activeSlug) ?? items[0];
  if (!active) return null;
  const activeName = nameParts(active);

  return (
    <div className="grid gap-x-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
      {/* The stage: one portrait, the row in hand. */}
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <div className="plinth relative aspect-[4/5] max-h-[calc(100vh-15rem)] w-full overflow-hidden rounded-[2rem]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={active.slug}
                initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 1.03, filter: "blur(8px)" }}
                transition={{ duration: 0.7, ease: EASE }}
                className="absolute inset-0"
              >
                <ProductArt rec={active} className="p-[4%]" />
              </motion.div>
            </AnimatePresence>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-7">
              <span
                className="font-display text-[4.5rem] leading-[0.8] text-transparent"
                style={{ WebkitTextStroke: "1px rgb(238 235 229 / 0.3)" }}
                aria-hidden="true"
              >
                {String(active.rank).padStart(2, "0")}
              </span>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-linear-to-t from-pit/90 to-transparent p-7 pt-16">
              <div className="min-w-0">
                <p className="truncate text-[12px] text-ink-muted">{activeName.lead}</p>
                <p className="display truncate text-[1.75rem] leading-tight text-ink">{activeName.title}</p>
              </div>
              <RegionDots regions={active.regions} className="mb-2 shrink-0" />
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-faint">
            {active.image
              ? "A photograph, graded into the page's palette."
              : "Drawn from its measured frequency response."}{" "}
            Measured by {active.measurement.source}
            {active.measurement.converted_to ? ", converted from a clone coupler" : ""}.
          </p>
        </div>
      </div>

      {/* The index. */}
      <ul className="border-t border-hairline" onPointerLeave={() => setActiveSlug(null)}>
        {items.map((rec, i) => {
          const why = strengths(rec)[0];
          const caveat = tradeoffs(rec)[0];
          const open = openId === rec.slug;
          const on = active.slug === rec.slug;
          const name = nameParts(rec);
          return (
            <motion.li
              key={rec.iem_id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.8, delay: Math.min(i, 5) * 0.05, ease: EASE }}
              onPointerEnter={() => setActiveSlug(rec.slug)}
              onFocusCapture={() => setActiveSlug(rec.slug)}
              className="group relative border-b border-hairline"
            >
              {/* The row in hand is marked by a rule that draws in, not by a box. */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 hidden w-px origin-top bg-ember transition-transform duration-700 ease-(--ease-out-expo) lg:block",
                  on ? "scale-y-100" : "scale-y-0",
                )}
              />
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 py-6 transition-[padding] duration-700 ease-(--ease-out-expo) sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-x-6 lg:grid-cols-[3rem_minmax(0,1fr)_auto] lg:py-7 lg:group-focus-within:pl-5 lg:group-hover:pl-5">
                {/* Narrow screens: the portrait travels with the row. */}
                <div className="plinth relative aspect-square w-full overflow-hidden rounded-xl lg:hidden">
                  <ProductArt rec={rec} intensity={0.85} animate={false} className="p-[2%]" />
                </div>
                <span
                  className={cn(
                    "numeric hidden pt-2 text-[12px] tracking-[0.16em] transition-colors duration-500 lg:block",
                    on ? "text-ember" : "text-ink-faint",
                  )}
                >
                  {String(rec.rank).padStart(2, "0")}
                </span>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(rec)}
                    aria-expanded={open}
                    className="group/open flex max-w-full items-end gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2.5 text-[12px] text-ink-muted">
                        <span className="numeric text-[11px] tracking-[0.16em] text-ink-faint lg:hidden">
                          {String(rec.rank).padStart(2, "0")}
                        </span>
                        <span className="truncate">{name.lead}</span>
                      </span>
                      <span className="display block truncate text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.08] text-ink">
                        {name.title}
                      </span>
                    </span>
                    <ArrowUpRight className="mb-2 size-4 shrink-0 text-ink-faint opacity-0 transition-[opacity,transform] duration-500 group-hover/open:translate-x-0.5 group-hover/open:-translate-y-0 group-hover/open:opacity-100 group-focus-visible/open:opacity-100" />
                  </button>
                  {why && (
                    <p className="mt-2.5 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-ink-faint">
                      {why.message}
                    </p>
                  )}
                  <StandingLine rec={rec} compact className="mt-1.5" />
                  {open && caveat && (
                    <p className="mt-2 max-w-xl border-l border-warn/40 pl-3 text-[12px] leading-relaxed text-ink-faint">
                      {caveat.message}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 sm:hidden">
                    <Rating rec={rec} size="sm" />
                    <span className="text-[12px] text-ink-muted">{MATCH_WORD[rec.match]}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <RegionDots regions={rec.regions} />
                    <Price price={rec.price} />
                    <span className="ml-auto flex items-center gap-1.5 sm:hidden">
                      <RowActions
                        rec={rec}
                        saved={saved.has(rec.slug)}
                        onSave={() => onSave(rec.slug)}
                        researched={researched.has(rec.slug)}
                      />
                    </span>
                  </div>
                </div>

                <div className="hidden flex-col items-end gap-4 sm:flex">
                  <div className="flex items-start gap-6">
                    <span className="pt-1 text-[12px] whitespace-nowrap text-ink-muted">
                      {MATCH_WORD[rec.match]}
                    </span>
                    <Rating rec={rec} size="sm" />
                  </div>
                  <span className="flex items-center gap-1.5">
                    <RowActions
                      rec={rec}
                      saved={saved.has(rec.slug)}
                      onSave={() => onSave(rec.slug)}
                      researched={researched.has(rec.slug)}
                    />
                  </span>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export function RowActions({
  rec,
  saved,
  onSave,
  researched,
}: {
  rec: Recommendation;
  saved: boolean;
  onSave: () => void;
  researched: boolean;
}) {
  return (
    <>
      <ListenButton
        slug={rec.slug}
        label={`${rec.brand} ${rec.model}`}
        className="bg-white/[0.04] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:bg-white/[0.08] hover:text-ink"
      />
      {researched && (
        <Link
          href={`/research/${rec.slug}`}
          aria-label={`What reviewers said about the ${rec.brand} ${rec.model}`}
          className="grid size-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <BookOpen className="size-3.5" />
        </Link>
      )}
      <SaveButton on={saved} onToggle={onSave} label="Save" />
    </>
  );
}

/**
 * Community standing, said in full: who recommends it (linked), how widely it is
 * stocked, and what that added to the ranking. Never folded silently into the
 * measured number beside it.
 */
export function StandingLine({
  rec,
  className,
  compact = false,
}: {
  rec: Recommendation;
  className?: string;
  compact?: boolean;
}) {
  const st = rec.standing;
  if (!st || (st.points <= 0 && !st.mentions.length)) return null;
  const publishers = [...new Set(st.mentions.map((m) => m.publisher.replace(/ \(store blog\)$/, "")))];
  return (
    <p className={cn("text-[12px] leading-relaxed text-ink-faint", className)}>
      {st.mentions.length > 0 && (
        <>
          <span className="text-ink-muted">Recommended by </span>
          {publishers.map((p, i) => {
            const m = st.mentions.find((x) => x.publisher.startsWith(p))!;
            return (
              <span key={p}>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={`${m.title}${m.published_on ? ` (${m.published_on})` : ""}: \u201c${m.note}\u201d`}
                  className="text-ink-muted underline decoration-white/20 underline-offset-4 transition-colors hover:text-ink hover:decoration-white/60"
                >
                  {p}
                </a>
                {i < publishers.length - 1 ? ", " : ""}
              </span>
            );
          })}
          {!compact && " · "}
        </>
      )}
      {!compact && (
        <>
          {st.stores > 0 ? `stocked by ${st.stores} ${st.stores === 1 ? "store" : "stores"} · ` : ""}
          <span title="Community standing: added to the measured match, at most 3 points">
            +{st.points.toFixed(1)} standing
          </span>
        </>
      )}
    </p>
  );
}

/** The match score, arriving: counts up from zero the first time it is seen. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-15% 0px" });
  useEffect(() => {
    if (!seen || !ref.current) return;
    const el = ref.current;
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = v.toFixed(1)),
    });
    return () => controls.stop();
  }, [seen, value]);
  return <span ref={ref}>{value.toFixed(1)}</span>;
}
