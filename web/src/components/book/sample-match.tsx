"use client";

import snapshot from "@/components/book/sample-match.json";
import { FlowShell } from "@/components/flow/flow-shell";
import { Results } from "@/components/match/results";
import type { Me, MusicProfile, Recommendations, SoundProfile } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * The real `/match` page, for the sample listener the edition is printed for.
 *
 * The edition ends on `/match`, and the page it ends on must agree with the
 * book: the same earphone, the same rating, the same listener. So this is the
 * route's own component tree (`FlowShell` and `Results`, unchanged), given the
 * sample listener's data instead of the viewer's — the engine's actual output
 * for the "Neon Odyssey" playlist, captured from the running stack by
 * `design/book/capture_sample_match.py`, not edited.
 *
 * It runs in a query cache of its own, seeded with that capture, so it can
 * never read or change the viewer's own account; public catalogue data (the
 * reviews) is fetched live as `/match` fetches it. The page says whose it is:
 * its heading is the sample listener's name.
 */

export const SAMPLE_MATCH = snapshot as unknown as {
  capturedOn: string;
  playlist: string;
  me: Me;
  sound: SoundProfile;
  music: MusicProfile;
  recommendations: Recommendations;
};

/** The limit `/match` asks the recommender for. */
const LIMIT = 9;

function seeded() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
    },
  });
  client.setQueryData(keys.me, SAMPLE_MATCH.me);
  client.setQueryData(keys.soundProfile, SAMPLE_MATCH.sound);
  client.setQueryData(keys.musicProfile, SAMPLE_MATCH.music);
  client.setQueryData(["recommendations", SAMPLE_MATCH.sound.id, LIMIT], SAMPLE_MATCH.recommendations);
  return client;
}

export function SampleMatch({ lead }: { lead?: ReactNode }) {
  const [client] = useState(seeded);
  return (
    <QueryClientProvider client={client}>
      <FlowShell step="match" bleed scene={false}>
        <Results
          me={SAMPLE_MATCH.me}
          sound={SAMPLE_MATCH.sound}
          music={SAMPLE_MATCH.music}
          sample
          lead={lead}
        />
      </FlowShell>
    </QueryClientProvider>
  );
}
