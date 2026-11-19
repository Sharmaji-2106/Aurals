"use client";

import type { Ranked, ResearchTally, Run, RunEvent } from "@/components/discovery/acts";
import { cn } from "@/lib/cn";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

/**
 * The community investigation, as it happens.
 *
 * Everything on screen is read out of an event payload: the query string is
 * the query that was issued, the subreddits are the ones the results came
 * from, the titles are real thread titles, and the counts are sums of what was
 * actually kept. Nothing is projected forward and there is no progress bar,
 * because the number of discussions that exist about an earphone is not
 * knowable before looking.
 *
 * Rejected results are shown as a count too. A search that returned six
 * threads and kept none is a true and interesting thing to say — it is the
 * relevance filter refusing to attribute someone's opinion about one earphone
 * to a different one.
 */

type Card = {
  key: string;
  slug: string;
  title: string;
  subreddits: string[];
  kept: number;
  rejected: number;
};

function cards(run: Run | undefined): Card[] {
  if (!run) return [];
  const out: Card[] = [];
  for (const event of run.events) {
    if (event.stage !== "posts_found") continue;
    const p = event.payload ?? {};
    const titles = Array.isArray(p.titles) ? p.titles.filter((t) => typeof t === "string") : [];
    const subs = Array.isArray(p.subreddits)
      ? p.subreddits.filter((s): s is string => typeof s === "string")
      : [];
    titles.forEach((title, i) => {
      out.push({
        key: `${event.seq}-${i}`,
        slug: typeof p.slug === "string" ? p.slug : "",
        title: title as string,
        subreddits: subs,
        kept: typeof p.kept === "number" ? p.kept : 0,
        rejected: typeof p.rejected === "number" ? p.rejected : 0,
      });
    });
  }
  return out.slice(-6);
}

export function ResearchFeed({
  run,
  counts,
  ranking,
  note,
}: {
  run: Run | undefined;
  counts: ResearchTally;
  ranking: Ranked[];
  note: string | null;
}) {
  const feed = useMemo(() => cards(run), [run]);
  const rejected = useMemo(() => rejectedTotal(run), [run]);
  const current = ranking.find((r) => r.slug === counts.currentSlug);

  return (
    <div className="mt-10 grid min-h-0 flex-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
      {/* What is being asked, right now. */}
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.28em] text-ink-faint uppercase">Searching for</p>
        <AnimatePresence mode="wait">
          <motion.p
            key={current?.slug ?? "none"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5 }}
            className="display mt-2 text-[clamp(1.3rem,2.4vw,1.9rem)] leading-tight"
          >
            {current ? (
              <>
                {current.brand} <em className="text-ember-soft">{current.model}</em>
              </>
            ) : (
              "Opening the search"
            )}
          </motion.p>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {counts.currentQuery && (
            <motion.p
              key={counts.currentQuery}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="mt-5 font-mono text-[12px] break-words text-band-presence sm:text-[13px]"
            >
              {counts.currentQuery}
              <motion.span
                aria-hidden="true"
                animate={{ opacity: [1, 0.15, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
                className="ml-1 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-band-presence"
              />
            </motion.p>
          )}
        </AnimatePresence>

        {counts.subreddits.length > 0 && (
          <div className="mt-7">
            <p className="font-mono text-[10px] tracking-[0.28em] text-ink-faint uppercase">
              Communities reached
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {counts.subreddits.slice(0, 10).map((sub) => (
                <motion.li
                  key={sub}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-full border border-hairline-strong px-2.5 py-1 text-[11px] text-ink-muted"
                >
                  r/{sub}
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-6 sm:grid-cols-4 lg:grid-cols-2">
          <Count value={counts.queriesIssued} label="searches run" />
          <Count value={counts.postsKept} label="discussions kept" />
          <Count value={rejected} label="set aside as a different product" />
          <Count value={counts.commentsRead} label="replies read" />
        </dl>

        {note && (
          <p className="mt-7 border-l border-warn/40 pl-4 text-[12px] leading-relaxed text-ink-faint">
            {note}
          </p>
        )}
      </div>

      {/* What came back. */}
      <div className="min-w-0 lg:border-l lg:border-hairline lg:pl-14">
        <p className="font-mono text-[10px] tracking-[0.28em] text-ink-faint uppercase">Found so far</p>
        <ul className="mt-4 flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {feed.map((card) => (
              <motion.li
                key={card.key}
                layout
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-lg border border-hairline bg-white/[0.02] px-4 py-3"
              >
                <p className="line-clamp-2 text-[13px] leading-snug text-ink">{card.title}</p>
                {card.subreddits.length > 0 && (
                  <p className="mt-1.5 font-mono text-[10px] tracking-wide text-ink-faint">
                    {card.subreddits
                      .slice(0, 3)
                      .map((s) => `r/${s}`)
                      .join(" · ")}
                  </p>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          {feed.length === 0 && (
            <li className="rounded-lg border border-dashed border-hairline px-4 py-6 text-[12px] text-ink-faint">
              Waiting for the first results.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function rejectedTotal(run: Run | undefined): number {
  if (!run) return 0;
  return run.events.reduce((sum: number, event: RunEvent) => {
    if (event.stage !== "posts_found") return sum;
    const value = event.payload?.rejected;
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <dt className={cn("numeric text-2xl leading-none", value > 0 ? "text-ink" : "text-ink-faint")}>
        {value}
      </dt>
      <dd className="mt-1 text-[11px] leading-snug text-ink-faint">{label}</dd>
    </div>
  );
}
