"use client";

import type { Run } from "@/components/discovery/acts";
import { useLatestResearchRun, useResearchRun, useStartResearch } from "@/lib/api/hooks";
import { useEffect, useRef } from "react";

/**
 * The listener's community research, run quietly behind the results.
 *
 * There is no sequence to watch any more: the run only feeds the community
 * section, which says plainly what it found or why it found nothing.
 *
 * The run id is derived, not stored: whichever run the start mutation
 * returned, or the latest one the server already has, so a refresh, a second
 * tab and a double click all converge on the same run. Starting is attempted
 * once per mount — the endpoint hands back the run already in flight, and the
 * job queue refuses a duplicate at the database.
 */
export function useCommunityResearch(enabled = true): Run | undefined {
  const latest = useLatestResearchRun(enabled);
  const start = useStartResearch();
  const asked = useRef(false);

  const runId = start.data?.id ?? latest.data?.id ?? null;
  const watched = useResearchRun(runId);

  useEffect(() => {
    if (!enabled || asked.current || latest.isPending || latest.isError || latest.data) return;
    asked.current = true;
    start.mutate();
  }, [enabled, latest.isPending, latest.isError, latest.data, start]);

  return watched.data ?? start.data ?? latest.data ?? undefined;
}
