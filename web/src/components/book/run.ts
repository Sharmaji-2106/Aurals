import type { ListenerSnapshot } from "@/components/card/listener";
import { SAMPLE_LISTENER } from "@/components/book/sample-listener";
import type { Recommendation } from "@/lib/api/client";

/**
 * Whose numbers the book prints.
 *
 * The editorial pages are the same for everyone. The pages that print a
 * listener's data — their music band by band, their profile, their shortlist,
 * how their match fits — print the data of the person the book is for: the
 * prepared sample listener in the studio, or the signed-in listener in their
 * own edition, read from the same live data their results page shows.
 */
export type BookRun = {
  who: "sample" | "listener";
  /** The playlist's own title, when the music came from one. */
  playlist: string | null;
  capturedOn: string;
  tracksAnalysed: number;
  referenceTarget: string;
  measured: number;
  bands: readonly {
    key: string;
    label: string;
    lowHz: number;
    highHz: number;
    db: number;
    low: number;
    high: number;
  }[];
  /** `db` is the profile's mean for tonal dimensions, relative to the reference target. */
  dimensions: readonly { key: string; label: string; group: string; description: string; db: number }[];
  shortlist: readonly {
    rank: number;
    slug: string;
    brand: string;
    model: string;
    match: string;
    mean: number;
    low: number;
    high: number;
  }[];
  recommendation: {
    slug: string;
    brand: string;
    model: string;
    rank: number;
    match: string;
    predicted_preference: { mean: number; low: number; high: number };
    measurement: { rig: string };
    regions: readonly { region: string; error_db: number | null; tolerance_db: number | null }[];
    reasons: readonly {
      kind: string;
      region?: string | null;
      error_db?: number | null;
      tolerance_db?: number | null;
    }[];
  };
};

export const SAMPLE_RUN: BookRun = {
  ...SAMPLE_LISTENER,
  who: "sample",
  playlist: "Neon Odyssey",
  dimensions: SAMPLE_LISTENER.dimensions.map((d) => ({ ...d, db: d.db ?? 0 })),
};

type Band = {
  key: string;
  label: string;
  low_hz: number;
  high_hz: number;
  balance_db?: { estimate: number; ci_low: number; ci_high: number } | null;
  deviation_db?: { median: number; p25: number; p75: number } | null;
};

/** The listener's own run, from the data `/match` already holds. */
export function listenerRun(snapshot: ListenerSnapshot, playlist: string | null): BookRun {
  const { music, sound, recommendations } = snapshot;
  const bands = ((music.data as unknown as { bands: Band[] }).bands ?? []).map((b) => {
    const balance = b.balance_db;
    const deviation = b.deviation_db;
    return {
      key: b.key,
      label: b.label,
      lowHz: b.low_hz,
      highHz: b.high_hz,
      db: balance?.estimate ?? deviation?.median ?? 0,
      low: balance?.ci_low ?? deviation?.p25 ?? 0,
      high: balance?.ci_high ?? deviation?.p75 ?? 0,
    };
  });
  const top = recommendations.items[0];
  return {
    who: "listener",
    playlist,
    capturedOn: music.created_at.slice(0, 10),
    tracksAnalysed: music.track_count,
    referenceTarget: recommendations.reference_target?.label ?? "Harman in-ear 2019",
    measured: recommendations.dataset.measurements,
    bands,
    dimensions: sound.data.dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      group: d.group,
      description: d.description ?? "",
      db: d.mean ?? 0,
    })),
    shortlist: recommendations.items.slice(0, 5).map((r) => ({
      rank: r.rank,
      slug: r.slug,
      brand: r.brand,
      model: r.model,
      match: r.match,
      mean: r.predicted_preference.mean,
      low: r.predicted_preference.low,
      high: r.predicted_preference.high,
    })),
    recommendation: asRunRecommendation(top),
  };
}

function asRunRecommendation(r: Recommendation): BookRun["recommendation"] {
  return {
    slug: r.slug,
    brand: r.brand,
    model: r.model,
    rank: r.rank,
    match: r.match,
    predicted_preference: r.predicted_preference,
    measurement: { rig: r.measurement.rig ?? "" },
    regions: r.regions.map((g) => ({ region: g.region, error_db: g.error_db, tolerance_db: g.tolerance_db })),
    reasons: r.reasons.map((x) => ({
      kind: x.kind,
      region: x.region,
      error_db: x.error_db ?? null,
      tolerance_db: x.tolerance_db ?? null,
    })),
  };
}
