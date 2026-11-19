"use client";

import type { ReviewSource } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { STANCE_COLOR } from "@/components/research/constellation";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

/**
 * One piece of evidence, shown as it was found: who published it, who wrote it, when,
 * and the passages quoted from it. The topic and stance beside each passage are
 * Auralis reading that passage, which the card says in as many words.
 */
const STANCE_WORD = {
  positive: "reads as positive",
  negative: "reads as negative",
  mixed: "reads as mixed",
} as const;

export function ReviewCard({
  source,
  open,
  highlightTopic,
  onOpen,
  className,
}: {
  source: ReviewSource;
  open: boolean;
  highlightTopic: string | null;
  onOpen: () => void;
  className?: string;
}) {
  const date = source.published_on
    ? new Date(`${source.published_on}T00:00:00Z`).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : null;
  const claims = source.claims;
  const shown = open ? claims : claims.filter((c) => c.topic === highlightTopic).slice(0, 1);

  return (
    <motion.article
      layout
      className={cn(
        "rounded-2xl border p-5 transition-colors duration-300",
        open ? "border-white/25 bg-white/[0.04]" : "border-hairline-strong bg-white/[0.015]",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="group/card flex w-full items-start justify-between gap-4 text-left"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[14px] text-ink">{source.publication}</span>
            {source.author && <span className="text-[12px] text-ink-muted">{source.author}</span>}
            {date && <span className="numeric text-[11px] text-ink-faint">{date}</span>}
          </span>
          <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-muted">{source.title}</span>
        </span>
        <span className="numeric shrink-0 text-[11px] text-ink-faint">
          {claims.length} quote{claims.length === 1 ? "" : "s"}
        </span>
      </button>

      {!open && source.excerpt && shown.length === 0 && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-faint italic">
          &ldquo;{source.excerpt}&rdquo;
        </p>
      )}

      {shown.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3.5">
          {shown.map((claim) => (
            <li key={claim.id} className="border-l pl-4" style={{ borderColor: STANCE_COLOR[claim.stance] }}>
              <p className="text-[14px] leading-relaxed text-ink">&ldquo;{claim.quote}&rdquo;</p>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {claim.topic_label} · {STANCE_WORD[claim.stance]} ·{" "}
                <span title="AURALS assigned the theme and stance; the words are the reviewer's.">
                  tagged by {claim.tagged_by === "auralis-editorial" ? "AURALS" : claim.tagged_by}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-4">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-[13px] text-ink underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white/60"
          >
            Read the original on {source.publication}
            <ArrowUpRight className="size-3.5" />
          </a>
          {source.license_note && (
            <p className="text-[11px] leading-relaxed text-ink-faint">{source.license_note}</p>
          )}
        </div>
      )}
    </motion.article>
  );
}
