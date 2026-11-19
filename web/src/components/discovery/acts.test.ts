import { describe, expect, it } from "vitest";
import {
  actOf,
  latest,
  numberFrom,
  shortfall,
  tally,
  TOTAL_PRELUDE_MS,
  winnerSlug,
  type Run,
  type RunEvent,
} from "./acts";

let seq = 0;
const ev = (stage: string, payload: Record<string, unknown> = {}): RunEvent => ({
  seq: ++seq,
  stage,
  payload,
  at: "2026-11-08T00:00:00Z",
});

const run = (events: RunEvent[], extra: Partial<Run> = {}): Run =>
  ({
    id: "r1",
    status: "running",
    provider: "reddrix",
    finished: false,
    ranking: [],
    products_requested: 2,
    products_with_evidence: 0,
    sources_kept: 0,
    claims_made: 0,
    error_code: null,
    error_message: null,
    created_at: "2026-11-08T00:00:00Z",
    finished_at: null,
    events,
    ...extra,
  }) as Run;

describe("act grouping", () => {
  it("puts the analytical stages in the acts that narrate them", () => {
    expect(actOf("profile_ready")).toBe("sound");
    expect(actOf("catalogue_loaded")).toBe("catalogue");
    expect(actOf("candidates_scored")).toBe("catalogue");
    expect(actOf("ranking_ready")).toBe("ranking");
    expect(actOf("winner_selected")).toBe("ranking");
  });

  it("treats every research stage as the community act", () => {
    for (const stage of ["research_started", "product_started", "query_issued", "posts_found"]) {
      expect(actOf(stage)).toBe("community");
    }
  });

  it("ends on both outcomes", () => {
    expect(actOf("complete")).toBe("done");
    expect(actOf("failed")).toBe("done");
  });

  it("keeps the prelude short enough to sit through", () => {
    // The work behind it takes about half a second; this is reading time, and
    // it should stay well under ten seconds.
    expect(TOTAL_PRELUDE_MS).toBeLessThan(10_000);
  });
});

describe("reading events", () => {
  it("takes the most recent occurrence of a stage", () => {
    seq = 0;
    const r = run([ev("posts_found", { kept: 1 }), ev("posts_found", { kept: 9 })]);
    expect(numberFrom(latest(r, "posts_found"), "kept")).toBe(9);
  });

  it("returns null rather than guessing a missing number", () => {
    seq = 0;
    expect(numberFrom(latest(run([]), "catalogue_loaded"), "measured")).toBeNull();
  });

  it("reads the winner from the event, not from the ranking order", () => {
    seq = 0;
    const r = run([ev("winner_selected", { slug: "moondrop-aria" })]);
    expect(winnerSlug(r)).toBe("moondrop-aria");
    expect(winnerSlug(run([]))).toBeNull();
  });
});

describe("tally", () => {
  it("sums only what events actually reported", () => {
    seq = 0;
    const r = run([
      ev("research_started", { products: 2 }),
      ev("product_started", { slug: "a" }),
      ev("query_issued", { query: '"Brand A" review' }),
      ev("posts_found", { kept: 3, rejected: 2, subreddits: ["iems", "headphones"] }),
      ev("product_started", { slug: "b" }),
      ev("query_issued", { query: '"Brand B" review' }),
      ev("posts_found", { kept: 1, rejected: 5, subreddits: ["iems"] }),
      ev("comments_read", { comments: 7 }),
      ev("product_done", { sources: 4, claims: 6 }),
    ]);
    const t = tally(r);
    expect(t.productsStarted).toBe(2);
    expect(t.queriesIssued).toBe(2);
    expect(t.postsKept).toBe(4);
    expect(t.commentsRead).toBe(7);
    expect(t.sources).toBe(4);
    expect(t.claims).toBe(6);
    // Deduplicated, so one community reached twice is one community.
    expect(t.subreddits.sort()).toEqual(["headphones", "iems"]);
    // The current product and query are the latest ones, for the live readout.
    expect(t.currentSlug).toBe("b");
    expect(t.currentQuery).toBe('"Brand B" review');
  });

  it("counts nothing from an empty run", () => {
    const t = tally(undefined);
    expect(t.queriesIssued).toBe(0);
    expect(t.subreddits).toEqual([]);
    expect(t.currentQuery).toBeNull();
  });

  it("ignores payload values of the wrong shape", () => {
    seq = 0;
    const r = run([ev("posts_found", { kept: "lots", subreddits: "iems" })]);
    expect(tally(r).postsKept).toBe(0);
    expect(tally(r).subreddits).toEqual([]);
  });
});

describe("explaining a shortfall", () => {
  it("says nothing when nothing went wrong", () => {
    expect(shortfall(run([], { error_code: null }))).toBeNull();
  });

  it("does not call a switched-off provider a failure", () => {
    const text = shortfall(run([], { error_code: "provider_disabled" }));
    expect(text).toMatch(/switched off/);
    expect(text).not.toMatch(/fail/i);
  });

  it("distinguishes a refused reply read from a thread with no replies", () => {
    expect(shortfall(run([], { error_code: "comments_unavailable" }))).toMatch(
      /would not return their replies/,
    );
  });

  it("explains ungrouped quotes without implying they are missing", () => {
    const text = shortfall(run([], { error_code: "llm_not_configured" }));
    expect(text).toMatch(/could not be grouped/);
    expect(text).toMatch(/shown as found/);
  });

  it("still says something for an unknown code", () => {
    expect(shortfall(run([], { error_code: "something_new" }))).toBeTruthy();
  });
});
