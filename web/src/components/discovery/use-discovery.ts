"use client";

import type { Run } from "@/components/discovery/acts";
import { useLatestResearchRun, useResearchRun, useStartResearch } from "@/lib/api/hooks";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Deciding whether there is a discovery to watch.
 *
 * The run id is derived, not stored: it is whichever run the start mutation
 * returned, or the latest one the server already has. That matters because a
 * refresh, a second tab and a double click must all converge on the same run,
 * and the server is the only thing that knows which that is.
 *
 * Starting is safe to attempt once per mount — the endpoint hands back the run
 * already in flight, and the job queue refuses a duplicate at the database —
 * but it is still guarded, because enqueueing work is not something to do on
 * every render.
 */
export type Discovery = {
  run: Run | undefined;
  /** Render the sequence. False once it has handed over, or when nothing is running. */
  show: boolean;
  /** The sequence has finished or been skipped. */
  dismiss: () => void;
  /** True while we do not yet know whether a run exists. */
  deciding: boolean;
};

export function useDiscovery({ enabled = true }: { enabled?: boolean } = {}): Discovery {
  const latest = useLatestResearchRun(enabled);
  const start = useStartResearch();
  const [dismissed, setDismissed] = useState(false);
  const asked = useRef(false);

  // One run id, from the server. Whichever we have, they are the same run.
  const runId = start.data?.id ?? latest.data?.id ?? null;
  const watched = useResearchRun(runId);
  const run = watched.data ?? start.data ?? latest.data ?? undefined;

  // No run has ever been made for this listener, so make one. Enqueueing is a
  // request to an external system, so it belongs in an effect — but only once.
  useEffect(() => {
    if (!enabled || asked.current || latest.isPending || latest.isError) return;
    if (latest.data) return;
    asked.current = true;
    start.mutate();
  }, [enabled, latest.isPending, latest.isError, latest.data, start]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return {
    run,
    show: !dismissed && Boolean(run),
    dismiss,
    deciding: latest.isPending || (start.isPending && !run),
  };
}
