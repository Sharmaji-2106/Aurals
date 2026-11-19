import type { components } from "@/lib/api/schema";

/**
 * Turning a run's event log into something a person can watch.
 *
 * The honest problem this solves: ranking 203 earphones takes about half a
 * second, so `profile_ready` through `winner_selected` all land at once. The
 * community investigation takes minutes, because each search is a real round
 * trip. One sequence has to cover both without lying in either direction.
 *
 * The answer is to separate *what happened* from *how it is presented*. Events
 * are facts, already recorded, and nothing here invents or reorders them. Acts
 * one to three are read at reading speed — the work is done, and the pacing is
 * only so the words can be read, which is why the copy states findings rather
 * than claiming to be working. Act four is driven purely by events arriving,
 * because there the waiting is real.
 *
 * A run that is already finished when the page opens is not replayed. There is
 * nothing to discover about a result you already have.
 */

export type RunEvent = components["schemas"]["Event"];
export type Run = components["schemas"]["RunOut"];
export type Ranked = components["schemas"]["RankedItem"];

export type ActId = "sound" | "catalogue" | "ranking" | "community" | "draw" | "done";

export const ACT_ORDER: readonly ActId[] = ["sound", "catalogue", "ranking", "community", "draw", "done"];

/**
 * How long the draw holds the screen once the research is in.
 *
 * It is not driven by events, because nothing is happening any more — the
 * ranking was settled in act three and the research finished in act four. This
 * is presentation time, and the number is the length of the sequence itself:
 * the rail stops at 6.5 s, the reveal has landed by 8.8 s, and the rest is the
 * beat before the handover.
 */
export const DRAW_MS = 11_000;

/** Which act an event belongs to. */
export function actOf(stage: string): ActId {
  switch (stage) {
    case "profile_ready":
      return "sound";
    case "catalogue_loaded":
    case "candidates_scored":
      return "catalogue";
    case "ranking_ready":
    case "winner_selected":
      return "ranking";
    case "complete":
    case "failed":
      return "done";
    default:
      return "community";
  }
}

/**
 * How long each of the instant acts stays on screen. Reading time, not work
 * time. Act four has no entry because it lasts exactly as long as the research
 * does, and the draw has none because it runs on `DRAW_MS`.
 */
export const DWELL_MS: Record<Exclude<ActId, "community" | "draw" | "done">, number> = {
  sound: 2200,
  catalogue: 2600,
  ranking: 3000,
};

export const TOTAL_PRELUDE_MS = DWELL_MS.sound + DWELL_MS.catalogue + DWELL_MS.ranking;

export function eventsIn(run: Run | undefined, act: ActId): RunEvent[] {
  if (!run) return [];
  return run.events.filter((e) => actOf(e.stage) === act);
}

export function latest(run: Run | undefined, stage: string): RunEvent | undefined {
  if (!run) return undefined;
  for (let i = run.events.length - 1; i >= 0; i -= 1) {
    if (run.events[i].stage === stage) return run.events[i];
  }
  return undefined;
}

export function numberFrom(event: RunEvent | undefined, key: string): number | null {
  const value = event?.payload?.[key];
  return typeof value === "number" ? value : null;
}

export function stringFrom(event: RunEvent | undefined, key: string): string | null {
  const value = event?.payload?.[key];
  return typeof value === "string" ? value : null;
}

/** The earphone the run put first, from the event rather than re-derived. */
export function winnerSlug(run: Run | undefined): string | null {
  return stringFrom(latest(run, "winner_selected"), "slug");
}

/**
 * What the community act has achieved so far, counted from real events only.
 * Used for the readout beside the search; never extrapolated.
 */
export type ResearchTally = {
  productsStarted: number;
  queriesIssued: number;
  postsKept: number;
  commentsRead: number;
  sources: number;
  claims: number;
  subreddits: string[];
  currentSlug: string | null;
  currentQuery: string | null;
};

export function tally(run: Run | undefined): ResearchTally {
  const out: ResearchTally = {
    productsStarted: 0,
    queriesIssued: 0,
    postsKept: 0,
    commentsRead: 0,
    sources: 0,
    claims: 0,
    subreddits: [],
    currentSlug: null,
    currentQuery: null,
  };
  if (!run) return out;
  const subs = new Set<string>();
  for (const event of run.events) {
    const p = event.payload ?? {};
    switch (event.stage) {
      case "product_started":
        out.productsStarted += 1;
        if (typeof p.slug === "string") out.currentSlug = p.slug;
        break;
      case "query_issued":
        out.queriesIssued += 1;
        if (typeof p.query === "string") out.currentQuery = p.query;
        break;
      case "posts_found":
        if (typeof p.kept === "number") out.postsKept += p.kept;
        if (Array.isArray(p.subreddits)) {
          for (const s of p.subreddits) if (typeof s === "string") subs.add(s);
        }
        break;
      case "comments_read":
        if (typeof p.comments === "number") out.commentsRead += p.comments;
        break;
      case "product_done":
        if (typeof p.sources === "number") out.sources += p.sources;
        if (typeof p.claims === "number") out.claims += p.claims;
        break;
    }
  }
  out.subreddits = [...subs];
  return out;
}

/**
 * Why research stopped short, in words a listener can act on. `null` when
 * nothing went wrong. A disabled provider is deliberately not called a
 * failure — nothing failed, the feature is switched off.
 */
export function shortfall(run: Run | undefined): string | null {
  if (!run?.error_code) return null;
  switch (run.error_code) {
    case "provider_disabled":
      return "Live community research is switched off in this installation: no new discussions are being gathered, and only those collected earlier are shown.";
    case "provider_blocked":
      return "Reddit declined the requests, so community evidence is missing for now.";
    case "provider_timeout":
      return "The search for community discussion took too long and was stopped.";
    case "provider_missing":
      return "The community research provider is selected but not installed.";
    case "comments_unavailable":
      return "The discussions were found, but Reddit would not return their replies this time, so only the posts are shown.";
    case "llm_not_configured":
      return "Discussions were gathered but could not be grouped by topic, so they are shown as found.";
    case "no_ranking":
      return "There was no ranking to research.";
    default:
      return "Community research did not finish.";
  }
}
