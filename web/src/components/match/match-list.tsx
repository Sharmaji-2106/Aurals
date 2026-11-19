"use client";

import type { Recommendation } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/currency";
import { BookOpen } from "lucide-react";
import { motion } from "motion/react";

/**
 * The ranking, as the engine produced it.
 *
 * The number beside each row is the model's own predicted rating, not a match
 * percentage: nothing here is rescaled into a figure the engine never computed.
 */
const MATCH_WORD: Record<Recommendation["match"], string> = {
  close: "Close match",
  good: "Good match",
  partial: "Partial match",
  poor: "Poor match",
};

export function MatchList({
  items,
  loading,
  activeId,
  researched,
  onSelect,
}: {
  items: Recommendation[];
  loading: boolean;
  activeId: string | null;
  researched: Set<string>;
  onSelect: (rec: Recommendation) => void;
}) {
  return (
    <ol className="border-t border-hairline">
      {loading &&
        Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="border-b border-hairline py-5">
            <span className="skeleton block h-4 w-1/2 rounded" />
            <span className="skeleton mt-2 block h-3 w-3/4 rounded" />
          </li>
        ))}
      {items.map((rec) => {
        const on = rec.iem_id === activeId;
        const match = rec.reasons.find((r) => r.kind === "match");
        const miss = rec.reasons.find((r) => r.kind === "mismatch");
        return (
          <li key={rec.iem_id} className="relative border-b border-hairline">
            {on && (
              <motion.span
                layoutId="match-row"
                className="absolute inset-y-0 -left-4 w-px bg-ember"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(rec)}
              onMouseEnter={() => onSelect(rec)}
              aria-pressed={on}
              className={cn(
                "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-5 text-left transition-opacity",
                !on && "opacity-60 hover:opacity-100",
              )}
            >
              <span className="numeric text-[12px] text-ink-faint">{String(rec.rank).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[16px] text-ink">
                    {rec.brand} {rec.model}
                  </span>
                  {researched.has(rec.slug) && (
                    <BookOpen
                      className="size-3.5 shrink-0 text-ink-faint"
                      aria-label="Review evidence gathered"
                    />
                  )}
                </span>
                <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-ink-faint">
                  {match?.message ?? miss?.message}
                </span>
              </span>
              <span className="text-right text-[12px]">
                <span className="block text-ink-muted">{MATCH_WORD[rec.match]}</span>
                <span className="numeric block text-ink-faint">
                  {rec.price ? formatMoney(Number(rec.price.amount), rec.price.currency) : "price unknown"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
      {!loading && items.length > 0 && (
        <li className="pt-4 text-[11px] leading-relaxed text-ink-faint">
          Ordered by the model&rsquo;s predicted rating against your target. Rows with a book have published
          reviews gathered too.
        </li>
      )}
    </ol>
  );
}
