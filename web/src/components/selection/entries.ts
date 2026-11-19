import type { RailEntry } from "@/components/selection/rail";
import { RAIL_LENGTH, WINNER_INDEX, type RailProduct } from "@/components/selection/contract";
import { MEASUREMENT_CREDIT } from "@/components/selection/demo-data";
import type { Recommendation } from "@/lib/api/client";
import type { ReactNode } from "react";

/**
 * Who rides the rail, and in what order.
 *
 * The order is the order the cards *arrive*, not a ranking — which is why no
 * card but the chosen one shows a number. A rail of scores would turn a curated
 * sequence into a leaderboard, and the sequence is meant to read as "here are
 * real possibilities, and this is the one", not as a countdown.
 *
 * The engine's top result always takes `WINNER_INDEX`, and that is the only
 * fact about placement this file knows. Two further candidates travel behind it
 * so the centre has company on both sides when the rail stops; without them the
 * composition would run off one edge and stop dead at the other.
 *
 * Nothing here chooses a winner. The winner is whatever arrived ranked first.
 */
export function railOrder<T extends { rank: number; slug: string }>(ranked: readonly T[]): T[] {
  if (ranked.length === 0) return [];
  const [best, ...rest] = ranked;

  // The cards that sweep past are shuffled, deterministically.
  //
  // They are real catalogue entries from this listener's own ranking — nothing
  // here is invented, and inventing it would be both dishonest and no cheaper.
  // But they are *not* shown in rank order, because a rail that counts down
  // from ninth to first reads as a leaderboard, and a leaderboard is not what
  // this moment means. Only the card that stops is ranked, and only it says so.
  //
  // Seeded from the winner's slug rather than from `Math.random`, so the same
  // recommendation always produces the same sequence: a rail that reshuffled
  // on every render would tear itself apart, and one that differed between a
  // first visit and a refresh would look like a bug.
  const shuffled = [...rest];
  let seed = 0;
  for (let i = 0; i < best.slug.length; i += 1) {
    seed = (seed * 31 + best.slug.charCodeAt(i)) % 2147483647;
  }
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const before = shuffled.slice(0, WINNER_INDEX);
  // And the ones still travelling when it stops, so the centre has company on
  // both sides rather than running off one edge.
  const after = shuffled.slice(WINNER_INDEX, RAIL_LENGTH - 1);

  const order = [...before, best, ...after];
  // If the catalogue handed us fewer than the rail holds, keep the winner where
  // it belongs by padding the front rather than letting it drift to the middle.
  while (order.length < RAIL_LENGTH && order.length > 0) {
    order.unshift(order[0]);
  }
  return order.slice(0, RAIL_LENGTH);
}

/** The subset of a recommendation the rail actually displays. */
export function toRailProduct(rec: Recommendation): RailProduct {
  const credit = MEASUREMENT_CREDIT[rec.slug];
  const strength = rec.reasons.find((r) => r.kind === "match") ?? null;
  const tradeoff = rec.reasons.find((r) => r.kind === "mismatch" || r.kind === "note") ?? null;
  return {
    slug: rec.slug,
    rank: rec.rank,
    brand: rec.brand,
    model: rec.model,
    match: rec.match,
    mean: rec.predicted_preference.mean,
    low: rec.predicted_preference.low,
    high: rec.predicted_preference.high,
    strength: strength?.message ?? null,
    tradeoff: tradeoff?.message ?? null,
    measuredBy: credit?.measuredBy ?? null,
    rig: credit?.rig ?? null,
  };
}

/**
 * Build the rail from a ranking.
 *
 * `art` is asked for per product rather than assumed, because on `/match` the
 * winning card's portrait has to be the very element that travels into the
 * results page, and only the caller knows which element that is.
 */
export function buildEntries(
  ranked: readonly Recommendation[],
  art: (rec: Recommendation, winner: boolean) => ReactNode,
): RailEntry[] {
  const ordered = railOrder(ranked);
  return ordered.map((rec, index) => ({
    product: toRailProduct(rec),
    art: art(rec, index === WINNER_INDEX),
  }));
}
