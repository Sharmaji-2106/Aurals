"use client";

import { shortfall, type Run } from "@/components/discovery/acts";
import { nameParts } from "@/components/results/recommendations";
import { Lines, Reveal } from "@/components/site/reveal";
import { ButtonLink } from "@/components/ui/button";
import type { Recommendation } from "@/lib/api/client";
import { useReviews } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

/**
 * The listening community.
 *
 * Measurements say what an earphone does; they do not say what it is like to
 * own. This section carries the other half. It follows the music fingerprint,
 * so the page reads: the earphones, why (your music), then what owners say.
 *
 * Three rules it does not bend:
 *
 * - Coverage is stated, never implied. If two of nine ranked earphones have
 *   been researched, it says two of nine.
 * - A single person's opinion is never dressed as consensus. Counts are shown
 *   as counts, and a topic only reads as contested when sources genuinely
 *   disagree.
 * - None of it moves the ranking. That comes from measured response against
 *   the listener's target, and nothing else — said plainly, because it is the
 *   natural thing to assume otherwise.
 */

type Collection = { slug: string; brand: string; model: string; sources: number };

export function EvidenceGallery({
  collections,
  showcaseSlug,
  ranked,
  run,
  className,
}: {
  collections: Collection[];
  showcaseSlug: string | null;
  ranked: Recommendation[];
  run?: Run;
  className?: string;
}) {
  const covered = new Set(collections.map((c) => c.slug));
  const inYourList = ranked.filter((r) => covered.has(r.slug));
  const totalSources = collections.reduce((sum, c) => sum + c.sources, 0);
  const note = shortfall(run);

  // Only the earphones matched to this listener: what owners say about anything
  // else is beside the point here (the full research lives at /research).
  const mine = inYourList.slice(0, 3);
  const showcase =
    collections.find(
      (c) => c.slug === showcaseSlug && covered.has(c.slug) && inYourList.some((r) => r.slug === c.slug),
    ) ??
    collections.find((c) => c.slug === inYourList[0]?.slug) ??
    null;

  if (!inYourList.length && !note) return null;

  // None of the earphones matched here has been reviewed yet: one honest line,
  // not a large empty section about other earphones.
  if (!inYourList.length) {
    return (
      <section className={cn("shell", className)} data-section="community">
        <div className="flex flex-col gap-3 border-y border-hairline py-8 sm:flex-row sm:items-baseline sm:gap-10">
          <p className="eyebrow shrink-0">What owners say</p>
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            None of the {ranked.length} earphones matched to you has gathered owner reviews in AURALS yet, so
            this page rests on measurement alone. {note ?? ""}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("relative", className)} data-section="community">
      <div className="shell">
        <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow eyebrow-rule">Beyond the measurements</p>
            <h2 className="marquee mt-6 text-[clamp(2.6rem,6.2vw,6rem)]">
              <Lines onView>
                <>The listening</>
                <>
                  <em className="voice text-sunset">community</em>.
                </>
              </Lines>
            </h2>
          </div>
          <Reveal delay={0.15}>
            <p className="max-w-sm text-[14px] leading-relaxed text-ink-muted lg:pb-3">
              A measurement says what an earphone does. It does not say what it is like to live with. For
              that, AURALS keeps what people actually wrote — quoted as they wrote it, linked to the original,
              with the disagreements left in.
            </p>
          </Reveal>
        </div>

        {note && (
          <p className="mt-10 max-w-2xl border-l border-warn/40 pl-5 text-[13px] leading-relaxed text-ink-muted">
            {note}
          </p>
        )}

        {/* What owners said about the earphones in this listener's own list. */}
        {mine.length > 0 && (
          <div className="mt-16 flex flex-col gap-20 sm:mt-24 sm:gap-28">
            {mine.map((rec, i) => (
              <CommunityProduct key={rec.slug} rec={rec} index={i} />
            ))}
          </div>
        )}

        {/* Coverage, and the thing it is easy to assume and wrong. */}
        <div className="mt-20 grid gap-x-16 gap-y-12 sm:mt-28 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="eyebrow">How far this goes</p>
            <dl className="mt-6 grid grid-cols-1 gap-x-10 sm:grid-cols-3">
              <Figure
                value={`${collections.length}`}
                of="earphones in the catalogue"
                note="have gathered discussion or published reviews so far"
              />
              <Figure
                value={`${inYourList.length}`}
                of={`of the ${ranked.length} ranked for you`}
                note={
                  inYourList.length
                    ? "are covered — the rest are ranked on measurement alone"
                    : "are covered yet, so your ranking rests on measurement alone"
                }
              />
              <Figure
                value={`${totalSources}`}
                of="sources"
                note="kept with their author, date and a link to the original"
              />
            </dl>
            <p className="mt-8 max-w-xl text-[12px] leading-relaxed text-ink-faint">
              What owners write is shown beside the ranking, never inside it. The ranking is the measured
              response against your target; the only other thing that can touch it is community standing — how
              widely an earphone is stocked and recommended in published roundups — which adds at most three
              points, and is shown wherever it does.
            </p>
          </div>

          {showcase && (
            <aside className="surface relative min-w-0 self-start overflow-hidden rounded-[1.75rem] p-8 sm:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-1/2 -right-1/4 size-[90%] rounded-full blur-3xl"
                style={{ background: "radial-gradient(closest-side, rgb(255 122 58 / 0.14), transparent)" }}
              />
              <p className="eyebrow relative">Read in depth</p>
              <h3 className="display relative mt-5 text-[clamp(2rem,3.4vw,3rem)] leading-[0.95]">
                <span className="block text-[0.5em] leading-[1.2] text-ink-muted">
                  {nameParts(showcase).lead}
                </span>
                <em className="text-ember-soft">{nameParts(showcase).title}</em>
              </h3>
              <p className="relative mt-4 text-[14px] leading-relaxed text-ink-muted">
                {plural(showcase.sources, "source")} gathered and quoted, grouped by what they discuss and
                where they disagree.
              </p>
              <ButtonLink href={`/research/${showcase.slug}`} className="relative mt-8">
                Open the evidence <ArrowRight className="size-4" />
              </ButtonLink>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- per product --- */

function CommunityProduct({ rec, index }: { rec: Recommendation; index: number }) {
  const reviews = useReviews(rec.slug);
  const [open, setOpen] = useState(index === 0);

  if (reviews.isPending || !reviews.data) return null;
  const { topics } = reviews.data;
  // Someone's own experience leads; a thread asking for advice never does.
  const sources = [...reviews.data.sources].sort((a, b) => firstHand(b) - firstHand(a));
  if (!sources.length) return null;

  const subreddits = [
    ...new Set(
      sources
        .filter((s) => s.kind === "reddit")
        .map((s) => s.publication)
        .filter(Boolean),
    ),
  ];
  const contested = topics.filter((t) => t.contested);
  const liked = topics.filter((t) => t.positive > 0 && !t.contested);
  const criticised = topics.filter((t) => t.negative > 0 && !t.contested);
  const shown = open ? sources : sources.slice(0, 2);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="grid min-w-0 gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]"
    >
      {/* The margin: which earphone, where it was discussed, and the tally. */}
      <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
        <p className="folio">
          <span className="text-ember">{String(rec.rank).padStart(2, "0")}</span>
          <span className="mx-2 text-ink-faint/50">/</span>
          {plural(sources.length, "discussion")} kept
        </p>
        <h3 className="display mt-5 text-[clamp(2rem,3.6vw,3.25rem)] leading-[0.95]">
          <span className="block text-[0.46em] leading-[1.2] text-ink-muted">{nameParts(rec).lead}</span>
          <em className="text-ember-soft">{nameParts(rec).title}</em>
        </h3>

        {subreddits.length > 0 && (
          <p className="numeric mt-5 text-[11px] leading-relaxed tracking-[0.04em] text-ink-faint">
            {subreddits.slice(0, 8).join("  ·  ")}
          </p>
        )}

        {/* What came up repeatedly, and where people split. Counts are counts. */}
        {(liked.length > 0 || criticised.length > 0 || contested.length > 0) && (
          <div className="mt-8 flex flex-col gap-6">
            <TopicList title="What owners appreciate" topics={liked} tone="good" />
            <TopicList title="What owners criticise" topics={criticised} tone="bad" />
            <TopicList title="Where they disagree" topics={contested} tone="split" />
          </div>
        )}
      </div>

      {/* The column: what was written, in the order it was kept. */}
      <div className="min-w-0">
        <ul className="border-t border-hairline">
          {shown.map((source, i) => (
            <li
              key={source.id}
              className="group grid gap-x-8 gap-y-2 border-b border-hairline py-7 sm:grid-cols-[8.5rem_minmax(0,1fr)]"
            >
              <div className="numeric flex flex-row flex-wrap gap-x-3 gap-y-0.5 text-[10px] leading-relaxed tracking-[0.06em] text-ink-faint sm:flex-col sm:pt-1.5">
                <span className="text-ink-muted">{source.publication}</span>
                {source.author && <span className="truncate">{source.author}</span>}
                {source.published_on && <span>{source.published_on}</span>}
              </div>
              <div className="min-w-0">
                {source.claims.length > 0 ? (
                  <ul className="flex flex-col gap-4">
                    {source.claims.slice(0, 2).map((claim) => (
                      <li key={claim.id}>
                        <p className="flex items-center gap-2 text-[11px] text-ink-faint">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              claim.stance === "positive" && "bg-band-presence",
                              claim.stance === "negative" && "bg-warn",
                              claim.stance === "mixed" && "bg-ink-faint",
                            )}
                          />
                          {claim.topic_label}
                        </p>
                        <Quote lead={i === 0 && !asking(source)}>{claim.quote}</Quote>
                      </li>
                    ))}
                  </ul>
                ) : source.excerpt ? (
                  <Quote lead={i === 0 && !asking(source)}>{source.excerpt}</Quote>
                ) : null}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-4 inline-flex max-w-full items-start gap-1.5 text-[13px] leading-snug text-ink-muted transition-colors hover:text-ink"
                >
                  <span className="link-draw min-w-0 pb-0.5">{source.title}</span>
                  <ArrowUpRight className="mt-[0.15em] size-3.5 shrink-0 text-ink-faint transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>

        {sources.length > 2 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-5 flex items-center gap-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronDown className={cn("size-4 transition-transform duration-500", open && "rotate-180")} />
            {open ? "Show fewer" : `All ${sources.length} discussions`}
          </button>
        )}
      </div>
    </motion.article>
  );
}

type Source = NonNullable<ReturnType<typeof useReviews>["data"]>["sources"][number];

/** A thread that asks for advice rather than giving an opinion. */
function asking(s: Source) {
  const title = s.title ?? "";
  return /\?\s*$/.test(title) || /\b(recommend|suggest|which (one|iem)|should i|help me)\b/i.test(title);
}

/**
 * How plainly a source is an owner's own experience. Ordering only: nothing is
 * hidden, and every source stays one tap away.
 */
function firstHand(s: Source) {
  const text = `${s.title ?? ""} ${s.excerpt ?? ""}`;
  let score = s.claims.length > 0 ? 3 : 0;
  if (
    /\b(review|impressions?|thoughts|experience|after \d+ (days|weeks|months)|i('ve| have) (bought|owned|been using))\b/i.test(
      text,
    )
  )
    score += 2;
  if (asking(s)) score -= 3;
  return score;
}

/**
 * Somebody's own words. The first quote of a spread is set at reading size in
 * the display face; the rest stay quiet so the page reads as one voice leading
 * and others following, rather than as a wall of equal boxes.
 */
function Quote({ children, lead }: { children: string; lead: boolean }) {
  return (
    <blockquote
      className={cn(
        "mt-2",
        lead
          ? "font-display text-[clamp(1.4rem,2.1vw,1.85rem)] leading-[1.22] text-ink"
          : "text-[15px] leading-relaxed text-ink-muted",
      )}
    >
      &ldquo;{children}&rdquo;
    </blockquote>
  );
}

function TopicList({
  title,
  topics,
  tone,
}: {
  title: string;
  topics: { slug: string; label: string; positive: number; negative: number; mixed: number }[];
  tone: "good" | "bad" | "split";
}) {
  if (!topics.length) return null;
  return (
    <div className="min-w-0">
      <p className="eyebrow">{title}</p>
      <ul className="mt-3 flex flex-col">
        {topics.slice(0, 4).map((topic) => (
          <li
            key={topic.slug}
            className="flex items-baseline justify-between gap-3 border-t border-hairline py-2 text-[13px]"
          >
            <span className="text-ink-muted">{topic.label}</span>
            <span className="numeric shrink-0 text-[11px] text-ink-faint">
              {tone === "good" && `${topic.positive}`}
              {tone === "bad" && `${topic.negative}`}
              {tone === "split" && `${topic.positive}/${topic.negative}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Figure({ value, of, note }: { value: string; of: string; note: string }) {
  return (
    <div className="border-t border-hairline py-6">
      <dt className="display text-[clamp(3.5rem,6vw,5.5rem)] leading-[0.85] text-ink">{value}</dt>
      <dd className="mt-4 min-w-0">
        <span className="block text-[13px] text-ink-muted">{of}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-faint">{note}</span>
      </dd>
    </div>
  );
}
